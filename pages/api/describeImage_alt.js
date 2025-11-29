// pages/api/describeImage_alt.js
// Focused image->news summarizer (no extra deps).
// Accepts JSON POST: { image: "<dataURL or base64>", filename?: "photo.jpg" }
// Prefers OPENAI_API_KEY, falls back to GEMINI_API_KEY.
// Returns: { ok, answer, source, debug }

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

function stripDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const idx = dataUrl.indexOf(",");
  if (idx >= 0 && dataUrl.slice(0, idx).includes("base64")) return dataUrl.slice(idx + 1);
  return dataUrl;
}
function safeParseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

function buildNewsPrompt({ filename, mimeType }) {
  // Strong focused prompt for news screenshots: extract headline, summarize 1-2 lines.
  return [
    "You are a concise news-article reader. Be factual, do not guess identities, and prefer exact visible text.",
    `Image meta: filename=${filename || "unknown"}, mime=${mimeType || "image/jpeg"}.`,
    "Task (strict):",
    "1) EXTRACT HEADLINE: If the image contains a visible headline (newspaper title or webpage headline), copy that headline EXACTLY (in quotes). If none, write: \"Headline: None\".",
    "2) BRIEF SUMMARY: In 1-2 short sentences, summarize what the article or screenshot is about (focus on who/what/where/when if visible).",
    "3) READABLE TEXT: Copy any other short readable text (captions, byline, date) as bullet points. If none, write 'None'.",
    "4) CONFIDENCE: Write one word: high, medium, or low (how confident you are in the extraction).",
    "",
    "Respond in one block (no extra commentary) with numbered sections labeled exactly: HEADLINE, SUMMARY, READABLE TEXT, CONFIDENCE.",
    "",
    "Embed below the base64 image and read it:",
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
      { role: "system", content: "You are a precise assistant that extracts headlines and summarizes news screenshots." },
      { role: "user", content: prompt },
    ],
    temperature: 0.0,
    max_tokens: 400,
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, error: `openai ${r.status}`, details: safeParseJSON(text) || text.slice(0, 3000) };
  const json = safeParseJSON(text);
  const answer = json?.choices?.[0]?.message?.content ?? null;
  return { ok: true, answer, raw: json };
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
  const text = await r.text();
  if (!r.ok) return { ok: false, error: `gemini ${r.status}`, details: safeParseJSON(text) || text.slice(0,3000) };
  const json = safeParseJSON(text);
  // try common response locations
  const answer = json?.candidates?.[0]?.content?.[0]?.text
                 || (json?.candidates?.[0]?.content?.parts || []).find(p => p.text)?.text
                 || json?.output?.[0]?.content?.[0]?.text
                 || null;
  return { ok: true, answer, raw: json };
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
    const prompt = buildNewsPrompt({ filename, mimeType }).replace("{BASE64}", b64);

    // Prefer OpenAI, else Gemini
    let modelResp = null;
    if (process.env.OPENAI_API_KEY) {
      modelResp = await callOpenAI(prompt);
      if (!modelResp.ok) {
        // fallback to Gemini
        modelResp = await callGemini(prompt);
      }
    } else {
      modelResp = await callGemini(prompt);
    }

    const text = (modelResp && modelResp.ok && modelResp.answer) ? String(modelResp.answer).trim() : null;

    if (!text || text.length < 8) {
      // try a short retry with stricter instruction (headline first)
      const retryPrompt = prompt + "\n\nIf you cannot find a clear headline, at least provide a 1-line summary of visible content.";
      const retryResp = process.env.OPENAI_API_KEY ? await callOpenAI(retryPrompt) : await callGemini(retryPrompt);
      const retryText = (retryResp && retryResp.ok && retryResp.answer) ? String(retryResp.answer).trim() : null;
      if (retryText && retryText.length > (text ? text.length : 0)) {
        return res.json({ ok: true, answer: retryText, source: process.env.OPENAI_API_KEY ? "openai" : "gemini", debug: { approxBytes, raw: retryResp.raw || modelResp.raw } });
      }
      return res.json({ ok: true, answer: null, note: "Model returned no usable text", source: process.env.OPENAI_API_KEY ? "openai" : "gemini", debug: { approxBytes, raw: modelResp?.raw } });
    }

    // Normalize: if the model produced many lines, keep as-is (frontend will show). But we prefer a short summary:
    // Return the model text (expected to contain HEADLINE, SUMMARY, READABLE TEXT, CONFIDENCE sections).
    return res.json({ ok: true, answer: text, source: process.env.OPENAI_API_KEY ? "openai" : "gemini", debug: { approxBytes, raw: modelResp.raw || null } });
  } catch (err) {
    console.error("describeImage_alt error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
