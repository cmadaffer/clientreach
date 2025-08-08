// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Batch controls (safe defaults; can tweak via query)
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200); // sync 25 at a time
  const days  = Math.min(parseInt(req.query.days, 10)  || 14, 90);  // last 14 days max
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  });

  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock('INBOX');

    // 1) Unseen messages within recent window
    const uids = await client.search({ seen: false, since: sinceDate });
    if (!uids || uids.length === 0) {
      return res.status(200).json({ status: 'no-unseen', scanned: 0, fetched: 0 });
    }

    // 2) Take the most recent N
    const selected = uids.slice(-limit);

    // 3) Fetch ENVELOPE+FLAGS only (fast) — no BODY parsing
    let fetched = 0;
    for await (const msg of client.fetch(selected, { envelope: true, flags: true })) {
      const flags = Array.isArray(msg.flags) ? msg.flags : [];
      if (flags.includes('\\Seen')) continue; // defensive

      const env = msg.envelope || {};
      const msg_id    = env.messageId || String(msg.uid);
      const from_addr = env.from?.[0]?.address || env.from?.[0]?.name || '';
      const subject   = env.subject || '';
      const created_at = env.date ? new Date(env.date) : new Date();

      // 4) UPSERT by msg_id (your DB already has UNIQUE(msg_id))
      const { error: upsertErr } = await supabase
        .from('inbox_messages')
        .upsert(
          [{ msg_id, from_addr, subject, body: '', created_at, direction: 'inbound' }],
          { onConflict: 'msg_id' }
        );

      if (upsertErr) {
        // Log and continue (non-fatal)
        console.error('Supabase upsert error:', upsertErr.message);
      }

      // 5) Mark seen so we don't reprocess next time
      try { await client.messageFlagsAdd(msg.uid, ['\\Seen']); } catch (e) {}

      fetched++;
    }

    return res.status(200).json({ status: 'completed', scanned: uids.length, fetched, limit, days });
  } catch (err) {
    console.error('IMAP sync error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { if (lock) lock.release(); } catch {}
    try { await client.logout(); } catch {}
  }
}
