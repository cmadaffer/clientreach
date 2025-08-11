// pages/api/message-body.js
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const msgId = req.query.msg_id;

  if (!msgId) return res.status(400).json({ error: 'msg_id is required' });

  try {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('body')
      .eq('msg_id', msgId)
      .maybeSingle();

    if (error) throw error;
    res.status(200).json({ body: data?.body || '' });
  } catch (e) {
    console.error('message-body error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Failed to load message body' });
  }
}
