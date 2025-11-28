// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * CollegeGPT API
 * 1. Search Supabase faculty_list using ilike partial match
 * 2. If no match → call Gemini using API key (query param)
 *
 * REQUIRED ENV VARS (in Vercel):
 * NEXT_PUBLIC_SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * GEMINI_API_URL
 * GEMINI_API_KEY
 */

// ------------------------------
// Fallback LLM: Gemini
// ------------------------------
async function callGemini(question) {
  const url = process.env.GEMINI_API_URL;
  const key = process.env.GEMINI_API_KEY;

  if (!url || !key) {
    return "LLM not configured: set GEMINI_API_URL and GEMINI_API_KEY in Vercel.";
  }

  try {
    // KEY MUST BE IN URL (not header)
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: question }]
          }
        ]
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return `Gemini error ${resp.status}: ${txt}`;
    }

    const json = await resp.json();

    // Gemini response structure:
    // candidates[0].content.parts[0].text
    return (
      json?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from Gemini."
    );

  } catch (err) {
    return `Gemini exception: ${String(err)}`;
  }
}

// ------------------------------
// API Handler
// ------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  // Validate Supabase envs
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: "Missing Supabase env variables",
      hint: "Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."
    });
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "question required in body" });
    }

    const q = question.trim();
    const filter = `%${q}%`;

    // ------------------------------
    // 1) DB search (PARTIAL MATCH)
    // ------------------------------
    const { data: rows, error } = await supabase
      .from("faculty_list")
      .select("*")
      .or(
        `name.ilike.${filter},department.ilike.${filter},courses_taught.ilike.${filter},notes.ilike.${filter},email_official.ilike.${filter}`
      )
      .limit(5);

    if (error) {
      return res.status(500).json({
        error: "Supabase query error",
        details: error
      });
    }

    if (rows && rows.length > 0) {
      const r = rows[0];
      const answer = [
        `${r.name}${r.designation ? " — " + r.designation : ""}`,
        r.department ? `Department: ${r.department}` : null,
        r.courses_taught ? `Courses: ${r.courses_taught}` : null,
        r.email_official ? `Email: ${r.email_official}` : null
      ]
        .filter(Boolean)
        .join("\n");

      return res.json({ source: "supabase", answer });
    }

    // ------------------------------
    // 2) No DB match → Gemini fallback
    // ------------------------------
    const llmAnswer = await callGemini(q);
    return res.json({ source: "gemini", answer: llmAnswer });

  } catch (err) {
    return res.status(500).json({
      error: "Unhandled exception in ask.js",
      details: String(err)
    });
  }
}
