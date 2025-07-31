// pages/contacts.js

import { useEffect, useState } from "react";

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch("/api/contacts");
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load contacts");

        setContacts(data.contacts);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-6 text-center">
          🧾 FreshBooks Contacts
        </h1>

        {loading ? (
          <div className="text-center text-gray-500 text-xl">Loading...</div>
        ) : error ? (
          <div className="text-red-500 text-center text-lg">{error}</div>
        ) : contacts.length === 0 ? (
          <div className="text-center text-gray-400">No contacts found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-white rounded-2xl shadow p-4 border hover:shadow-md transition"
              >
                <h2 className="text-lg font-semibold text-gray-800">
                  {contact.first_name} {contact.last_name}
                </h2>
                <p className="text-sm text-gray-500">
                  {contact.email || "No email"}
                </p>
                <p className="text-sm text-gray-400">
                  {contact.organization || "No company"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
