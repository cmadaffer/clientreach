// pages/api/send-test.js
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// simple {{var}} replacement (only for plain text fallback)
function renderTemplate(tpl, vars) {
  if (!tpl) return '';
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars?.[k] ?? ''));
}

function makeTransport() {
  // SMTP path (stable, using Gmail App Password)
  if (process.env.EMAIL_PROVIDER === 'smtp' && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE ?? 'true') !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // OAuth2 fallback (not used if EMAIL_PROVIDER=smtp)
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER } = process.env;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: GMAIL_USER,
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      refreshToken: GMAIL_REFRESH_TOKEN,
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { flow_id, to_email, subject, body_html, body_text, variables } = req.body || {};
    if (!to_email) return res.status(400).json({ error: 'Missing to_email' });

    // subject fallback from flow if needed
    let finalSubject = subject || 'ClientReach Message';
    let finalText = body_text || '';
    let finalHtml = body_html || '';

    // If a flow is selected but subject/body not provided, pull flow content (legacy support)
    if (flow_id && (!finalText && !finalHtml || !finalSubject)) {
      const { data: flows, error: flowErr } = await supabase
        .from('message_flows')
        .select('*')
        .eq('id', flow_id)
        .limit(1);

      if (flowErr) throw new Error('Failed to load flow');
      if (flows?.length) {
        const flow = flows[0];
        finalSubject = finalSubject || flow.name || finalSubject;
        finalText = finalText || renderTemplate(flow.content, variables || {});
      }
    }

    const transporter = makeTransport();
    const fromEmail =
      process.env.FROM_ADDRESS ||
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      'no-reply@clientreach.local';

    const fromName = process.env.FROM_NAME || 'Frequensea Marine';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to_email,
      subject: finalSubject,
      // prefer HTML if provided, include text fallback
      html: finalHtml || undefined,
      text: finalText || (finalHtml ? '' : ' '),
    });

    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (e) {
    console.error('send-test error:', e?.response?.data || e?.message || e);
    return res.status(500).json({ error: 'Failed to send test', details: e?.message || String(e) });
  }
}

