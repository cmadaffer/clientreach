// pages/api/flows.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('message_flows')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('flows query error:', error);
      return res.status(500).json({ error: 'Failed to load flows' });
    }

    return res.status(200).json({ flows: data || [] });
  } catch (e) {
    console.error('flows error:', e);
    return res.status(500).json({ error: 'Failed to load flows' });
  }
}
