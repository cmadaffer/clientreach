// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';
import cookie from 'cookie';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const userId = cookies.clientreach_user_id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - No user ID found in cookies' });
  }

  const { data: tokenRow, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'freshbooks')
    .single();

  if (error || !tokenRow) {
    return res.status(401).json({ error: 'Unauthorized - No token found' });
  }

  const { access_token } = tokenRow;

  try {
    const fbRes = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Api-Version': 'alpha'
      }
    });

    const fbData = await fbRes.json();

    if (!fbRes.ok) {
      return res.status(400).json({ error: 'Failed to fetch user data', details: fbData });
    }

    res.status(200).json({ freshbooksUser: fbData });
  } catch (err) {
    console.error('Error fetching from FreshBooks:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
