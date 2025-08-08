// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Allow lightweight control via query params (fallbacks are safe)
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);     // max 200 per run
  const days = Math.min(parseInt(req.query.days, 10) || 14, 90);        // look back up to 90 days
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

    // 1) Find unseen messages since a recent date
    const uids = await client.search({ seen: false, since: sinceDate });

    if (!uids || uids.length === 0) {
      return res.status(200).json({ status: 'no-unseen', scanned: 0, fetched: 0 });
    }

    // 2) Take only the most recent N
    const selected = uids.slice(-limit);

    // 3) Fetch & store
    let fetched = 0;
    for await (const message of client.fetch(selected, { envelope: true, source: true, flags: true })) {
      const flags = Array.isArray(message.flags) ? message.flags : [];
      if (flags.includes('\\Seen')) continue;

      const parsed = await simpleParser(message.source);
      const msg_id =
        parsed.messageId ||
        message.envelope?.messageId ||
        String(message.uid);

      const from =
        parsed.from?.text ||
        message.envelope?.from?.[0]?.address ||
        '';

      const subject = parsed.subject || '';
      const body = parsed.text || '';
      const created_at = parsed.date || new Date();

      // Use INSERT for now (UI dedupes). We can switch to UPSERT once a unique index on msg_id exists.
      const { error: insertErr } = await supabase
        .from('inbox_messages')
        .insert([{ msg_id, from_addr: from, subject, body, created_at, direction: 'inbound' }]);

      if (insertErr) {
        // Non-fatal: log and continue
        console.error('Supabase insert error:', insertErr.message);
      }

      // Mark as seen so next run doesn't reprocess the same messages
      try {
        await client.messageFlagsAdd(message.uid, ['\\Seen']);
      } catch (flagErr) {
        console.error('Flag add error:', flagErr?.message || flagErr);
      }

      fetched++;
    }

    return res.status(200).json({
      status: 'completed',
      scanned: uids.length,
      fetched,
      limit,
      days,
    });
  } catch (err) {
    console.error('IMAP sync error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { if (lock) lock.release(); } catch {}
    try { await client.logout(); } catch {}
  }
}
