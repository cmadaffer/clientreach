// pages/api/send-email.js
import nodemailer from 'nodemailer';

function bool(v, def = false) {
  if (v === undefined) return def;
  return String(v).toLowerCase() === 'true';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, text, inReplyTo } = req.body || {};
  if (!to || !subject || !text) return res.status(400).json({ error: 'Missing fields in request' });

  const {
    SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({ error: 'SMTP env vars missing' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: bool(SMTP_SECURE, Number(SMTP_PORT) === 465),
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const headers = { 'X-ClientReach': 'sent' };
    if (inReplyTo) {
      headers['In-Reply-To'] = inReplyTo;
      headers['References'] = inReplyTo;
    }

    const info = await transporter.sendMail({
      from: SMTP_USER,
      to,
      subject,
      text,
      headers,
    });

    res.status(200).json({ ok: true, id: info?.messageId || null });
  } catch (e) {
    console.error('send-email error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Send failed' });
  }
}
