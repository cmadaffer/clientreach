// pages/api/cron/inbox.js
// Full inbox poller: connects to Gmail via IMAP (App Password), parses unread messages,
// classifies intent, stores in Supabase, logs why items are skipped, and returns a summary.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

/* ===========================
   Configuration
=========================== */
const DAYS_LOOKBACK = 3; // change to 14 if you want a longer window
const LOG_PREFIX = '📬 INBOX';

/* ===========================
   Env & Clients
=========================== */
const REQUIRED_ENVS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IMAP_HOST',
  'IMAP_PORT',
  'IMAP_USER',
  'IMAP_PASS'
];

function assertEnv() {
  const missing = REQUIRED_ENVS.filter(
    (k) => !process.env[k] || String(process.env[k]).trim() === ''
  );
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Optional: protect the route so only your cron caller can trigger it
function checkCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // not enforced unless set
  const header = req.headers['x-cron-secret'];
  if (header !== secret) {
    throw new Error('Unauthorized cron caller (bad X-Cron-Secret)');
  }
}

/* ===========================
   Helpers: intent & threading
=========================== */
function classifyIntent(text) {
  const t = (text || '').toLowerCase();
  if (/stop|unsubscribe|remove me|opt[- ]?out|no longer/i.test(t)) return 'unsubscribe';
  if (/schedule|book|appointment|available|when|time|slot/i.test(t)) return 'book_service';
  if (/price|cost|quote|estimate/i.test(t)) return 'price_question';
  if (/re(?:schedule|book)|different time|another day|push back/i.test(t)) return 'reschedule';
  if (/wrong|not me|who is this/i.test(t)) return 'wrong_contact';
  if (/thank|thanks|appreciate/i.test(t)) return 'ack';
  return 'general_question';
}

function deriveThreadKey({ subject, inReplyTo, references }) {
  if (inReplyTo) return String(inReplyTo).trim();
  if (references) {
    const parts = String(references).trim().split(/\s+/);
    if (parts.length) return parts[parts.length - 1];
  }
  const s = (subject || '').replace(/^(\s*(re|fwd|fw):\s*)+/gi, '').trim().toLowerCase();
  return s || null;
}

/* ===========================
   Persistence
=========================== */

// Duplicate guard (by RFC822 Message-ID)
async function alreadySaved(messageId) {
  if (!messageId) return false;
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();
  if (error) {
    console.warn(`${LOG_PREFIX} WARN duplicate check failed:`, error.message || error);
    return false;
  }
  return Boolean(data?.id);
}

async function saveInbound({
  from,
  to,
  subject,
  bodyText,
  headers,
  messageId,
  inReplyTo,
  references
}) {
  // Duplicate guard
  if (await alreadySaved(messageId)) {
    console.log(`${LOG_PREFIX} duplicate message_id, skipping save`, { messageId });
    return { id: null, intent: 'duplicate' };
  }

  const combined = `${subject || ''}\n${bodyText || ''}`;
  const intent = classifyIntent(combined);
  const thread_key = deriveThreadKey({ subject, inReplyTo, references });

  const { data, error } = await supabase
    .from('inbox_messages')
    .insert({
      channel: 'email',
      direction: 'inbound',
      from_addr: from || null,
      to_addr: to || null,
      subject: subject || null,
      body: bodyText || null,
      message_id: messageId || null,
      in_reply_to: inReplyTo || null,
      msg_references: references || null, // IMPORTANT: "msg_references" (not "references")
      thread_key,
      intent,
      meta: headers || {},
      status: intent === 'unsubscribe' ? 'handled' : 'new'
    })
    .select('id')
    .single();

  if (error) throw error;

  await supabase.from('events').insert({
    type: intent === 'unsubscribe' ? 'unsubscribe' : 'reply',
    payload: { message_id: messageId, intent, from, to, subject }
  });

  return { id: data.id, intent };
}

