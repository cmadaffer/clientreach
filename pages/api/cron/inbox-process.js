// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Batch controls (fast + safe defaults)
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200);
  const days  = Math.min(parseInt(req.query.days, 10)  || 14, 90);
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

    // unseen within window
    const uids = await client.search({ seen: false, since: sinceDate });
    if (!uids || uids.length === 0) {
      return res.status(200).json({ status: 'no-unseen', scanned: 0, fetched: 0 });
    }

    // most recent N
    const selected = uids.slice(-limit);

    let fetched = 0;
    // fetch envelope + source so we can parse and store body
    for await (const msg of client.fetch(selected, { envelope: true, source: true, flags: true })) {
      const flags = Array.isArray(msg.flags) ? msg.flags : [];
      if (flags.includes('\\Seen')) continue;

      const env = msg.envelope || {};
      let parsed = {};
      try { parsed = await simpleParser(msg.source); } catch {}

      const msg_id = parsed?.messageId || env?.messageId || String(msg.uid);
      const from_addr = parsed?.from?.text || env?.from?.[0]?.address || '';
      const subject = parsed?.subject || env?.subject || '';
      const body = parsed?.text || '';
      const dt = parsed?.date || env?.date || new Date();
      const created_at = dt ? new Date(dt) : new Date();

      // UPSERT by msg_id (you already have UNIQUE(msg_id))
      const { error: upsertErr } = await supabase
        .from('inbox_messages')
        .upsert(
          [{ msg_id, from_addr, subject, body, created_at, direction: 'inbound' }],
          { onConflict: 'msg_id' }
        );
      if (upsertErr) console.error('Supabase upsert error:', upsertErr.message);

      try { await client.messageFlagsAdd(msg.uid, ['\\Seen']); } catch {}
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

