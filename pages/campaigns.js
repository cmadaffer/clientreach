'use client';
import { useEffect, useState, useMemo, useRef } from 'react';

const DEFAULT_HTML = `<!-- FREQUENSEA MARINE — Summer Check-Up HTML Email -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f4f7fb; padding:24px; font-family: Arial, Helvetica, sans-serif;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden;">
        <tr>
          <td align="center" style="background:#0b3558; padding:22px;">
            <h1 style="margin:0; font-size:22px; line-height:1.2; color:#e6f6ff; letter-spacing:0.3px;">
              FREQUENSEA MARINE
            </h1>
            <div style="margin-top:6px; font-size:12px; color:#9ad7ff;">Electronics • Updates • Service</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 22px 12px 22px;">
            <div style="font-size:20px; font-weight:bold; color:#0b3558; letter-spacing:.2px;">☀️ Summer Check-Up & Software Updates</div>
            <div style="font-size:14px; color:#6b7a90; margin-top:4px;">Keep performance high and headaches low all season.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 22px; color:#2b2f36; font-size:15px; line-height:1.6;">
            <p style="margin:12px 0 0;">Hey {{first_name}},</p>
            <p style="margin:10px 0;">
              Summer is here, and just like your AC, your <strong>electrical systems</strong> need a little TLC to keep running at their best.
              We’re offering <strong>Summer Check-Ups & Software Updates</strong> to make sure your equipment is smooth, secure, and ready for the busy season.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 22px 8px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fbff; border:1px solid #e3eef8; border-radius:10px;">
              <tr><td style="padding:14px 16px;">
                <div style="color:#0b3558; font-weight:bold; margin-bottom:6px;">Why schedule now?</div>
                <ul style="padding-left:18px; margin:8px 0; color:#2b2f36; font-size:15px; line-height:1.6;">
                  <li>☑️ Prevent mid-season breakdowns</li>
                  <li>☑️ Get the latest software features &amp; security patches</li>
                  <li>☑️ Maximize system performance and speed</li>
                </ul>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 22px 8px 22px;">
            <a href="tel:18884462746" style="display:inline-block; background:#12bde2; color:#0b3558; text-decoration:none; font-weight:bold; padding:12px 22px; border-radius:8px; font-size:16px;">
              📞 Call Us Today: 1-888-446-2746
            </a>
            <div style="font-size:12px; color:#6b7a90; margin-top:8px;">Prefer email? Just hit reply and we’ll book you in.</div>
          </td>
        </tr>
        <tr><td style="padding:8px 22px;"><hr style="border:none; border-top:1px solid #e9eef5; margin:0;"></td></tr>
        <tr>
          <td style="padding:12px 22px 18px 22px; color:#2b2f36; font-size:15px; line-height:1.6;">
            <p style="margin:0 0 6px 0;">Stay cool,</p>
            <p style="margin:0;"><strong>The ClientReach Team</strong><br>Frequensea Marine</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="background:#f2f5f9; padding:14px; color:#7a8799; font-size:12px; line-height:1.6;">
            1-888-446-2746 • Naples, FL<br>© <span style="white-space:nowrap;">Frequensea Marine</span>. All rights reserved.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

export default function CampaignsPage() {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [subject, setSubject] = useState('☀️ Summer Check-Up & Software Updates — Keep Your Systems Running Smooth');
  const [mode, setMode] = useState('html'); // 'html' | 'text'
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_HTML);
  const [bodyText, setBodyText] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const iframeRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/flows');
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || 'Failed to load flows');
        setFlows(data.flows || []);
        if (data.flows?.length) setSelectedFlowId(data.flows[0].id);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  useEffect(() => {
    // live preview for HTML mode
    if (mode === 'html' && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      doc.open();
      doc.write(bodyHtml);
      doc.close();
    }
  }, [mode, bodyHtml]);

  async function sendTest() {
    setSending(true);
    setError(null);
    setMsg(null);
    try {
      const resp = await fetch('/api/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow_id: selectedFlowId || null,
          to_email: toEmail,
          subject,
          body_html: mode === 'html' ? bodyHtml : null,
          body_text: mode === 'text' ? bodyText : null,
          variables: { first_name: 'Curtis' } // simple preview var
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.details || data?.error || 'Failed to send');
      setMsg(`Sent to ${toEmail}`);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={S.wrap}>
      <h1 style={S.title}>Campaigns</h1>
      {error && <div style={{...S.card, ...S.error}}>Error: {error}</div>}
      {msg && <div style={{...S.card, ...S.success}}>{msg}</div>}

      <div style={S.grid}>
        <div style={S.card}>
          <h3 style={S.h3}>1) Details</h3>

          <label style={S.label}>Subject</label>
          <input style={S.input} value={subject} onChange={e => setSubject(e.target.value)} />

          <div style={{marginTop:12}}>
            <label style={S.label}>Recipient (test)</label>
            <input style={S.input} placeholder="you@domain.com" value={toEmail} onChange={e => setToEmail(e.target.value)} />
          </div>

          <div style={{marginTop:12}}>
            <label style={S.label}>Editor Mode</label>
            <div style={{display:'flex', gap:10, marginTop:6}}>
              <button onClick={()=>setMode('html')} style={mode==='html'?S.btnOn:S.btnOff}>HTML</button>
              <button onClick={()=>setMode('text')} style={mode==='text'?S.btnOn:S.btnOff}>Plain Text</button>
            </div>
          </div>

          {mode === 'html' ? (
            <textarea style={{...S.textarea, minHeight:260}} value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} />
          ) : (
            <textarea style={{...S.textarea, minHeight:260}} placeholder="Type plain text…" value={bodyText} onChange={e => setBodyText(e.target.value)} />
          )}

          <button style={S.button} onClick={sendTest} disabled={sending || !toEmail || (!bodyHtml && !bodyText)}>
            {sending ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>

        <div style={S.card}>
          <h3 style={S.h3}>2) Preview</h3>
          {mode === 'html' ? (
            <iframe ref={iframeRef} title="preview" style={{width:'100%', height:480, border:'1px solid #e2e8f0', borderRadius:8}} />
          ) : (
            <pre style={S.previewPlain}>{bodyText || 'Start typing…'}</pre>
          )}
          <div style={{fontSize:12, color:'#64748b', marginTop:8}}>
            Merge tags supported: <code>{'{{first_name}}'}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  wrap: { maxWidth: 1100, margin: '40px auto', padding: '0 16px', fontFamily: 'ui-sans-serif, system-ui' },
  title: { margin: 0, fontSize: '1.75rem' },
  grid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  card: { background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,0.06)', padding:16 },
  h3: { margin:'0 0 12px 0', fontSize:'1.125rem' },
  input: { width:'100%', padding:10, border:'1px solid #e2e8f0', borderRadius:10, marginTop:6 },
  label: { fontSize:13, color:'#475569' },
  textarea: { width:'100%', padding:10, border:'1px solid #e2e8f0', borderRadius:10, marginTop:6, fontFamily:'monospace' },
  button: { marginTop:12, padding:'10px 14px', border:'1px solid #0f172a', background:'#0f172a', color:'#fff', borderRadius:10, cursor:'pointer' },
  previewPlain: { background:'#f8fafc', padding:12, borderRadius:8, minHeight:480, whiteSpace:'pre-wrap' },
  btnOn: { padding:'6px 10px', borderRadius:8, border:'1px solid #0f172a', background:'#0f172a', color:'#fff', cursor:'pointer' },
  btnOff:{ padding:'6px 10px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#0f172a', cursor:'pointer' },
  error: { border:'1px solid #fecaca', background:'#fff1f2', color:'#dc2626' },
  success: { border:'1px solid #86efac', background:'#f0fdf4', color:'#166534' },
};

