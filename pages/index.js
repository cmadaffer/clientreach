// pages/index.js
import Head from 'next/head';

export default function HomePage() {
  const handleFreshBooksLogin = () => {
    window.location.href = '/api/auth/freshbooks-auth';
  };

  return (
    <>
      <Head>
        <title>ClientReach Assistant</title>
      </Head>
      <main style={styles.container}>
        <h1 style={styles.title}>ClientReach Assistant</h1>
        <p style={styles.subtitle}>
          Log in to connect your FreshBooks account and start syncing your clients.
        </p>
        <button onClick={handleFreshBooksLogin} style={styles.button}>
          Connect FreshBooks
        </button>
      </main>
    </>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    padding: '4rem 2rem',
    backgroundColor: '#f4f4f4',
    textAlign: 'center',
    fontFamily: 'Segoe UI, sans-serif',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 600,
    color: '#222',
    marginBottom: '1rem',
  },
  subtitle: {
    fontSize: '1.1rem',
    marginBottom: '2rem',
    color: '#666',
  },
  button: {
    padding: '0.8rem 1.6rem',
    fontSize: '1rem',
    backgroundColor: '#00BFA5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};
