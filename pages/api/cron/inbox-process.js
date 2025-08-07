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
    await client.connect();
    lock = await client.getMailboxLock('INBOX');

    for await (const message of client.fetch('UNSEEN', { envelope: true, source: true, flags: true })) {
      const flags = Array.isArray(message.flags) ? message.flags : [];
      if (!flags.includes('\\Seen')) {
        const parsed = await simpleParser(message.source);
        const msg_id = parsed.messageId || message.envelope?.messageId || String(message.uid);
        const from = parsed.from?.text || message.envelope.from[0]?.address || '';
        const subject = parsed.subject || '';
        const body = parsed.text || '';
        const created_at = parsed.date || new Date();

        const { error: upsertError } = await supabase
          .from('inbox_messages')
          .upsert(
            [{ msg_id, from_addr: from, subject, body, created_at, direction: 'inbound' }],
            { onConflict: 'msg_id' }
          );
        if (upsertError && !upsertError.message.includes('no unique or exclusion constraint')) {
          console.error('Supabase upsert error:', upsertError.message);
        }

        await client.messageFlagsAdd(message.uid, ['\\Seen']);
      }
    }

    res.status(200).json({ status: 'completed' });
  } catch (err) {
    console.error('IMAP sync error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (lock) lock.release();
    try {
      await client.logout();
    } catch (logoutErr) {
      console.error('Logout error:', logoutErr);
    }
  }
}
