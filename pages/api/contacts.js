// pages/api/contacts.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { data: tokenRows, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('provider', 'freshbooks')
      .order('inserted_at', { ascending: false })
      .limit(1);

    if (error || !tokenRows || tokenRows.length === 0) {
      return res.status(401).json({ error: 'No FreshBooks token found' });
    }

    const token = tokenRows[0];
    const accountId = process.env.FRESHBOOKS_ACCOUNT_ID;

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

    return res.status(200).json({ contacts: clients });
  } catch (err) {
    // 🚨 Log full FreshBooks error for inspection
    console.error('🔥 FreshBooks API ERROR:', JSON.stringify(err.response?.data || err.message, null, 2));

    return res.status(500).json({
      error: 'Failed to fetch contacts from FreshBooks',
      details: err.response?.data || err.message,
    });
  }
}
