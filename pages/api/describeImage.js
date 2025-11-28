// pages/api/describeImage.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { image } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY missing in env" });

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "image/png", data: image } },
          { text: "Describe this image in a short paragraph." }
        ]
      }
    ]
  };

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ error: `Gemini describe error ${resp.status}`, details: txt });
    }

    const json = await resp.json();
    const answer = json?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    return res.json({ answer: answer || "No description returned" });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
