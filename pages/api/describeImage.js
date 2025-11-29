// pages/api/describeImage.js
// Expects JSON POST: { image: "<base64 or dataURL>", filename?: "file.png" }
// or: { imageBase64: "<base64 or dataURL>", filename?: "file.png" }
// Requires Vercel env: GEMINI_API_KEY (API key) and optional GEMINI_API_URL

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const payload = req.body || {};
    // accept either field name
    let raw = payload.image || payload.imageBase64 || null;
    const filename = payload.filename || "uploaded-image";

    if (!raw) {
      return res.status(400).json({ error: "image or imageBase64 required in JSON body" });
    }

    // if client sent "data:image/png;base64,AAAA..." remove prefix
    if (typeof raw === "string" && raw.includes(",")) {
      const parts = raw.split(",");
      raw = parts[1] || parts[parts.length - 1];
    }

    if (typeof raw !== "string") {
      return res.status(400).json({ error: "image must be a base64 string" });
    }

    // minimal size check (avoid sending huge blobs accidentally)
    const approxBytes = Math.ceil((raw.length * 3) / 4);
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB safe default
    if (approxBytes > MAX_BYTES) {
      return res.status(413).json({ error: "Image too large", sizeBytes: approxBytes });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL =
      process.env.GEMINI_API_URL ||
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY missing in environment" });
    }

    // Build model prompt + include the base64 as inlineData (your previous working shape)
    // NOTE: the model/service may have limits on binary-in-text. If you still get schema errors,
    // we'll switch to a different approach (base64 -> storage URL -> LLM).
    const requestBody = {
      contents: [
        {
          parts: [
            // inlineData part for the image (mime guess from filename)
            {
              inlineData: {
                mimeType: filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
                data: raw
              }
            },
            // instruction part
            {
              text: [
                "You are CollegeGPT for HSIT (Hirasugar Institute of Technology).",
                "Describe this image in 2–4 short sentences and list the main visible objects, text, or signs.",
                "Do not invent facts or personal identities; if uncertain, say so.",
                `Filename: ${filename}`
              ].join(" ")
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
      // return Gemini error body to help debugging
      return res.status(resp.status).json({
        error: `Gemini responded with status ${resp.status}`,
        details: rawText.slice(0, 4000), // avoid huge responses
        requestSummary: { filename, approxBytes }
      });
    }

    // parse JSON and extract model text from common locations
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: "Failed to parse Gemini JSON", raw: rawText.slice(0, 4000) });
    }

    const candidateText =
      json?.candidates?.[0]?.content?.[0]?.text ||
      json?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ||
      json?.output?.[0]?.content?.[0]?.text ||
      // fallback to probing content parts
      (Array.isArray(json?.candidates?.[0]?.content)
        ? json.candidates[0].content.map((c) => (c?.text ? c.text : JSON.stringify(c))).join("\n")
        : null);

    if (!candidateText) {
      // return the full json if we couldn't extract a simple text answer
      return res.status(200).json({
        ok: true,
        answer: null,
        note: "No single text field found in Gemini response",
        gemini: json
      });
    }

    return res.json({ ok: true, answer: candidateText });
  } catch (err) {
    console.error("describeImage error:", err);
    return res.status(500).json({ error: String(err) });
  }
}