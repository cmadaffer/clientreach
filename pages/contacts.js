import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/contacts", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setContacts(data.contacts || []);
          }
        })
        .catch(() => {
          setError("Failed to fetch contacts.");
        });
    }
  }, [status, session]);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Client Contacts</h1>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {contacts.length === 0 && !error && <p>No contacts found.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {contacts.map((contact) => (
          <li
            key={contact.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1rem",
              backgroundColor: "#f9f9f9",
            }}
          >
            <strong>{contact.organization || contact.first_name + " " + contact.last_name}</strong>
            <br />
            {contact.email && <span>Email: {contact.email}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
