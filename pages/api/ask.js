// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * Improved ask endpoint:
 * - larger alias map (college + faculty + common misspellings)
 * - ignore 1-2 char queries and simple greetings
 * - department-aware filtering (if user mentions "cse" etc)
 * - stronger scoring with exact-name boost, token coverage, and tie-safety
 *
 * Required envs:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - GEMINI_API_KEY (optional) and GEMINI_API_URL (optional)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

// Full alias map (extend as needed)
const aliasMap = {
  // cricket examples
  "rcb": "royal challengers bengaluru",
  "rcb owner": "royal challengers bengaluru owner",
  "royal challengers bengaluru": "royal challengers bengaluru",
  "royal challengers bangalore": "royal challengers bengaluru",

  // branches + variants
  "cse": "computer science and engineering",
  "computer science": "computer science and engineering",
  "computer science and engineering": "computer science and engineering",
  "ece": "electronics and communication engineering",
  "electronics and communication engineering": "electronics and communication engineering",
  "me": "mechanical engineering",
  "mechanical": "mechanical engineering",
  "ce": "civil engineering",
  "civil": "civil engineering",
  "eee": "electrical and electronics engineering",
  "electrical": "electrical and electronics engineering",

  // college canonical + variants and misspellings
  "hsit": "hirasugar institute of technology",
  "hsit nidasoshi": "hirasugar institute of technology nidasoshi",
  "hirasugar": "hirasugar institute of technology",
  "hirasugar institute of technology": "hirasugar institute of technology",
  "hit nidasoshi": "hirasugar institute of technology nidasoshi",
  "nidasoshi": "hirasugar institute of technology nidasoshi",
  "nidasoshi engineering college": "hirasugar institute of technology nidasoshi",
  "nidasoshi engineering collage": "hirasugar institute of technology nidasoshi", // misspelling
  "nidasshi": "hirasugar institute of technology nidasoshi", // misspelling

  // common queries about faculty list
  "hsit faculty": "hirasugar institute of technology faculty list",
  "hsit faculty list": "hirasugar institute of technology faculty list",
  "hit faculty": "hirasugar institute of technology faculty list",
  "hit faculty list": "hirasugar institute of technology faculty list",
  "hsit facylty list": "hirasugar institute of technology faculty list", // misspelling
  "hit facukty list": "hirasugar institute of technology faculty list", // misspelling

  // roles
  "hod": "head of department",
  "cse hod": "head of department, computer science and engineering",
  "head of department": "head of department",
  "principal": "principal",

  // popular faculty name aliases (normalize to DB full names)
  "mallikarjun": "prof. mallikarjun g. ganachari",
  "mallikarjun ganachari": "prof. mallikarjun g. ganachari",
  "mgganachari": "prof. mallikarjun g. ganachari",
  "prof. mallikarjun g. ganachari": "prof. mallikarjun g. ganachari",
  "sapna": "prof. sapna b patil",
  "sapna patil": "prof. sapna b patil",
  "kb manwade": "dr. k. b. manwade",
  "manwade": "dr. k. b. manwade",
  "manjaragi": "dr. s. v. manjaragi",
  "aruna": "mrs. aruna anil daptardar",
  "manoj chitale": "manojkumar a chitale",
  "shruti kumbar": "prof. shruti kumbar",
  "sujata mane": "ms. sujata ishwar mane",

  // courses / short forms
  "os": "operating systems",
  "operating system": "operating systems",
  "operating systems": "operating systems",
  "ds": "data structures and applications",
  "data structures": "data structures and applications",
  "dbms": "database management systems",
  "ml": "machine learning",
  "machine learning": "machine learning",
  "cloud": "cloud computing",
  "java": "java",
  "digital electronics": "digital electronics",
  "vlsi": "vlsi design",
  "embedded": "embedded systems",
  "embedded systems": "embedded systems"
};

// Small set of greeting/stop tokens we want to ignore for DB lookup
const GREETINGS = new Set(["hi", "hello", "hey", "ok", "yo", "h", "hi!", "hello!"]);

// Department tokens to enforce department filter when present
const DEPT_TOKENS = [
  "computer science and engineering", "computer science", "cse",
  "electronics and communication engineering", "ece",
  "mechanical engineering", "me", "civil engineering", "ce",
  "electrical and electronics engineering", "eee"
];

function normalizeText(s = "") {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s = "") {
  return normalizeText(s)
    .split(" ")
    .filter(Boolean);
}

// Gemini fallback call (same shape, key in URL)
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
              text: `You are CollegeGPT for HSIT Nidasoshi. Answer concisely. Question: ${question}`
            }
          ]
        }
      ]
    };
    const resp = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { answer: `LLM error ${resp.status}: ${txt}`, source: "llm" };
    }
    const json = await resp.json();
    const text =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ||
      json?.output?.[0]?.content?.[0]?.text ||
      null;
    return { answer: text || "No answer from LLM.", source: "llm" };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

/**
 * Score a faculty row against tokens.
 * Weighted rules:
 *  - exact name contains token -> +8 (strong)
 *  - name contains token -> +5
 *  - department match -> +3
 *  - specialization match -> +2
 *  - course match -> +4
 *  - email/mobile exact token -> +3
 *  - notes -> +1
 *
 * Also returns matched token count to compute coverage.
 */
