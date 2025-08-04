// lib/mail.js
import nodemailer from 'nodemailer';

export function makeTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export async function sendAck({ to, originalSubject }) {
  const transporter = makeTransport();
  const from = process.env.GMAIL_USER;

  const subject = `Re: ${originalSubject || 'Thanks for reaching out'}`;
  const text = [
    `Hi there,`,
    ``,
    `We got your message and we're on it.`,
    `A technician will follow up shortly. If this is urgent, call us at 1-888-446-2746.`,
    ``,
    `— Frequensea Marine | ClientReach Assistant`,
  ].join('\n');

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  return info.messageId || null;
}
