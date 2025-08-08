// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Ultra-light batch so it never times out under load
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50); // 5 per click
  const days  = Math.min(parseInt(req.query.days, 10)  || 3, 30);  // last 3 days
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

    // Only recent unseen UIDs. If your mailbox has 41k unread, this keeps the set tiny.
    const uids = await client.search({ since: sinceDate, seen: false });
    if (!uids?.length) {
      return res.status(200).json({ status: 'no-unseen', fetched: 0, limit, days });
    }

    // Most recent N
    const selected = uids.slice(-limit);

    // Fetch ENVELOPE+FLAGS only (fast). No BODY, no flag writes.
    let fetched = 0;
    for await (const msg of client.fetch(selected, { envelope: true, flags: true, internalDate: true })) {
      const env = msg.envelope || {};
      const gm = msg.gmailMessageId ? String(msg.gmailMessageId) : null; // present on Gmail
      const stable_id = gm || env.messageId || String(msg.uid);

      const from_addr = env.from?.[0]?.address || env.from?.[0]?.name || '';
      const subject   = env.subject || '';
      const created_at = env.date ? new Date(env.date) : new Date();

      // UPSERT by msg_id (UNIQUE); we also save uid + gm id for later body fetches.
      const { error: upsertErr } = await supabase
        .from('inbox_messages')
        .upsert(
          [{
            msg_id: stable_id,
            gm_msgid: gm,
            uid: msg.uid,
            from_addr,
            subject,
            body: '',            // body is lazy-loaded on click
            created_at,
            direction: 'inbound'
          }],
          { onConflict: 'msg_id' }
        );
      if (!upsertErr) fetched++;
    }

    // Quick return
    return res.status(200).json({ status: 'completed', fetched, limit, days });
  } catch (err) {
    console.error('IMAP sync error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { if (lock) lock.release(); } catch {}
    try { await client.logout(); } catch {}
  }
}