function scoreRow(row, tokens) {
  let score = 0;
  const name = normalizeText(row.name || "");
  const dept = normalizeText(row.department || "");
  const spec = normalizeText(row.specialization || "");
  const notes = normalizeText(row.notes || "");
  const email = normalizeText(row.email_official || row.email || "");
  const mobile = normalizeText(row.mobile || "");
  let coursesArr = [];

  if (Array.isArray(row.courses_taught)) {
    coursesArr = row.courses_taught.map((c) => normalizeText(String(c)));
  } else if (row.courses_taught) {
    try {
      const parsed = typeof row.courses_taught === "string" ? JSON.parse(row.courses_taught) : row.courses_taught;
      if (Array.isArray(parsed)) coursesArr = parsed.map((c) => normalizeText(String(c)));
      else coursesArr = [normalizeText(String(row.courses_taught))];
    } catch {
      coursesArr = String(row.courses_taught).split(/,|;|\|/).map((c) => normalizeText(c));
    }
  }

  let matchedTokens = 0;
  for (const t of tokens) {
    if (!t) continue;
    let matched = false;
    // exact full-name token (if query token equals full normalized name or full alias)
    if (name === t || name.includes(` ${t} `) || name.startsWith(`${t} `) || name.endsWith(` ${t}`)) {
      score += 8;
      matched = true;
    } else if (name.includes(t)) {
      score += 5;
      matched = true;
    }

    if (dept.includes(t)) { score += 3; matched = true; }
    if (spec.includes(t)) { score += 2; matched = true; }

    for (const c of coursesArr) {
      if (c.includes(t)) { score += 4; matched = true; break; }
    }

    if (notes.includes(t)) { score += 1; matched = true; }
    if (email.includes(t)) { score += 3; matched = true; }
    if (mobile.includes(t)) { score += 3; matched = true; }

    if (matched) matchedTokens++;
  }

  // coverage bonus: many tokens matched relative to tokens.length
  const coverage = tokens.length ? matchedTokens / tokens.length : 0;
  if (coverage >= 0.6) score += 2;
  else if (coverage >= 0.4) score += 1;

  return { score, matchedTokens, coverage };
}

// helper: check if any dept token present in normalized query
function detectDepartment(normalized) {
  for (const d of DEPT_TOKENS) {
    if (normalized.includes(d)) return d;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST supported" });
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question required" });

  const qRaw = question.trim();
  const qNorm = normalizeText(qRaw);

  // quick greeting guard
  if (GREETINGS.has(qNorm) || (qNorm.length <= 2 && qNorm.length >= 1)) {
    return res.json({ answer: "Hi 👋 How can I help you?", source: "generic" });
  }

  // find alias (exact or contained)
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

  // if tokens are too short (like only one token of length 1-2) -> generic
  if (tokens.length === 1 && tokens[0].length <= 2) {
    return res.json({ answer: "Hi 👋 How can I help you?", source: "generic" });
  }

  // detect department token for stricter filtering
  const detectedDept = detectDepartment(normalizeText(effectiveQuery));

  // If no Supabase configured -> fallback to LLM
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json(llm);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // load faculty rows
    const LIMIT = 1000;
    const { data: rows, error } = await supabase.from("faculty_list").select("*").limit(LIMIT);

    if (error) {
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    if (!rows || rows.length === 0) {
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    // Optionally pre-filter by department if detected to reduce false positives
    let candidateRows = rows;
    if (detectedDept) {
      const dnorm = normalizeText(detectedDept);
      candidateRows = rows.filter((r) => normalizeText(r.department || "").includes(dnorm) || normalizeText(r.specialization || "").includes(dnorm));
      // if filter produced zero rows, fallback to full list (avoid empty)
      if (candidateRows.length === 0) candidateRows = rows;
    }

    // Score each candidate
    const scored = candidateRows.map((r) => {
      const s = scoreRow(r, tokens);
      return { row: r, score: s.score, matchedTokens: s.matchedTokens, coverage: s.coverage };
    });

    // sort by score desc then coverage
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.coverage - a.coverage;
    });

    const best = scored[0] || null;
    const second = scored[1] || { score: 0 };

    // threshold and tie-safety
    const THRESHOLD = 6; // require at least this many points (tweak if needed)
    const MIN_SCORE_RATIO = 1.15; // best must be 15% better than second to be safe

    if (best && best.score >= THRESHOLD && (second.score === 0 || best.score >= Math.max(THRESHOLD, second.score * MIN_SCORE_RATIO))) {
      const r = best.row;
      const parts = [];
      parts.push(`${r.name}${r.designation ? " — " + r.designation : ""}`);
      if (r.department) parts.push(`Department: ${r.department}`);
      if (r.specialization) parts.push(`Specialization: ${r.specialization}`);
      if (r.courses_taught) {
        const courses = Array.isArray(r.courses_taught) ? r.courses_taught.join(", ") : r.courses_taught;
        parts.push(`Courses: ${courses}`);
      }
      if (r.email_official) parts.push(`Email: ${r.email_official}`);
      if (r.mobile) parts.push(`Phone: ${r.mobile}`);
      if (r.notes) parts.push(`Notes: ${r.notes}`);

      const answer = parts.join("\n");
      return res.json({ answer, source: "supabase", matched_alias, debug: { top_score: best.score, second_score: second.score, detectedDept } });
    }

    // No confident DB match -> fallback to LLM, but include low-confidence suggestions
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    const suggestions = scored.slice(0, 5).filter((s) => s.score > 0).map((s) => ({ name: s.row.name, score: s.score }));
    if (suggestions.length) llm.suggestions = suggestions;
    return res.json(llm);
  } catch (err) {
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json({ answer: llm.answer || String(err), source: llm.source || "llm" });
  }
}