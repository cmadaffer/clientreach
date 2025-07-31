// pages/api/auth/freshbooks/callback.js

export default async function handler(req, res) {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  try {
    const tokenRes = await fetch('https://api.freshbooks.com/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.FRESHBOOKS_CLIENT_ID,
        client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/freshbooks/callback`,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    // For now, just dump token data to confirm it works:
    console.log('FreshBooks token data:', tokenData);

    return res.redirect('/contacts'); // or wherever your app goes after auth
  } catch (err) {
    console.error('FreshBooks OAuth error:', err);
    return res.status(500).send('OAuth failed');
  }
}
