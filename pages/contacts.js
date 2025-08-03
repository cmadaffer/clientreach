'use client';

import { useEffect, useMemo, useState } from 'react';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // controls
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name'); // name | created
  const [dir, setDir] = useState('asc');    // asc | desc

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/contacts?sort=${sort}&dir=${dir}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || 'Failed to load contacts');
        setContacts(data.contacts || []);
        setTotal(data.total || 0);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sort, dir]);

  const filtered = useMemo(() => {
    if (!q.trim()) return contacts;
    const hay = q.toLowerCase();
    return contacts.filter(c => {
      const org = (c.organization || c.business_name || '').toLowerCase();
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.phone || c.mobile_phone || '').toLowerCase();
      return org.includes(hay) || name.includes(hay) || email.includes(hay) || phone.includes(hay);
    });
  }, [contacts, q]);

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.title}>Your Clients</h1>
        <div style={styles.meta}>
          <span style={styles.badge}>Total: {total}</span>
          <span style={styles.badge}>Showing: {filtered.length}</span>
        </div>
      </header>

      <section style={styles.controls}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search name, company, email, phone..."
          style={styles.input}
        />
        <div style={styles.row}>
          <label style={styles.label}>Sort by:</label>
          <select value={sort} onChange={e => setSort(e.target.value)} style={styles.select}>
            <option value="name">Name / Company</option>
            <option value="created">Created Date</option>
          </select>
          <select value={dir} onChange={e => setDir(e.target.value)} style={styles.select}>
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </section>

      {loading ? (
        <div style={styles.card}>Loading clients…</div>
      ) : err ? (
        <div style={{ ...styles.card, ...styles.error }}>Error: {err}</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Name / Company</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Phone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const company = c.organization || c.business_name || '';
                const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                const display = company || name || c.email || '—';
                return (
                  <tr key={`${display}-${i}`} style={styles.tr}>
                    <td style={styles.tdNum}>{i + 1}</td>
                    <td style={styles.tdMain}>
                      <div style={styles.primary}>{display}</div>
                      {company && name && (
                        <div style={styles.sub}>{name}</div>
                      )}
                    </td>
                    <td style={styles.td}>{c.email || '—'}</td>
                    <td style={styles.td}>{c.phone || c.mobile_phone || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 1100, margin: '40px auto', padding: '0 16px', fontFamily: 'ui-sans-serif, system-ui' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { margin: 0, fontSize: '1.75rem' },
  meta: { display: 'flex', gap: 8 },
  badge: { background: '#f1f5f9', color: '#0f172a', padding: '4px 8px', borderRadius: 8, fontSize: 12 },
  controls: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 260, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: '#475569' },
  select: { padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' },

  tableWrap: { overflowX: 'auto', background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0 },
  th: { textAlign: 'left', padding: '12px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  tdNum: { padding: '12px', width: 56, color: '#334155' },
  tdMain: { padding: '12px', color: '#0f172a' },
  td: { padding: '12px', color: '#334155' },
  primary: { fontWeight: 600 },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },

  card: { padding: 16, borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  error: { border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626' },
};
