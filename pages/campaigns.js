'use client';

import { useEffect, useMemo, useState } from 'react';

export default function CampaignsPage() {
  const [flows, setFlows] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [error, setError] = useState(null);

  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [preview, setPreview] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [testData, setTestData] = useState({
    FirstName: 'Curtis',
    YourBusinessName: 'Frequensea Marine Electronics',
    InvoiceNumber: 'INV-12345'
  });

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    async function loadFlows() {
      setLoadingFlows(true);
      setError(null);
      try {
        const r = await fetch('/api/flows');
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || 'Failed to load flows');
        setFlows(data.flows || []);
        if (data.flows?.length) {
          setSelectedFlowId(data.flows[0].id);
          setPreview(renderTemplate(data.flows[0].content, testData));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingFlows(false);
      }
    }
    loadFlows();
  }, []);

  useEffect(() => {
    if (!selectedFlowId) return;
    const f = flows.find(x => x.id === selectedFlowId);
    if (f) setPreview(renderTemplate(f.content, testData));
  }, [selectedFlowId, testData, flows]);

  async function onSendTest() {
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const resp = await fetch('/api/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow_id: selectedFlowId,
          to_email: toEmail,
          variables: testData
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to send');
      setSendResult(`Sent to ${toEmail}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={S.wrap}>
      <h1 style={S.title}>Campaigns</h1>

      {loadingFlows ? <div style={S.card}>Loading flows…</div> : null}
      {error ? <div style={{...S.card, ...S.error}}>Error: {error}</div> : null}

      {!loadingFlows && !error && (
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.h3}>1) Pick a Flow</h3>
            <select
              value={selectedFlowId}
              onChange={e => setSelectedFlowId(e.target.value)}
              style={S.input}
            >
              {flows.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.trigger || 'manual'}
                </option>
              ))}
            </select>

            <div style={{marginTop: 12}}>
              <label style={S.label}>Test to (your email)</label>
              <input
                style={S.input}
                placeholder="you@domain.com"
                value={toEmail}
                onChange={e => setToEmail(e.target.value)}
              />
              <div style={{fontSize:12,color:'#64748b',marginTop:6}}>
                We’ll send only to this address for now.
              </div>
            </div>

            <div style={{marginTop: 12}}>
              <h4 style={S.h4}>Variables</h4>
              <div style={S.vars}>
                {Object.keys(testData).map(k => (
                  <div key={k} style={S.varRow}>
                    <label style={S.labelSmall}>{k}</label>
                    <input
                      style={S.input}
                      value={testData[k]}
                      onChange={e => setTestData(prev => ({...prev, [k]: e.target.value}))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              style={S.button}
              onClick={onSendTest}
              disabled={sending || !toEmail || !selectedFlowId}
            >
              {sending ? 'Sending…' : 'Send Test Email'}
            </button>

            {sendResult ? <div style={{...S.badge, marginTop:8}}>{sendResult}</div> : null}
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>2) Preview</h3>
            <div style={S.preview}>
              {preview || 'Select a flow to preview'}
            </div>
            <div style={{fontSize:12,color:'#64748b',marginTop:8}}>
              Placeholders like <code>{'{{FirstName}}'}</code> will be merged per-contact at send time.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderTemplate(tpl, vars) {
  if (!tpl) return '';
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars?.[key] ?? ''));
}

const S = {
  wrap: { maxWidth: 1100, margin: '40px auto', padding: '0 16px', fontFamily: 'ui-sans-serif, system-ui' },
  title: { margin: 0, fontSize: '1.75rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card: { background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,0.06)', padding:16 },
  h3: { margin:'0 0 12px 0', fontSize:'1.125rem' },
  h4: { margin:'0 0 8px 0', fontSize:'1rem' },
  input: { width:'100%', padding:10, border:'1px solid #e2e8f0', borderRadius:10, marginTop:6 },
  label: { fontSize:13, color:'#475569' },
  labelSmall: { fontSize:12, color:'#475569', minWidth:140 },
  vars: { display:'grid', gap:8 },
  varRow: { display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center' },
  preview: { whiteSpace:'pre-wrap', background:'#f8fafc', padding:12, borderRadius:8, minHeight:120 },
  button: { marginTop:12, padding:'10px 14px', border:'1px solid #0f172a', background:'#0f172a', color:'#fff', borderRadius:10, cursor:'pointer' },
  badge: { background:'#ecfeff', color:'#155e75', padding:'4px 8px', borderRadius:8, display:'inline-block', fontSize:12 },
  error: { border:'1px solid #fecaca', background:'#fff1f2', color:'#dc2626' },
};
