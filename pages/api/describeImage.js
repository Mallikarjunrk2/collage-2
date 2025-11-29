// pages/api/describeImage.js
// Accepts multipart/form-data with a "file" field.
// Example client: `formData.append('file', fileFromInput)`
// Requires env: GEMINI_API_KEY (or set GEMINI_API_URL if custom)
//
// Install dependency: formidable (add to package.json dependencies)

import fs from "fs";
import { promisify } from "util";
import formidable from "formidable";

const readFile = promisify(fs.readFile);

export const config = {
  api: {
    bodyParser: false, // we use formidable to parse multipart
  },
};

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function mimeFromFilename(filename = "") {
  filename = filename.toLowerCase();
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function callGeminiWithInlineImage({ b64data, mimeType, filename, geminiUrl, geminiKey }) {
  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: b64data,
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

  const endpoint = `${geminiUrl}?key=${encodeURIComponent(geminiKey)}`;
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const rawText = await r.text();
  if (!r.ok) {
    let parsed = safeParseJSON(rawText);
    return { ok: false, status: r.status, details: parsed || rawText.slice(0, 8000), endpoint };
  }

  const json = safeParseJSON(rawText);
  if (!json) {
    return { ok: false, status: 200, error: "Failed to parse Gemini JSON", raw: rawText.slice(0, 8000) };
  }

  const ansCandidates = [
    json?.candidates?.[0]?.content?.[0]?.text,
    (json?.candidates?.[0]?.content?.parts || []).find((p) => p.text)?.text,
    json?.output?.[0]?.content?.[0]?.text,
    json?.output?.[0]?.content?.[0]?.parts?.find((p) => p.text)?.text,
  ];

  const answer = ansCandidates.find((x) => typeof x === "string" && x.trim().length > 0) || null;
  return { ok: true, answer, rawJson: json };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_API_URL =
    process.env.GEMINI_API_URL ||
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY missing in environment" });
  }

  try {
    // parse multipart form
    const form = new formidable.IncomingForm({ maxFileSize: 8 * 1024 * 1024 }); // 8MB per-file cap
    const parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const files = parsed.files || {};
    const fileKey = files.file ? "file" : Object.keys(files)[0];
    if (!fileKey) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "file" in form-data.' });
    }

    const file = files[fileKey];
    const filepath = file.filepath || file.path || file.file;
    if (!filepath) {
      return res.status(400).json({ error: "Uploaded file path not found" });
    }

    const buf = await readFile(filepath);
    const approxBytes = buf.length;
    const MAX_BYTES = 6 * 1024 * 1024; // 6MB recommended
    if (approxBytes > MAX_BYTES) {
      return res.status(413).json({
        error: "Image too large",
        approxBytes,
        note: `Max allowed ${MAX_BYTES} bytes. Please resize/compress image on client.`,
      });
    }

    const filename = file.originalFilename || file.name || "upload.jpg";
    const mimeType = file.mimetype || mimeFromFilename(filename) || "image/jpeg";
    const b64data = buf.toString("base64");

    const geminiResp = await callGeminiWithInlineImage({
      b64data,
      mimeType,
      filename,
      geminiUrl: GEMINI_API_URL,
      geminiKey: GEMINI_API_KEY,
    });

    if (!geminiResp.ok) {
      return res.status(500).json({
        error: "Gemini error",
        details: geminiResp.details || geminiResp,
        endpoint: geminiResp.endpoint,
        debug: { mimeType, filename, approxBytes },
      });
    }

    if (!geminiResp.answer) {
      return res.status(200).json({
        ok: true,
        answer: null,
        note: "No text answer found in Gemini response",
        geminiRawKeys: Object.keys(geminiResp.rawJson).slice(0, 20),
        geminiSnippet: JSON.stringify(geminiResp.rawJson).slice(0, 8000),
        debug: { mimeType, filename, approxBytes },
      });
    }

    return res.status(200).json({ ok: true, answer: geminiResp.answer, debug: { mimeType, filename, approxBytes } });
  } catch (err) {
    console.error("describeImage multipart error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
