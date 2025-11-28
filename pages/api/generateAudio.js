export default async function handler(req, res) {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const key = process.env.GEMINI_API_KEY;

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      audioConfig: { audioEncoding: "LINEAR16" }
    }
  };

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const json = await resp.json();
    const audio = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    res.json({ audio: audio || null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
