// pages/api/contacts.js

import { getToken } from "next-auth/jwt";
import { fetchFreshBooks } from "@/lib/freshbooksClient";

export default async function handler(req, res) {
  const token = await getToken({ req });

  if (!token || !token.accessToken) {
    return res.status(401).json({ error: "Unauthorized - No token found" });
  }

  try {
    const data = await fetchFreshBooks("users/clients", token.accessToken);
    const clients = data?.response?.result?.clients || [];
    res.status(200).json({ contacts: clients });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to fetch FreshBooks contacts",
    });
  }
}
