// pages/api/auth/freshbooks-callback.js
export default async function handler(req, res) {
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code not provided' });
  }

  // Placeholder for now until we have client ID/secret
  res.status(200).json({ message: 'FreshBooks auth callback received', code });
}
