// pages/api/inbox-data.js
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 25;

  try {
    // Pull a reasonable window, then dedupe & paginate in memory
    const { data: rows = [], error } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const toSecond = (v) => {
      try { const d = new Date(v); d.setMilliseconds(0); return d.toISOString(); }
      catch { return ''; }
    };

    // Strong key: msg_id → gm_msgid → from+subject+created_at (to the SECOND)
    const key = (m) =>
      (m?.msg_id && `m:${m.msg_id}`) ||
      (m?.gm_msgid && `g:${m.gm_msgid}`) ||
      `f:${m?.from_addr || ''}|s:${m?.subject || ''}|t:${toSecond(m?.created_at)}`;

    const map = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!map.has(k)) map.set(k, r); // keep newest first due to ORDER BY
    }
    const deduped = Array.from(map.values());

    // paginate after dedupe
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const slice = deduped.slice(start, end);

    res.status(200).json({ messages: slice, total: deduped.length });
  } catch (err) {
    console.error('Inbox data error:', err);
    res.status(500).json({ error: err.message });
  }
}
