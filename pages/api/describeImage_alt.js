

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

function extractBase64(dataURL) {
  if (!dataURL || typeof dataURL !== "string") return null;
  return dataURL.split(",")[1] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { image, filename } = req.body || {};
    if (!image) return res.status(400).json({ error: "image required" });

    const base64 = extractBase64(image);
    if (!base64) return res.status(400).json({ error: "invalid image data" });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY)
      return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    const GEMINI_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    const mime =
      filename?.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    const prompt =
      "Describe the image clearly. If it's a news article or screenshot, extract headline, subheadline, summary and key visible details.";

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mime,
                data: base64,
              },
            },
            { text: prompt },
          ],
        },
      ],
    };

    const url = `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_KEY)}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const txt = await r.text();
    let json = {};
    try {
      json = JSON.parse(txt);
    } catch (e) {
      return res.status(500).json({ error: "Invalid JSON from Gemini", raw: txt });
    }

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Gemini error",
        details: json,
      });
    }

    const output =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ||
      json?.candidates?.[0]?.content?.[0]?.text ||
      "No description found";

    return res.json({
      ok: true,
      answer: output,
      source: "gemini-vision",
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
