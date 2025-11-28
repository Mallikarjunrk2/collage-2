// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

/* ---------------------------------------
   🔥 ALIAS + SYNONYM + COURSE EXPANSION
---------------------------------------- */
const aliasMap = {
  // Branches
  cse: "computer science and engineering",
  "computer science": "computer science and engineering",
  ece: "electronics and communication engineering",
  ce: "civil engineering",
  me: "mechanical engineering",
  eee: "electrical and electronics engineering",

  // College names
  hsit: "hirasugar institute of technology",
  "hsit nidasoshi": "hirasugar institute of technology nidasoshi",
  "hirasugar institute of technology": "hirasugar institute of technology",
  "hit nidasoshi": "hirasugar institute of technology nidasoshi",
  nidasoshi: "hirasugar institute of technology nidasoshi",
  "nidasoshi engineering college": "hirasugar institute of technology",
  "hit faculty list": "hirasugar institute of technology faculty list",

  // Roles
  hod: "head of department",
  "cse hod": "head of department computer science",
  principal: "principal",
  dean: "dean",

  // Faculty name short forms
  mallikarjun: "prof. mallikarjun g ganachari",
  manjaragi: "dr. s. v. manjaragi",
  manwade: "dr. k. b. manwade",
  sapna: "prof. sapna b patil",
  aruna: "mrs. aruna anil daptardar",

  // Subjects
  os: "operating systems",
  dbms: "database management systems",
  "data structures": "data structures and applications",
  java: "java programming",
  ml: "machine learning",
  cloud: "cloud computing",
  "digital electronics": "digital electronics",
};

/* Course codes */
const courseCodeMap = {
  "22ESC145": "introduction to c programming",
  "22ESC245": "introduction to data structures",
  BCS303: "operating systems",
  BCS403: "database management systems",
};

/* ---------------------------------------
   Normalize & Tokenization
---------------------------------------- */
const normalize = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (s = "") => normalize(s).split(" ").filter(Boolean);

/* ---------------------------------------
   Expand Query using alias & course codes
---------------------------------------- */
function expandQuery(q) {
  let updated = q;
  const norm = normalize(q);
  let matched_alias = null;

  // Course codes
  Object.keys(courseCodeMap).forEach((code) => {
    const codeNorm = normalize(code);
    if (norm.includes(codeNorm)) {
      updated += " " + courseCodeMap[code];
      matched_alias = matched_alias || codeNorm;
    }
  });

  // Aliases
  Object.keys(aliasMap).forEach((a) => {
    const aNorm = normalize(a);
    if (norm.includes(aNorm)) {
      updated += " " + aliasMap[a];
      matched_alias = matched_alias || aNorm;
    }
  });

  return { expanded: updated, matched_alias };
}

/* ---------------------------------------
   ⭐ Gemini API (with HSIT context)
---------------------------------------- */
async function callGemini(question) {
  if (!GEMINI_API_KEY) {
    return {
      answer: "LLM not configured.",
      source: "llm",
    };
  }

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are CollegeGPT for HSIT Nidasoshi (Hirasugar Institute of Technology). Answer ONLY about this college unless user clearly asks general question.\n\nQuestion: ${question}`,
          },
        ],
      },
    ],
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await response.json();

  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ||
    json?.output?.[0]?.content?.[0]?.text ||
    "";

  return { answer: text, source: "llm" };
}

/* ---------------------------------------
   ⭐ Scoring (Improved)
---------------------------------------- */
function scoreRow(row, tokens, deptBoost) {
  let score = 0;

  const fields = {
    name: normalize(row.name || ""),
    dept: normalize(row.department || ""),
    spec: normalize(row.specialization || ""),
    desig: normalize(row.designation || ""),
    notes: normalize(row.notes || ""),
    email: normalize(row.email_official || row.email || ""),
    mobile: normalize(row.mobile || ""),
  };

  let courses = "";
  try {
    courses = Array.isArray(row.courses_taught)
      ? row.courses_taught.map(normalize).join(" ")
      : normalize(row.courses_taught || "");
  } catch {
    courses = normalize(row.courses_taught || "");
  }

  for (const t of tokens) {
    if (fields.name.includes(t)) score += 6;
    if (fields.desig.includes(t)) score += 8; // hod, professor, etc.
    if (fields.dept.includes(t)) score += 3;
    if (fields.spec.includes(t)) score += 3;
    if (courses.includes(t)) score += 5;
    if (fields.email.includes(t)) score += 2;
    if (fields.mobile.includes(t)) score += 2;
  }

  // BOOST department relevance (Soft Filtering)
  if (deptBoost && fields.dept.includes(deptBoost)) {
    score += 8; // BIG but not strict
  }

  return score;
}

/* ---------------------------------------
   ⭐ Main Handler
---------------------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  const question = req.body?.question?.trim();
  if (!question) return res.json({ answer: "Please ask something." });

  const qNorm = normalize(question);

  /* ---------------------------
     Short-messages guard
  ---------------------------- */
  if (qNorm.length <= 2 || ["hi", "ok", "yo", "hey"].includes(qNorm)) {
    return res.json({
      answer: "Hi 👋 How can I help you?",
      source: "generic",
    });
  }

  /* ---------------------------
     Expand aliases
  ---------------------------- */
  const { expanded, matched_alias } = expandQuery(question);
  const tokens = tokenize(expanded);

  /* ---------------------------
     Soft Department Detection
  ---------------------------- */
  const deptMap = {
    cse: "computer science and engineering",
    ece: "electronics and communication engineering",
    ce: "civil engineering",
    me: "mechanical engineering",
    eee: "electrical and electronics engineering",
  };

  let deptBoost = null;
  for (const d of Object.keys(deptMap)) {
    if (tokens.includes(d)) deptBoost = deptMap[d];
  }

  /* ---------------------------
     Supabase fetch
  ---------------------------- */
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: rows, error } = await supabase
    .from("faculty_list")
    .select("*")
    .limit(500);

  if (error || !rows) {
    const llm = await callGemini(expanded);
    return res.json(llm);
  }

  /* ---------------------------
     Apply Fuzzy Scoring
  ---------------------------- */
  const scored = rows.map((r) => ({
    row: r,
    score: scoreRow(r, tokens, deptBoost),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score >= 4) {
    const r = best.row;

    const answer = [
      `${r.name} — ${r.designation}`,
      `Department: ${r.department}`,
      `Specialization: ${r.specialization}`,
      `Courses: ${
        Array.isArray(r.courses_taught)
          ? r.courses_taught.join(", ")
          : r.courses_taught
      }`,
      `Email: ${r.email_official}`,
      `Phone: ${r.mobile}`,
      `Notes: ${r.notes}`,
    ]
      .filter(Boolean)
      .join("\n");

    return res.json({
      answer,
      source: "supabase",
      alias: matched_alias,
      score: best.score,
    });
  }

  /* ---------------------------
     Fallback: Gemini LLM
  ---------------------------- */
  const llm = await callGemini(expanded);
  return res.json(llm);
}
