import { useEffect, useState } from "react";

export default function InboxPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cron/inbox-list")
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col p-4">
        <h2 className="text-xl font-bold mb-6">ClientReach</h2>
        <nav className="space-y-3">
          <button className="text-left px-3 py-2 rounded bg-gray-200 font-medium">Inbox</button>
          <button className="text-left px-3 py-2 rounded hover:bg-gray-100">Starred</button>
          <button className="text-left px-3 py-2 rounded hover:bg-gray-100">Sent</button>
          <button className="text-left px-3 py-2 rounded hover:bg-gray-100">Trash</button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-white px-6 py-4 shadow flex items-center justify-between">
          <input
            type="text"
            placeholder="Search mail"
            className="w-1/2 px-4 py-2 border rounded-md focus:outline-none focus:ring"
          />
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-gray-500">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="p-6 text-gray-500">No messages found.</div>
          ) : (
            <ul className="divide-y">
              {messages.map((msg, i) => (
                <li key={i} className="bg-white hover:bg-gray-50 px-6 py-4 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-medium">{msg.from || "Unknown Sender"}</span>
                      <span className="text-sm text-gray-600">{msg.subject || "(No subject)"}</span>
                    </div>
                    <div className="text-sm text-gray-500 whitespace-nowrap">
                      {new Date(msg.date).toLocaleDateString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
