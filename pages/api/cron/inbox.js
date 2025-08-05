// pages/api/cron/inbox.js
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export const config = { api: { bodyParser: false } };

function env(name, fallback) {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env: ${name}`);
}

export default async function handler(req, res) {
  const started = new Date().toISOString();
  let client;
  let processed = 0;
  let skipped = 0;
  let emails = [];

  const q = req.query || {};
  const includeSeen = q.includeSeen === "1" || q.includeSeen === "true";
  const lookbackDays = Number(q.lookbackDays ?? 14);

  const IMAP_HOST = env("IMAP_HOST", "imap.gmail.com");
  const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
  const IMAP_SECURE = (process.env.IMAP_SECURE ?? "true") !== "false";
  const IMAP_USER = env("IMAP_USER");
  const IMAP_PASS = env("IMAP_PASS") || env("GMAIL_APP_PASSWORD");

  try {
    client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: IMAP_SECURE,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
      socketTimeout: 60000,
      greetingTimeout: 30000,
      idleTimeout: 60000,
    });

    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true, lock: true });

    const since = new Date(Date.now() - lookbackDays * 86400000);
    const searchCriteria = includeSeen ? { since } : { seen: false, since };
    const uids = await client.search(searchCriteria);

    if (!uids.length) {
      return res.status(200).json({ ok: true, emails: [], note: "No messages" });
    }

    for await (const msg of client.fetch(uids, {
      uid: true,
      envelope: true,
      internalDate: true,
      source: true,
    })) {
      if (!msg.source) {
        skipped++;
        continue;
      }

      const parsed = await safeParse(msg.source);
      emails.push({
        uid: msg.uid,
        from: parsed.from?.text || "",
        subject: parsed.subject || "",
        date: msg.internalDate,
        preview: parsed.text?.slice(0, 300) || "",
      });

      processed++;
    }

    return res.status(200).json({
      ok: true,
      processed,
      skipped,
      started,
      finished: new Date().toISOString(),
      emails,
    });
  } catch (err) {
    console.error("INBOX ERROR:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  } finally {
    try {
      if (client?.mailbox) await client.mailboxClose();
    } catch {}
    try {
      if (client?.connected) await client.logout();
    } catch {}
  }
}

async function safeParse(streamOrBuffer) {
  try {
    return await simpleParser(streamOrBuffer);
  } catch {
    return { subject: "", text: "", html: "", from: { text: "" } };
  }
}
