// pages/api/generateAudio.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY missing in env" });

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: { responseModalities: ["AUDIO"], audioConfig: { audioEncoding: "LINEAR16" } }
  };

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ error: `Gemini audio error ${resp.status}`, details: txt });
    }

    const json = await resp.json();
    const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) return res.status(500).json({ error: "No audio returned" });

    return res.json({ audio: b64 });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
