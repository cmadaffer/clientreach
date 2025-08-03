// pages/api/auth/freshbooks-auth.js
export default async function handler(req, res) {
  const clientId = process.env.FRESHBOOKS_CLIENT_ID;
  const redirectUri = 'https://clientreach.onrender.com/api/auth/freshbooks/callback';

  // ✅ Only use valid, needed scopes
  const scopes = [
    'user:profile:read',
    'user:clients:read',
  ];

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    // FreshBooks accepts space-separated scopes (encoded). Using '+' between items is also fine.
    scope: scopes.join(' '),
  });

  const authUrl = `https://auth.freshbooks.com/service/auth/oauth/authorize?${params.toString()}`;
  res.redirect(authUrl);
}
