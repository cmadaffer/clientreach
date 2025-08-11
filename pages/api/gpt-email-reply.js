// pages/api/gpt-email-reply.js
import { generateReply } from '../../lib/generateReply';
import { rateLimit } from '../../lib/rateLimit';
import { supabase } from '../../lib/supabaseClient';

const checkRate = rateLimit({ key: 'gpt-reply', limit: 3, intervalMs: 10_000 });
const FRESH_MS = 24 * 60 * 60 * 1000; // 24h

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkRate(req, res)) return;

  const { messageBody, subject, sender, msgId } = req.body || {};
  if (!subject || !sender) return res.status(400).json({ error: 'Missing subject or sender' });

  try {
    // serve cached draft if fresh
    if (msgId) {
      const { data: row, error } = await supabase
        .from('inbox_messages')
        .select('id, draft_reply, draft_updated_at')
        .eq('msg_id', msgId)
        .maybeSingle();

      if (!error && row?.draft_reply && row?.draft_updated_at) {
        const age = Date.now() - new Date(row.draft_updated_at).getTime();
        if (age >= 0 && age < FRESH_MS) {
          return res.status(200).json({ reply: row.draft_reply, cached: true });
        }
      }
    }

    const reply = await generateReply({
      body: messageBody || '',
      subject: subject || '',
      sender: sender || '',
    });

    if (msgId) {
      try {
        await supabase
          .from('inbox_messages')
          .update({ draft_reply: reply, draft_updated_at: new Date().toISOString() })
          .eq('msg_id', msgId);
      } catch (e) {
        console.error('cache write failed:', e?.message || e);
      }
    }

    res.status(200).json({ reply, cached: false });
  } catch (err) {
    console.error('gpt-email-reply error:', err?.message || err);
    res.status(500).json({ error: String(err?.message || 'Failed to generate reply') });
  }
}
