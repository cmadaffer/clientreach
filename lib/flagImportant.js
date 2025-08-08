// lib/flagImportant.js
// No external dependencies. Uses fetch + OPENAI_API_KEY from env.

export async function isImportantEmail(subject, body) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY');
    return false;
  }

  const prompt = `You are a professional assistant for a marine electronics business.
Decide if the email should be flagged as IMPORTANT for the owner to review personally.
Return ONLY "Yes" or "No" (no punctuation, no extra words).

Examples of IMPORTANT:
- Booking requests or time-sensitive scheduling
- High-value customer asking for help or quote
- Urgent issues, failures, cancellations, legal/financial/account problems
- Messages from known partners/vendors needing action

Subject: ${subject || '(no subject)'}
Body:
${(body || '').slice(0, 4000)}

Important?`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('OpenAI error:', data);
      return false;
    }

    const answer =
      data?.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    return answer.startsWith('yes');
  } catch (err) {
    console.error('Flag important failed:', err);
    return false;
  }
}
