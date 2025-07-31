// pages/api/auth/freshbooks/callback.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const tokenRes = await fetch('https://api.freshbooks.com/auth/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Version': 'alpha',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.FRESHBOOKS_CLIENT_ID,
        client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
        code,
        redirect_uri: process.env.NEXTAUTH_URL, // Make sure this is set correctly
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Token error:', tokenData);
      return res.status(500).json({ error: 'Token exchange failed' });
    }

    const { access_token, refresh_token, expires_in, created_at } = tokenData;

    // Store token in Supabase (you can adapt this to your user structure)
    const { error } = await supabase
      .from('tokens')
      .insert([
        {
          provider: 'freshbooks',
          access_token,
          refresh_token,
          expires_in,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to store token in Supabase' });
    }

    return res.redirect('/contacts');
  } catch (err) {
    console.error('Callback handler crash:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
