// pages/inbox.js
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

// Safer fetcher: tolerates non-JSON responses without throwing
const fetcher = async (url) => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) return JSON.parse(text);
    return { error: `Non-JSON from ${url}`, status: res.status, body: text.slice(0, 300) };
  } catch (e) {
    return { error: `Parse error from ${url}: ${e.message}`, status: res.status, body: text.slice(0, 300) };
  }
};

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Auto-refresh every 60s (no numeric separators to avoid older-browser hiccups)
  const { data, error, mutate } = useSWR(
    `/api/inbox-data?page=${page}&pageSize=${pageSize}`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  );

  const [selected, setSelected] = useState(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  // Reply state
  const [to, setTo] = useState('');
  const [subj, setSubj] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [sendOk, setSendOk] = useState('');

  // Search/filters
  const [q, setQ] = useState('');
  const [dir, setDir] = useState('all');   // 'all' | 'inbound' | 'outbound'
  const [days, setDays] = useState('all'); // 'all' | '7' | '30'

  // Handle API anomalies safely
  const apiError = data && data.error ? String(data.error) : null;
  const messagesRaw = Array.isArray(data?.messages) ? data.messages : [];

  // Defensive de-dupe
  const deduped = useMemo(() => {
    const map = new Map();
    for (const m of messagesRaw) {
      const k =
        (m && (m.msg_id || `${m.from_addr || ''}|${m.subject || ''}|${m.created_at || ''}`)) ||
        Math.random().toString(36);
      if (!map.has(k)) map.set(k, m);
    }
    return Array.from(map.values());
  }, [messagesRaw]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const qNorm = (q || '').trim().toLowerCase();
    const cutoff = days === 'all' ? null : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    return deduped.filter((m) => {
      if (!m) return false;
      const direction = m.direction || 'inbound';
      if (dir !== 'all' && direction !== dir) return false;

      if (cutoff) {
        const d = m.created_at ? new Date(m.created_at) : null;
        if (!d || d < cutoff) return false;
      }

      if (!qNorm) return true;
      const hay = `${m.from_addr || ''} ${m.subject || ''} ${m.body || ''}`.toLowerCase();
      return hay.includes(qNorm);
    });
  }, [deduped, dir, days, q]);

  // Pagination
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = filtered.slice(start, end);

  // Maintain selection
  useEffect(() => {
    if (!selected && pageRows.length) setSelected(pageRows[0]);
  }, [pageRows, selected]);

  // Lazy-load body and prefill reply
  useEffect(() => {
    const m = selected;
    if (!m) return;

    setTo(m.from_addr || '');
    setSubj(m.subject ? (m.subject.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject}`) : 'Re:');
    setBody(`\n\n--- On ${m.created_at ? new Date(m.created_at).toLocaleString() : ''}, ${m.from_addr || ''} wrote:\n${(m.body || '').slice(0, 500)}`);

    if (m.body && m.body.trim()) return;

    (async () => {
      setLoadingBody(true);
      try {
        const res = await fetch(`/api/message-body?msg_id=${encodeURIComponent(m.msg_id || '')}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const txt = await res.text();
        const json = ct.includes('application/json') ? JSON.parse(txt) : { body: '' };
        const loaded = (json && json.body) || '';
        setSelected({ ...m, body: loaded });
      } catch {
        // ignore
      } finally {
        setLoadingBody(false);
      }
    })();
  }, [selected]);

  const cleanError = (txt) =>
    (String(txt || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('/api/cron/inbox-process?limit=20', { signal: controller.signal });
      const txt = await res.text();
      clearTimeout(timer);
      if (!res.ok) throw new Error(cleanError(txt) || `Sync failed (${res.status})`);
      await mutate();
    } catch (err) {
      setSyncError(err.name === 'AbortError' ? 'Sync timed out (20s)' : cleanError(err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setSendErr('');
    setSendOk('');
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: subj,
          text: body,
          inReplyTo: selected?.msg_id || null,
        }),
      });
      const txt = await res.text();
      let ok = false;
      try { ok = res.ok && JSON.parse(txt).ok === true; } catch {}
      if (!ok) {
        let errMsg = 'Send failed';
        try { errMsg = JSON.parse(txt).error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      setSendOk('Sent ✔');
      await mutate();
      setTimeout(() => setSendOk(''), 3000);
    } catch (e) {
      setSendErr(cleanError(e.message));
      setTimeout(() => setSendErr(''), 5000);
    } finally {
      setSending(false);
    }
  };

  // Top-level render guards (never throw)
  if (error) return <p style={center}>Failed to load: {String(error.message || error)}</p>;
  if (apiError) return <p style={center}>API error: {cleanError(apiError)}</p>;
  if (!data) return <p style={center}>Loading…</p>;

  const selectedMsg = selected || null;

  return (
    <div style={wrap}>
      <div style={headerBar}>
        <h1 style={logo}>ClientReach</h1>
        <div style={pillRow}><span style={pill}>AI Email Ops</span></div>
      </div>

      <div style={toolbar}>
        <div style={filters}>
          <input
            style={search}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search from / subject / body…"
          />
          <div style={segmented}>
            <button onClick={() => { setDir('all'); setPage(1); }} style={{ ...segBtn, ...(dir === 'all' ? segBtnActive : null) }}>All</button>
            <button onClick={() => { setDir('inbound'); setPage(1); }} style={{ ...segBtn, ...(dir === 'inbound' ? segBtnActive : null) }}>Inbound</button>
            <button onClick={() => { setDir('outbound'); setPage(1); }} style={{ ...segBtn, ...(dir === 'outbound' ? segBtnActive : null) }}>Outbound</button>
          </div>
          <div style={segmented}>
            <button onClick={() => { setDays('all'); setPage(1); }} style={{ ...segBtn, ...(days === 'all' ? segBtnActive : null) }}>All time</button>
            <button onClick={() => { setDays('7'); setPage(1); }} style={{ ...segBtn, ...(days === '7' ? segBtnActive : null) }}>Last 7d</button>
            <button onClick={() => { setDays('30'); setPage(1); }} style={{ ...segBtn, ...(days === '30' ? segBtnActive : null) }}>Last 30d</button>
          </div>
        </div>

        <div style={actions}>
          <button onClick={handleSync} disabled={syncing} style={btnPrimary}>
            {syncing ? 'Syncing…' : 'Sync Inbox'}
          </button>
          {syncError && <span style={errorText}>{syncError}</span>}
        </div>
      </div>

      <div style={grid}>
        <aside style={listPane}>
          {pageRows.map((m, idx) => {
            const active = selectedMsg && (selectedMsg.id === m.id || selectedMsg.msg_id === m.msg_id);
            return (
              <div
                key={m?.id || m?.msg_id || idx}
                onClick={() => setSelected(m)}
                style={{ ...listItem, ...(active ? listItemActive : null) }}
                title={m?.created_at ? new Date(m.created_at).toLocaleString() : ''}
              >
                <div style={rowTop}>
                  <div style={from}>{m?.from_addr || '—'}</div>
                  <span style={badge(m?.direction || 'inbound')}>{(m?.direction || 'inbound') === 'outbound' ? 'Sent' : 'Inbox'}</span>
                </div>
                <div style={subject}>{m?.subject || '(no subject)'}</div>
                <div style={rowBottom}>
                  <span style={dateText}>{formatRelative(m?.created_at)}</span>
                </div>
              </div>
            );
          })}
          {pageRows.length === 0 && <div style={emptyList}>No messages match your filters.</div>}
        </aside>

        <main style={detailPane}>
          {selectedMsg ? (
            <>
              <h2 style={detailSubject}>{selectedMsg.subject || '(no subject)'}</h2>
              <div style={metaLine}>
                <strong>From:</strong>&nbsp;{selectedMsg.from_addr || '—'}
                <span style={dot} />
                <strong>When:</strong>&nbsp;{selectedMsg.created_at ? new Date(selectedMsg.created_at).toLocaleString() : '—'}
                <span style={dot} />
                <span style={badge(selectedMsg.direction || 'inbound')}>{(selectedMsg.direction || 'inbound') === 'outbound' ? 'Sent' : 'Inbox'}</span>
              </div>

              <div style={twoCols}>
                <div style={messageBox}>
                  <div style={bodyBox}>{loadingBody ? 'Loading message…' : (selectedMsg.body || 'No preview available.')}</div>
                </div>

                <div style={composer}>
                  <div style={fieldRow}><label style={label}>To</label><input style={input} value={to} onChange={(e) => setTo(e.target.value)} /></div>
                  <div style={fieldRow}><label style={label}>Subject</label><input style={input} value={subj} onChange={(e) => setSubj(e.target.value)} /></div>
                  <textarea style={textarea} rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your reply…" />
                  <div style={composeActions}>
                    <button onClick={handleSend} disabled={sending || !to || !subj || !body} style={btnPrimary}>{sending ? 'Sending…' : 'Send'}</button>
                    {sendOk && <span style={okText}>{sendOk}</span>}
                    {sendErr && <span style={errorText}>{sendErr}</span>}
                  </div>
                  <div style={hint}>Uses SMTP env: SMTP_HOST/PORT/SECURE/USER/PASS (or IMAP_* fallback) and SMTP_FROM</div>
                </div>
              </div>
            </>
          ) : (
            <div style={emptyDetail}>Select a message</div>
          )}
        </main>
      </div>

      <div style={paginationBar}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={btn}>← Prev</button>
        <span style={pageInfo}>Page {page} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={btn}>Next →</button>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function formatRelative(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/* ---------- Styles ---------- */
const wrap = { fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', background: '#f8f9fb', minHeight: '100vh' };
const headerBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', background: '#fff', position: 'sticky', top: 0, zIndex: 10 };
const logo = { fontSize: '18px', fontWeight: 700, color: '#111' };
const pillRow = { display: 'flex', gap: 8 };
const pill = { fontSize: 12, background: '#eef2ff', color: '#1e40af', border: '1px solid #dbeafe', padding: '4px 8px', borderRadius: 999 };

const toolbar = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px 16px' };
const filters = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
const actions = { display: 'flex', alignItems: 'center', gap: 12 };
const search = { width: 260, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, background: '#fff' };
const segmented = { display: 'inline-flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' };
const segBtn = { padding: '6px 10px', fontSize: 13, border: 'none', background: '#fff', cursor: 'pointer' };
const segBtnActive = { background: '#111', color: '#fff' };

const grid = { display: 'grid', gridTemplateColumns: '360px 1fr', height: 'calc(100vh - 160px)', gap: '16px', padding: '0 16px 16px 16px' };
const listPane = { borderRight: '1px solid #eee', overflowY: 'auto', background: '#fff', borderRadius: 8, padding: 8 };
const detailPane = { padding: 16, overflowY: 'auto' };

const listItem = { padding: '12px', borderRadius: 8, margin: '6px 0', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer', border: '1px solid #eee' };
const listItemActive = { background: '#e8f0fe', borderColor: '#c7d2fe' };
const rowTop = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const rowBottom = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 };
const from = { fontWeight: 600, fontSize: 14, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' };
const subject = { fontSize: 13, color: '#333', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const dateText = { fontSize: 12, color: '#777' };
const badge = (direction) => ({
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid',
  borderColor: direction === 'outbound' ? '#bbf7d0' : '#dbeafe',
  background: direction === 'outbound' ? '#ecfdf5' : '#eff6ff',
  color: direction === 'outbound' ? '#065f46' : '#1e40af',
});

const emptyList = { padding: 16, color: '#999' };
const emptyDetail = { padding: 16, color: '#999' };

const detailSubject = { fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111' };
const metaLine = { fontSize: 14, color: '#444', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const dot = { width: 4, height: 4, borderRadius: 4, background: '#ccc', display: 'inline-block' };

const twoCols = { display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16, alignItems: 'start', marginTop: 12 };
const messageBox = { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, minHeight: 220 };
const composer = { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12 };
const fieldRow = { display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, alignItems: 'center', marginBottom: 8 };
const label = { fontSize: 13, color: '#444' };
const input = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 };
const textarea = { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14, minHeight: 220, resize: 'vertical' };
const composeActions = { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 };
const hint = { fontSize: 12, color: '#777', marginTop: 8 };

const bodyBox = { whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.5, color: '#222' };

const paginationBar = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 16px' };
const btn = { padding: '8px 14px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', borderRadius: 6, fontSize: 14 };
const btnPrimary = { padding: '8px 14px', border: 'none', background: '#0070f3', color: '#fff', cursor: 'pointer', borderRadius: 6, fontSize: 14 };
const errorText = { color: 'red', maxWidth: 600, whiteSpace: 'normal' };
const okText = { color: 'green', marginLeft: 12 };
const pageInfo = { fontSize: 14 };              // <-- missing before; added now
const center = { textAlign: 'center', marginTop: '2rem', color: '#888' };
