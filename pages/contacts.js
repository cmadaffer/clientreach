import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    // Replace with fake clients for now
    const fakeContacts = [
      { id: 1, first_name: "John", last_name: "Doe", email: "john.doe@example.com", company: "Doe Inc." },
      { id: 2, first_name: "Jane", last_name: "Smith", email: "jane.smith@example.com", company: "Smith Consulting" },
      { id: 3, first_name: "Michael", last_name: "Johnson", email: "m.johnson@example.com", company: "Johnson LLC" },
    ];
    setContacts(fakeContacts);
    setLoading(false);
  }, []);

  if (loading) return <div className="text-center text-gray-500 mt-10">Loading contacts...</div>;

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-6 sm:px-12">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">🧾 Your FreshBooks Clients</h1>

      {contacts.length === 0 ? (
        <p className="text-gray-600">No contacts found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white rounded-2xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition-all"
            >
              <h2 className="text-xl font-semibold text-gray-800">
                {contact.first_name} {contact.last_name}
              </h2>
              <p className="text-gray-600">{contact.company}</p>
              <p className="text-gray-500 text-sm mt-1">{contact.email}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
