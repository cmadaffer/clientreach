// File: pages/api/auth/freshbooks-auth.js
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  const state = uuidv4();
  const clientId = process.env.FRESHBOOKS_CLIENT_ID;
  const redirectUri = process.env.FRESHBOOKS_REDIRECT_URI;

  const authUrl = `https://auth.freshbooks.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&state=${state}&scope=admin:all`;

  res.redirect(authUrl);
}
