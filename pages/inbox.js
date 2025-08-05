// pages/inbox.js

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Inbox() {
  const [messages, setMessages] = useState([])
  const [filtered, setFiltered] = useState([])
  const [selectedMsg, setSelectedMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeLabel, setActiveLabel] = useState('Inbox')

  // load once
  useEffect(() => {
    fetchMessages()
  }, [])

  // re-filter when messages, search or label change
  useEffect(() => {
    let out = messages

    // label filter (assuming you tag messages in your table; 
    // for now Inbox = everything)
    if (activeLabel === 'Sent') {
      out = out.filter(m => m.from.includes('@your-domain.com'))
    }
    // All Mail = no filter
    // Inbox = everything

    // search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      out = out.filter(
        m =>
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
        data.map(m => ({
          id: m.id,
          from: m.from_addr,
          subject: m.subject,
          snippet: m.body?.slice(0, 200) || '',
          date: m.created_at,
          body: m.body
        }))
      )
    }
    setLoading(false)
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString()
  }

  const labels = ['Inbox', 'Sent', 'All Mail']

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar Labels */}
      <aside className="w-1/5 bg-white border-r">
        <h2 className="text-xl font-bold p-4">Labels</h2>
        <ul>
          {labels.map(label => (
            <li
              key={label}
              onClick={() => setActiveLabel(label)}
              className={`p-3 cursor-pointer hover:bg-gray-50 ${
                activeLabel === label ? 'bg-gray-200 font-semibold' : ''
              }`}
            >
              {label}
            </li>
          ))}
        </ul>
      </aside>

      {/* Message List */}
      <section className="w-1/3 border-r bg-white flex flex-col">
        {/* Search */}
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Search mail"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4">No messages found.</p>
          ) : (
            filtered.map(msg => (
              <div
                key={msg.id}
                onClick={() => setSelectedMsg(msg)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedMsg?.id === msg.id ? 'bg-gray-100' : ''
                }`}
              >
                <p className="font-semibold">{msg.from}</p>
                <p className="truncate">{msg.subject}</p>
                <p className="text-sm text-gray-600">{msg.snippet}</p>
                <p className="text-xs text-gray-400">{formatDate(msg.date)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Message Detail */}
      <section className="flex-1 p-6 overflow-y-auto bg-white">
        {selectedMsg ? (
          <>
            <h3 className="text-2xl font-bold mb-2">{selectedMsg.subject}</h3>
            <p className="text-sm text-gray-600 mb-4">
              From: {selectedMsg.from} | {formatDate(selectedMsg.date)}
            </p>
            <div className="prose max-w-none">{selectedMsg.body}</div>
          </>
        ) : (
          <p className="text-gray-500">Select a message to view</p>
        )}
      </section>
    </div>
  )
}

