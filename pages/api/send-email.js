// pages/api/send-email.js
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      to,
      subject,
      text,
      html,
      inReplyTo, // optional msg_id for threading
      references, // optional array
    } = req.body || {};

    if (!to || !(subject || text || html)) {
      return res.status(400).json({ error: 'Missing to/subject/body' });
    }

    const FROM = process.env.SMTP_FROM || process.env.IMAP_USER;
    if (!FROM) return res.status(500).json({ error: 'Missing SMTP_FROM/IMAP_USER env' });

    // ❌ Never email ourselves or no-reply addresses (prevents ping-pong)
    const lcTo = String(to).toLowerCase();
    const lcFrom = String(FROM).toLowerCase();
    const toDomain = lcTo.split('@')[1] || '';
    const fromDomain = lcFrom.split('@')[1] || '';
    if (lcTo === lcFrom || (!lcTo.includes('@')) || lcTo.includes('no-reply') || (toDomain && toDomain === fromDomain)) {
      return res.status(400).json({ error: 'Refusing to send to self/no-reply/same-domain' });
    }

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: {
        user: process.env.SMTP_USER || process.env.IMAP_USER,
        pass: process.env.SMTP_PASS || process.env.IMAP_PASS,
      },
    });

    const headers = {
      'Auto-Submitted': 'auto-replied',          // tell other bots not to answer
      'X-Auto-Response-Suppress': 'All',         // Outlook/Exchange
      'Precedence': 'bulk',                      // mailing/list hint
      'X-ClientReach': 'outbound',               // our custom marker
    };
    if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
    if (Array.isArray(references) && references.length) {
      headers['References'] = references.join(' ');
    }

    const info = await transport.sendMail({
      from: FROM,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      headers,
    });

    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (err) {
    console.error('send-email error:', err?.message || err);
    return res.status(500).json({ error: 'Send failed' });
  }
}
