// pages/inbox.js

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Inbox() {
  const labels = ['Inbox', 'Sent', 'All Mail']
  const [messages, setMessages] = useState([])
  const [filtered, setFiltered] = useState([])
  const [selectedMsg, setSelectedMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeLabel, setActiveLabel] = useState('Inbox')

  // Fetch once
  useEffect(() => {
    fetchMessages()
  }, [])

  // Re-filter whenever deps change
  useEffect(() => {
    let out = [...messages]

    // label filter (example: only messages from your-domain.com for Sent)
    if (activeLabel === 'Sent') {
      out = out.filter((m) => m.from.includes('@your-domain.com'))
    }
    // Inbox & All Mail show everything

    // search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      out = out.filter(
        (m) =>
          m.from.toLowerCase().includes(term) ||
          m.subject.toLowerCase().includes(term) ||
          m.snippet.toLowerCase().includes(term)
      )
    }

    setFiltered(out)
  }, [messages, search, activeLabel])

  async function fetchMessages() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, from_addr, subject, body, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch error:', error.message)
      setMessages([])
    } else {
      setMessages(
        data.map((m) => ({
          id: m.id,
          from: m.from_addr,
          subject: m.subject,
          snippet: m.body?.slice(0, 200) || '',
          date: m.created_at,
          body: m.body,
        }))
      )
    }
    setLoading(false)
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString([], {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-1/5 bg-white border-r shadow-md p-6 flex flex-col">
        <h1 className="text-2xl font-bold text-blue-600 mb-8">ClientReach</h1>

        <h2 className="text-lg font-semibold mb-4">Folders</h2>
        <ul className="space-y-2 flex-1">
          {labels.map((label) => (
            <li
              key={label}
              onClick={() => {
                setActiveLabel(label)
                setSelectedMsg(null)
              }}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                activeLabel === label
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-blue-50 text-gray-700'
              }`}
            >
              {label}
            </li>
          ))}
        </ul>

        <button
          onClick={() => alert('Compose clicked!')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Compose
        </button>
      </aside>

      {/* Message List */}
      <section className="w-1/3 border-r bg-white flex flex-col">
        {/* Search */}
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Search mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {loading ? (
            <p className="p-4 text-center text-gray-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center text-gray-500">No messages found.</p>
          ) : (
            filtered.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelectedMsg(msg)}
                className={`p-4 rounded-lg cursor-pointer transition-shadow ${
                  selectedMsg?.id === msg.id
                    ? 'bg-blue-50 shadow'
                    : 'hover:shadow-md'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <p className="font-semibold text-gray-800">{msg.from}</p>
                  <span className="text-xs text-gray-400">
                    {formatDate(msg.date)}
                  </span>
                </div>
                <p className="text-gray-700 font-medium mb-1 truncate">
                  {msg.subject}
                </p>
                <p className="text-sm text-gray-600">{msg.snippet}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Message Detail */}
      <section className="flex-1 p-6 overflow-y-auto">
        {selectedMsg ? (
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-2xl font-bold mb-4">{selectedMsg.subject}</h3>
            <div className="flex items-center text-sm text-gray-600 mb-6 space-x-2">
              <span>
                From: <span className="font-medium text-gray-800">{selectedMsg.from}</span>
              </span>
              <span>|</span>
              <span>{formatDate(selectedMsg.date)}</span>
            </div>
            <div className="prose max-w-none">{selectedMsg.body}</div>
          </div>
        ) : (
          <p className="text-gray-500">Select a message to view</p>
        )}
      </section>
    </div>
  )
}
