// pages/api/gmail.js

import { getToken } from "next-auth/jwt";

const GMAIL_API_URL = "https://www.googleapis.com/gmail/v1/users/me/messages";

export default async function handler(req, res) {
  const token = await getToken({ req });

  if (!token || !token.accessToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const response = await fetch(`${GMAIL_API_URL}?maxResults=5`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error });
    }

    const messages = await response.json();
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Gmail messages", details: err });
  }
}
