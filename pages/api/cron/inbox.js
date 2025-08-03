// pages/api/cron/inbox.js
import { simpleParser } from 'mailparser';
import { ImapFlow } from 'imapflow';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// simple intent classifier (safe starter)
function classifyIntent(text) {
  const t = (text || '').toLowerCase();
  if (/stop|unsubscribe|remove me|no longer/i.test(t)) return 'unsubscribe';
  if (/schedule|book|appointment|available|time|when/i.test(t)) return 'book_service';
  if (/price|cost|quote|estimate/i.test(t)) return 'price_question';
  if (/resched|another day|different time/i.test(t)) return 'reschedule';
  if (/wrong|not me|who is this/i.test(t)) return 'wrong_contact';
  if (/thank/i.test(t)) return 'ack';
  return 'general_question';
}

// derive a thread key to group messages (subject minus re: fwd:, or in-reply-to)
function threadKey({ subject, inReplyTo, references }) {
  if (inReplyTo) return inReplyTo.trim();
  if (references) return references.split(/\s+/).slice(-1)[0];
  return (subject || '').replace(/^(\s*(re|fwd):\s*)+/i, '').trim().toLowerCase();
}

async function saveInbound({ from, to, subject, text, html, headers, msgId, inReplyTo, references }) {
  const body = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const intent = classifyIntent(`${subject}\n${body}`);
  const tkey = threadKey({ subject, inReplyTo, references });

  // store message
  const { data, error } = await supabase
    .from('inbox_messages')
    .insert({
      channel: 'email',
      direction: 'inbound',
      from_addr: from,
      to_addr: to,
      subject,
      body,
      message_id: msgId,
      in_reply_to: inReplyTo || null,
      references: references || null,
      thread_key: tkey || null,
      intent,
      meta: headers || {}
    })
    .select('id')
    .single();

  if (error) throw error;

  // events row
  await supabase.from('events').insert({
    type: intent === 'unsubscribe' ? 'unsubscribe' : 'reply',
    payload: { message_id: msgId, intent, from, to, subject }
  });

  // handle unsubscribe immediately
  if (intent === 'unsubscribe' && to) {
    // minimal: mark status handled — you can add an unsubscribes table later
    await supabase
      .from('inbox_messages')
      .update({ status: 'handled' })
      .eq('id', data.id);
  }

  return data.id;
}

export default async function handler(req, res) {
  // Allow GET for cron; POST also OK
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS
    }
  });

  let processed = 0;

  try {
    await client.connect();
    // lock INBOX
    let lock = await client.getMailboxLock('INBOX');
    try {
      // search unseen in the last 3 days
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const seq = await client.search({ seen: false, since });

      for (const uid of seq) {
        const { source } = await client.download(uid);
        const parsed = await simpleParser(source);

        const msgId = parsed.messageId || '';
        const from = parsed.from?.text || '';
        const to = parsed.to?.text || '';
        const subject = parsed.subject || '';
        const text = parsed.text || '';
        const html = parsed.html || '';
        const inReplyTo = parsed.inReplyTo || '';
        const references = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');
        const headers = Object.fromEntries(parsed.headerLines?.map(h => [h.key, h.line]) || []);

        // ignore pure delivery receipts/spammy auto-replies (light filter)
        if (/auto-?reply|out of office|delivery status notification/i.test(subject)) {
          await client.messageFlagsAdd(uid, ['\\Seen']);
          continue;
        }

        await saveInbound({ from, to, subject, text, html, headers, msgId, inReplyTo, references });

        // mark seen so we don't reprocess
        await client.messageFlagsAdd(uid, ['\\Seen']);
        processed++;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return res.status(200).json({ ok: true, processed });
  } catch (e) {
    console.error('inbox cron error:', e?.message || e);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: 'Inbox cron failed', details: e?.message || String(e) });
  }
}