/* ===========================
   IMAP Fetch Logic
=========================== */
async function fetchUnreadSince({ days = DAYS_LOOKBACK }) {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    logger: false
  });

  let processed = 0;
  let skipped = 0;

  await client.connect();
  console.log(`${LOG_PREFIX} STEP B: Connected to IMAP`);
  const lock = await client.getMailboxLock('INBOX');
  console.log(`${LOG_PREFIX} STEP C: Locked INBOX`);

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    console.log(`${LOG_PREFIX} STEP D: Searching unseen since ${since.toISOString()}`);
    const uids = await client.search({ seen: false, since });
    console.log(`${LOG_PREFIX} STEP E: Search found ${uids.length} message(s)`);

    for (const uid of uids) {
      try {
        console.log(`${LOG_PREFIX} STEP F: Downloading uid ${uid}`);
        const { source } = await client.download(uid);

        if (!source) {
          console.warn(`${LOG_PREFIX} SKIP: no source stream for uid`, uid);
          skipped++;
          continue;
        }

        const parsed = await simpleParser(source).catch((e) => {
          console.error(`${LOG_PREFIX} MAILPARSE ERROR uid ${uid}:`, e?.message || e);
          skipped++;
          return null;
        });
        if (!parsed) continue;

        const subject = parsed.subject || '';
        const messageId = parsed.messageId || '';
        const from = parsed.from?.text || '';
        const to =
          parsed.to?.text ||
          parsed.headers?.get?.('delivered-to') ||
          '';
        const text = parsed.text || '';
        const html = parsed.html || '';
        const bodyText =
          text || (html ? String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
        const inReplyTo = parsed.inReplyTo || '';
        const references = Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : parsed.references || '';
        const headers =
          Object.fromEntries((parsed.headerLines || []).map((h) => [h.key, h.line])) || {};

        // Skip common auto-replies and bounces, but log + optionally audit-save
        if (/auto-?reply|out of office|delivery status notification|mail delivery/i.test(subject)) {
          await client.messageFlagsAdd(uid, ['\\Seen']);
          skipped++;
          console.log(`${LOG_PREFIX} SKIP auto/bounce:`, { uid, subject, from });

          // OPTIONAL: store skipped autos for audit
          try {
            await supabase.from('inbox_messages').insert({
              channel: 'email',
              direction: 'inbound',
              from_addr: from || null,
              to_addr: to || null,
              subject: subject || null,
              body: bodyText || null,
              message_id: messageId || null,
              status: 'skipped_auto'
            });
          } catch (auditErr) {
            console.warn(`${LOG_PREFIX} save skipped_auto failed:`, auditErr?.message || auditErr);
          }

          continue;
        }

        // Save inbound & classify
        const { intent } = await saveInbound({
          from,
          to,
          subject,
          bodyText,
          headers,
          messageId,
          inReplyTo,
          references
        });

        // Mark seen so we don't re-process
        await client.messageFlagsAdd(uid, ['\\Seen']);
        processed++;
        console.log(`${LOG_PREFIX} STEP H: saved uid ${uid} intent=${intent}`);
      } catch (loopErr) {
        console.error(`${LOG_PREFIX} UID ERROR ${uid}:`, loopErr?.message || loopErr);
        skipped++;
        // do not throw; continue processing the rest
      }
    }
  } finally {
    lock.release();
    await client.logout();
    console.log(`${LOG_PREFIX} STEP Z: Released lock & logged out`);
  }

  return { processed, skipped };
}

/* ===========================
   API Handler
=========================== */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    assertEnv();
    checkCronSecret(req);

    const started = new Date().toISOString();
    console.log(`${LOG_PREFIX} started @ ${started}`, {
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT || 993),
      secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
      user: process.env.IMAP_USER,
      passLen: process.env.IMAP_PASS ? String(process.env.IMAP_PASS).length : 0
    });

    const { processed, skipped } = await fetchUnreadSince({ days: DAYS_LOOKBACK });

    const finished = new Date().toISOString();
    console.log(`${LOG_PREFIX} finished @ ${finished} | processed=${processed} skipped=${skipped}`);

    return res.status(200).json({ ok: true, processed, skipped, started, finished });
  } catch (err) {
    console.error(`${LOG_PREFIX} ERROR:`, err?.stack || err?.message || String(err));
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}

