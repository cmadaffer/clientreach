export default async function handler(req, res) {
  const code = req.query.code;

  const response = await fetch('https://api.freshbooks.com/auth/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.FRESHBOOKS_CLIENT_ID,
      client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
      redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI,
      code,
    }),
  });

  const data = await response.json();

  if (data.access_token) {
    // Store securely (cookie, db, etc)
    res.status(200).json({ success: true, tokens: data });
  } else {
    res.status(500).json({ error: data });
  }
}
