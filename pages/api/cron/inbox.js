// pages/api/cron/inbox.js
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getServerClient } from '../../../lib/supa';
import { sendAck } from '../../../lib/mail';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CFG = {
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  user: process.env.GMAIL_USER,
  pass: process.env.GMAIL_APP_PASSWORD,
  lookbackDays: parseInt(process.env.INBOX_LOOKBACK_DAYS || '3', 10),
  includeSeen: (process.env.INBOX_INCLUDE_SEEN || 'false').toLowerCase() === 'true',
  skipAutos: (process.env.INBOX_SKIP_AUTOS || 'true').toLowerCase() === 'true',
  autoAck: (process.env.AUTO_ACK_ENABLED || 'false').toLowerCase() === 'true',
};

const SKIP_SENDERS = [
  'no-reply',
  'noreply',
  'mailer-daemon',
  'postmaster',
];

function isAutoAddress(addr = '') {
  const a = addr.toLowerCase();
  return SKIP_SENDERS.some((s) => a.includes(s));
}

function extractEmail(addr = '') {
  // "Name" <user@domain> -> user@domain
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}

export const config = {
  maxDuration: 60, // Render hard cap safety
};

export default async function handler(req, res) {
  const started = new Date();
  const supa = getServerClient();
  let client;
  let lock;

  const summary = { ok: true, processed: 0, skipped: 0, started: started.toISOString() };

  try {
    if (!CFG.user || !CFG.pass) {
      throw new Error('GMAIL creds not set');
    }

    client = new ImapFlow({
      host: CFG.host, port: CFG.port, secure: CFG.secure,
      auth: { user: CFG.user, pass: CFG.pass },
      logger: false,
      // prevent long hangs on busy connections
      socketTimeout: 50_000,
    });

    await client.connect();
    lock = await client.getMailboxLock('INBOX');

    const since = new Date(Date.now() - CFG.lookbackDays * 24 * 60 * 60 * 1000);

    const criteria = CFG.includeSeen
      ? { since }
      : { seen: false, since };

    const { uidList } = await client.search(criteria, { uid: true });

    for (const uid of uidList) {
      const src = await client.download(uid);
      if (!src) { summary.skipped++; continue; }

      const parsed = await simpleParser(src);
      const messageId = parsed.messageId || null;
      const subject = parsed.subject || '';
      const date = parsed.date ? new Date(parsed.date) : new Date();
      const fromAddr = (parsed.from?.text || '').trim();
      const toAddr = (parsed.to?.text || '').trim();
      const plain = parsed.text || '';

      // idempotency – skip if we’ve seen it
      if (messageId) {
        const { data: exists } = await supa
          .from('inbox_messages')
          .select('id,status')
          .eq('message_id', messageId)
          .limit(1)
          .maybeSingle();

        if (exists) {
          // Mark duplicate (optional)
          await supa.from('inbox_messages')
            .update({ status: exists.status?.startsWith('ack_') ? exists.status : 'duplicate' })
            .eq('id', exists.id);
          summary.skipped++;
          continue;
        }
      }

      // Insert the message
      const insert = {
        channel: 'email',
        direction: 'inbound',
        from_addr: fromAddr,
        to_addr: toAddr || CFG.user,
        subject,
        message_id: messageId,
        msg_date: date.toISOString(),
        body_text: plain,
        status: 'new',
        meta: {
          size: src.size || null,
        },
      };

      const { data: row, error: insErr } = await supa
        .from('inbox_messages')
        .insert(insert)
        .select('*')
        .single();

      if (insErr) throw insErr;

      // Decide if we auto-ack
      let didAck = false;
      if (CFG.autoAck) {
        const sender = extractEmail(fromAddr);
        const isSelf = sender.toLowerCase() === CFG.user.toLowerCase();
        const looksAuto = isAutoAddress(sender) || isAutoAddress(fromAddr);

        if (!isSelf && !looksAuto) {
          try {
            const ackId = await sendAck({ to: sender, originalSubject: subject });
            await supa.from('inbox_messages')
              .update({ status: 'ack_sent', ack_message_id: ackId || null })
              .eq('id', row.id);
            didAck = true;
          } catch (sendErr) {
            await supa.from('inbox_messages')
              .update({ status: 'error', meta: { ...(row.meta || {}), send_error: String(sendErr) } })
              .eq('id', row.id);
          }
          // small gap to be gentle on SMTP/IMAP
          await sleep(250);
        } else {
          await supa.from('inbox_messages')
            .update({ status: 'skipped' })
            .eq('id', row.id);
        }
      }

      summary.processed += didAck ? 1 : 0;
    }

    summary.finished = new Date().toISOString();
    res.status(200).json(summary);
  } catch (err) {
    console.error('INBOX ERROR:', err);
    res.status(500).json({ ok: false, error: String(err), ...summary });
  } finally {
    try { if (lock) lock.release(); } catch (_) {}
    try { if (client) await client.logout(); } catch (_) {}
  }
}
