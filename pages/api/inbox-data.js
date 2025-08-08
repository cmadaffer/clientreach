// pages/api/inbox-data.js
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 25;

  try {
    // Pull a bigger window, then dedupe, then paginate in memory.
    const { data: rows = [], error } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300); // adjust if you want more/less

    if (error) throw error;

    // Robust dedupe key priority: msg_id → gm_msgid → composite fallback
    const makeKey = (m) => {
      if (m?.msg_id) return `m:${m.msg_id}`;
      if (m?.gm_msgid) return `g:${m.gm_msgid}`;
      const d = m?.created_at ? new Date(m.created_at).toISOString() : '';
      return `f:${m?.from_addr || ''}|s:${m?.subject || ''}|d:${d}`;
    };

    const map = new Map();
    for (const m of rows) {
      const k = makeKey(m);
      if (!map.has(k)) map.set(k, m); // keep first (newest due to sort)
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
