// pages/api/gpt-email-reply.js

import { generateReply } from "@/lib/generateReply";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messageBody, subject, sender } = req.body;

  if (!messageBody || !subject || !sender) {
    return res.status(400).json({ error: "Missing fields in request." });
  }

  try {
    const reply = await generateReply(messageBody, subject, sender);
    res.status(200).json({ reply });
  } catch (err) {
    console.error("Reply generation failed:", err);
    res.status(500).json({ error: "Failed to generate reply." });
  }
}
