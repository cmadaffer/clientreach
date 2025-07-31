// pages/api/auth/freshbooks/callback.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokenRes = await fetch('https://api.freshbooks.com/auth/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Version': 'alpha'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.FRESHBOOKS_CLIENT_ID,
        client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirect_uri: 'https://clientreach.onrender.com/api/auth/freshbooks/callback',
        code
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(401).json({ error: 'Token exchange failed', details: tokenData });
    }

    // 🔒 Store token in Supabase (using dummy user_id for now)
    const { error } = await supabase
      .from('tokens')
      .upsert({
        user_id: 'test-user', // Replace with real user_id when you add auth
        provider: 'freshbooks',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Supabase storage error:', error);
      return res.status(500).json({ error: 'Failed to store token' });
    }

    // ✅ Redirect to contacts
    res.redirect('/contacts');

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: 'Callback handler failed' });
  }
}
