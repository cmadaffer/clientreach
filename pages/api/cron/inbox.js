// pages/api/cron/inbox.js

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

/**
 * ---- Safety / Setup --------------------------------------------------------
 */
const REQUIRED_ENVS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IMAP_HOST',
  'IMAP_PORT',
  'IMAP_USER',
  'IMAP_PASS'
];

function checkEnv() {
  const missing = REQUIRED_ENVS.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Optional shared secret to block random callers (set CRON_SECRET in Render and cron-job.org header)
function checkCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // not enforced
  const header = req.headers['x-cron-secret'];
  if (header !== secret) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    throw new Error(`Unauthorized cron caller from ${ip}`);
  }
}

/**
 * ---- Helpers ---------------------------------------------------------------
 */

// Very light intent classifier (can be improved later)
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

// Derive a thread key (normalize subject or use reply headers)
function deriveThreadKey({ subject, inReplyTo, references }) {
  if (inReplyTo) return String(inReplyTo).trim();
  if (references) {
    const parts = String(references).trim().split(/\s+/);
    if (parts.length) return parts[parts.length - 1];
  }
  const s = (subject || '').replace(/^(\s*(re|fwd|fw):\s*)+/gi, '').trim().toLowerCase();
  return s || null;
}

// Persist an inbound message + analytics event
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
      msg_references: references || null, // IMPORTANT: msg_references (not "references")
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

/**
 * ---- IMAP Fetcher ----------------------------------------------------------
 */

async function fetchUnreadSince({ days = 3 }) {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    logger: false
  });

  let processed = 0;
  let skipped = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const uids = await client.search({ seen: false, since });

      for (const uid of uids) {
        // Download full source to feed mailparser
        const { source } = await client.download(uid);
        const parsed = await simpleParser(source);

        const subject = parsed.subject || '';
        // Skip common auto replies / bounces
        if (/auto-?reply|out of office|delivery status notification|mail delivery/i.test(subject)) {
          await client.messageFlagsAdd(uid, ['\\Seen']);
          skipped++;
          continue;
        }

        const messageId = parsed.messageId || '';
        const from = parsed.from?.text || '';
        const to = parsed.to?.text || parsed.headers.get('delivered-to') || '';
        const text = parsed.text || '';
        const html = parsed.html || '';
        const bodyText = text || (html ? String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
        const inReplyTo = parsed.inReplyTo || '';
        const references = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');

        // Store raw header lines as a simple key:value object
        let headers = {};
        if (parsed.headerLines?.length) {
          headers = Object.fromEntries(parsed.headerLines.map((h) => [h.key, h.line]));
        }

        await saveInbound({
          from,
          to,
          subject,
          bodyText,
          headers,
          messageId,
          inReplyTo,
          references
        });

        await client.messageFlagsAdd(uid, ['\\Seen']);
        processed++;
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch {}
  }

  return { processed, skipped };
}

/**
 * ---- API Handler -----------------------------------------------------------
 */

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    checkEnv();
    checkCronSecret(req);

    const started = new Date().toISOString();
    console.log(`📬 /api/cron/inbox started @ ${started}`);

    const { processed, skipped } = await fetchUnreadSince({ days: 3 });

    const finished = new Date().toISOString();
    console.log(`✅ /api/cron/inbox finished @ ${finished} | processed=${processed} skipped=${skipped}`);

    return res.status(200).json({
      ok: true,
      processed,
      skipped,
      started,
      finished
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('❌ inbox cron error:', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
