// pages/api/auth/freshbooks-auth.js

export default async function handler(req, res) {
  const clientId = process.env.FRESHBOOKS_CLIENT_ID;
  const redirectUri = 'https://clientreach.onrender.com/api/auth/freshbooks/callback';

  // Include scopes that guarantee user + business + accounting access
  const scopes = [
    'user:profile:read',
    'user:business:read',
    'accounting:read',
  ];

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '), // spaces will be URL-encoded
  });

  const authUrl = `https://auth.freshbooks.com/service/auth/oauth/authorize?${params.toString()}`;
  res.redirect(authUrl);
}
