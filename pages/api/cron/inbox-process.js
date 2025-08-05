// pages/api/cron/inbox-process.js

import { google } from 'googleapis'
import { supabase } from '../../../lib/supabaseClient'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const oAuth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  oAuth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })

  const gmail = google.gmail({ version: 'v1', auth: oAuth2 })

  try {
    const listRes = await gmail.users.messages.list({
      userId: process.env.GMAIL_USER,
      maxResults: 50,
      q: 'in:inbox'
    })
    const messages = listRes.data.messages || []

    for (let { id } of messages) {
      const msgRes = await gmail.users.messages.get({
        userId: process.env.GMAIL_USER,
        id,
        format: 'full'
      })

      const headers = (msgRes.data.payload.headers || []).reduce((acc, h) => {
        acc[h.name.toLowerCase()] = h.value
        return acc
      }, {})

      const from    = headers.from    || ''
      const subject = headers.subject || ''
      let body       = ''

      const parts = msgRes.data.payload.parts || []
      const plain = parts.find(p => p.mimeType === 'text/plain')
      if (plain?.body?.data) {
        body = Buffer.from(plain.body.data, 'base64').toString('utf8')
      }

      const { error } = await supabase
        .from('inbox_messages')
        .upsert(
          { id, from_addr: from, subject, body },
          { onConflict: 'id' }
        )
      if (error) console.error('Supabase upsert error:', error.message)
    }

    return res
      .status(200)
      .json({ status: 'completed', fetched: messages.length })
  } catch (err) {
    console.error('Gmail API error:', err)
    return res.status(500).json({ error: err.message })
  }
}

