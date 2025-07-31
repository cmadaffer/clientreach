// pages/api/auth/freshbooks-auth.js
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  const state = uuidv4();

  const clientId = process.env.FRESHBOOKS_CLIENT_ID;
  const redirectUri = process.env.NEXTAUTH_URL + '/api/auth/freshbooks-callback';

  const authUrl = `https://auth.freshbooks.com/oauth/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'user:profile accounting:read',
      state,
    });

  res.redirect(authUrl);
}
