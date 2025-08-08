// pages/api/message-body.js
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const msgId = req.query.msg_id;
  if (!msgId) return res.status(400).json({ error: 'msg_id required' });

  try {
    // Find row — we only need the DB id and any cached body
    const { data: row, error } = await supabase
      .from('inbox_messages')
      .select('id, body, subject, created_at')
      .eq('msg_id', msgId)
      .maybeSingle();

    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (row.body && row.body.trim()) return res.status(200).json({ body: row.body });

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

      let fetchIterator;

      // If msgId looks like an RFC Message-ID (<...@...>), search by header
      const looksLikeHeaderId = /@/.test(msgId);
      if (looksLikeHeaderId) {
        const ids = await client.search({ header: ['Message-ID', msgId] });
        if (ids?.length) {
          fetchIterator = client.fetch(ids.slice(-1), { source: true });
        }
      } else if (/^\d+$/.test(msgId)) {
        // If it’s numeric, assume it was a UID
        fetchIterator = client.fetch({ uid: Number(msgId) }, { source: true });
      }

      if (!fetchIterator) {
        return res.status(200).json({ body: '' }); // can't locate; leave empty
      }

      const { value } = await fetchIterator.next();
      if (!value?.source) return res.status(200).json({ body: '' });

      const parsed = await simpleParser(value.source);
      const bodyText = parsed?.text || parsed?.html || '';

      // Cache body
      await supabase
        .from('inbox_messages')
        .update({ body: bodyText })
        .eq('id', row.id);

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
