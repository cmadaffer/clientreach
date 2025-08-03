// pages/api/send-test.js
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function renderTemplate(tpl, vars) {
  if (!tpl) return '';
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars?.[k] ?? ''));
}

function makeTransport() {
  // Simple SMTP (recommended)
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

  // OAuth2 (kept as fallback; ignored if EMAIL_PROVIDER=smtp)
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
    const { flow_id, to_email, variables } = req.body || {};
    if (!flow_id || !to_email) return res.status(400).json({ error: 'Missing flow_id or to_email' });

    const { data: flows, error: flowErr } = await supabase
      .from('message_flows')
      .select('*')
      .eq('id', flow_id)
      .limit(1);

    if (flowErr || !flows?.length) return res.status(404).json({ error: 'Flow not found' });

    const flow = flows[0];
    const subject = flow.name || 'ClientReach Message';
    const body = renderTemplate(flow.content, variables || {});

    const transporter = makeTransport();
    const fromAddr =
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      'no-reply@clientreach.local';

    const info = await transporter.sendMail({
      from: `"ClientReach" <${fromAddr}>`,
      to: to_email,
      subject,
      text: body,
    });

    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (e) {
    console.error('send-test error:', e?.response?.data || e?.message || e);
    return res.status(500).json({
      error: 'Failed to send test',
      details: e?.response?.data || e?.message || String(e),
    });
  }
}

