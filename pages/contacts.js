// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('freshbooks_tokens')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !data?.access_token || !data?.account_id) {
      return res.status(401).json({ error: 'Unauthorized - No token or account ID found' });
    }

    const { access_token, account_id } = data;

    const clientRes = await axios.get(
      `https://api.freshbooks.com/accounting/account/${account_id}/users/clients`,
      {
        headers: { Authorization: `Bearer ${access_token}` }
      }
    );

    const clients = clientRes.data.response.result.clients;
    res.status(200).json({ contacts: clients });
  } catch (err) {
    console.error('Contacts API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
}

