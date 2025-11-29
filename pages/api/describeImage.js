// pages/api/describeImage.js
// Single-file image describe handler.
// Expects JSON POST: { image: "<base64 OR dataURL>", filename?: "photo.png" }
// Uses GEMINI_API_KEY (must be set in Vercel envs).
// Returns { ok: true, answer: "..." } or helpful error JSON.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = req.body || {};
    let raw = body.image || body.imageBase64 || null;
    const filename = body.filename || "uploaded-image";

    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ error: "image (base64 or dataURL) required in JSON body" });
    }

    // Strip data URL prefix if present
    if (raw.includes(",")) raw = raw.split(",")[1];

    // Basic size check
    const approxBytes = Math.ceil((raw.length * 3) / 4);
    const MAX_BYTES = 6 * 1024 * 1024; // 6 MB - safe limit for serverless request/LLM payload
    if (approxBytes > MAX_BYTES) {
      return res.status(413).json({ error: "Image too large", approxBytes, maxBytes: MAX_BYTES });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL =
      process.env.GEMINI_API_URL ||
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured in environment" });
    }

    // Build a short instruction + include image inlineData (this matches your previously-working shape)
    const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: raw
              }
            },
            {
              text:
                "You are CollegeGPT for HSIT (Hirasugar Institute of Technology). " +
                "Describe the image in 2-3 short sentences. List main visible objects and any legible text. " +
                "Do NOT invent personal identities or facts. If uncertain, say so."
            }
          ]
        }
      ]
    };

    const endpoint = `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const rawText = await resp.text();

    if (!resp.ok) {
      // return useful debug info to help identify exact failure
      return res.status(resp.status).json({
        error: `Gemini error ${resp.status}`,
        details: rawText.slice(0, 4000),
        requestSummary: { filename, approxBytes, mimeType }
      });
    }

    // parse response
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: "Failed to parse Gemini JSON", raw: rawText.slice(0, 4000) });
    }

    // Try common locations for returned text
    const textCandidate =
      json?.candidates?.[0]?.content?.[0]?.text ||
      json?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ||
      json?.output?.[0]?.content?.[0]?.text ||
      null;

    if (!textCandidate) {
      // if no simple text field, return the model json (truncated) to debug
      return res.status(200).json({
        ok: true,
        answer: null,
        note: "No text found in Gemini response (structure unexpected). See gemini field.",
        gemini: json
      });
    }

    return res.json({ ok: true, answer: textCandidate });
  } catch (err) {
    console.error("describeImage exception:", err);
    return res.status(500).json({ error: String(err) });
  }
}
