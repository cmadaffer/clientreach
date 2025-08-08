// pages/inbox.js

import { useState, useEffect } from "react";
import styles from "@/styles/Inbox.module.css";
import Link from "next/link";

export default function Inbox() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [smartReplies, setSmartReplies] = useState({}); // { msgId: "response" }
  const [generatingId, setGeneratingId] = useState(null); // msgId currently generating

  useEffect(() => {
    async function fetchInbox() {
      try {
        const res = await fetch("/api/inbox-data");
        const data = await res.json();
        setMessages(data.messages);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch inbox:", err);
        setLoading(false);
      }
    }

    fetchInbox();
  }, []);

  const handleSmartReply = async (msg) => {
    setGeneratingId(msg.id);
    try {
      const res = await fetch("/api/gpt-email-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageBody: msg.snippet,
          subject: msg.subject,
          sender: msg.from,
        }),
      });

      const data = await res.json();
      setSmartReplies((prev) => ({ ...prev, [msg.id]: data.reply }));
    } catch (err) {
      console.error("Error generating smart reply:", err);
    } finally {
      setGeneratingId(null);
    }
  };

  if (loading) return <p>Loading inbox...</p>;

  return (
    <div className={styles.container}>
      <h1>📥 Inbox</h1>
      {messages.map((msg) => (
        <div key={msg.id} className={styles.emailCard}>
          <p><strong>From:</strong> {msg.from}</p>
          <p><strong>Subject:</strong> {msg.subject}</p>
          <p><strong>Snippet:</strong> {msg.snippet}</p>

          {!smartReplies[msg.id] && (
            <button
              className={styles.replyButton}
              onClick={() => handleSmartReply(msg)}
              disabled={generatingId === msg.id}
            >
              {generatingId === msg.id ? "Generating..." : "💡 Smart Reply"}
            </button>
          )}

          {smartReplies[msg.id] && (
            <div className={styles.replyBox}>
              <p><strong>AI-Generated Reply:</strong></p>
              <textarea
                value={smartReplies[msg.id]}
                onChange={(e) =>
                  setSmartReplies((prev) => ({
                    ...prev,
                    [msg.id]: e.target.value,
                  }))
                }
                rows={5}
              />
              <Link href="/send-email" className={styles.sendLink}>
                ➤ Review & Send
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
