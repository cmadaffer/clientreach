// pages/api/inbox-data.js
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 25;
  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;

  try {
    const { data: rows = [], error } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // Aggressive de-dupe across unreliable IDs.
    const seen = new Set();
    const keyOf = (m) =>
      (m.gm_msgid && `g:${m.gm_msgid}`) ||
      (m.msg_id && `m:${m.msg_id}`) ||
      `f:${m.from_addr}|s:${m.subject}|d:${m.created_at ? new Date(m.created_at).toISOString() : ''}`;

    const messages = [];
    for (const m of rows) {
      const k = keyOf(m);
      if (seen.has(k)) continue;
      seen.add(k);
      messages.push(m);
    }

    res.status(200).json({ messages, total: messages.length });
  } catch (err) {
    console.error('Inbox data error:', err);
    res.status(500).json({ error: err.message });
  }
}
