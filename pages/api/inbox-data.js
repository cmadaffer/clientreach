/* pages/api/inbox-data.js */
import { supabase } from '../../lib/supabaseClient'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const page = parseInt(req.query.page, 10) || 1
  const pageSize = parseInt(req.query.pageSize, 10) || 10
  const from = (page - 1) * pageSize
  const to = page * pageSize - 1

  try {
    const { data: messages = [], count, error } = await supabase
      .from('inbox_messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    // Deduplicate messages by msg_id in JavaScript
    const seen = new Set()
    const deduped = messages.filter((m) => {
      if (seen.has(m.msg_id)) return false
      seen.add(m.msg_id)
      return true
    })

    res.status(200).json({ messages: deduped, total: deduped.length })
  } catch (err) {
    console.error('Inbox data error:', err)
    res.status(500).json({ error: err.message })
  }
}
