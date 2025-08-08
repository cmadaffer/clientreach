// pages/inbox.js
import { useState } from 'react';
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, error, mutate } = useSWR(
    `/api/inbox-data?page=${page}&pageSize=${pageSize}`,
    fetcher
  );

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');

    // 45s client-side timeout so the button never sticks
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    try {
      // pulls latest 50 unseen from last 14 days (handled server-side)
      const res = await fetch('/api/cron/inbox-process?limit=50&days=14', {
        signal: controller.signal,
      });
      const text = await res.text();
      clearTimeout(timer);

      if (!res.ok) throw new Error(text || `Sync failed (${res.status})`);
      await mutate();
    } catch (err) {
      setSyncError(err.name === 'AbortError' ? 'Sync timed out (45s)' : err.message);
    } finally {
      setSyncing(false);
    }
  };

  if (error) return <p style={center}>Failed to load: {error.message}</p>;
  if (!data) return <p style={center}>Loading…</p>;
  if (data.error) return <p style={center}>Server error: {data.error}</p>;

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const total = typeof data.total === 'number' ? data.total : messages.length;
  const totalPages = Math.ceil(Math.max(total, 1) / pageSize);

  return (
    <div style={c
