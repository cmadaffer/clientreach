/* pages/inbox.js */
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((res) => res.json())

export default function InboxPage() {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const { data, error, mutate } = useSWR(
    `/api/inbox-data?page=${page}&pageSize=${pageSize}`,
    fetcher
  )
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const handleSync = async () => {
    setSyncing(true)
    setSyncError('')
    try {
      const res = await fetch('/api/cron/inbox-process')
      if (!res.ok) throw new Error(`Sync failed (${res.status})`)
      await mutate()
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (error) return <p style={center}>Failed to load messages: {error.message}</p>
  if (!data) return <p style={center}>Loading…</p>
  if (data.error) return <p style={center}>Server error: {data.error}</p>

  const messages = Array.isArray(data.messages) ? data.messages : []
  const total = typeof data.total === 'number' ? data.total : messages.length
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={container}>
      <h1 style={heading}>Inbox</h1>
      <div style={syncContainer}>
        <button onClick={handleSync} disabled={syncing} style={btn}>
          {syncing ? 'Syncing...' : 'Sync Inbox'}
        </button>
        {syncError && <p style={errorText}>{syncError}</p>}
      </div>
      <table style={table}>
        <thead style={thead}>
          <tr>
            <th style={th}>From</th>
            <th style={th}>Subject</th>
            <th style={th}>Date</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m, idx) => (
            <tr
              key={m.id || idx}
              style={{
                backgroundColor: idx % 2 === 0 ? '#fafafa' : '#fff',
                transition: 'background-color 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e8e8e8')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor =
                  idx % 2 === 0 ? '#fafafa' : '#fff')
              }
            >
              <td style={td}>{m.from_addr || '—'}</td>
              <td style={td}>{m.subject || '(no subject)'}</td>
              <td style={td}>
                {m.created_at
                  ? new Date(m.created_at).toLocaleString()
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={pagination}>
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page <= 1}
          style={btn}
        >
          ← Prev
        </button>
        <span style={pageInfo}>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages}
          style={btn}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// --- inline styles ---
const container = { maxWidth: 900, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif' }
const heading = { fontSize: '2rem', textAlign: 'center', color: '#333', marginBottom: '1rem' }
const syncContainer = { textAlign: 'center', marginBottom: '1rem' }
const errorText = { color: 'red', marginTop: '0.5rem' }
const table = { width: '100%', borderCollapse: 'collapse', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }
const thead = { backgroundColor: '#f0f0f0' }
const th = { textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd', color: '#555', fontSize: '1rem' }
const td = { padding: '0.75rem', borderBottom: '1px solid #eee', color: '#333', fontSize: '0.95rem' }
const pagination = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }
const btn = { padding: '0.6rem 1.2rem', border: 'none', background: '#0070f3', color: '#fff', cursor: 'pointer', borderRadius: 6, fontSize: '0.95rem', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', transition: 'background-color 0.2s, transform 0.1s' }
const pageInfo = { fontSize: '1rem', color: '#555' }
const center = { textAlign: 'center', marginTop: '2rem', color: '#888' }
