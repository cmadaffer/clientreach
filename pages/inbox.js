import { useEffect, useState } from "react";

export default function InboxPage() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch("/api/cron/inbox-list")
      .then((res) => res.json())
      .then((data) => {
        // assuming data.messages contains parsed emails with html/text
        setEmails(data.messages || []);
      })
      .catch((err) => console.error("Failed to load inbox:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-1/4 bg-white shadow-md overflow-y-auto">
        <h2 className="p-4 text-xl font-bold border-b">Inbox</h2>
        {loading ? (
          <p className="p-4 text-gray-500">Loading…</p>
        ) : (
          emails.map((email) => (
            <button
              key={email.uid}
              onClick={() => setSelected(email)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition ${
                selected?.uid === email.uid ? "bg-gray-200" : ""
              }`}
            >
              <span className="block font-medium truncate">{email.from}</span>
              <span className="block text-sm text-gray-600 truncate">{email.subject}</span>
              <span className="block text-xs text-gray-400">
                {new Date(email.date).toLocaleString()}
              </span>
            </button>
          ))
        )}
      </aside>

      {/* Main Pane */}
      <section className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white px-6 py-4 shadow flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {selected ? selected.subject : "Select a message"}
          </h3>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear
            </button>
          )}
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {selected ? (
            selected.html ? (
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: selected.html }}
              />
            ) : (
              <pre className="whitespace-pre-wrap">{selected.text}</pre>
            )
          ) : (
            <p className="text-gray-500">No message selected.</p>
          )}
        </div>
      </section>
    </div>
  );
}
