import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
  }, [status]);

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch("/api/contacts");
        const data = await res.json();
        setContacts(data.contacts || []);
      } catch (err) {
        console.error("Failed to load contacts", err);
      } finally {
        setLoading(false);
      }
    };

    if (status === "authenticated") {
      fetchContacts();
    }
  }, [status]);

  if (loading) {
    return <div className="text-center text-xl mt-20">Loading contacts...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">Your FreshBooks Clients</h1>
      {contacts.length === 0 ? (
        <div className="text-center text-gray-500">No contacts found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-lg transition-all duration-300"
            >
              <h2 className="text-xl font-semibold text-gray-800">{contact.organization || "No Company"}</h2>
              <p className="text-gray-600">{contact.first_name} {contact.last_name}</p>
              <p className="text-gray-500 text-sm mt-2">{contact.email || "No email provided"}</p>
              <p className="text-gray-400 text-xs mt-1">Client ID: {contact.id}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
