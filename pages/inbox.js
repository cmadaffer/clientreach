// pages/inbox.js
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Auto-refresh list every 60s; avoid refetch on tab focus to prevent UI jumps
  const { data, error, mutate } = useSWR(
    `/api/inbox-data?page=${page}&pageSize=${pageSize}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  // Selection & fetch state
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

  // UI polish: search & filters
  const [q, setQ] = useState('');
  const [dir, setDir] = useState('all');         // 'all' | 'inbound' | 'outbound'
  const [days, setDays] = useState('all');       // 'all' | '7' | '30'

  const messagesRaw = Array.isArray(data?.messages) ? data.messages : [];

  // Deduplicate defensively
  const deduped = useMemo(() => {
    const makeKey = (m) => m?.msg_id || `${m?.from_addr || ''}|${m?.subject || ''}|${m?.created_at || ''}`;
    const map = new Map();
    for (const m of messagesRaw) {
      const k = makeKey(m);
      if (!map.has(k)) map.set(k, m);
    }
    // Already sorted desc by API; keep order
    return Array.from(map.values());
  }, [messagesRaw]);

  // Filtered view (client-side)
  const filtered = useMemo(() => {
    const qNorm = (q || '').trim().toLowerCase();
    const cutoff =
      days === 'all'
        ? null
        : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    return deduped.filter((m) => {
      if (dir !== 'all' && (m.direction || 'inbound') !== dir) return false;

      if (cutoff) {
        const d = m.created_at ? new Date(m.created_at) : null;
        if (!d || d < cutoff) return false;
      }

      if (!qNorm) return true;

      const hay =
        ((m.from_addr || '') + ' ' + (m.subject || '') + ' ' + (m.body || '')).toLowerCase();
      return hay.includes(qNorm);
    });
  }, [deduped, dir, days, q]);

  // Pagination after filters
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = filtered.slice(start, end);

  // Maintain a valid selection
  useEffect(() => {
    if (!selected) {
      if (pageRows.length) setSelected(pageRows[0]);
      return;
    }
    // If selected fell out of the current page/filter, keep it (don’t force switch)
  }, [pageRows, selected]);

  // Lazy-load body for the selected message once
  useEffect(() => {
    const m = selected;
    if (!m) return;

    // Pre-fill reply fields
    setTo(m.from_addr || '');
    setSubj(
      m.subject
        ? (m.subject.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject}`)
        : 'Re:'
    );
    setBody(
      `\n\n--- On ${m.created_at ? new Date(m.created_at).toLocaleString() : ''}, ${
        m.from_addr || ''
      } wrote:\n${(m.body || '').slice(0, 500)}`
    );

    if (m.body && m.body.trim()) return;

    (async () => {
      setLoadingBody(true);
      try {
        const res = await fetch(`/api/message-body?msg_id=${encodeURIComponent(m.msg_id)}`);
        const json = await res.json();
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
    (txt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('/api/cron/inbox-process?limit=20', { signal: controller.signal });
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
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Send failed');

      setSendOk('Sent ✔');
      await mutate(); // pull in logged outbound
      setTimeout(() => setSendOk(''), 3000);
    } catch (e) {
      setSendErr(cleanError(e.message));
      setTimeout(() => setSendErr(''), 5000);
    } finally {
      setSending(false);
    }
  };

  if (error) return <p style={center}>Failed to load: {error.message}</p>;
  if (!data) return <p style={center}>Loading…</p>;
  if (data.error) return <p style={center}>Server error: {data.error}</p>;

  const selectedMsg = selected || null;

  return (
    <div style={wrap}>
      <div style={headerBar}>
        <h1 style={logo}>ClientReach</h1>
        <div style={pillRow}>
          <span style={pill}>AI Email Ops</span>
        </div>
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
            <button
              onClick={() => { setDir('all'); setPage(1); }}
              style={{ ...segBtn, ...(dir === 'all' ? segBtnActive : null) }}
            >All</button>
            <button
              onClick={() => { setDir('inbound'); setPage(1); }}
              style={{ ...segBtn, ...(dir === 'inbound' ? segBtnActive : null) }}
            >Inbound</button>
            <button
              onClick={() => { setDir('outbound'); setPage(1); }}
              style={{ ...segBtn, ...(dir === 'outbound' ? segBtnActive : null) }}
            >Outbound</button>
          </div>
          <div style={segmented}>
            <button
              onClick={() => { setDays('all'); setPage(1); }}
              style={{ ...segBtn, ...(days === 'all' ? segBtnActive : null) }}
            >All time</button>
            <button
              onClick={() => { setDays('7'); setPage(1); }}
              style={{ ...segBtn, ...(days === '7' ? segBtnActive : n
