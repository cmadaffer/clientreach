import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { supabase } from '../../../lib/supabaseClient'

// Cron handler: fetch unseen emails, upsert into Supabase, mark as seen
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
      // Compute the since-date filter
      const lookbackDays = Number(process.env.INBOX_LOOKBACK_DAYS || 1)
      const sinceDate = new Date(Date.now() - lookbackDays * 86400000)
        .toISOString()
        .split('T')[0]

      // Search for unseen messages since the given date
      const uids = await client.search({ seen: false, since: sinceDate })

      for await (let msg of client.fetch(uids, { envelope: true, source: true, uid: true })) {
        const parsed = await simpleParser(msg.source)
        const from       = parsed.from?.text || parsed.from?.value[0]?.address || ''
        const subject    = parsed.subject || ''
        const body       = parsed.text || parsed.html || ''
        const created_at = parsed.date?.toISOString() || new Date().toISOString()
        const direction  = 'inbound'
        // Use Gmail message-id if available, else fallback to UID as string
        const msg_id     = parsed.messageId || msg.envelope?.messageId || String(msg.uid)

        // Upsert into Supabase to avoid duplicates on msg_id
        const { error: upsertError } = await supabase
          .from('inbox_messages')
          .upsert(
            [{ msg_id, from_addr: from, subject, body, created_at, direction }],
            { onConflict: 'msg_id' }
          )
        if (upsertError) {
          console.error('Supabase upsert error:', upsertError.message)
        }

        // Mark the message as seen so it won’t be fetched again
        await client.messageFlagsAdd(msg.uid, ['\\Seen'])
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

