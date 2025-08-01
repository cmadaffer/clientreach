// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const userId = req.cookies?.clientreach_user_id || 'clientreach-debug-user';

  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'freshbooks')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Supabase token fetch error:', error);
    return res.status(500).json({ error: 'Token fetch failed' });
  }

  if (!tokens || !tokens.access_token) {
    return res.status(401).json({ error: 'No token found' });
  }

  const accessToken = tokens.access_token;

  try {
    const response = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const userData = await response.json();
    console.log('FreshBooks user profile:', userData);

    // You can also fetch clients if needed here
    res.status(200).json({ success: true, user: userData });
  } catch (err) {
    console.error('Error accessing FreshBooks API:', err);
    res.status(500).json({ error: 'Failed to access FreshBooks' });
  }
}
