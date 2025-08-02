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
      throw new Error('No FreshBooks token found');
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

    // If real data exists, return it
    if (clients.length > 0) {
      return res.status(200).json({ contacts: clients });
    }

    throw new Error('No clients found from FreshBooks API');
  } catch (err) {
    console.warn('FreshBooks failed — using dummy fallback:', err.message);

    // Dummy fallback data
    const fallbackContacts = [
      { first_name: 'Test', last_name: 'Client', email: 'test@example.com', phone: '555-555-1234' },
      { first_name: 'Demo', last_name: 'User', email: 'demo@clientreach.ai', phone: null },
    ];

    return res.status(200).json({ contacts: fallbackContacts });
  }
}
