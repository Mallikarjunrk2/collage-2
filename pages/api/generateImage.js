// pages/api/generateImage.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  const url = process.env.GEMINI_API_URL_IMAGES || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateImages";
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY missing in env" });

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = null; }

    if (!resp.ok) {
      // Return full details so you can paste them here
      return res.status(resp.status).json({ error: `Gemini returned status ${resp.status}`, details: json ?? text });
    }

    // Try multiple possible response shapes:
    const base64FromImages = json?.images?.[0]?.image;
    const candidateInline = json?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    const candidateTextImage = json?.candidates?.[0]?.content?.parts?.find(p => p.text && p.text.startsWith("data:image"))?.text;

    const found = base64FromImages || candidateInline || candidateTextImage;

    if (!found) {
      // If nothing found, return the full JSON so we can inspect
      return res.status(500).json({ error: "No image found in response", raw: json ?? text });
    }

    // ensure we always return base64-only string if candidateTextImage includes data:...,strip it
    const base64 = candidateTextImage ? candidateTextImage.split(",").pop() : found;
    return res.json({ image: base64, raw: json });
  } catch (err) {
    return res.status(500).json({ error: "Exception calling Gemini", details: String(err) });
  }
}
