// pages/api/cron/inbox-process.js

import { ImapFlow } from 'imapflow'
import { supabase } from '../../lib/supabaseClient'

export default async function handler(req, res) {
  // Only allow GET (or scheduled) calls
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
    // Increase timeouts
    connectTimeout: 30000,   // 30s to connect
    socketTimeout: 120000,   // 2m for socket ops
  })

  try {
    await client.connect()
    // Select INBOX
    let lock = await client.getMailboxLock('INBOX')
    try {
      // Fetch unseen messages since last run…
      for await (let msg of client.fetch('1:*', { 
        envelope: true, 
        source: true 
      })) {
        const fromAddr = msg.envelope.from?.[0]?.address || ''
        const subject  = msg.envelope.subject || ''
        const body      = msg.source.toString('utf8')  // or parse MIME properly

        // Upsert into Supabase
        const { error } = await supabase
          .from('inbox_messages')
          .insert({ from_addr: fromAddr, subject, body })
          .onConflict('id')  // assuming you set id = msg.uid somewhere
        if (error) console.error('Supabase insert error:', error.message)
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error('IMAP fetch error:', err.code || err.message, err)
  } finally {
    try { await client.logout() } catch {}
  }

  res.status(200).json({ status: 'completed' })
}
