import { useEffect, useState } from 'react';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchContacts() {
      try {
        const res = await fetch('/api/contacts');
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setContacts(data.contacts || []);
      } catch (err) {
        console.error(err);
        setError('Error: ' + err.message);
      }
    }

    fetchContacts();
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial' }}>
      <h1>Your Clients</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {contacts.length === 0 && !error && <p>No contacts found.</p>}
      {contacts.length > 0 && (
        <table border="1" cellPadding="10" style={{ marginTop: '1rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Email</th>
              <th>Organization</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((client: any) => (
              <tr key={client.id}>
                <td>{client.first_name} {client.last_name}</td>
                <td>{client.email}</td>
                <td>{client.organization}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
