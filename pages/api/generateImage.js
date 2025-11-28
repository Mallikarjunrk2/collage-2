export default async function handler(req, res) {
  const { image } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const key = process.env.GEMINI_API_KEY;

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "image/png", data: image } },
          { text: "Describe this image briefly and clearly." }
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

    const json = await resp.json();
    const answer = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    res.json({ answer: answer || "No description." });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
