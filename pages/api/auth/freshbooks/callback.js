// pages/api/auth/freshbooks/callback.js

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import cookie from 'cookie';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code from FreshBooks' });
  }

  try {
    // Step 1: Exchange code for token
    const tokenRes = await axios.post('https://api.freshbooks.com/auth/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FRESHBOOKS_CLIENT_ID,
      client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
      redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI,
      code,
    });

    const {
      access_token,
      refresh_token,
      expires_in,
      token_type,
      scope,
      created_at,
    } = tokenRes.data;

    // Step 2: Get FreshBooks user ID
    const identityRes = await axios.get('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const identity = identityRes.data?.response?.id;
    if (!identity) {
      return res.status(500).json({ error: 'Missing identity from FreshBooks' });
    }

    // Step 3: Store token
    const { error: dbError } = await supabase
      .from('tokens')
      .upsert({
        identity,
        access_token,
        refresh_token,
        expires_in,
        token_type,
        scope,
        created_at,
        provider: 'freshbooks',
      }, { onConflict: ['identity'] });

    if (dbError) {
      console.error('Supabase token save error:', dbError);
      return res.status(500).json({ error: 'Failed to save token', details: dbError });
    }

    // Step 4: Set cookie with identity
    res.setHeader('Set-Cookie', cookie.serialize('freshbooks_identity_id', identity, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }));

    res.redirect('/contacts');
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error('OAuth callback error:', details);
    res.status(500).json({ error: 'Token exchange failed', details });
  }
}

