// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Robust pagination that respects FreshBooks metadata
async function fetchAllClients({ access_token, account_id }) {
  const perPage = 100; // FreshBooks max
  let page = 1;
  let all = [];
  let totalPages = null; // from metadata when available

  while (true) {
    const url =
      `https://api.freshbooks.com/accounting/account/${account_id}/users/clients`
      + `?page=${page}&per_page=${perPage}&include_pagination=true`;

    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Api-Version': 'alpha',
        'Content-Type': 'application/json',
      },
    });

    const result = resp.data?.response?.result || {};
    const batch = result.clients || [];
    const pagesMeta = result.pages || result?.page || null;

    // Try to read official meta
    // Expected: { page, pages, per_page, total }
    if (pagesMeta && typeof pagesMeta === 'object') {
      totalPages = pagesMeta.pages ?? totalPages;
    }

    all = all.concat(batch);

    // Decide if we’re done:
    if (totalPages) {
      if (page >= totalPages) break;
    } else {
      // Fallback: stop when fewer than perPage came back
      if (batch.length < perPage) break;
    }

    page += 1;

    // Gentle delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  return all;
}

export default async function handler(req, res) {
  try {
    // 1) Get latest token + account_id
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

    // 2) Fetch all active clients
    let contacts = await fetchAllClients({ access_token, account_id });

    // 3) Optional pass for archived/inactive if FreshBooks separates them.
    // If your count still looks short, uncomment this block to try `active=false`.
    // try {
    //   const inactive = await fetchAllClients({ access_token, account_id, active: false });
    //   contacts = contacts.concat(inactive);
    // } catch (e) {
    //   // ignore if endpoint doesn't support the flag
    // }

    return res.status(200).json({ contacts, total: contacts.length });
  } catch (err) {
    console.error('🔥 FreshBooks API ERROR:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to fetch contacts from FreshBooks',
      details: err?.response?.data || err.message,
    });
  }
}
