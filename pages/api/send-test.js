// pages/api/send-test.js
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple handlebars-style replace: {{Key}}
function renderTemplate(tpl, vars) {
  if (!tpl) return '';
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars?.[key] ?? ''));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { flow_id, to_email, variables } = req.body || {};
    if (!flow_id || !to_email) {
      return res.status(400).json({ error: 'Missing flow_id or to_email' });
    }

    // 1) Load flow
    const { data: flows, error: flowErr } = await supabase
      .from('message_flows')
      .select('*')
      .eq('id', flow_id)
      .limit(1);

    if (flowErr || !flows?.length) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const flow = flows[0];
    const subject = flow.name || 'ClientReach Message';
    const body = renderTemplate(flow.content, variables || {});

    // 2) Send email via Gmail OAuth2 (requires env)
    const {
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN,
      GMAIL_USER,
    } = process.env;

    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_USER) {
      return res.status(400).json({
        error: 'Email not configured',
        details: 'Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER in Render env.'
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: GMAIL_CLIENT_ID,
        clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN,
      },
    });

    const info = await transporter.sendMail({
      from: `"ClientReach" <${GMAIL_USER}>`,
      to: to_email,
      subject,
      text: body,
    });

    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (e) {
    console.error('send-test error:', e);
    return res.status(500).json({ error: 'Failed to send test', details: e.message });
  }
}
