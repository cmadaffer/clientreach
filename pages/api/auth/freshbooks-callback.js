import { serialize } from "cookie";
import axios from "axios";

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const clientId = process.env.FRESHBOOKS_CLIENT_ID;
    const clientSecret = process.env.FRESHBOOKS_CLIENT_SECRET;
    const redirectUri = process.env.FRESHBOOKS_REDIRECT_URI || "https://clientreach.onrender.com/api/auth/freshbooks-callback";

    const tokenRes = await axios.post(
      "https://api.freshbooks.com/auth/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Get the account ID from /auth/api/me
    const meRes = await axios.get("https://api.freshbooks.com/auth/api/v1/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const accountId = meRes.data?.response?.business_memberships?.[0]?.business?.account_id;

    if (!accountId) {
      return res.status(500).json({ error: "Failed to retrieve FreshBooks Account ID" });
    }

    // Store token + account ID in secure cookies
    res.setHeader("Set-Cookie", [
      serialize("fb_access_token", access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 3600,
        path: "/",
      }),
      serialize("fb_account_id", accountId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 3600,
        path: "/",
      }),
    ]);

    // Redirect to contacts page
    res.redirect("/contacts");
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err.message);
    res.status(500).json({ error: "OAuth failed", detail: err.response?.data || err.message });
  }
}
