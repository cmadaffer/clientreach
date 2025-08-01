// pages/api/auth/freshbooks/callback.js
import { createClient } from '@supabase/supabase-js';
import cookie from 'cookie';

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
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', process.env.FRESHBOOKS_CLIENT_ID);
    params.append('client_secret', process.env.FRESHBOOKS_CLIENT_SECRET);
    params.append('code', code);
    params.append('redirect_uri', 'https://clientreach.onrender.com/api/auth/freshbooks/callback');

    const tokenRes = await fetch('https://api.freshbooks.com/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();
    console.log('Token exchange result:', tokenData);

    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(400).json({ error: 'Token exchange failed', details: tokenData });
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const userId = req.cookies?.clientreach_user_id || crypto.randomUUID();

    const { error } = await supabase.from('tokens').upsert({
      user_id: userId,
      provider: 'freshbooks',
      access_token,
      refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + expires_in
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to save token', details: error });
    }

    // Set cookie for clientreach_user_id
    res.setHeader('Set-Cookie', cookie.serialize('clientreach_user_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax'
    }));

    res.redirect('/contacts');
  } catch (err) {
    console.error('Callback handler exception:', err);
    res.status(500).json({ error: 'Unexpected error during token exchange' });
  }
}

