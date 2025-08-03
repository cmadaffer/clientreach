// pages/connect-freshbooks.js
import { useState } from 'react';

export default function ConnectFreshBooks() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  async function startAuth() {
    try {
      setError(null);
      setConnecting(true);
      const r = await fetch('/api/auth/freshbooks-auth');
      if (!r.ok) throw new Error('Failed to initiate FreshBooks auth');
      // The API should 302 to FreshBooks; as a fallback, open returned URL if provided
      const data = await r.json().catch(()=> ({}));
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        // If the route issues a redirect directly, the browser will navigate on its own.
        // Nothing else to do here.
      }
    } catch (e) {
      setError(e.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div>
      <h1>Connect FreshBooks</h1>
      <p>Connect your FreshBooks account to sync and email your clients.</p>

      <button onClick={startAuth}
              disabled={connecting}
              style={{ padding:'10px 14px', border:'1px solid #0f172a',
                       background:'#0f172a', color:'#fff', borderRadius:10,
                       cursor:'pointer' }}>
        {connecting ? 'Opening FreshBooks…' : 'Connect to FreshBooks'}
      </button>

      {error && <div style={{ marginTop:12, color:'#dc2626' }}>Error: {error}</div>}
      <div style={{ marginTop:20, fontSize:12, color:'#64748b' }}>
        After you authorize, you’ll return here automatically.
      </div>
    </div>
  );
}
