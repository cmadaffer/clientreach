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
    // 1. Exchange code for token
    const tokenRes = await axios.post('https://api.freshbooks.com/auth/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FRESHBOOKS_CLIENT_ID,
      client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
      redirect_uri: 'https://clientreach.onrender.com/api/auth/freshbooks/callback',
      code,
    });

    const {
      access_token,
      refresh_token,
      expires_in,
    } = tokenRes.data;

    // 2. Get user + account info
    const identityRes = await axios.get('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user_id = identityRes.data?.response?.id;
    const account_id = identityRes.data?.response?.business_memberships?.[0]?.account_id;

    if (!user_id || !account_id) {
      return res.status(500).json({ error: 'Missing identity or account_id from FreshBooks' });
    }

    // 3. Save everything to Supabase
    const { error: dbError } = await supabase
      .from('tokens')
      .upsert(
        {
          user_id,
          provider: 'freshbooks',
          access_token,
          refresh_token,
          expires_at: Date.now() + expires_in * 1000,
          account_id,
        },
        { onConflict: ['user_id', 'provider'] }
      );

    if (dbError) {
      console.error('Supabase token save error:', dbError);
      return res.status(500).json({ error: 'Failed to save token', details: dbError });
    }

    res.redirect('/contacts');
  } catch (err) {
    console.error('OAuth callback error:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Token exchange failed',
      details: err?.response?.data || err.message,
    });
  }
}

