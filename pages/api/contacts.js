import { getToken } from "next-auth/jwt";

export default async function handler(req, res) {
  const token = await getToken({ req });

  if (!token || !token.accessToken) {
    return res.status(401).json({ error: "Unauthorized - No access token" });
  }

  const accountId = process.env.FRESHBOOKS_ACCOUNT_ID; // Set this manually for now

  if (!accountId) {
    return res.status(500).json({ error: "Missing FreshBooks Account ID" });
  }

  try {
    const response = await fetch(
      `https://api.freshbooks.com/accounting/account/${accountId}/users/clients`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
          "Api-Version": "alpha",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    const clients = data?.response?.result?.clients || [];
    res.status(200).json({ contacts: clients });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contacts", details: error.message });
  }
}
