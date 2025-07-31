// pages/api/contacts.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { data: tokens, error } = await supabase
    .from('freshbooks_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !tokens || tokens.length === 0) {
    return res.status(401).json({ error: 'Unauthorized - No token found' });
  }

  const { access_token } = tokens[0];

  try {
    const apiRes = await fetch('https://api.freshbooks.com/accounting/account/me/contacts/contacts', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Api-Version': 'alpha',
        'Content-Type': 'application/json',
      },
    });

    const apiData = await apiRes.json();

    const contacts = apiData?.response?.result?.contacts || [];

    return res.status(200).json({ contacts });
  } catch (err) {
    console.error('Fetch contacts failed:', err);
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
}
