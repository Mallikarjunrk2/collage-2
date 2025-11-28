// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * Returns { answer, source } where source is "supabase" or "llm"
 * Make sure these env vars exist in Vercel:
 * NEXT_PUBLIC_SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * GEMINI_API_URL
 * GEMINI_API_KEY
 */

async function callGemini(question) {
  const url = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const key = process.env.GEMINI_API_KEY;
  if (!url || !key) {
    return { answer: "LLM not configured.", source: "llm" };
  }

  try {
    const resp = await fetch(`${url}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: question }] }] }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { answer: `LLM error ${resp.status}: ${txt}`, source: "llm" };
    }

    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { answer: text || "No response from LLM.", source: "llm" };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question required" });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // fallback to LLM if DB not configured
    const llm = await callGemini(question.trim());
    return res.json(llm);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const q = question.trim();
    const filter = `%${q}%`;

    const { data: rows, error } = await supabase
      .from("faculty_list")
      .select("*")
      .or(
        `name.ilike.${filter},department.ilike.${filter},courses_taught.ilike.${filter},notes.ilike.${filter},email_official.ilike.${filter}`
      )
      .limit(3);

    if (error) {
      // If DB query fails, fallback to LLM
      const llm = await callGemini(q);
      return res.json(llm);
    }

    if (rows && rows.length > 0) {
      const r = rows[0];
      const answer = [
        `${r.name}${r.designation ? " — " + r.designation : ""}`,
        r.department ? `Department: ${r.department}` : null,
        r.courses_taught ? `Courses: ${r.courses_taught}` : null,
        r.email_official ? `Email: ${r.email_official}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      return res.json({ answer, source: "supabase" });
    }

    // no db match -> call LLM
    const llm = await callGemini(q);
    return res.json(llm);
  } catch (err) {
    // fallback to LLM on unexpected error
    const llm = await callGemini(question.trim());
    return res.json(llm);
  }
}
