// pages/index.js
import Head from 'next/head';
import Link from 'next/link';

export default function HomePage() {
  const handleFreshBooksLogin = () => {
    window.location.href = '/api/auth/freshbooks-auth';
  };

  const btn = {
    padding: '10px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    textDecoration: 'none',
    color: '#0f172a',
    background: '#fff'
  };

  return (
    <>
      <Head>
        <title>ClientReach Assistant</title>
      </Head>

      <main style={styles.container}>
        <h1 style={styles.title}>ClientReach Assistant</h1>
        <p style={styles.subtitle}>
          Connect FreshBooks, manage contacts, and run campaigns.
        </p>

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          <Link href="/contacts" style={btn}>Contacts</Link>
          <Link href="/campaigns" style={btn}>Campaigns</Link>
          <Link href="/connect-freshbooks" style={btn}>Connect FreshBooks</Link>
        </div>

        {/* Primary action */}
        <button onClick={handleFreshBooksLogin} style={styles.primaryButton}>
          Connect FreshBooks
        </button>
      </main>
    </>
  );
}

const styles = {
  container: {
    minHeight: '70vh',
    padding: '3rem 2rem',
    backgroundColor: '#f4f4f4',
    textAlign: 'center',
    fontFamily: 'Segoe UI, ui-sans-serif, system-ui, Arial'
  },
  title: {
    fontSize: '2.2rem',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '0.6rem'
  },
  subtitle: {
    fontSize: '1.05rem',
    marginBottom: '1.5rem',
    color: '#475569'
  },
  primaryButton: {
    padding: '0.9rem 1.6rem',
    fontSize: '1rem',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: '1px solid #0f172a',
    borderRadius: '10px',
    cursor: 'pointer'
  }
};

