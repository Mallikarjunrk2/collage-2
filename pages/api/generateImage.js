export default async function handler(req, res) {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateImages";
  const key = process.env.GEMINI_API_KEY;

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const json = await resp.json();
    const img = json.images?.[0]?.image;

    res.json({ image: img || null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
