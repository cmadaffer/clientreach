// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Keep fast: small batches & short lookback
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100); // 10 per click
  const days  = Math.min(parseInt(req.query.days, 10)  || 7, 90);   // last 7 days
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

    // Search unseen & recent; get just UIDs first (fast).
    const uids = await client.search({ seen: false, since: sinceDate });
    if (!uids?.length) return res.status(200).json({ status: 'no-unseen', fetched: 0 });

    const selected = uids.slice(-limit);

    // Fetch ENVELOPE+FLAGS only (no BODY here). We'll lazy-load body on click.
    let fetched = 0;
    for await (const msg of client.fetch(selected, { envelope: true, flags: true, internalDate: true })) {
      const flags = Array.isArray(msg.flags) ? msg.flags : [];
      if (flags.includes('\\Seen')) continue;

      const env = msg.envelope || {};
      const uid = msg.uid;
      const gm_msgid = msg.gmailMessageId || undefined; // if exposed by imapflow; harmless if undefined
      // Prefer a stable ID order: Gmail ID → RFC Message-Id → UID
      const stable_id = (gm_msgid && String(gm_msgid)) || env.messageId || String(uid);

      const from_addr = env.from?.[0]?.address || env.from?.[0]?.name || '';
      const subject   = env.subject || '';
      const created_at = env.date ? new Date(env.date) : new Date();

      // UPSERT by msg_id (stable_id). Body left empty; fetched on demand.
      const { error: upsertErr } = await supabase
        .from('inbox_messages')
        .upsert(
          [{
            msg_id: stable_id,
            gm_msgid: gm_msgid ? String(gm_msgid) : null,
            uid,
            from_addr,
            subject,
            body: '',        // empty now; filled by message-body API when user clicks
            created_at,
            direction: 'inbound'
          }],
          { onConflict: 'msg_id' } // you already have UNIQUE(msg_id)
        );

      if (upsertErr) console.error('Supabase upsert error:', upsertErr.message);

      // Mark seen so we don't reprocess next time
      try { await client.messageFlagsAdd(uid, ['\\Seen']); } catch (e) { /* ignore */ }

      fetched++;
    }

    return res.status(200).json({ status: 'completed', fetched, limit, days });
  } catch (err) {
    console.error('IMAP sync error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { if (lock) lock.release(); } catch {}
    try { await client.logout(); } catch {}
  }
}
