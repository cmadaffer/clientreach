// lib/generateReply.js

export async function generateReply(messageBody, subject, sender) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");

  const prompt = `
You are a helpful assistant for "FrequenSea Marine".
Write a concise, friendly reply in Curtis's voice.
- If this is about bookings/scheduling, propose next steps.
- If details are missing, ask 1–2 specific questions.
- Keep it short and actionable.
From: ${sender}
Subject: ${subject}
Message:
${messageBody || "(No body provided.)"}
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000); // 12s safety

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.5,
        messages: [
          { role: "system", content: "You generate succinct, professional email replies." },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("OpenAI timed out (12s)");
    throw e;
  }
  clearTimeout(timeout);

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) throw new Error("OpenAI auth failed (check OPENAI_API_KEY)");
  if (res.status === 429) throw new Error("OpenAI rate limited (429). Try again in a moment.");
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`OpenAI error ${res.status}: ${msg}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned no content");
  return text;
}
