// pages/inbox.js

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Inbox() {
  const [messages, setMessages] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMessages()
  }, [])

  async function fetchMessages() {
    setLoading(true)

    // Pull the core fields + created_at
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, from_addr, subject, body, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch error:', error.message)
      setMessages([])
    } else {
      // Map into the shape the UI expects
      setMessages(
        data.map((m) => ({
          id: m.id,
          from: m.from_addr || '',
          subject: m.subject || '',
          snippet: m.body ? m.body.slice(0, 300) : '',
          date: m.created_at,
          body: m.body || '',
        }))
      )
    }

    setLoading(false)
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString()
  }

  return (
    <div className="flex h-screen">
      {/* Labels */}
      <aside className="w-1/5 border-r p-4 bg-white">
        <h2 className="text-xl font-bold mb-4">Labels</h2>
        <ul>
          {['Inbox', 'Sent', 'All Mail'].map((label) => (
            <li key={label} className="mb-2 hover:text-blue-600 cursor-pointer">
              {label}
            </li>
          ))}
        </ul>
      </aside>

      {/* Message List */}
      <section className="w-1/3 border-r overflow-y-auto bg-gray-50">
        {loading ? (
          <p className="p-4">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="p-4">No messages found.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              onClick={() => setSelected(msg)}
              className={`p-4 border-b cursor-pointer ${
                selected?.id === msg.id ? 'bg-white' : ''
              }`}
            >
              <p className="font-semibold">{msg.from}</p>
              <p className="truncate text-gray-700">{msg.subject}</p>
              <p className="text-sm text-gray-600">{msg.snippet}</p>
              <p className="text-xs text-gray-400">{formatDate(msg.date)}</p>
            </div>
          ))
        )}
      </section>

      {/* Message Detail */}
      <section className="flex-1 p-6 overflow-y-auto bg-white">
        {selected ? (
          <>
            <h3 className="text-2xl font-bold mb-2">{selected.subject}</h3>
            <p className="text-sm text-gray-600 mb-4">
              From: {selected.from} | {formatDate(selected.date)}
            </p>
            <div className="prose max-w-none">{selected.body}</div>
          </>
        ) : (
          <p className="text-gray-500">Select a message to view</p>
        )}
      </section>
    </div>
  )
}

