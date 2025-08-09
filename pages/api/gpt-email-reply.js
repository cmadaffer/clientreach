// pages/api/gpt-email-reply.js
import { generateReply } from "@/lib/generateReply";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messageBody, subject, sender } = req.body || {};

  // Only require subject + sender; body can be empty (we'll prompt GPT accordingly)
  if (!subject || !sender) {
    return res.status(400).json({ error: "Missing subject or sender." });
  }

  try {
    const safeBody =
      (messageBody && String(messageBody).trim()) ||
      "(No body was provided. Draft a brief, polite reply asking for details and offering to schedule.)";

    const reply = await generateReply(safeBody, subject, sender);
    res.status(200).json({ reply });
  } catch (err) {
    console.error("Reply generation failed:", err);
    res.status(500).json({ error: "Failed to generate reply." });
  }
}
