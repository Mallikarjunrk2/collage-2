// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Build concise DB answer
function buildFacultyAnswer(r) {
  const out = [];
  if (r.name) out.push(`${r.name}${r.designation ? " — " + r.designation : ""}`);
  if (r.department) out.push(`Dept: ${r.department}`);
  if (r.courses_taught) out.push(`Courses: ${r.courses_taught}`);
  if (r.email_official) out.push(`Email: ${r.email_official}`);
  if (r.mobile) out.push(`Mobile: ${r.mobile}`);
  if (r.notes) out.push(`Notes: ${r.notes}`);
  return out.join("\n");
}

// Generic LLM fallback using GEMINI_API_URL / GEMINI_API_KEY
async function callGemini(question) {
  const url = process.env.GEMINI_API_URL;
  const key = process.env.GEMINI_API_KEY;
  if (!url || !key) return `LLM not configured.`;

  // Minimal payload — adapt if your Gemini endpoint needs a different shape.
  const payload = { prompt: `You are CollegeGPT. Answer concisely: ${question}`, max_tokens: 400 };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    return `LLM error: ${res.status} ${txt}`;
  }
  const j = await res.json();
  // try common shapes
  if (j.answer) return j.answer;
  if (j.choices?.[0]?.text) return j.choices[0].text;
  if (j.choices?.[0]?.message?.content) return j.choices[0].message.content;
  return JSON.stringify(j);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question required" });
  const q = question.trim();

  const filter = `%${q}%`;
  try {
    const { data: rows, error } = await supabase
      .from("faculty_list")
      .select("*")
      .or(
        `name.ilike.${filter},department.ilike.${filter},courses_taught.ilike.${filter},notes.ilike
