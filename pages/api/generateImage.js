export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

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
    const base64 = json.images?.[0]?.image;

    if (!base64) return res.json({ error: "No image returned" });

    return res.json({ image: base64 });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
