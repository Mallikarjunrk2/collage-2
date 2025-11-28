// pages/api/generateAudio.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });

  const url = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY missing in env" });

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: { responseModalities: ["AUDIO"], audioConfig: { audioEncoding: "LINEAR16" } }
  };

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const textResp = await resp.text();
    let json;
    try { json = JSON.parse(textResp); } catch (e) { json = null; }

    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Gemini returned status ${resp.status}`, details: json ?? textResp });
    }

    // possible shapes:
    // 1) candidates[0].content.parts[].inlineData.data (base64)
    // 2) candidates[0].content.parts[].text with data URL
    // 3) some other path (return raw)

    const parts = json?.candidates?.[0]?.content?.parts || [];
    let b64 = null;
    for (const p of parts) {
      if (p?.inlineData?.data) { b64 = p.inlineData.data; break; }
      if (typeof p?.text === "string" && p.text.startsWith("data:audio")) {
        b64 = p.text.split(",").pop(); break;
      }
      // some shapes might have audioObject etc.
      if (p?.audio) { b64 = p.audio; break; }
    }

    if (!b64) {
      return res.status(500).json({ error: "No audio found in Gemini response", raw: json ?? textResp });
    }

    return res.json({ audio: b64, raw: json });
  } catch (err) {
    return res.status(500).json({ error: "Exception calling Gemini", details: String(err) });
  }
}
