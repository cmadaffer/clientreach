// pages/api/cron/inbox-process.js
import { supabase } from '../../../lib/supabaseClient';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { flagImportant } from '../../../lib/flagImportant';

const MIN_INTERVAL_MS = 20_000; // throttle to avoid hammering on Render free/auto-idle
let lastRun = 0;

function cleanText(str = '') {
  const s = String(str || '');
  return s.replace(/\r/g, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'throttled' });
  }
  lastRun = now;

  const { IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS } = process.env;
  if (!IMAP_HOST || !IMAP_PORT || !IMAP_USER || !IMAP_PASS) {
    return res.status(500).json({ error: 'IMAP env vars missing' });
  }

  let client;
  try {
    // find last message time to limit fetch window
    const { data: last } = await supabase
      .from('inbox_messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const baseline = last?.created_at ? new Date(last.created_at).getTime() - 60 * 60 * 1000 : Date.now() - 7 * 24 * 60 * 60 * 1000;
    const sinceDate = new Date(Math.max(0, baseline));

    client = new ImapFlow({
      host: IMAP_HOST,
      port: Number(IMAP_PORT),
      secure: Number(IMAP_PORT) === 993,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
    });

    await client.connect();
    await client.mailboxOpen('INBOX');

    const lock = await client.getMailboxLock('INBOX');
    try {
      const toInsert = [];

      // Fetch messages since date; include flags to know seen/unseen; include full source to parse.
      for await (const msg of client.fetch({ since: sinceDate }, { envelope: true, flags: true, source: true, uid: true })) {
        const flags = Array.isArray(msg.flags) ? msg.flags : [];
        // Parse safely
        const parsed = await simpleParser(msg.source);
        const fromAddr = parsed?.from?.value?.[0]?.address || parsed?.from?.text || msg?.envelope?.from?.[0]?.address || '';
        const subject = parsed?.subject || msg?.envelope?.subject || '(no subject)';
        const date = parsed?.date || msg?.envelope?.date || new Date();
        const textBody = cleanText(parsed?.text || '');

        const msgId = (parsed?.messageId || msg?.envelope?.messageId || msg?.uid || `${fromAddr}|${subject}|${date}`).toString();

        // Direction
        const direction = (fromAddr && IMAP_USER && fromAddr.toLowerCase() === IMAP_USER.toLowerCase()) ? 'outbound' : 'inbound';

        // Important scoring (fast heuristic + optional OpenAI)
        let important = false;
        try {
          const flag = await flagImportant({ subject, body: textBody, from: fromAddr });
          important = !!flag?.important;
        } catch {}

        toInsert.push({
          msg_id: msgId,
          from_addr: fromAddr,
          subject: subject || '(no subject)',
          body: textBody,
          created_at: new Date(date).toISOString(),
          direction,
          important,
          // flags example: mark seen if present
          seen: flags.includes('\\Seen'),
        });
      }

      if (toInsert.length) {
        const { error } = await supabase
          .from('inbox_messages')
          .upsert(toInsert, { onConflict: 'msg_id', ignoreDuplicates: true });
        if (error) throw error;
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return res.status(200).json({ ok: true, imported: true });
  } catch (e) {
    try { await client?.logout(); } catch {}
    console.error('IMAP sync error:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'IMAP sync failed' });
  }
}
