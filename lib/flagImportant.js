import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function isImportantEmail(subject, body) {
  const prompt = `You are a professional assistant. Does the following email seem important for a marine electronics business owner to review personally? Answer only "Yes" or "No".

Subject: ${subject}

Body: ${body}

Important?`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const answer = completion.choices[0]?.message?.content?.trim().toLowerCase();
    return answer.startsWith("yes");
  } catch (err) {
    console.error("Flag important failed:", err);
    return false;
  }
}
