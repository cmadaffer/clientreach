// pages/api/send-email.js
import { supabase } from '../../lib/supabaseClient';

// Use dynamic import so build doesn't choke if nodemailer isn't needed during build.
async function getTransporter() {
  const nodemailer = await import('nodemailer');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true'; // true for 465, false for 587
  const user = process.env.SMTP_USER || process.env.IMAP_USER;
  const pass = process.env.SMTP_PASS || process.env.IMAP_PASS;

  return nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { to, subject, text, inReplyTo } = await req.body || {};
    if (!to || !subject || !text) {
      return res.status(400).json({ error: 'Missing to/subject/text' });
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.IMAP_USER;
    if (!from) return res.status(500).json({ error: 'Missing SMTP_FROM/SMTP_USER/IMAP_USER env' });

    const transporter = await getTransporter();

    const headers = {};
    if (inReplyTo) headers['In-Reply-To'] = inReplyTo;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,            // plain text
      headers,
    });

    const msgId = info?.messageId || `${Date.now()}`;

    // Log sent message so it appears in the list (simple: use same table)
    const { error: upsertErr } = await supabase
      .from('inbox_messages')
      .upsert([{
        msg_id: msgId,
        from_addr: from,        // sender (you)
        subject,
        body: text,
        created_at: new Date(),
        direction: 'outbound',
      }], { onConflict: 'msg_id' });

    if (upsertErr) {
      // Don't fail the send if logging flaked
      console.error('Supabase log error:', upsertErr.message);
    }

    return res.status(200).json({ ok: true, messageId: msgId });
  } catch (err) {
    console.error('send-email error:', err);
    return res.status(500).json({ error: err.message || 'Send failed' });
  }
}
