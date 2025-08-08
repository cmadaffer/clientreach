// pages/api/message-body.js
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const msgId = req.query.msg_id;
  if (!msgId) return res.status(400).json({ error: 'msg_id required' });

  try {
    // find the record, we use uid if we have it
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, uid, body')
      .eq('msg_id', msgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Message not found' });
    if (data.body && data.body.trim()) return res.status(200).json({ body: data.body });

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

      if (!data.uid) return res.status(200).json({ body: '' }); // no uid stored yet

      // fetch this single message source by UID
      const iter = client.fetch({ uid: data.uid }, { source: true });
      const { value } = await iter.next();
      if (!value?.source) return res.status(200).json({ body: '' });

      const parsed = await simpleParser(value.source);
      const bodyText = parsed?.text || '';

      await supabase.from('inbox_messages').update({ body: bodyText }).eq('id', data.id);

      return res.status(200).json({ body: bodyText });
    } finally {
      try { if (lock) lock.release(); } catch {}
      try { await client.logout(); } catch {}
    }
  } catch (err) {
    console.error('message-body error:', err);
    return res.status(500).json({ error: err.message });
  }
}
