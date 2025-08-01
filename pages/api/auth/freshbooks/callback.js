// pages/api/auth/freshbooks/callback.js

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

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
    // Step 1: Exchange auth code for access token
    const tokenRes = await axios.post('https://api.freshbooks.com/auth/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FRESHBOOKS_CLIENT_ID,
      client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
      redirect_uri: 'https://clientreach.onrender.com/api/auth/freshbooks/callback', // <== HARDCODED
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

    // Step 2: Fetch user identity to link token to identity_id
    const identityRes = await axios.get('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const identity = identityRes.data?.response?.id;

    if (!identity) {
      return res.status(500).json({ error: 'Missing identity from FreshBooks profile' });
    }

    // Step 3: Store token in Supabase
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
      }, { onConflict: ['identity'] });

    if (dbError) {
      console.error('Supabase token save error:', dbError);
      return res.status(500).json({ error: 'Failed to save token', details: dbError });
    }

    // ✅ Success
    res.redirect('/contacts');
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error('OAuth callback error:', details);

    return res.status(500).json({
      error: 'Token exchange failed',
      details,
    });
  }
}

