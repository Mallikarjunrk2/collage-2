// pages/api/describeImage.js
// Expects JSON POST: { image: "<base64 or dataURL>", filename?: "photo.png" }
// Requires Vercel env: GEMINI_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = req.body || {};
    let raw = body.image || body.imageBase64 || null;
    const filename = body.filename || "uploaded-image";

    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ error: "image or imageBase64 required in JSON body" });
    }

    if (raw.includes(",")) raw = raw.split(",")[1];
    const approxBytes = Math.ceil((raw.length * 3) / 4);
    const MAX_BYTES = 6 * 1024 * 1024;
    if (approxBytes > MAX_BYTES) {
      return res.status(413).json({ error: "Image too large", approxBytes });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    if (!GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY missing in environment" });

    const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: { mimeType, data: raw }
            },
            {
              text: "You are CollegeGPT for HSIT. Describe the image in 2-3 short sentences. List main visible objects and any readable text. Do not invent identities or facts."
            }
          ]
        }
      ]
    };

    const endpoint = `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const rawText = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: `Gemini error ${r.status}`, details: rawText.slice(0, 4000) });
    }

    let json;
    try { json = JSON.parse(rawText); } catch (e) {
      return res.status(500).json({ error: "Failed to parse Gemini JSON", raw: rawText.slice(0, 4000) });
    }

    const ans =
      json?.candidates?.[0]?.content?.[0]?.text ||
      json?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ||
      json?.output?.[0]?.content?.[0]?.text ||
      null;

    if (!ans) {
      return res.status(200).json({ ok: true, answer: null, note: "No text found in Gemini response", gemini: json });
    }

    return res.json({ ok: true, answer: ans });
  } catch (err) {
    console.error("describeImage error:", err);
    return res.status(500).json({ error: String(err) });
  }
}