// pages/inbox.js
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { data, error, mutate } = useSWR(
    `/api/inbox-data?page=${page}&pageSize=${pageSize}`,
    fetcher
  );

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [selected, setSelected] = useState(null);
  const [loadingBody, setLoadingBody] = useState(false);

  const messagesRaw = Array.isArray(data?.messages) ? data.messages : [];

  // Client-side safety dedupe (handles any residual DB dupes)
  const messages = useMemo(() => {
    const makeKey = (m) => m?.msg_id || `${m?.from_addr || ''}|${m?.subject || ''}|${m?.created_at || ''}`;
    const map = new Map();
    for (const m of messagesRaw) {
      const k = makeKey(m);
      if (!map.has(k)) map.set(k, m);
    }
    return Array.from(map.values());
  }, [messagesRaw]);

  const total = typeof data?.total === 'number' ? data.total : messages.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // When a message is selected and has no body, lazy-load it once
  useEffect(() => {
    const m = selected;
    if (!m || (m.body && m.body.trim())) return;

    (async () => {
      setLoadingBody(true);
      try {
        const res = await fetch(`/api/message-body?msg_id=${encodeURIComponent(m.msg_id)}`);
        const json = await res.json();
        const body = (json && json.body) || '';
        setSelected({ ...m, body });
      } catch {
        // ignore
      } finally {
        setLoadingBody(false);
      }
    })();
  }, [selected]);

  const cleanError = (txt) =>
    (txt || '')
      .replace(/<[^>]*>/g, ' ') // strip tags so no red HTML blob
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200); // keep it short

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // 20s, small batch server-side

    try {
      const res = await fetch('/api/cron/inbox-process?limit=10&days=7', { signal: controller.signal });
      const text = await res.text();
      clearTimeout(timer);

      if (!res.ok) throw new Error(cleanError(text) || `Sync failed (${res.status})`);
      await mutate();
    } catch (err) {
      setSyncError(err.name === 'AbortError' ? 'Sync timed out (20s)' : cleanError(err.message));
    } finally {
      setSyncing(false);
    }
  };

  if (error) return <p style={center}>Failed to load: {error.message}</p>;
  if (!data) return <p style={center}>Loading…</p>;
  if (data.error) return <p style={center}>Server error: {data.error}</p>;

  const selectedMsg = selected || messages[0] || null;

  return (
    <div style={wrap}>
      <div style={headerBar}>
        <h1 style={logo}>ClientReach</h1>
      </div>

      <div style={toolbar}>
        <button onClick={handleSync} disabled={syncing} style={btnPrimary}>
          {syncing ? 'Syncing…' : 'Sync Inbox'}
        </button>
        {syncError && <span style={errorText}>{syncError}</span>}
      </div>

      <div style={grid}>
        <aside style={listPane}>
          {messages.map((m, idx) => {
            const active = selectedMsg && (selectedMsg.id === m.id || selectedMsg.msg_id === m.msg_id);
            return (
              <div
                key={m.id || m.msg_id || idx}
                onClick={() => setSelected(m)}
                style={{ ...listItem, ...(active ? listItemActive : null) }}
              >
                <div style={from}>{m.from_addr || '—'}</div>
                <div style={subject}>{m.subject || '(no subject)'}</div>
                <div style={dateText}>
                  {m.created_at ? new Date(m.created_at).toLocaleString() : '—'}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && <div style={emptyList}>No messages</div>}
        </aside>

        <main style={detailPane}>
          {selectedMsg ? (
            <>
              <h2 style={detailSubject}>{selectedMsg.subject || '(no subject)'}</h2>
              <div style={metaLine}><strong>From:</strong>&nbsp;{selectedMsg.from_addr || '—'}</div>
              <div style={metaLine}>
                <strong>Date:</strong>&nbsp;
                {selectedMsg.created_at ? new Date(selectedMsg.created_at).toLocaleString() : '—'}
              </div>
              <div style={bodyBox}>
                {loadingBody ? 'Loading message…' : (selectedMsg.body || 'No preview available.')}
              </div>
            </>
          ) : (
            <div style={emptyDetail}>Select a message</div>
          )}
        </main>
      </div>

      <div style={paginationBar}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={btn}>
          ← Prev
        </button>
        <span style={pageInfo}>Page {page} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={btn}>
          Next →
        </button>
      </div>
    </div>
  );
}

// --- Styles ---
const wrap = { fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' };
const headerBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee' };
const logo = { fontSize: '18px', fontWeight: 700, color: '#111' };

const toolbar = { display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px' };
const errorText = { color: 'red', maxWidth: 600, whiteSpace: 'normal' };

const grid = { display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 140px)', gap: '16px', padding: '0 16px 16px 16px' };
const listPane = { borderRight: '1px solid #eee', overflowY: 'auto' };
const detailPane = { padding: 16, overflowY: 'auto' };

const listItem = { padding: '12px', borderRadius: 8, margin: '6px 0', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer' };
const listItemActive = { background: '#e8f0fe' };
const from = { fontWeight: 600, fontSize: 14, color: '#222' };
const subject = { fontSize: 13, color: '#333', marginTop: 4 };
const dateText = { fontSize: 12, color: '#777', marginTop: 2 };
const emptyList = { padding: 16, color: '#999' };
const emptyDetail = { padding: 16, color: '#999' };

const detailSubject = { fontSize: 20, fontWeight: 700, marginBottom: 8 };
const metaLine = { fontSize: 14, color: '#444', marginBottom: 6 };
const bodyBox = { whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.5, color: '#222', marginTop: 16 };

const paginationBar = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 16px' };
const btn = { padding: '8px 14px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', borderRadius: 6, fontSize: 14 };
const btnPrimary = { padding: '8px 14px', border: 'none', background: '#0070f3', color: '#fff', cursor: 'pointer', borderRadius: 6, fontSize: 14 };
const pageInfo = { fontSize: 14 };
const center = { textAlign: 'center', marginTop: '2rem', color: '#888' };
