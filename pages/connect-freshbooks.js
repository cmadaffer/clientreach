// pages/connect-freshbooks.js

export default function ConnectFreshbooks() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Connect to FreshBooks</h2>
      <a href="/api/auth/freshbooks-auth">
        <button
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#0061ff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Connect My FreshBooks Account
        </button>
      </a>
    </div>
  );
}
