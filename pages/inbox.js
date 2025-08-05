// pages/inbox.js
import { useState, useEffect } from "react";

export default function Inbox() {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cron/inbox-list")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.messages)) {
          setMessages(data.messages);
          if (data.messages.length) {
            setSelected(data.messages[0]);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 20 }}>Loading your inbox…</div>;
  }

  if (!messages.length) {
    return <div style={{ padding: 20 }}>No messages found.</div>;
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Left pane: message list */}
      <aside
        style={{
          width: "30%",
          borderRight: "1px solid #ddd",
          overflowY: "auto",
          background: "#fafafa",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.uid}
            onClick={() => setSelected(msg)}
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              backgroundColor:
                selected?.uid === msg.uid ? "#e6f7ff" : "transparent",
              borderBottom: "1px solid #eee",
            }}
          >
            <div style={{ fontSize: "0.9em", color: "#333" }}>
              {msg.from}
            </div>
            <div style={{ fontWeight: "600", margin: "4px 0" }}>
              {msg.subject}
            </div>
            <div style={{ fontSize: "0.75em", color: "#888" }}>
              {new Date(msg.date).toLocaleString()}
            </div>
          </div>
        ))}
      </aside>

      {/* Right pane: message preview */}
      <section
        style={{
          flexGrow: 1,
          padding: "24px",
          overflowY: "auto",
        }}
      >
        {selected && (
          <>
            <h1 style={{ marginBottom: 8 }}>{selected.subject}</h1>
            <div style={{ marginBottom: 16, color: "#555" }}>
              <div>
                <strong>From:</strong> {selected.from}
              </div>
              <div>
                <strong>Date:</strong>{" "}
                {new Date(selected.date).toLocaleString()}
              </div>
            </div>

            {/* Render HTML if present, otherwise plain text */}
            <div
              style={{ lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{
                __html:
                  selected.html ||
                  `<pre style="white-space: pre-wrap; font-family:inherit;">${selected.text}</pre>`,
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

