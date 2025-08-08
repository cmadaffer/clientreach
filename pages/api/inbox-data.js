// pages/api/inbox-data.js
import { supabase } from '../../lib/supabaseClient';
import { isImportantEmail } from '../../lib/flagImportant';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 25;

  try {
    // Pull a recent window from DB (already sorted newest first)
    const { data: rows = [], error } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Normalize created_at to ISO second for de-dupe fallback key
    const toSecond = (v) => {
      try { const d = new Date(v); d.setMilliseconds(0); return d.toISOString(); }
      catch { return ''; }
    };

    // Strong de-dupe:
    // 1) Prefer msg_id if present
    // 2) Fallback: from+subject+created_at(to the SECOND)
    const keyFor = (m) =>
      (m?.msg_id && `m:${m.msg_id}`) ||
      `f:${m?.from_addr || ''}|s:${m?.subject || ''}|t:${toSecond(m?.created_at)}`;

    const map = new Map();
    for (const r of rows) {
      const k = keyFor(r);
      if (!map.has(k)) map.set(k, r); // keep first because rows are newest-first
    }
    const deduped = Array.from(map.values());

    // Paginate AFTER de-dupe
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageRows = deduped.slice(start, end);

    // --- IMPORTANT FLAGGING ---
    // We classify a few items per request to keep latency/cost low.
    // If your table has an `important` boolean column, we also persist it (best effort).
    const MAX_CLASSIFY = 5; // upper bound per request
    const classifyTargets = []; // indices in pageRows that need classification

    const messages = pageRows.map((m, idx) => {
      const base = {
        id: m.id,
        msg_id: m.msg_id,
        from_addr: m.from_addr || '',
        subject: m.subject || '',
        body: m.body || '', // if empty, UI fetches on demand via /api/message-body
        created_at: m.created_at,
        direction: m.direction || 'inbound',
        important: typeof m.important === 'boolean' ? m.important : undefined,
      };

      // Only classify inbound emails without a stored important flag
      if (
        base.direction !== 'outbound' &&
        typeof base.important !== 'boolean' &&
        classifyTargets.length < MAX_CLASSIFY
      ) {
        classifyTargets.push(idx);
      }

      return base;
    });

    // Run GPT classification (sequentially for stability)
    for (const idx of classifyTargets) {
      const m = messages[idx];
      try {
        const flagged = await isImportantEmail(m.subject || '', (m.body || '').slice(0, 4000));
        m.important = !!flagged;

        // Persist if the column exists; ignore schema errors quietly
        try {
          await supabase.from('inbox_messages').update({ important: m.important }).eq('id', m.id);
        } catch {
          // Column might not exist yet; ignore
        }
      } catch (e) {
        // On failure, leave as undefined (UI can still render)
        m.important = m.important ?? undefined;
      }
    }

    return res.status(200).json({
      messages,
      total: deduped.length,
    });
  } catch (err) {
    console.error('Inbox data error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
