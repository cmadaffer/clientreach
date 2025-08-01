// pages/api/auth/freshbooks/callback.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  try {
    // 1. Exchange code for tokens
    const tokenRes = await axios.post('https://api.freshbooks.com/auth/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FRESHBOOKS_CLIENT_ID,
      client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
      code,
      redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI
    });

    const { access_token, refresh_token } = tokenRes.data;

    // 2. Get profile (identity + business memberships)
    const profileRes = await axios.get('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const memberships = profileRes.data.response.business_memberships;
    const account_id = memberships?.[0]?.account_id; // Extract first business ID

    if (!account_id) {
      return res.status(500).json({ error: 'No account ID found in FreshBooks profile' });
    }

    // 3. Store access_token and account_id in Supabase
    await supabase.from('freshbooks_tokens').upsert({
      id: 1, // single user for now
      access_token,
      refresh_token,
      account_id
    });

    res.redirect('/contacts');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Token exchange failed' });
  }
}

