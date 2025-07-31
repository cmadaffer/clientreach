// pages/api/auth/freshbooks/callback.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    const tokenRes = await axios.post('https://api.freshbooks.com/auth/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FRESHBOOKS_CLIENT_ID,
      client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
      code,
      redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Save tokens to Supabase
    const { error } = await supabase
      .from('tokens')
      .insert([{ access_token, refresh_token, expires_in }]);

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to save tokens' });
    }

    // Redirect to /contacts
    res.redirect('/contacts');
  } catch (err) {
    console.error('Callback handler error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Callback error' });
  }
}

