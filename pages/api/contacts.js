// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // 1) Get latest FreshBooks token + account_id
    const { data: tokenRows, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('provider', 'freshbooks')
      .order('inserted_at', { ascending: false })
      .limit(1);

    if (error || !tokenRows?.length) {
      return res.status(401).json({ error: 'No FreshBooks token found' });
    }

    const { access_token, account_id } = tokenRows[0];
    if (!account_id) {
      return res.status(500).json({ error: 'FreshBooks account_id missing in database' });
    }

    // 2) Page through all clients
    const perPage = 100; // FreshBooks max page size
    let page = 1;
    let all = [];
    // Some accounts return pagination info; we’ll loop until we stop getting results
    for (;;) {
      const url =
        `https://api.freshbooks.com/accounting/account/${account_id}/users/clients` +
        `?page=${page}&per_page=${perPage}`;

      const resp = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Api-Version': 'alpha',
          'Content-Type': 'application/json',
        },
      });

      const batch = resp.data?.response?.result?.clients ?? [];
      all = all.concat(batch);

      // Stop when fewer than perPage returned (no more pages)
      if (batch.length < perPage) break;
      page += 1;

      // (Optional) tiny delay to be nice to the API; adjust if you hit 429s
      await new Promise(r => setTimeout(r, 120));
    }

    return res.status(200).json({ contacts: all, total: all.length });
  } catch (err) {
    console.error('🔥 FreshBooks API ERROR:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to fetch contacts from FreshBooks',
      details: err?.response?.data || err.message,
    });
  }
}
