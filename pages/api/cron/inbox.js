// pages/api/cron/inbox.js
// Gmail IMAP poller (fetch-based): robust for Gmail where download() may not return a source.
// Modes:
//   - default: unread + last 3 days + skip autos/bounces
//   - ?debug=1: include read + last 14 days + do NOT skip autos/bounces (for validation)

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

const LOG = '📬 INBOX';

// ---------- ENV / CLIENTS ----------
const REQUIRED_ENVS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IMAP_HOST',
  'IMAP_PORT',
  'IMAP_USER',
  'IMAP_PASS'
];

function assertEnv() {
  const missing = REQUIRED_ENVS.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Optional shared secret (set CRON_SECRET in Render and header X-Cron-Secret in your external cron)
function checkCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const header = req.headers['x-cron-secret'];
  if (header !== secret) throw new Error('Unauthorized cron caller (bad X-Cron-Secret)');
}

// ---------- INTENT / THREAD ----------
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

// ---------- PERSISTENCE ----------
async function alreadySaved(messageId) {
  if (!messageId) return false;
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();
  if (error) {
    console.warn(`${LOG} duplicate-check failed:`, error.message || error);
    return false;
  }
  return Boolean(data?.id);
}

async function saveInbound({ from, to, subject, bodyText, headers, messageId, inReplyTo, references }) {
  if (await alreadySaved(messageId)) {
    console.log(`${LOG} duplicate message_id, skipping save`, { messageId });
    return { id: null, intent: 'duplicate' };
  }

  const intent = classifyIntent(`${subject || ''}\n${bodyText || ''}`);
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
      msg_references: references || null, // NOTE: msg_references (not "references")
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

// ---------- IMAP (FETCH-BASED) ----------
async function fetchMail({ includeSeen, lookbackDays, skipAutos }) {
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
  console.log(`${LOG} Connected to IMAP`);
  const lock = await client.getMailboxLock('INBOX');
  console.log(`${LOG} Locked INBOX`);

  try {
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const searchQuery = includeSeen ? { since } : { seen: false, since };
    console.log(`${LOG} Searching with`, searchQuery);

    const uids = await client.search(searchQuery);
    console.log(`${LOG} Found ${uids.length} message(s)`);

    if (!uids.length) return { processed, skipped };

    // FETCH with source: true (reliable for Gmail)
    const fetcher = client.fetch({ uid: uids }, { source: true, envelope: true, flags: true, internalDate: true });

    for await (const msg of fetcher) {
      try {
        if (!msg.source) {
          console.warn(`${LOG} SKIP: no source stream for uid`, msg.uid);
          skipped++;
          continue;
        }

        const parsed = await simpleParser(msg.source).catch((e) => {
          console.error(`${LOG} parse error uid ${msg.uid}:`, e?.message || e);
          skipped++;
          return null;
        });
        if (!parsed) continue;

        const subject = parsed.subject || '';
        const from = parsed.from?.text || '';
        const messageId = parsed.messageId || '';
        const to = parsed.to?.text || parsed.headers?.get?.('delivered-to') || '';
        const text = parsed.text || '';
        const html = parsed.html || '';
        const bodyText = text || (html ? String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
        const inReplyTo = parsed.inReplyTo || '';
        const references = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');
        const headers = Object.fromEntries((parsed.headerLines || []).map(h => [h.key, h.line])) || {};

        console.log(`${LOG} UID ${msg.uid} FROM "${from}" SUBJECT "${subject}"`);

        const looksAuto = /auto-?reply|out of office|delivery status notification|mail delivery/i.test(subject);
        if (skipAutos && looksAuto) {
          await client.messageFlagsAdd(msg.uid, ['\\Seen']);
          skipped++;
          console.log(`${LOG} SKIPPED AUTO/BOUNCE uid ${msg.uid}`);
          // Optional audit row:
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
          } catch (e) {
            console.warn(`${LOG} save skipped_auto failed:`, e?.message || e);
          }
          continue;
        }

        const { intent } = await saveInbound({
          from, to, subject, bodyText, headers, messageId, inReplyTo, references
        });

        await client.messageFlagsAdd(msg.uid, ['\\Seen']);
        processed++;
        console.log(`${LOG} SAVED uid ${msg.uid} intent=${intent}`);
      } catch (loopErr) {
        console.error(`${LOG} UID ERROR ${msg.uid}:`, loopErr?.message || loopErr);
        skipped++;
      }
    }
  } finally {
    lock.release();
    await client.logout();
    console.log(`${LOG} Released lock & logged out`);
  }

  return { processed, skipped };
}

// ---------- API HANDLER ----------
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    assertEnv();
    checkCronSecret(req);

    const debug = String(req.query.debug || '').trim() === '1';
    const includeSeen = debug;           // debug mode includes read mail
    const lookbackDays = debug ? 14 : 3; // longer window in debug
    const skipAutos = !debug;            // do not skip autos in debug

    console.log(`${LOG} started`, {
      debug, includeSeen, lookbackDays, skipAutos,
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT || 993),
      secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
      user: process.env.IMAP_USER,
      passLen: process.env.IMAP_PASS ? String(process.env.IMAP_PASS).length : 0
    });

    const { processed, skipped } = await fetchMail({ includeSeen, lookbackDays, skipAutos });

    const body = { ok: true, processed, skipped, debug, includeSeen, lookbackDays, skipAutos, ts: new Date().toISOString() };
    console.log(`${LOG} done`, body);
    return res.status(200).json(body);
  } catch (err) {
    console.error(`${LOG} ERROR:`, err?.stack || err?.message || String(err));
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}

