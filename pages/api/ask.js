import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Question required" });

  const q = question.trim();
  const filter = `%${q}%`;

  // 1) Supabase match
  const { data } = await supabase
    .from("faculty_list")
    .select("*")
    .or(
      `name.ilike.${filter},department.ilike.${filter},courses_taught.ilike.${filter},notes.ilike.${filter}`
    )
    .limit(3);

  if (data && data.length > 0) {
    const r = data[0];
    const ans = [
      `${r.name} — ${r.designation || ""}`,
      r.department && `Department: ${r.department}`,
      r.courses_taught && `Courses: ${r.courses_taught}`,
      r.email_official && `Email: ${r.email_official}`,
    ]
      .filter(Boolean)
      .join("\n");

    return res.json({ answer: ans });
  }

  // 2) Gemini fallback
  const reply = await fetch(process.env.GEMINI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: `Answer concisely:\n${q}`,
      max_tokens: 200,
    }),
  });

  const out = await reply.json();
  const text =
    out.answer ||
    out.choices?.[0]?.text ||
    out.choices?.[0]?.message?.content ||
    "No answer";

  return res.json({ answer: text });
}
