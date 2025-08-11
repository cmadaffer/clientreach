// pages/api/inbox-data.js
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, error, count } = await supabase
      .from('inbox_messages')
      .select('msg_id, from_addr, subject, body, created_at, direction, important', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.status(200).json({ messages: data || [], total: count || 0, page, pageSize });
  } catch (e) {
    console.error('inbox-data error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Failed to load inbox' });
  }
}
