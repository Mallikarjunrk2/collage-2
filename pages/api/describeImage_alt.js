// pages/api/describeImage_alt.js
// Accepts JSON POST: { image: "<dataURL or base64>" , filename?: "photo.jpg" }
// No extra dependencies required. Increase body parser size to accept compressed images.
// Uses OPENAI_API_KEY (preferred) or GEMINI_API_KEY (fallback).

export const config = {
  api: {
    bodyParser: {
      // allow up to ~12MB JSON body (base64 takes more bytes)
      sizeLimit: "12mb",
    },
  },
};

function stripDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const idx = dataUrl.indexOf(",");
  if (idx >= 0 && dataUrl.slice(0, idx).includes("base64")) return dataUrl.slice(idx + 1);
  // maybe raw base64 already
  return dataUrl;
}

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

async function callGemini(b64, mimeType, filename) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_API_URL = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  if (!GEMINI_API_KEY) return { ok: false, error: "GEMINI_API_KEY not configured" };

  const requestBody = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: b64 } },
          { text: "You are CollegeGPT for HSIT. Describe the image in 2-3 short sentences. List main visible objects and any readable text. Do NOT identify people." }
        ]
      }
    ]
  };

  const endpoint = `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  const text = await r.text();
  if (!r.ok) return { ok: false, error: `gemini ${r.status}`, details: safeParseJSON(text) || text.slice(0,3000) };
  const json = safeParseJSON(text);
  const candidate = json?.candidates?.[0]?.content?.[0]?.text || (json?.output?.[0]?.content?.[0]?.text) || null;
  return { ok: true, answer: candidate || null, raw: json };
}

async function callOpenAI(b64, mimeType, filename) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not configured" };

  // Use Chat Completions with image in system message as data URL — some deployments support it.
  // Keep conservative to avoid depending on exact OpenAI multimodal shapes.
  try {
    const payload = {
      model: "gpt-4o-mini", // fallback; change if you prefer another
      messages: [
        { role: "system", content: "You are CollegeGPT for HSIT. Describe images concisely; do not identify people." },
        { role: "user", content: `Image (base64, mime=${mimeType}, filename=${filename}):\n\n[data begins]\n${b64}\n[data ends]\n\nPlease describe the image in 2-3 short sentences and list visible objects.` }
      ],
      max_tokens: 512,
      temperature: 0.2,
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await resp.text();
    if (!resp.ok) return { ok: false, error: `openai ${resp.status}`, details: safeParseJSON(txt) || txt.slice(0,3000) };
    const json = safeParseJSON(txt);
    const ans = json?.choices?.[0]?.message?.content || null;
    return { ok: true, answer: ans, raw: json };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = req.body || {};
    let raw = body.image || null;
    const filename = body.filename || "photo.jpg";

    if (!raw || typeof raw !== "string") return res.status(400).json({ ok: false, error: "image (dataURL or base64) required" });

    // strip dataURL prefix if present
    const b64 = stripDataUrl(raw);
    if (!b64) return res.status(400).json({ ok: false, error: "failed to parse base64 image" });

    // approximate bytes and reject very large
    const approxBytes = Math.ceil((b64.length * 3) / 4);
    const MAX = 10 * 1024 * 1024; // 10MB
    if (approxBytes > MAX) return res.status(413).json({ ok: false, error: "Image too large", approxBytes });

    const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    // prefer OpenAI if configured (some users have better OpenAI access); else Gemini
    if (process.env.OPENAI_API_KEY) {
      const r = await callOpenAI(b64, mimeType, filename);
      if (r.ok) return res.json({ ok: true, answer: r.answer, source: "openai", debug: { approxBytes } });
      // if OpenAI fails, fallback to Gemini
      console.warn("openai failed, falling back:", r);
    }

    const g = await callGemini(b64, mimeType, filename);
    if (!g.ok) return res.status(500).json({ ok: false, error: "LLM failed", details: g });
    return res.json({ ok: true, answer: g.answer, source: "gemini", debug: { approxBytes } });
  } catch (err) {
    console.error("describeImage_alt error", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
