import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import cookie from 'cookie';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing FreshBooks auth code.' });
  }

  try {
    // Step 1: Exchange auth code for access token
    const tokenResponse = await axios.post(
      'https://api.freshbooks.com/auth/oauth/token',
      {
        grant_type: 'authorization_code',
        client_id: process.env.FRESHBOOKS_CLIENT_ID,
        client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/freshbooks-callback`,
        code: code,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Step 2: Fetch identity (business ID)
    const identityResponse = await axios.get(
      'https://api.freshbooks.com/auth/api/v1/users/me',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const businessMembership = identityResponse.data.response.roles[0];
    const businessId = businessMembership.business.id;

    // Step 3: Store tokens and business ID in Supabase
    const { error } = await supabase
      .from('freshbooks_tokens')
      .upsert({
        user_email: req.cookies.user_email || 'anonymous',
        access_token,
        refresh_token,
        expires_in,
        business_id: businessId,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Token storage failed' });
    }

    // Step 4: Redirect to home or dashboard
    return res.redirect('/');
  } catch (err) {
    console.error('FreshBooks callback error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'FreshBooks OAuth failed' });
  }
}
