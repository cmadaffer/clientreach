// pages/api/gpt-email-reply.js
import { generateReply } from "../../lib/generateReply";
import { rateLimit } from "../../lib/rateLimit";
import { supabase } from "../../lib/supabaseClient";

// 3 requests / 10s per IP (was 2 / 8s)
const checkRate = rateLimit({ key: "gpt-reply", intervalMs: 10000, limit: 3 });

// cache freshness
const FRESH_MS = 24 * 60 * 60 * 1000; // 24h

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRate(req, res)) return; // 429 handled

  const { messageBody, subject, sender, msgId } = req.body || {};
  if (!subject || !sender) return res.status(400).json({ error: "Missing subject or sender." });

  try {
    // 1) Serve cached draft if available and fresh
    if (msgId) {
      const { data: row, error } = await supabase
        .from("inbox_messages")
        .select("id, draft_reply, draft_updated_at")
        .eq("msg_id", msgId)
        .maybeSingle();

      if (!error && row?.draft_reply && row?.draft_updated_at) {
        const age = Date.now() - new Date(row.draft_updated_at).getTime();
        if (age >= 0 && age < FRESH_MS) {
          return res.status(200).json({ reply: row.draft_reply, cached: true });
        }
      }
    }

    // 2) Generate fresh draft (fast model, short prompt)
    const reply = await generateReply({
      body: messageBody || "",
      subject: subject || "",
      sender: sender || "",
    });

    // 3) Save back to Supabase for future instant load
    if (msgId) {
      try {
        await supabase
          .from("inbox_messages")
          .update({ draft_reply: reply, draft_updated_at: new Date().toISOString() })
          .eq("msg_id", msgId);
      } catch (e) {
        // don't fail the request if cache write fails
        console.error("cache write failed:", e?.message || e);
      }
    }

    res.status(200).json({ reply, cached: false });
  } catch (err) {
    console.error("gpt-email-reply error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || "Failed to generate reply") });
  }
}
