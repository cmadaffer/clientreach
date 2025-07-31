// pages/api/contacts.js

import { getToken } from "next-auth/jwt";
import { getFreshBooksClients } from "@/lib/freshbooksClient";

export default async function handler(req, res) {
  const token = await getToken({ req });

  if (!token || !token.accessToken) {
    return res.status(401).json({ error: "Unauthorized - No access token" });
  }

  const accountId = process.env.FRESHBOOKS_ACCOUNT_ID;

  if (!accountId) {
    return res.status(500).json({ error: "Missing FreshBooks Account ID" });
  }

  try {
    const clients = await getFreshBooksClients(token.accessToken, accountId);
    res.status(200).json({ contacts: clients });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contacts", details: error.message });
  }
}
