// pages/inbox.js

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Inbox() {
  const [messages, setMessages] = useState([])
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMessages()
  }, [])

  async function fetchMessages() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('Fetch error:', error.message)
    } else {
      setMessages(data)
    }
    setLoading(false)
  }

  function formatDate(isoString) {
    return new Date(isoString).toLocaleString()
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-1/5 border-r p-4 bg-white">
        <h2 className="text-xl font-bold mb-4">Labels</h2>
        <ul>
          <li className="mb-2 cursor-pointer hover:text-blue-600">Inbox</li>
          <li className="mb-2 cursor-pointer hover:text-blue-600">Sent</li>
          <li className="mb-2 cursor-pointer hover:text-blue-600">All Mail</li>
        </ul>
      </aside>

      {/* Message List */}
      <section className="w-1/3 border-r overflow-y-auto bg-gray-50">
        {loading ? (
          <p className="p-4">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="p-4">No messages found.</p>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              onClick={() => setSelectedMessage(msg)}
              className={
                'p-4 border-b cursor-pointer ' +
                (selectedMessage?.id === msg.id ? 'bg-white' : '')
              }
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
        {selectedMessage ? (
          <>
            <h3 className="text-2xl font-bold mb-2">
              {selectedMessage.subject}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              From: {selectedMessage.from} |{' '}
              {formatDate(selectedMessage.date)}
            </p>
            <div className="prose max-w-none">
              {selectedMessage.body}
            </div>
          </>
        ) : (
          <p className="text-gray-500">Select a message to view</p>
        )}
      </section>
    </div>
)
}

