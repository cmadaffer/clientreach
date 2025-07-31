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
          setContacts([]);
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
      <div style={styles.container}>
        <h1 style={styles.header}>Client Contacts</h1>

        {loading && <p style={styles.message}>Loading contacts...</p>}
        {error && <p style={{ ...styles.message, color: 'red' }}>Error: {error}</p>}

        {!loading && contacts.length === 0 && !error && (
          <p style={styles.message}>No contacts found.</p>
        )}

        <div style={styles.cardGrid}>
          {contacts.map((contact) => (
            <div key={contact.id} style={styles.card}>
              <h3>{contact.organization || contact.first_name + ' ' + contact.last_name}</h3>
              <p>Email: {contact.email || '—'}</p>
              <p>Phone: {contact.phone || '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const styles = {
  container: {
    padding: '2rem',
    fontFamily: 'Arial, sans-serif',
    background: '#f9f9f9',
    minHeight: '100vh',
  },
  header: {
    fontSize: '2rem',
    marginBottom: '1.5rem',
  },
  message: {
    fontSize: '1rem',
    marginBottom: '1rem',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    padding: '1rem',
    background: '#fff',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    border: '1px solid #e5e5e5',
  },
};

