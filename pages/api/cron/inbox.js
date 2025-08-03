// pages/api/cron/inbox.js (diagnostic)

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

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
    const msg = `Missing environment variables: ${missing.join(', ')}`;
    console.error('ENV CHECK FAILED:', msg);
    throw new Error(msg);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function checkCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const header = req.headers['x-cron-secret'];
  if (header !== secret) throw new Error('Unauthorized cron caller (bad X-Cron-Secret)');
}

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

async function saveInbound(row) {
  const combined = `${row.subject || ''}\n${row.bodyText || ''}`;
  const intent = classifyIntent(combined);
  const thread_key = deriveThreadKey({
    subject: row.subject,
    inReplyTo: row.inReplyTo,
    references: row.references
  });

  const { error } = await supabase.from('inbox_messages').insert({
    channel: 'email',
    direction: 'inbound',
    from_addr: row.from || null,
    to_addr: row.to || null,
    subject: row.subject || null,
    body: row.bodyText || null,
    message_id: row.messageId || null,
    in_reply_to: row.inReplyTo || null,
    msg_references: row.references || null,
    thread_key,
    intent,
    meta: row.headers || {},
    status: intent === 'unsubscribe' ? 'handled' : 'new'
  });

  if (error) throw error;

  await supabase.from('events').insert({
    type: intent === 'unsubscribe' ? 'unsubscribe' : 'reply',
    payload: { message_id: row.messageId, intent, from: row.from, to: row.to, subject: row.subject }
  });

  return intent;
}

async function fetchUnreadSince({ days = 3 }) {
  console.log('STEP A: building IMAP client with envs:', {
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
    user: process.env.IMAP_USER,
    passLen: process.env.IMAP_PASS ? String(process.env.IMAP_PASS).length : 0
  });

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
  console.log('STEP B: connected to IMAP');

  const lock = await client.getMailboxLock('INBOX');
  console.log('STEP C: locked INBOX');

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    console.log('STEP D: searching unseen since', since.toISOString());
    const uids = await client.search({ seen: false, since });
    console.log('STEP E: search found', uids.length, 'messages');

    for (const uid of uids) {
      try {
        console.log('STEP F: downloading uid', uid);
        const { source } = await client.download(uid);
        if (!source) {
          console.warn('WARN: no source stream for uid', uid);
          skipped++;
          continue;
        }

        const parsed = await simpleParser(source).catch((e) => {
          console.error('MAILPARSE ERROR uid', uid, e?.message || e);
          skipped++;
          return null;
        });
        if (!parsed) continue;

        const subject = parsed.subject || '';
        if (/auto-?reply|out of office|delivery status notification|mail delivery/i.test(subject)) {
          await client.messageFlagsAdd(uid, ['\\Seen']);
          skipped++;
          console.log('STEP G: skipped auto/bounce uid', uid);
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
        const headers = Object.fromEntries((parsed.headerLines || []).map((h) => [h.key, h.line]));

        const intent = await saveInbound({
          from, to, subject, bodyText, headers, messageId, inReplyTo, references
        });

        await client.messageFlagsAdd(uid, ['\\Seen']);
        processed++;
        console.log('STEP H: saved uid', uid, 'intent=', intent);
      } catch (innerErr) {
        console.error('UID ERROR', uid, innerErr?.message || innerErr);
        // do not throw; continue to next message
        skipped++;
      }
    }
  } finally {
    lock.release();
    await client.logout();
    console.log('STEP Z: released lock & logged out');
  }

  return { processed, skipped };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    checkEnv();
    checkCronSecret(req);

    const started = new Date().toISOString();
    console.log(`📬 /api/cron/inbox started @ ${started}`);

    const { processed, skipped } = await fetchUnreadSince({ days: 3 });

    const finished = new Date().toISOString();
    console.log(`✅ /api/cron/inbox finished @ ${finished} | processed=${processed} skipped=${skipped}`);

    return res.status(200).json({ ok: true, processed, skipped, started, finished });
  } catch (err) {
    console.error('❌ inbox cron error:', err?.stack || err?.message || String(err));
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
