import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function Contacts() {
  const { data: session, status } = useSession();
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/contacts")
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setContacts(data.contacts || []);
          }
        })
        .catch((err) => {
          setError("Failed to fetch contacts.");
        });
    }
  }, [status]);

  if (status === "loading") return <p className="p-4">Loading...</p>;
  if (status === "unauthenticated") return <p className="p-4 text-red-500">Please log in.</p>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Client Contacts</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {contacts.length === 0 ? (
        <p className="text-gray-600">No contacts found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contacts.map((client, index) => (
            <div key={index} className="p-4 border rounded shadow hover:shadow-md transition">
              <h2 className="text-lg font-semibold">
                {client.organization || client.first_name + " " + client.last_name}
              </h2>
              <p className="text-gray-600">{client.email}</p>
              <p className="text-sm text-gray-500">{client.phone}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
