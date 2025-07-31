export default async function handler(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - No token found" });
  }

  const token = authHeader.split(" ")[1];
  const accountId = process.env.FRESHBOOKS_ACCOUNT_ID;

  if (!accountId) {
    return res.status(500).json({ error: "Missing FreshBooks Account ID" });
  }

  try {
    const response = await fetch(
      `https://api.freshbooks.com/accounting/account/${accountId}/users/clients`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
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
