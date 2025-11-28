// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * pages/api/ask.js
 *
 * Robust ask endpoint with:
 *  - short-query guard (ignore 1-2 char queries and return greeting)
 *  - college-context injection for Gemini calls
 *  - alias map, course code handling, fuzzy DB scoring + LLM fallback
 *
 * Required envs:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY (recommended)
 * Optional:
 *  - GEMINI_API_KEY
 *  - GEMINI_API_URL
 *
 * NOTE: This file uses the Gemini endpoint with the API key in the URL (as many generativelanguage endpoints expect).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

/* -------------------------
   Alias / course maps
   ------------------------- */
const aliasMap = {
  // branches & short codes
  "cse": "computer science and engineering",
  "computer science": "computer science and engineering",
  "ece": "electronics and communication engineering",
  "me": "mechanical engineering",
  "ce": "civil engineering",
  "eee": "electrical and electronics engineering",

  // college canonical names + variants
  "hsit": "hirasugar institute of technology",
  "hsit nidasoshi": "hirasugar institute of technology nidasoshi",
  "hirasugar institute of technology": "hirasugar institute of technology",
  "hirasugar institute of technology nidasoshi": "hirasugar institute of technology nidasoshi",
  "hirasugar": "hirasugar institute of technology",
  "hirasugar hit": "hirasugar institute of technology",
  "hit nidasoshi": "hirasugar institute of technology nidasoshi",
  "hit nidaoshi": "hirasugar institute of technology nidasoshi",
  "hit nidaoshi college": "hirasugar institute of technology nidasoshi",
  "hit nidasoshi engineering": "hirasugar institute of technology nidasoshi",
  "nidasoshi": "hirasugar institute of technology nidasoshi",
  "nidasoshi engineering college": "hirasugar institute of technology nidasoshi",
  "nidasoshi engineering collage": "hirasugar institute of technology nidasoshi",
  "nidasshi": "hirasugar institute of technology nidasoshi", // misspelling
  "nidasshi hit": "hirasugar institute of technology nidasoshi",
  "nidasshi hsit": "hirasugar institute of technology nidasoshi",
  "hsit faculty list": "hirasugar institute of technology faculty list",
  "hit faculty list": "hirasugar institute of technology faculty list",
  "hit facukty list": "hirasugar institute of technology faculty list", // misspelling
  "hsit facylty list": "hirasugar institute of technology faculty list", // misspelling
  "hsit faculty": "hirasugar institute of technology faculty list",
  "hit faculty": "hirasugar institute of technology faculty list",
  "nidasoshi hit collage": "hirasugar institute of technology nidasoshi",

  // roles
  "hod": "head of department",
  "head": "head of department",
  "head of department": "head of department",
  "cse hod": "head of department, computer science and engineering",
  "principal": "principal",
  "dean": "dean",

  // cricket example
  "rcb": "royal challengers bengaluru",
  "royal challengers bengaluru": "royal challengers bengaluru",
  "rcb owner": "royal challengers bengaluru owner",
  "royal challengers bangalore": "royal challengers bengaluru",

  // faculty name variants
  "mallikarjun": "prof. mallikarjun g. ganachari",
  "mallikarjun ganachari": "prof. mallikarjun g. ganachari",
  "mgganachari": "prof. mallikarjun g. ganachari",
  "sapna": "prof. sapna b patil",
  "sapna patil": "prof. sapna b patil",
  "kb manwade": "dr. k. b. manwade",
  "manwade": "dr. k. b. manwade",
  "manjaragi": "dr. s. v. manjaragi",
  "s v manjaragi": "dr. s. v. manjaragi",
  "aruna daptardar": "mrs. aruna anil daptardar",
  "aruna": "mrs. aruna anil daptardar",
  "manoj chitale": "manojkumar a chitale",
  "shruti kumbar": "prof. shruti kumbar",
  "sujata mane": "ms. sujata ishwar mane",

  // course shortcuts
  "os": "operating systems",
  "operating system": "operating systems",
  "operating systems": "operating systems",
  "data structures": "data structures and applications",
  "ds": "data structures and applications",
  "dbms": "database management systems",
  "dbms course": "database management systems",
  "ml": "machine learning",
  "machine learning": "machine learning",
  "cloud": "cloud computing",
  "java": "java",
  "digital electronics": "digital electronics",
  "vlsi": "vlsi design",
  "embedded": "embedded systems",
  "embedded systems": "embedded systems",

  // small miscellaneous aliases
  "operating systems teacher": "operating systems",
  "java teacher": "java",
  "ml teacher": "machine learning",
  "cloud teacher": "cloud computing"
};

