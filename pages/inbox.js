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
                  <div style={hint}>Uses SMTP env: SMTP_HOST/PORT/SECURE/USER/PASS (or IMAP_* fallback) and SMTP_FROM</di_*
