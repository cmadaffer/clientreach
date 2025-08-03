// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllClients({ access_token, account_id }) {
  const perPage = 100;
  let page = 1;
  let all = [];
  let totalPages = null;

  while (true) {
    const url =
      `https://api.freshbooks.com/accounting/account/${account_id}/users/clients` +
      `?page=${page}&per_page=${perPage}&include_pagination=true`;

    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Api-Version': 'alpha',
        'Content-Type': 'application/json',
      },
    });

    const result = resp.data?.response?.result || {};
    const batch = result.clients || [];
    const pagesMeta = result.pages || null;

    if (pagesMeta && typeof pagesMeta === 'object') {
      totalPages = pagesMeta.pages ?? totalPages;
    }

    all = all.concat(batch);
    if (totalPages ? page >= totalPages : batch.length < perPage) break;
    page += 1;
  }

  return all;
}

function displayName(c) {
  const org = c?.organization || c?.business_name || '';
  const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim();
  return (org || name || c?.email || '').toString().trim();
}

export default async function handler(req, res) {
  try {
    const sort = (req.query.sort || 'name').toString(); // 'name' | 'created'
    const dir = (req.query.dir || 'asc').toString();    // 'asc' | 'desc'
    const dirFactor = dir === 'desc' ? -1 : 1;

    // 1) get token + account
    const { data: rows, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('provider', 'freshbooks')
      .order('inserted_at', { ascending: false })
      .limit(1);

    if (error || !rows?.length) {
      return res.status(401).json({ error: 'No FreshBooks token found' });
    }
    const { access_token, account_id } = rows[0];
    if (!account_id) {
      return res.status(500).json({ error: 'FreshBooks account_id missing in database' });
    }

    // 2) fetch all
    const clients = await fetchAllClients({ access_token, account_id });

    // 3) sort server-side for a stable order
    const sorted = clients.slice().sort((a, b) => {
      if (sort === 'created') {
        const aDate = new Date(a?.created_at || a?.updated || 0).getTime() || 0;
        const bDate = new Date(b?.created_at || b?.updated || 0).getTime() || 0;
        return (aDate - bDate) * dirFactor;
      }
      // default: name/org
      const an = displayName(a).toLowerCase();
      const bn = displayName(b).toLowerCase();
      if (an < bn) return -1 * dirFactor;
      if (an > bn) return 1 * dirFactor;
      return 0;
    }
