// pages/contacts.js
import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchContacts() {
      try {
        const res = await fetch('/api/contacts');
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Something went wrong');
        } else {
          setContacts(data.contacts || []);
        }
      } catch (err) {
        setError('Failed to load contacts');
      } finally {
        setLoading(false);
      }
    }

    fetchContacts();
  }, []);

  return (
    <>
      <Head>
        <title>Client Contacts</title>
      </Head>
      <main style={styles.wrapper}>
        <h1 style={styles.title}>Your Clients</h1>

        {loading && <p style={styles.status}>Loading contacts...</p>}
        {error && <p style={{ ...styles.status, color: '#d33' }}>Error: {error}</p>}
        {!loading && contacts.length === 0 && !error && (
          <p style={styles.status}>No contacts found.</p>
        )}

        <section style={styles.grid}>
          {contacts.map((contact, i) => (
            <div key={i} style={styles.card}>
              <h2 style={styles.name}>
                {contact.organization ||
                  `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
                  'Unnamed Contact'}
              </h2>
              <p style={styles.detail}>📧 {contact.email || '—'}</p>
              <p style={styles.detail}>📞 {contact.phone || '—'}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

const styles = {
  wrapper: {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto',
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 600,
    marginBottom: '2rem',
    color: '#333',
  },
  status: {
    fontSize: '1.1rem',
    marginBottom: '1.5rem',
  },
  grid: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  },
  card: {
    backgroundColor: '#fff',
    padding: '1.5rem',
    borderRadius: '1rem',
    boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
    border: '1px solid #e6e6e6',
    transition: 'transform 0.2s ease',
  },
  name: {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
    color: '#222',
  },
  detail: {
    fontSize: '1rem',
    color: '#555',
  },
};
