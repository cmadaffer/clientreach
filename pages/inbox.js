// pages/inbox.js
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((res) => res.json())

export default function InboxPage() {
  // pagination state
  const [page, setPage] = useState(1)
  const pageSize = 10

  // fetch paginated data
  const { data, error } = useSWR(
    `/api/inbox-data?page=${page}&pageSize=${pageSize}`,
    fetcher
  )

  if (error) return <p style={center}>Failed to load messages: {error.message}</p>
  if (!data)  return <p style={center}>Loading…</p>

  const { messages, total } = data
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={container}>
      <h1 style={heading}>Inbox</h1>

      <table style={table}>
        <thead style={thead}>
          <tr>
            <th style={th}>From</th>
            <th style={th}>Subject</th>
            <th style={th}>Date</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
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
const container = {
  maxWidth: 800,
  margin: '2rem auto',
  padding: '0 1rem',
  fontFamily: 'system-ui, sans-serif',
}

const heading = {
  marginBottom: '1rem',
  fontSize: '1.8rem',
  textAlign: 'center',
}

const table = {
  width: '100%',
  borderCollapse: 'collapse',
  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
}

const thead = {
  background: '#f7f7f7',
}

const th = {
  textAlign: 'left',
  padding: '0.75rem 0.5rem',
  borderBottom: '1px solid #ddd',
}

const td = {
  padding: '0.5rem',
  borderBottom: '1px solid #eee',
}

const pagination = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '0.75rem',
  marginTop: '1.5rem',
}

const btn = {
  padding: '0.5rem 1rem',
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer',
  borderRadius: 4,
  fontSize: '0.9rem',
}

const pageInfo = {
  fontSize: '0.9rem',
}

const center = { textAlign: 'center', marginTop: '2rem' }

