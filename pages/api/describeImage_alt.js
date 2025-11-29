// pages/api/describeImage_alt.js
// Improved no-deps image description endpoint.
// Accepts JSON POST: { image: "<dataURL or base64>", filename?: "photo.jpg" }
// Prefers OPENAI_API_KEY if present, otherwise GEMINI_API_KEY.
// Returns structured answer: short summary + bullet list of visible objects + readable text (if any).

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

function stripDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const idx = dataUrl.indexOf(",");
  if (idx >= 0 && dataUrl.slice(0, idx).includes("base64")) return dataUrl.slice(idx + 1);
  return dataUrl;
}

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

async function callOpenAIWithPrompt(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "OPENAI_API_KEY not configured" };

  const payload = {
    model: "gpt-4o-mini", // adjust if you prefer another model
    messages: [
      { role: "system", content: "You are an assistant that describes images precisely and conservatively." },
      { role: "user", content: prompt },
    ],
    max_tokens: 700,
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
  const content = json?.choices?.[0]?.message?.content || null;
  return { ok: true, answer: content, raw: json };
}

async function callGeminiWithPrompt(endpointKey, prompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiUrl = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  if (!geminiKey) return { ok: false, error: "GEMINI_API_KEY not configured" };

  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const r = await fetch(`${geminiUrl}?key=${encodeURIComponent(geminiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const txt = await r.text();
  if (!r.ok) return { ok: false, error: `gemini ${r.status}`, details: safeParseJSON(txt) || txt.slice(0,3000) };
  const json = safeParseJSON(txt);
  // Try several places for text depending on API shape
  const candidate = json?.candidates?.[0]?.content?.[0]?.text ||
                    (json?.candidates?.[0]?.content?.parts || []).find(p => p.text)?.text ||
                    json?.output?.[0]?.content?.[0]?.text ||
                    null;
  return { ok: true, answer: candidate, raw: json };
}

function buildPrimaryPrompt({ mimeType, filename }) {
  // Strong, structured prompt asking for exactly what you want
  return [
    "You are a careful image description assistant. Be concise, factual, and do not invent identities.",
    `Image meta: filename=${filename || "unknown"}, mime=${mimeType || "image/jpeg"}.`,
    "Please produce output with these sections ONLY (separate each section with a blank line):",
    "1) SHORT SUMMARY (2-3 sentences): Describe the overall scene and main purpose of the image.",
    "2) VISIBLE OBJECTS (bullet list): List main visible objects and elements (e.g., 'person, car, newspaper, headline, table, logo').",
    "3) READABLE TEXT (quoted): If any text appears in the image (headlines, captions, UI), copy it exactly and clearly mark where it was found. If none, write 'None'.",
    "4) CONFIDENCE: Write one of [low, medium, high] indicating how confident you are in the above description.",
    "Important: If the image is a screenshot of a webpage or article, try to extract the headline or visible headline-like text. Do NOT guess names or personal identities from faces.",
    "Now, read the embedded base64 image provided below and respond using the requested sections.",
    "[BEGIN IMAGE BASE64]",
    "{BASE64}",
    "[END IMAGE BASE64]"
  ].join("\n");
}

function buildRetryPrompt({ mimeType, filename }) {
  return [
    "Retrying with explicit extraction focus.",
    "Task: List all visible objects first (comma-separated), then list any textual content you can read from the image, then give a 1-2 sentence summary.",
    `Image meta: filename=${filename || "unknown"}, mime=${mimeType || "image/jpeg"}.`,
    "[BEGIN IMAGE BASE64]",
    "{BASE64}",
    "[END IMAGE BASE64]"
  ].join("\n");
}

function normalizeModelText(s) {
  if (!s) return "";
  return String(s).trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = req.body || {};
    const raw = body.image || null;
    const filename = body.filename || "photo.jpg";
    if (!raw || typeof raw !== "string") return res.status(400).json({ ok: false, error: "image (dataURL or base64) required" });

    // strip dataURL prefix if present
    const b64 = stripDataUrl(raw);
    if (!b64) return res.status(400).json({ ok: false, error: "failed to parse base64 image" });

    // approximate size guard
    const approxBytes = Math.ceil((b64.length * 3) / 4);
    const MAX = 12 * 1024 * 1024;
    if (approxBytes > MAX) return res.status(413).json({ ok: false, error: "Image too large", approxBytes });

    const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    // Build prompt with embedded base64 to allow multimodal LLMs to read inline image (Gemini supports inlineData shapes,
    // OpenAI approach here simply includes b64 as text inside message — some deployments accept)
    const primaryPrompt = buildPrimaryPrompt({ mimeType, filename }).replace("{BASE64}", b64);
    const retryPrompt = buildRetryPrompt({ mimeType, filename }).replace("{BASE64}", b64);

    // Prefer OpenAI if available
    let modelResp = null;
    if (process.env.OPENAI_API_KEY) {
      modelResp = await callOpenAIWithPrompt(primaryPrompt);
      if (!modelResp.ok) {
        // if OpenAI call failed, try Gemini as fallback
        modelResp = await callGeminiWithPrompt("fallback", primaryPrompt);
      }
    } else {
      // no OpenAI -> Gemini
      modelResp = await callGeminiWithPrompt("primary", primaryPrompt);
    }

    let answerText = normalizeModelText(modelResp?.answer);

    // If first try produced no useful text, retry once with the retryPrompt
    if (!answerText || answerText.length < 10) {
      const retryResp = process.env.OPENAI_API_KEY
        ? await callOpenAIWithPrompt(retryPrompt).catch(() => ({ ok: false }))
        : await callGeminiWithPrompt("retry", retryPrompt).catch(() => ({ ok: false }));

      if (retryResp && retryResp.ok) {
        const candidate = normalizeModelText(retryResp.answer);
        if (candidate && candidate.length > answerText.length) {
          answerText = candidate;
          modelResp = retryResp;
        }
      }
    }

    // Final sanitation: if still empty, return helpful debug
    if (!answerText || answerText.length < 10) {
      return res.status(200).json({
        ok: true,
        answer: null,
        note: "Model returned empty or insufficient text. See raw for debugging.",
        source: process.env.OPENAI_API_KEY ? "openai" : "gemini",
        debug: {
          approxBytes,
          filename,
          modelRaw: modelResp?.raw || null,
        },
      });
    }

    // Otherwise return the textual answer (structured as requested by prompt)
    return res.status(200).json({
      ok: true,
      answer: answerText,
      source: process.env.OPENAI_API_KEY ? "openai" : "gemini",
      debug: { approxBytes, filename, modelRaw: modelResp?.raw || null },
    });
  } catch (err) {
    console.error("describeImage_alt error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
