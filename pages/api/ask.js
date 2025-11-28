// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * DB-first API: search Supabase faculty_list via ilike partial match.
 * If no DB match, fallback to Gemini (GEMINI_API_URL + GEMINI_API_KEY).
 *
 * IMPORTANT: set these env vars in Vercel:
 * NEXT_PUBLIC_SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * GEMINI_API_URL
 * GEMINI_API_KEY
 */

async function callGemini(question) {
  const url = process.env.GEMINI_API_URL;
  const key = process.env.GEMINI_API_KEY;
  if (!url || !key) return `LLM not configured: set GEMINI_API_URL and GEMINI_API_KEY in Vercel.`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ prompt: `Answer concisely: ${question}`, max_tokens: 300 }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return `LLM error ${resp.status}: ${txt}`;
    }
    const j = await resp.json();
    if (j.answer) return j.answer;
    if (j.choices?.[0]?.text) return j.choices[0].text;
    if (j.choices?.[0]?.message?.content) return j.choices[0].message.content;
    return JSON.stringify(j);
  } catch (err) {
    return `LLM exception: ${String(err)}`;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  // Validate required envs
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: "Missing SUPABASE env variables",
      hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel (Project → Settings → Environment Variables).",
    });
  }

  // Create supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) return res.status(400).json({ error: "question required in body" });

    const q = question.trim();
    const filter = `%${q}%`;

    // 1) DB partial search
    const { data: rows, error } = await supabase
      .from("faculty_list")
      .select("*")
      .or(
        `name.ilike.${filter},department.ilike.${filter},courses_taught.ilike.${filter},notes.ilike.${filter},email_official.ilike.${filter}`
      )
      .limit(5);

    if (error) {
      // Return DB error detail for debugging
      return res.status(500).json({ error: "Supabase query error", details: error });
    }

    if (rows && rows.length > 0) {
      const r = rows[0];
      const answer = [
        `${r.name}${r.designation ? " — " + r.designation : ""}`,
        r.department && `Department: ${r.department}`,
        r.courses_taugh_
