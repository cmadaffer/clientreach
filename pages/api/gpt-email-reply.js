// pages/api/gpt-email-reply.js
import { generateReply } from "@/lib/generateReply";
import { rateLimit } from "@/lib/rateLimit";

const checkRate = rateLimit({ key: "gpt-reply", intervalMs: 8000, limit: 2 }); // 2 req / 8s per IP

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRate(req, res)) return; // 429 handled inside

  const { messageBody, subject, sender } = req.body || {};
  if (!subject || !sender) return res.status(400).json({ error: "Missing subject or sender." });

  try {
    const safeBody =
      (messageBody && String(messageBody).trim()) ||
      "(No body provided. Draft a brief, polite reply asking for the needed details and offering to schedule.)";

    const reply = await generateReply(safeBody, subject, sender);
    res.status(200).json({ reply });
  } catch (err) {
    // Emit a clear error for your Render logs AND return it to the client
    console.error("gpt-email-reply error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || "Failed to generate reply") });
  }
}
