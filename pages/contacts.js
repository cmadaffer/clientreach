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
        if (res.ok) {
          setContacts(data.contacts || []);
        } else {
          setError(data.error || "Error fetching contacts");
        }
      } catch (err) {
        setError("Unexpected error");
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Client Contacts</h1>

        {loading ? (
          <div className="text-gray-600">Loading...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : contacts.length === 0 ? (
          <div className="text-gray-500">No contacts found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {contacts.map((contact) => (
              <div
                key={contact.id || contact.userid}
                className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  {contact.organization || `${contact.first_name} ${contact.last_name}`}
                </h2>
                <p className="text-sm text-gray-600">
                  {contact.email || "No email"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  ID: {contact.id || contact.userid}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
