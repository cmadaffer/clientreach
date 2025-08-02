// pages/api/contacts.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// For now, we fetch the most recent FreshBooks token (assumes single user)
export default async function handler(req, res) {
  try {
    const { data: tokenRows, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('provider', 'freshbooks')
      .order('inserted_at', { ascending: false })
      .limit(1);

    if (error || !tokenRows || tokenRows.length === 0) {
      return res.status(401).json({ error: 'No valid FreshBooks token found' });
    }

    const token = tokenRows[0];

    const accountId = process.env.FRESHBOOKS_ACCOUNT_ID;

    if (!accountId) {
      return res.status(500).json({ error: 'Missing FreshBooks Account ID in env' });
    }

    const response = await axios.get(
      `https://api.freshbooks.com/accounting/account/${accountId}/users/clients`,
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Api-Version': 'alpha',
          'Content-Type': 'application/json',
        },
      }
    );

    const clients = response.data?.response?.result?.clients || [];
    res.status(200).json({ contacts: clients });
  } catch (err) {
    console.error('Fetch contacts error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch contacts', details: err?.message });
  }
}
