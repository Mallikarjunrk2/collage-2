// pages/api/describeImage_alt.js
// Robust image describer (no extra deps).
// 1) Try news/headline extraction prompt.
// 2) If result is "none" or too short or low confidence, retry with a forced visual-description prompt.
// Accepts JSON POST: { image: "<dataURL or base64>", filename?: "photo.jpg" }
// Prefers OPENAI_API_KEY, falls back to GEMINI_API_KEY.

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

function stripDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const i = dataUrl.indexOf(",");
  if (i >= 0 && dataUrl.slice(0, i).includes("base64")) return dataUrl.slice(i + 1);
  return dataUrl;
}
function safeParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function isProbablyEmptyText(s) {
  if (!s) return true;
  const t = String(s).trim();
  if (t.length < 20) return true;
  // some boilerplate responses we treat as empty
  if (/no (headline|text)|none/i.test(t)) return true;
  return false;
}

function buildNewsPrompt({ filename, mimeType }) {
  return [
    "You are a concise assistant that extracts headlines and summarizes screenshots of news/articles.",
    `Image meta: filename=${filename || "unknown"}, mime=${mimeType || "image/jpeg"}.`,
    "Respond with exactly these numbered sections (HEADLINE, SUMMARY, READABLE TEXT, CONFIDENCE).",
    "HEADLINE: Copy visible headline exactly in quotes, or write \"Headline: None\" if none visible.",
    "SUMMARY: 1-2 short sentences describing what the article or screenshot is about (who/what/where/when if visible).",
    "READABLE TEXT: bullet list of any other readable short text (byline, date). If none, write 'None'.",
    "CONFIDENCE: one word (high/medium/low).",
    "",
    "Now read the embedded base64 image below and produce those sections.",
    "[BEGIN IMAGE BASE64]",
    "{BASE64}",
    "[END IMAGE BASE64]"
  ].join("\n");
}

function buildVisualPrompt({ filename, mimeType }) {
  return [
    "You are a visual-description assistant. Ignore headline extraction — produce a clear visual description.",
    `Image meta: filename=${filename || "unknown"}, mime=${mimeType || "image/jpeg"}.`,
    "Output these sections (exact labels):",
    "1) SCENE SUMMARY (1-2 sentences): what is happening or shown overall.",
    "2) VISIBLE OBJECTS (comma-separated): list people, objects, UI elements, logos, vehicles, etc.",
    "3) COLORS & STYLE: short note about dominant colors, photo vs screenshot, layout (e.g., webpage screenshot, close-up photo).",
    "4) ANY READABLE TEXT: copy any readable text (headlines, captions) if you can see it, else 'None'.",
    "5) CONFIDENCE: one word (high/medium/low).",
    "",
    "Now read the embedded base64 image below and produce the sections.",
    "[BEGIN IMAGE BASE64]",
    "{BASE64}",
    "[END IMAGE BASE64]"
  ].join("\n");
}

async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "OPENAI_API_KEY not configured" };

  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an assistant that describes images precisely and conservatively." },
      { role: "user", content: prompt },
    ],
    max_tokens: 600,
    temperature: 0.0,
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, error: `openai ${r.status}`, details: safeParseJSON(txt) || txt.slice(0,3000) };
  const json = safeParseJSON(txt);
  const content = json?.choices?.[0]?.message?.content ?? null;
  return { ok: true, answer: content, raw: json };
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  const url = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  if (!key) return { ok: false, error: "GEMINI_API_KEY not configured" };

  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const r = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, error: `gemini ${r.status}`, details: safeParseJSON(txt) || txt.slice(0,3000) };
  const json = safeParseJSON(txt);
  const candidate = json?.candidates?.[0]?.content?.[0]?.text
                 || (json?.candidates?.[0]?.content?.parts || []).find(p => p.text)?.text
                 || json?.output?.[0]?.content?.[0]?.text
                 || null;
  return { ok: true, answer: candidate, raw: json };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });
  try {
    const body = req.body || {};
    const raw = body.image || null;
    const filename = body.filename || "photo.jpg";
    if (!raw || typeof raw !== "string") return res.status(400).json({ ok: false, error: "image (dataURL or base64) required" });

    const b64 = stripDataUrl(raw);
    if (!b64) return res.status(400).json({ ok: false, error: "failed to parse base64 image" });

    const approxBytes = Math.ceil((b64.length * 3) / 4);
    if (approxBytes > 12 * 1024 * 1024) return res.status(413).json({ ok: false, error: "Image too large", approxBytes });

    const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    // 1) Try headline/news extraction first
    const primaryPrompt = buildNewsPrompt({ filename, mimeType }).replace("{BASE64}", b64);
    let primaryResp = null;
    if (process.env.OPENAI_API_KEY) {
      primaryResp = await callOpenAI(primaryPrompt);
      if (!primaryResp.ok) primaryResp = await callGemini(primaryPrompt);
    } else {
      primaryResp = await callGemini(primaryPrompt);
    }

    const primaryText = (primaryResp && primaryResp.ok && primaryResp.answer) ? String(primaryResp.answer).trim() : null;

    // If primary result seems empty or says Headline: None, do forced visual description
    const needVisual = isProbablyEmptyText(primaryText) || /Headline:\s*None/i.test(primaryText || "");

    if (!needVisual) {
      // Good primary result – return it
      return res.json({ ok: true, answer: primaryText, source: process.env.OPENAI_API_KEY ? "openai" : "gemini", debug: { stage: "primary", approxBytes, raw: primaryResp.raw || null } });
    }

    // 2) Fallback: visual description prompt
    const visualPrompt = buildVisualPrompt({ filename, mimeType }).replace("{BASE64}", b64);
    let visualResp = null;
    if (process.env.OPENAI_API_KEY) {
      visualResp = await callOpenAI(visualPrompt);
      if (!visualResp.ok) visualResp = await callGemini(visualPrompt);
    } else {
      visualResp = await callGemini(visualPrompt);
    }

    const visualText = (visualResp && visualResp.ok && visualResp.answer) ? String(visualResp.answer).trim() : null;

    if (visualText && visualText.length > 10) {
      return res.json({ ok: true, answer: visualText, source: process.env.OPENAI_API_KEY ? "openai" : "gemini", debug: { stage: "visual-fallback", approxBytes, primaryRaw: primaryResp.raw || null, visualRaw: visualResp.raw || null } });
    }

    // 3) If both fail, return debug to help diagnose
    return res.json({
      ok: true,
      answer: null,
      note: "Model returned no usable description.",
      debug: {
        stage: "both-failed",
        approxBytes,
        primaryText: primaryText,
        primaryRaw: primaryResp?.raw || null,
        visualRaw: visualResp?.raw || null,
      },
      source: process.env.OPENAI_API_KEY ? "openai" : "gemini",
    });
  } catch (err) {
    console.error("describeImage_alt error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
