// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
  });

  let lock;
  try {
    // Connect & lock mailbox
    await client.connect();
    lock = await client.getMailboxLock('INBOX');

    // 1) Get unseen UIDs. If none, return fast so the button never hangs.
    const uids = await client.search({ seen: false });
    if (!uids || uids.length === 0) {
      return res.status(200).json({ status: 'no-unseen' });
    }

    // 2) Fetch just those messages
    for await (const message of client.fetch(uids, { envelope: true, source: true, flags: true })) {
      const flags = Array.isArray(message.flags) ? message.flags : [];
      // Defensive: if server says it's already \Seen, skip
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

      // 3) Insert (DB will allow duplicates unless you add a unique index on msg_id)
      const { error: upsertError } = await supabase
        .from('inbox_messages')
        .insert([{ msg_id, from_addr: from, subject, body, created_at, direction: 'inbound' }]);
      if (upsertError) {
        // Non-fatal: log and continue
        console.error('Supabase insert error:', upsertError.message);
      }

      // 4) Mark as seen so we don’t fetch again next time
      await client.messageFlagsAdd(message.uid, ['\\Seen']);
    }

    return res.status(200).json({ status: 'completed' });
  } catch (err) {
    console.error('IMAP sync error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { if (lock) lock.release(); } catch {}
    try { await client.logout(); } catch {}
  }
}
