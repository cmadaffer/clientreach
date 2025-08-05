// pages/api/inbox-data.js

import { supabase } from '../../lib/supabaseClient'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Parse pagination parameters
  const page = parseInt(req.query.page, 10) || 1
  const pageSize = parseInt(req.query.pageSize, 10) || 10
  const from = (page - 1) * pageSize
  const to   = page * pageSize - 1

  try {
    // Fetch with count
    const { data: messages, count, error } = await supabase
      .from('inbox_messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    res.status(200).json({
      messages,
      total: count
    })
  } catch (err) {
    console.error('Inbox data error:', err)
    res.status(500).json({ error: err.message })
  }
}
