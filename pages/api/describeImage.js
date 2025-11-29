// pages/api/describeImage.js
// Expects JSON POST: { image: "<base64 or dataURL>", filename?: "photo.png" }
// Requires env: GEMINI_API_KEY, optional GEMINI_API_URL
//
// Notes:
// - Next.js default body parser limit may be small. We increase it below via `config`.
// - This endpoint returns detailed debug info on failure to help you troubleshoot.

export const config = {
  api: {
    bodyParser: {
      // Increase limit to allow base64 images up to ~8MB
      sizeLimit: "8mb",
    },
  },
};

function stripDataUrl(dataUrl) {
  // dataUrl = "data:image/png;base64,AAAA..." or raw base64
  if (typeof dataUrl !== "string") return null;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx >= 0 && dataUrl.slice(0, commaIdx).includes("base64")) {
    return dataUrl.slice(commaIdx + 1);
  }
  // maybe already raw base64
  return dataUrl;
}

function approxBytesFromBase64(b64) {
  // approximate bytes of base64 string
  if (!b64) return 0;
  return Math.ceil((b64.length * 3) / 4);
}

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = req.body || {};
    const raw = body.image || body.imageBase64 || null;
    const filename = body.filename || "uploaded-image";

    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ error: "image or imageBase64 required in JSON body" });
    }

    const b64 = stripDataUrl(raw);
    if (!b64) return res.status(400).json({ error: "Failed to parse base64 image data" });

    const approxBytes = approxBytesFromBase64(b64);
    const MAX_BYTES = 6 * 1024 * 1024; // 6 MB limit (server + Gemini recommended safety)
    if (approxBytes > MAX_BYTES) {
      return res.status(413).json({
        error: "Image too large",
        approxBytes,
        note: `Max allowed ${MAX_BYTES} bytes. Consider resizing/compressing image on client before upload.`,
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL =
      process.env.GEMINI_API_URL ||
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY missing in environment" });
    }

    const mimeType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    // Build request body as per Google Generative Language multimodal inlineData format.
    // Keep the textual instruction short and explicit not to hallucinate identities.
    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: b64,
              },
            },
            {
              text:
                "You are CollegeGPT for HSIT. Describe the image in 2-3 short sentences. " +
                "List main visible objects and any readable text. Do NOT guess identities, names, or personal info. " +
                "If the image is unreadable or no text is present, say so.",
            },
          ],
        },
      ],
    };

    const endpoint = `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const rawText = await r.text();
    // If non-OK, return Gemini raw response for debugging
    if (!r.ok) {
      let parsed = safeParseJSON(rawText);
      return res.status(r.status).json({
        error: `Gemini returned ${r.status}`,
        details: parsed || rawText.slice(0, 8000),
        debug: {
          endpoint,
          approxBytes,
          mimeType,
          bodyPreview: {
            contents0_parts0_inlineData_len: requestBody.contents?.[0]?.parts?.[0]?.inlineData?.data?.length || 0,
            textInstruction: requestBody.contents?.[0]?.parts?.[1]?.text?.slice?.(0, 200),
          },
        },
      });
    }

    // Parse JSON safely
    const json = safeParseJSON(rawText);
    if (!json) {
      return res.status(500).json({
        error: "Failed to parse Gemini JSON",
        raw: rawText.slice(0, 8000),
      });
    }

    // Try several possible response paths (different versions can differ)
    const ansCandidates = [
      json?.candidates?.[0]?.content?.[0]?.text,
      // older/newer shape
      (json?.candidates?.[0]?.content?.parts || []).find((p) => p.text)?.text,
      json?.output?.[0]?.content?.[0]?.text,
      json?.output?.[0]?.content?.[0]?.parts?.find((p) => p.text)?.text,
      json?.candidates?.[0]?.content?.[0]?.imageText, // hypothetical
    ];

    const ans = ansCandidates.find((x) => typeof x === "string" && x.trim().length > 0) || null;

    if (!ans) {
      // no text answer found — return raw structure for debugging (trimmed)
      return res.status(200).json({
        ok: true,
        answer: null,
        note: "No text answer found in Gemini response",
        gemini: {
          keys: Object.keys(json).slice(0, 20),
          snippet: JSON.stringify(json).slice(0, 8000),
        },
        debug: { approxBytes, mimeType },
      });
    }

    // success
    return res.json({ ok: true, answer: ans, debug: { approxBytes, mimeType } });
  } catch (err) {
    console.error("describeImage error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