/* small course code map (extend as you add more) */
const courseCodeMap = {
  "22BMATS101": "mathematics for cse stream-i",
  "22ESC145": "introduction to c programming",
  "22ESC245": "introduction to data structures",
  "BCS303": "operating systems",
  "BCS403": "database management systems",
};

/* -------------------------
   Helpers
   ------------------------- */
function normalizeText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(s = "") {
  return normalizeText(s).split(" ").filter(Boolean);
}

// expand query using alias/course maps
function expandQuery(original) {
  let q = String(original || "");
  const normalized = normalizeText(q);
  let matched_alias = null;

  // course code expansion
  Object.keys(courseCodeMap).forEach((code) => {
    const codeNorm = normalizeText(code);
    const re = new RegExp(`\\b${codeNorm}\\b`, "i");
    if (re.test(normalized) && !new RegExp(normalizeText(courseCodeMap[code]), "i").test(normalizeText(q))) {
      q += " " + courseCodeMap[code];
      if (!matched_alias) matched_alias = codeNorm;
    }
  });

  // alias expansion
  Object.keys(aliasMap).forEach((a) => {
    const aNorm = normalizeText(a);
    const re = new RegExp(`\\b${aNorm.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(q)) {
      const canonical = aliasMap[a];
      if (!new RegExp(normalizeText(canonical), "i").test(normalizeText(q))) {
        q += " " + canonical;
      }
      if (!matched_alias) matched_alias = aNorm;
    }
  });

  return { expanded: q, matched_alias };
}

/* -------------------------
   Gemini call (with college context injection)
   ------------------------- */
async function callGemini(question) {
  if (!GEMINI_API_KEY || !GEMINI_API_URL) {
    return { answer: "LLM not configured (GEMINI_API_KEY/GEMINI_API_URL missing).", source: "llm" };
  }

  // inject short system context so Gemini knows to behave like CollegeGPT for HSIT Nidasoshi
  const prompt = `You are CollegeGPT for HSIT Nidasoshi (Hirasugar Institute of Technology). Answer concisely and only about the college when possible. If the question is unrelated to HSIT, say you don't know or answer briefly. Question: ${question}`;

  try {
    const body = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    // many Google generativelanguage endpoints require the key in the URL
    const url = `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { answer: `LLM error ${resp.status}: ${txt}`, source: "llm" };
    }

    const json = await resp.json();
    // try multiple shapes
    const text =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ||
      json?.output?.[0]?.content?.[0]?.text ||
      json?.candidates?.[0]?.content?.[0]?.text ||
      null;

    return { answer: text || "No answer from LLM.", source: "llm", raw: json };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

/* -------------------------
   Scoring function
   ------------------------- */
function scoreRow(row, tokens) {
  let score = 0;
  const name = normalizeText(row.name || "");
  const dept = normalizeText(row.department || "");
  const spec = normalizeText(row.specialization || "");
  const notes = normalizeText(row.notes || "");
  const email = normalizeText(row.email_official || row.email || "");
  const mobile = normalizeText(row.mobile || "");
  const designation = normalizeText(row.designation || "");

  // courses normalization
  let coursesArr = [];
  if (Array.isArray(row.courses_taught)) {
    coursesArr = row.courses_taught.map((c) => normalizeText(String(c)));
  } else if (row.courses_taught) {
    try {
      const parsed = typeof row.courses_taught === "string" ? JSON.parse(row.courses_taught) : row.courses_taught;
      if (Array.isArray(parsed)) coursesArr = parsed.map((c) => normalizeText(String(c)));
      else coursesArr = [normalizeText(String(row.courses_taught))];
    } catch {
      coursesArr = String(row.courses_taught || "").split(/,|;|\|/).map((c) => normalizeText(c));
    }
  }

  for (const t of tokens) {
    if (!t) continue;
    if (name.includes(t)) score += 6;
    if (dept.includes(t)) score += 3;
    if (spec.includes(t)) score += 3;
    for (const c of coursesArr) {
      if (c.includes(t)) score += 5;
    }
    if (notes.includes(t)) score += 1;
    if (email.includes(t)) score += 2;
    if (mobile.includes(t)) score += 2;
    if (designation.includes(t)) score += 8; // large boost for designation tokens such as "hod"
  }

  const matchedTokens = tokens.filter((t) => {
    return (
      name.includes(t) ||
      dept.includes(t) ||
      spec.includes(t) ||
      notes.includes(t) ||
      email.includes(t) ||
      mobile.includes(t) ||
      coursesArr.some((c) => c.includes(t)) ||
      designation.includes(t)
    );
  }).length;

  if (matchedTokens >= Math.max(1, Math.floor(tokens.length / 2))) {
    score += 1;
  }

  return score;
}

/* -------------------------
   Main handler
   ------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST supported" });
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question required" });

  const qRaw = question.trim();
  const qNorm = normalizeText(qRaw);

  // expand query (alias & course code expansion)
  const { expanded, matched_alias: expandAlias } = expandQuery(qRaw);
  let matched_alias = expandAlias || null;

  // tokens on expanded query
  const tokens = tokenize(expanded).filter(Boolean);

  // SHORT-QUERY GUARD (Option A) — ignore tiny messages like "hi", "ok", "yo", "hm"
  if (tokens.length === 1 && tokens[0].length <= 2) {
    return res.json({ answer: "Hi 👋 How can I help you? Ask about faculty, placements, courses, or upload an image.", source: "generic" });
  }

  // role detection
  const roleTokens = ["hod", "head", "headofdepartment", "principal", "dean"];
  const askedRole = tokens.some((t) => roleTokens.includes(t) || t.includes("hod") || t.includes("head") || t.includes("principal") || t.includes("dean"));

  // if no supabase envs, fallback to LLM
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const llm = await callGemini(expanded);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json(llm);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const LIMIT = 800;
    const { data: rows, error } = await supabase.from("faculty_list").select("*").limit(LIMIT);

    if (error) {
      const llm = await callGemini(expanded);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    if (!rows || rows.length === 0) {
      const llm = await callGemini(expanded);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    // role-first behavior: if asked about HOD/principal, prefer designation matches
    if (askedRole) {
      const roleMatches = rows.filter((r) => {
        const des = normalizeText(r.designation || "");
        return /hod|head of department|head|principal|dean/.test(des);
      });
      if (roleMatches.length > 0) {
        const scoredRole = roleMatches.map((r) => ({ row: r, score: scoreRow(r, tokens) }));
        scoredRole.sort((a, b) => b.score - a.score);
        const bestRole = scoredRole[0];
        if (bestRole && bestRole.score >= 2) {
          const r = bestRole.row;
          const answerParts = [];
          answerParts.push(`${r.name}${r.designation ? " — " + r.designation : ""}`);
          if (r.department) answerParts.push(`Department: ${r.department}`);
          if (r.specialization) answerParts.push(`Specialization: ${r.specialization}`);
          if (r.courses_taught) {
            const courses = Array.isArray(r.courses_taught) ? r.courses_taught.join(", ") : r.courses_taught;
            answerParts.push(`Courses: ${courses}`);
          }
          if (r.email_official) answerParts.push(`Email: ${r.email_official}`);
          if (r.mobile) answerParts.push(`Phone: ${r.mobile}`);
          if (r.notes) answerParts.push(`Notes: ${r.notes}`);
          const answer = answerParts.join("\n");
          return res.json({ answer, source: "supabase", matched_alias, debug: { chosen_role_match: true, score: bestRole.score } });
        }
      }
      // else fallthrough to fuzzy scoring
    }

    // fuzzy scoring across all rows
    const scored = rows.map((r) => ({ row: r, score: scoreRow(r, tokens) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const THRESHOLD = 3;

    if (best && best.score >= THRESHOLD) {
      const r = best.row;
      const answerParts = [];
      answerParts.push(`${r.name}${r.designation ? " — " + r.designation : ""}`);
      if (r.department) answerParts.push(`Department: ${r.department}`);
      if (r.specialization) answerParts.push(`Specialization: ${r.specialization}`);
      if (r.courses_taught) {
        const courses = Array.isArray(r.courses_taught) ? r.courses_taught.join(", ") : r.courses_taught;
        answerParts.push(`Courses: ${courses}`);
      }
      if (r.email_official) answerParts.push(`Email: ${r.email_official}`);
      if (r.mobile) answerParts.push(`Phone: ${r.mobile}`);
      if (r.notes) answerParts.push(`Notes: ${r.notes}`);
      const answer = answerParts.join("\n");
      return res.json({ answer, source: "supabase", matched_alias, debug: { top_score: best.score } });
    }

    // fallback to LLM when DB doesn't have a reliable match
    const llm = await callGemini(expanded);
    if (matched_alias) llm.matched_alias = matched_alias;
    const suggestions = scored.slice(0, 4).filter((s) => s.score > 0).map((s) => ({ name: s.row.name, score: s.score }));
    if (suggestions.length) llm.suggestions = suggestions;
    return res.json(llm);
  } catch (err) {
    const llm = await callGemini(expanded);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json({ answer: llm.answer || String(err), source: llm.source || "llm" });
  }
}

