// lib/flagImportant.js
// Heuristic + (optional) OpenAI classification via fetch. No 'openai' package required.

const KEYWORDS = [
  'urgent', 'asap', 'immediately', 'quote', 'estimate', 'invoice', 'payment',
  'schedule', 'booking', 'install', 'service', 'warranty', 'support', 'callback'
];

function heuristics({ subject = '', body = '', from = '' }) {
  const s = String(subject).toLowerCase();
  const b = String(body).toLowerCase();
  const f = String(from).toLowerCase();

  let score = 0;
  for (const kw of KEYWORDS) {
    if (s.includes(kw)) score += 2;
    if (b.includes(kw)) score += 1;
  }
  if (f.includes('freshbooks') || f.endsWith('@frequenseamarine.com')) score += 1;

  return {
    important: score >= 2,
    reason: score >= 2 ? 'Contains booking/billing/scheduling intent' : 'Low signal',
    score,
  };
}

export async function flagImportant({ subject = '', body = '', from = '' }) {
  const h = heuristics({ subject, body, from });
  const API_KEY = process.env.OPENAI_API_KEY;

  if (!API_KEY) return { important: h.important, reason: h.reason, via: 'heuristic' };

  // light classification
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 60,
        messages: [
          { role: 'system', content: 'Answer strictly in JSON: {"important":true|false,"reason":"..."}' },
          { role: 'user', content: `Subject: ${subject}\nFrom: ${from}\nBody: ${body.slice(0, 1000)}` },
        ],
      }),
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text);
    if (typeof parsed?.important === 'boolean') {
      return { important: parsed.important, reason: parsed.reason || 'model', via: 'openai' };
    }
  } catch {
    // fall back to heuristic
  } finally {
    clearTimeout(timeout);
  }

  return { important: h.important, reason: h.reason, via: 'heuristic' };
}
