// pages/api/describeImage.js
// Expects JSON POST: { imageBase64: "<base64 without data:image/...;base64, prefix>", filename: "name.png" }
// Requires Vercel env: GEMINI_API_KEY (and optionally GEMINI_API_URL)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { imageBase64, filename } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 (base64 string) required in JSON body" });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL =
      process.env.GEMINI_API_URL ||
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured in environment" });
    }

    // Build a short, clear prompt for the model. We include the base64 string inline.
    // NOTE: Some models may have limitations on binary-in-text processing; this is a
    // best-effort approach using the Generative Language endpoint with the key in URL.
    const promptText = [
      "You are an assistant that describes images concisely for a college chatbot (HSIT).",
      "Give a short, 2-3 sentence description of the image and list main visible objects or text (if any).",
      "Do NOT hallucinate facts about people or places—if unsure, say you are not certain.",
      `Filename: ${filename || "uploaded-image"}`,
      "",
      // include a short prefix so the model knows the next line is base64 image bytes
      "ImageBase64:",
      imageBase64
    ].join("\n");

    const body = {
      contents: [
        {
          parts: [
            {
              text: promptText
            }
          ]
        }
      ]
    };

    const endpoint = `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // increase timeout by letting Vercel handle (no special option here)
    });

    const textResp = await r.text(); // read raw text for better error messages
    if (!r.ok) {
      // return the API body to help debugging
      return res.status(500).json({ error: `Gemini error ${r.status}`, detail: textResp });
    }

    // parse JSON and try to extract the text answer
    let json;
    try {
      json = JSON.parse(textResp);
    } catch (e) {
      return res.status(500).json({ error: "Failed to parse Gemini JSON", detail: textResp });
    }

    // two common shapes: candidates[...] or output[...]
    const answer =
      json?.candidates?.[0]?.content?.[0]?.text ||
      json?.output?.[0]?.content?.[0]?.text ||
      // fallback: try to stringify a reasonable short excerpt
      (typeof json === "object" ? JSON.stringify(json).slice(0, 2000) : String(json));

    return res.json({ ok: true, answer });
  } catch (err) {
    console.error("describeImage error:", err);
    return res.status(500).json({ error: String(err) });
  }
}