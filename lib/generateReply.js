// lib/generateReply.js
// Fast, fetch-based OpenAI call (no SDK). Short prompt, 9s timeout.
export async function generateReply({ body, subject, sender }) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const trimmed = (body || '').trim();
  const bodyShort = trimmed.length > 1200 ? trimmed.slice(-1200) : trimmed;

  const system = 'You are a concise, professional assistant for a marine electronics business. Keep replies under 120 words. Plain text only. Offer to schedule when appropriate.';
  const user =
    `From: ${sender || 'unknown'}\n` +
    `Subject: ${subject || '(no subject)'}\n` +
    `Message:\n${bodyShort || '(No body. Draft a brief, polite reply asking for details and offering to schedule.)'}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('OpenAI timed out (9s)');
    throw e;
  }
  clearTimeout(timeout);

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('OpenAI auth failed (check OPENAI_API_KEY)');
  if (res.status === 429) throw new Error('OpenAI rate limited (429). Try again shortly.');
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data).slice(0, 200);
    throw new Error(`OpenAI error ${res.status}: ${msg}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned no content');
  return text;
}
