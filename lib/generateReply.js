// lib/generateReply.js

export async function generateReply(messageBody, subject, sender) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const prompt = `
You are a helpful assistant working for a marine electronics business called "FrequenSea Marine."
You will reply to emails in the voice of the owner, Curtis, who is professional but friendly.

Context:
- Prioritize responding to inquiries about bookings, follow-ups, or service needs.
- If it's about scheduling, offer to set up a time.
- If it's spam or not relevant, say “no reply needed.”
- Be concise but clear.
- Do not make assumptions—respond based only on what’s in the email.

Incoming email:
From: ${sender}
Subject: ${subject}
Message:
${messageBody}

Write a suggested reply for Curtis to review.
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You generate email replies for a marine business." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5
    })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("OpenAI error:", data);
    throw new Error("Failed to generate reply.");
  }

  return data.choices[0].message.content.trim();
}
