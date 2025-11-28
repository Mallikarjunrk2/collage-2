// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * Robust ask endpoint:
 *  - loads up to N faculty rows from supabase
 *  - does server-side tokenized fuzzy scoring (works with JSONB courses_taught or text)
 *  - returns best DB match if score passes threshold, otherwise falls back to Gemini
 *
 * Required envs:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY   (recommended for server)
 *  - GEMINI_API_URL (optional; defaults to Google generativelanguage endpoint)
 *  - GEMINI_API_KEY (optional; required if you want LLM fallback)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

// small alias map (extendable)
const aliasMap = {
  "rcb": "royal challengers bengaluru",
  "rcb owner": "royal challengers bengaluru",
  "hod cse": "head of department cse",
  "cse hod": "head of department cse",
  "operating systems teacher": "operating systems",
  "java teacher": "java",
  "ml teacher": "machine learning",
  "cloud teacher": "cloud computing"
  // branches & short codes
  "cse": "computer science and engineering",
  "computer science": "computer science and engineering",
  "ece": "electronics and communication engineering",
  "me": "mechanical engineering",
  "ce": "civil engineering",
  "eee": "electrical and electronics engineering",

  // college canonical names + many variants (HSIT / HIT / Hirasugar / Nidasoshi)
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
  "nidasshi": "hirasugar institute of technology nidasoshi",        // common misspelling
  "nidasshi hit": "hirasugar institute of technology nidasoshi",
  "nidasshi hsit": "hirasugar institute of technology nidasoshi",
  "hsit faculty list": "hirasugar institute of technology faculty list",
  "hit faculty list": "hirasugar institute of technology faculty list",
  "hit facukty list": "hirasugar institute of technology faculty list", // misspelling
  "hsit facylty list": "hirasugar institute of technology faculty list", // misspelling
  "hsit faculty": "hirasugar institute of technology faculty list",
  "hsit faculty list": "hirasugar institute of technology faculty list",
  "hit faculty": "hirasugar institute of technology faculty list",
  "nidasoshi hit collage": "hirasugar institute of technology nidasoshi",

  // roles
  "hod": "head of department",
  "head": "head of department",
  "head of department": "head of department",
  "cse hod": "head of department, computer science and engineering",
  "principal": "principal",
  "dean": "dean",

  // cricket example (user asked earlier)
  "rcb": "royal challengers bengaluru",
  "royal challengers bengaluru": "royal challengers bengaluru",
  "rcb owner": "royal challengers bengaluru owner",
  "royal challengers bangalore": "royal challengers bengaluru",

  // faculty name variants (common typing variants) — keep existing ones
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

  // course shortcuts and common course queries
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
  "embedded systems": "embedded systems"

};

function normalizeText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s = "") {
  return normalizeText(s)
    .split(" ")
    .filter(Boolean)
    .map((t) => t.trim());
}

async function callGemini(question) {
  if (!GEMINI_API_KEY || !GEMINI_API_URL) {
    return { answer: "LLM not configured (GEMINI_API_KEY/GEMINI_API_URL missing).", source: "llm" };
  }
  try {
    const body = {
      contents: [
        {
          parts: [
            {
              text: `Answer concisely. Question: ${question}`
            }
          ]
        }
      ]
    };
    const resp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { answer: `LLM error ${resp.status}: ${txt}`, source: "llm" };
    }
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || json?.output?.[0]?.content?.[0]?.text;
    return { answer: text || "No answer from LLM.", source: "llm" };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

/**
 * Score a faculty row against tokens.
 * Fields considered: name, department, specialization, courses_taught (array or string), notes, email_official
 * Simple weighting:
 *  - name match: 4
 *  - course match: 3
 *  - specialization match: 2
 *  - department match: 2
 *  - email/mobile exact token: +2
 *  - notes: 1
 */
function scoreRow(row, tokens) {
  let score = 0;
  const name = normalizeText(row.name || "");
  const dept = normalizeText(row.department || "");
  const spec = normalizeText(row.specialization || "");
  const notes = normalizeText(row.notes || "");
  const email = normalizeText(row.email_official || row.email || "");
  const mobile = normalizeText(row.mobile || "");
  // courses can be JSON array or string
  let coursesArr = [];
  if (Array.isArray(row.courses_taught)) {
    coursesArr = row.courses_taught.map((c) => normalizeText(String(c)));
  } else if (row.courses_taught) {
    // try parse JSON, else treat as comma-separated
    try {
      const parsed = typeof row.courses_taught === "string" ? JSON.parse(row.courses_taught) : row.courses_taught;
      if (Array.isArray(parsed)) coursesArr = parsed.map((c) => normalizeText(String(c)));
      else coursesArr = [normalizeText(String(row.courses_taught))];
    } catch {
      coursesArr = String(row.courses_taught).split(/,|;|\|/).map((c) => normalizeText(c));
    }
  }

  for (const t of tokens) {
    if (!t) continue;
    // name exact / partial
    if (name.includes(t)) score += 4;
    // department
    if (dept.includes(t)) score += 2;
    // specialization
    if (spec.includes(t)) score += 2;
    // courses
    for (const c of coursesArr) {
      if (c.includes(t)) score += 3;
    }
    // notes
    if (notes.includes(t)) score += 1;
    // email/mobile
    if (email.includes(t)) score += 2;
    if (mobile.includes(t)) score += 2;
  }

  // small bonus: if many tokens matched (token coverage)
  const matchedTokens = tokens.filter((t) => {
    return name.includes(t) || dept.includes(t) || spec.includes(t) || notes.includes(t) || email.includes(t) || mobile.includes(t) || coursesArr.some((c) => c.includes(t));
  }).length;
  if (matchedTokens >= Math.max(1, Math.floor(tokens.length / 2))) {
    score += 1;
  }

  return score;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST supported" });
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question required" });

  const qRaw = question.trim();
  const qNorm = normalizeText(qRaw);

  // check aliasMap
  let matched_alias = null;
  if (aliasMap[qNorm]) matched_alias = qNorm;
  else {
    for (const k of Object.keys(aliasMap)) {
      const pat = new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (pat.test(qNorm)) {
        matched_alias = k;
        break;
      }
    }
  }
  const effectiveQuery = matched_alias ? aliasMap[matched_alias] : qRaw;
  const tokens = tokenize(effectiveQuery).filter(Boolean);

  // if no supabase configured -> go straight to LLM
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json(llm);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // load faculty rows (limit safe) - for small college this is fine and reliable
    const LIMIT = 500;
    const { data: rows, error } = await supabase.from("faculty_list").select("*").limit(LIMIT);

    if (error) {
      // if DB error, fallback LLM
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    if (!rows || rows.length === 0) {
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    // score each row
    const scored = rows.map((r) => {
      const s = scoreRow(r, tokens);
      return { row: r, score: s };
    });

    // sort by score desc
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    // determine threshold: at least 3 points for a reasonable match (tweakable)
    const THRESHOLD = 3;

    if (best && best.score >= THRESHOLD) {
      const r = best.row;
      // build readable answer
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

    // No good DB match -> fallback to LLM
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    // Optionally include top suggestions from DB if any low-score rows exist (helpful)
    const suggestions = scored.slice(0, 3).filter((s) => s.score > 0).map((s) => ({ name: s.row.name, score: s.score }));
    if (suggestions.length) llm.suggestions = suggestions;
    return res.json(llm);
  } catch (err) {
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json({ answer: llm.answer || String(err), source: llm.source || "llm" });
  }
}
