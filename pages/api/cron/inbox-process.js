// pages/api/cron/inbox-process.js

import { ImapFlow } from 'imapflow'
import { supabase } from '../../../lib/supabaseClient'   // ← updated path

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    connectTimeout: 30000,
    socketTimeout: 120000,
  })

  try {
    await client.connect()
    let lock = await client.getMailboxLock('INBOX')
    try {
      for await (let msg of client.fetch('1:*', { envelope: true, source: true })) {
        const fromAddr = msg.envelope.from?.[0]?.address || ''
        const subject  = msg.envelope.subject || ''
        const body     = msg.source.toString('utf8')

        const { error } = await supabase
          .from('inbox_messages')
          .insert({ from_addr: fromAddr, subject, body })
          .onConflict('id')
        if (error) console.error('Supabase insert error:', error.message)
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error('IMAP fetch error:', err.code || err.message)
  } finally {
    try { await client.logout() } catch {}
  }

  res.status(200).json({ status: 'completed' })
}
