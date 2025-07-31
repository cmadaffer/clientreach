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
        'Authorization': 'Basic ' + Buffer.from(`${process.env.FRESHBOOKS_CLIENT_ID}:${process.env.FRESHBOOKS_CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://clientreach.onrender.com/api/auth/freshbooks/callback'
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(401).json({ error: 'Token exchange failed', data: tokenData });
    }

    // Save token to Supabase
    const { error } = await supabase
      .from('tokens')
      .insert([
        {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in
        }
      ]);

    if (error) throw error;

    return res.redirect('/contacts');
  } catch (err) {
    return res.status(500).json({ error: 'Callback error', details: err.message });
  }
}

