// pages/connect-freshbooks.js
export default function ConnectFreshbooks() {
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Connect to FreshBooks</h2>
      <a href="/api/auth/freshbooks-auth">
        <button>Connect My FreshBooks Account</button>
      </a>
    </div>
  );
}
