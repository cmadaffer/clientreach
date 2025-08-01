// pages/api/contacts.js

import { createClient } from '@supabase/supabase-js';
import cookie from 'cookie';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const identityId = cookies.freshbooks_identity_id;

  if (!identityId) {
    return res.status(401).json({ error: 'Missing identity cookie' });
  }

  const { data: token, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('identity', identityId)
    .eq('provider', 'freshbooks')
    .single();

  if (error || !token?.access_token) {
    return res.status(401).json({ error: 'No valid token found for identity' });
  }

  try {
    const response = await fetch('https://api.freshbooks.com/accounting/account/me/clients/clients', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    const json = await response.json();
    const clients = json?.response?.result?.clients || [];

    res.status(200).json({ contacts: clients });
  } catch (err) {
    console.error('Error fetching clients from FreshBooks:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
}
