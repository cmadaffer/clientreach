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

  // query flags for ad-hoc debugging
  const q = req.query || {};
  const includeSeen = q.includeSeen === "1" || q.includeSeen === "true";
  const lookbackDays = Number(q.lookbackDays ?? 3);
  const debug = q.debug === "1" || q.debug === "true";

  const IMAP_HOST = env("IMAP_HOST", "imap.gmail.com");
  const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
  const IMAP_SECURE = (process.env.IMAP_SECURE ?? "true") !== "false";
  const IMAP_USER = env("IMAP_USER");
  const IMAP_PASS = env("IMAP_PASS") || env("GMAIL_APP_PASSWORD");

  const log = (...args) => debug && console.log("📬", ...args);

  try {
    client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: IMAP_SECURE,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
      // shorter socket timeouts so we don't hang
      socketTimeout: 60_000,
      greetingTimeout: 30_000,
      idleTimeout: 60_000,
    });

    log("INBOX connect", {
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: IMAP_SECURE,
      user: IMAP_USER,
      passLen: IMAP_PASS?.length || 0,
      includeSeen,
      lookbackDays,
    });

    await client.connect();
    log("Connected");

    // Lock mailbox for safe concurrent access
    await client.mailboxOpen("INBOX", { readOnly: false, lock: true });
    log("Locked INBOX");

    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const searchCriteria = includeSeen
      ? { since }
      : { seen: false, since };

    log("Searching", searchCriteria);
    const uids = (await client.search(searchCriteria)) || [];
    log("Search result count", uids.length);

    // Nothing to do
    if (uids.length === 0) {
      return res.status(200).json({
        ok: true,
        processed,
        skipped,
        started,
        finished: new Date().toISOString(),
        note: "no messages matched",
      });
    }

    // Fetch minimal headers first (guards against empty/closed streams)
    for await (const msg of client.fetch(uids, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      source: true, // raw stream (may be missing on some servers)
    })) {
      try {
        const uid = msg.uid;
        const env = msg.envelope || {};
        const subject = env.subject || "";
        const from =
          (env.from && env.from.map(a => a.address || a.name).join(", ")) || "";
        const date = msg.internalDate || new Date();

        // Some servers provide msg.source as null if message is too large
        if (!msg.source) {
          skipped++;
          log("SKIP: no source stream for uid", uid);
          continue;
        }

        // Parse safely
        const parsed = await safeParse(msg.source);
        processed++;

        log(`Parsed uid ${uid}`, {
          from: parsed.from?.text,
          subject: parsed.subject,
          date,
        });

        // TODO: Save to Supabase (kept optional & safe)
        // await saveToSupabase({ uid, from, subject, date, html: parsed.html, text: parsed.text });

      } catch (err) {
        skipped++;
        console.error("INBOX item error:", err?.message || err);
      }
    }

    return res.status(200).json({
      ok: true,
      processed,
      skipped,
      started,
      finished: new Date().toISOString(),
    });
  } catch (err) {
    console.error("INBOX ERROR:", err);
    return res.status(200).json({
      ok: true,
      error: String(err),
      processed,
      skipped,
      started,
      finished: new Date().toISOString(),
    });
  } finally {
    // Always try to release lock and logout
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
  } catch (e) {
    // Fall back to empty parsed object
    return { subject: "", text: "", html: "", from: { text: "" } };
  }
}
