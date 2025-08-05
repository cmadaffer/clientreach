// pages/api/cron/inbox-process.js

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { supabase } from '../../../lib/supabaseClient'

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
    socketTimeout: 60000,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const lookbackDays = Number(process.env.INBOX_LOOKBACK_DAYS || 1)
      const sinceDate = new Date(Date.now() - lookbackDays * 86400000)
        .toISOString()
        .split('T')[0]

      // Fetch unseen UIDs since the lookback date
      const uids = await client.search({ seen: false, since: sinceDate })

      for await (let msg of client.fetch(uids, { envelope: true, source: true, uid: true })) {
        const parsed = await simpleParser(msg.source)
        const from        = parsed.from?.text || parsed.from?.value[0]?.address || ''
        const subject     = parsed.subject || ''
        const body        = parsed.text || parsed.html || ''
        const created_at  = parsed.date?.toISOString() || new Date().toISOString()
        const direction   = 'inbound'  // satisfy NOT NULL

        // Insert into Supabase (uuid `id` is auto-generated)
        const { error } = await supabase
          .from('inbox_messages')
          .insert([{ from_addr: from, subject, body, created_at, direction }])

        if (error) {
          console.error('Supabase insert error:', error.message)
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
    return res.status(200).json({ status: 'completed' })
  } catch (err) {
    console.error('IMAP sync error:', err)
    try { await client.logout() } catch {}
    return res.status(500).json({ error: err.message })
  }
}

