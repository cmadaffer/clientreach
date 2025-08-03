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

    const { access_token, account_id } = tokenRows[0];
    if (!account_id) {
      return res.status(500).json({ error: 'FreshBooks account_id missing in database' });
    }

    const url = `https://api.freshbooks.com/accounting/account/${account_id}/users/clients`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Api-Version': 'alpha',
        'Content-Type': 'application/json',
      },
    });

    const clients = response.data?.response?.result?.clients || [];
    return res.status(200).json({ contacts: clients });
  } catch (err) {
    console.error('🔥 FreshBooks API ERROR:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to fetch contacts from FreshBooks',
      details: err?.response?.data || err.message,
    });
  }
}
