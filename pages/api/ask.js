// pages/api/ask.js (debug-friendly)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  // we purposely export a handler that will return an immediate error if envs missing
  export default function handler(req, res) {
    return res.status(500).json({ error: "Missing SUPABASE env variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel." });
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callGemini(question) {
  const url = process.env.GEMINI_API_URL;
  const key = process.env.GEMINI_API_KEY;
  if (!url || !key) return `LLM not configured: set GEMINI_API_URL and GEMINI_API_KEY in Vercel.`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ prompt: `Answer concisely: ${question}`, max_tokens: 300 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return `LLM error ${res.status}: ${txt}`;
    }
    const j = await res.json();
    // try common shapes
    if (j.answer) return j.answer;
    if (j.choices?.[0]?.text) return j.choices[0].text;
    if (j.choices?.[0]?.message?.content) return j.choices[0].message.content;
    return JSON.stringify(j);
  } catch (err) {
    return `LLM call exception: ${String(err)}`;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: "question required in body" });

    const q = question.trim();
    const filter = `%${q}%`;

    // 1) DB search (partial, case-insensitive)
    const { data: rows, error } = await supabase
      .from("faculty_list")
      .select("*")
      .or(
        `name.ilike.${filter},department.ilike.${filter},courses_taught.ilike.${filter},notes.ilike.${filter},email_official.ilike.${filter}`
      )
      .limit(5);

    if (error) {
      // return DB error details for debugging
      return res.status(500).json({ error: "Supabase query error", details: error });
    }

    if (rows && rows.length > 0) {
      const r = rows[0];
      const ans = [
        `${r.name}${r.designation ? " — " + r.designation : ""}`,
        r.department && `Department: ${r.department}`,
        r.courses_taught && `Courses: ${r.courses_taught}`,
        r.email_official && `Email: ${r.email_official}`,
      ].filter(Boolean).join("\n");
      return res.json({ source: "supabase", answer: ans });
    }

    // 2) fallback LLM
    const llm = await callGemini(q);
    return res.json({ source: "llm", answer: llm });
  } catch (err) {
    return res.status(500).json({ error: "Unhandled exception in ask.js", details: String(err) });
  }
}
