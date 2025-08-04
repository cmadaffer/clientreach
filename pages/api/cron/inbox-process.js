// pages/api/cron/inbox-process.js
// Process ONE IMAP message by UID (fast, reliable). Defaults to Gmail [Gmail]/All Mail.
// Usage:
//   /api/cron/inbox-process?uid=122
//   Optional: &mailbox=INBOX

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

const LOG = '📬 PROCESS';

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

async function alreadySaved(messageId) {
  if (!messageId) return false;
  const { data } = await supabase
    .from('inbox_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();
  return Boolean(data?.id);
}

export default async function handler(req, res) {
  try {
    assertEnv();
    const uid = Number(req.query.uid || 0);
    if (!uid || !Number.isFinite(uid)) return res.status(400).json({ ok: false, error: 'Missing uid' });

    const mailbox = (req.query.mailbox || '').toString() ||
      (String(process.env.IMAP_HOST).includes('gmail') ? '[Gmail]/All Mail' : 'INBOX');

    const client = new ImapFlow({
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT || 993),
      secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
      auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
      logger: false,
      socketTimeout: 20000,
      tls: { servername: process.env.IMAP_HOST }
    });

    await client.connect();
    const lock = await client.getMailboxLock(mailbox);

    try {
      // fetch exactly one message by UID, with raw source
      const fetcher = client.fetch({ uid }, { source: true, envelope: true, flags: true, internalDate: true });
      let msg = null;
      for await (const it of fetcher) { msg = it; break; }
      if (!msg) return res.status(404).json({ ok: false, error: `UID ${uid} not found in ${mailbox}` });
      if (!msg.source) return res.status(500).json({ ok: false, error: `UID ${uid} has no source stream` });

      const parsed = await simpleParser(msg.source);
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

      // duplicate guard
      if (await alreadySaved(messageId)) {
        // mark seen and return
        try { await client.messageFlagsAdd(uid, ['\\Seen']); } catch {}
        return res.status(200).json({ ok: true, processed: 0, skipped: 1, reason: 'duplicate', uid, subject });
      }

      const intent = classifyIntent(`${subject}\n${bodyText}`);
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
          msg_references: references || null,
          thread_key,
          intent,
          meta: headers || {},
          status: intent === 'unsubscribe' ? 'handled' : 'new'
        })
        .select('id')
        .single();

      if (error) throw error;

      // best-effort mark read
      try { await client.messageFlagsAdd(uid, ['\\Seen']); } catch {}

      await supabase.from('events').insert({
        type: intent === 'unsubscribe' ? 'unsubscribe' : 'reply',
        payload: { message_id: messageId, intent, from, to, subject }
      });

      return res.status(200).json({ ok: true, processed: 1, uid, subject, intent, mailbox });
    } finally {
      try { lock.release(); } catch {}
      try { await client.logout(); } catch {}
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
