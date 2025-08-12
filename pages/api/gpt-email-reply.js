// pages/api/gpt-email-reply.js
import { generateReply } from '../../lib/generateReply';
import { rateLimit } from '../../lib/rateLimit';
import { supabase } from '../../lib/supabaseClient';

const checkRate = rateLimit({ key: 'gpt-reply', limit: 3, intervalMs: 10_000 });
const FRESH_MS = 24 * 60 * 60 * 1000; // 24h

function isMissingColumn(err) {
  const s = String(err?.message || err || '').toLowerCase();
  return s.includes('column') && s.includes('does not exist');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkRate(req, res)) return;

  const { messageBody, subject, sender, msgId } = req.body || {};
  if (!subject || !sender) return res.status(400).json({ error: 'Missing subject or sender' });

  // ---- Try to serve cached draft (ignore missing-column errors) ----
  try {
    if (msgId) {
      const { data, error } = await supabase
        .from('inbox_messages')
        .select('draft_reply, draft_updated_at')
        .eq('msg_id', msgId)
        .maybeSingle();

      if (!error && data?.draft_reply && data?.draft_updated_at) {
        const age = Date.now() - new Date(data.draft_updated_at).getTime();
        if (age >= 0 && age < FRESH_MS) {
          return res.status(200).json({ reply: data.draft_reply, cached: true });
        }
      }
      if (error && !isMissingColumn(error)) {
        console.error('cache read error:', error.message || error);
      }
    }
  } catch (e) {
    if (!isMissingColumn(e)) console.error('cache read exception:', e?.message || e);
  }

  // ---- Generate a new draft ----
  try {
    const reply = await generateReply({
      body: messageBody || '',
      subject: subject || '',
      sender: sender || '',
    });

    // Best-effort cache write (ignore if columns aren’t there yet)
    if (msgId) {
      try {
        await supabase
          .from('inbox_messages')
          .update({ draft_reply: reply, draft_updated_at: new Date().toISOString() })
          .eq('msg_id', msgId);
      } catch (e) {
        if (!isMissingColumn(e)) console.error('cache write error:', e?.message || e);
      }
    }

    return res.status(200).json({ reply, cached: false });
  } catch (err) {
    // Surface helpful OpenAI errors to the UI
    const msg = String(err?.message || err || 'Failed to generate reply');
    if (msg.toLowerCase().includes('openai')) {
      return res.status(500).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}
