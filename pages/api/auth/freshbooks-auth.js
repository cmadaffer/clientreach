// ✅ pages/api/auth/freshbooks-auth.js
export default async function handler(req, res) {
  const clientId = process.env.FRESHBOOKS_CLIENT_ID;
  const redirectUri = 'https://clientreach.onrender.com/api/auth/freshbooks/callback';
  const scopes = [
    'user:profile:read',
    'user:account:read',
    'user:clients:read'
  ];

  const authUrl = `https://auth.freshbooks.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join('+')}`;

  res.redirect(authUrl);
}
