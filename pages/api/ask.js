// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * pages/api/ask.js
 *
 * Behavior:
 * - Normalizes question text
 * - Checks aliasMap for canonical entities (returns matched_alias if used)
 * - Runs a focused DB search (multi-column, multi-token)
 * - If DB returns rows -> returns top match with source: "supabase"
 * - If DB returns nothing -> calls Gemini (LLM) fallback and returns source: "llm"
 *
 * Required env (set in Vercel):
 * NEXT_PUBLIC_SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY   (or NEXT_PUBLIC_SUPABASE_ANON_KEY but service role is recommended)
 * GEMINI_API_URL              (optional; defaults to Google's generativelanguage endpoint)
 * GEMINI_API_KEY              (optional; required for LLM fallback)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const aliasMap = {
  // RCB / Royal Challengers examples
  "rcb": "royal challengers bengaluru",
  "royal challengers bengaluru": "royal challengers bengaluru",
  "royal challengers bangalore": "royal challengers bengaluru",
  "rcb owner": "royal challengers bengaluru",
  "rcb franchise owner": "royal challengers bengaluru",
  "royal challengers bengaluru owner": "royal challengers bengaluru",

  // college-specific role/alias examples (extend as you need)
  "hod cse": "head of department cse",
  "cse hod": "head of department cse",
  "principal": "principal",
  "college principal": "principal",
  "os teacher": "operating systems",
  "operating systems teacher": "operating systems",
  "java teacher": "java",
  "ml teacher": "machine learning",
  "cloud teacher": "cloud computing"
};

// normalize helper
function normalizeText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build supabase .or string (comma-separated) for simple multi-column ilike matching.
// supabase-js .or wants comma-separated conditions like "name.ilike.%foo%,department.ilike.%foo%"
function buildSupabaseOrStringForTokens(tokens) {
  const cols = ["name", "department", "specialization", "notes"];
  // courses_taught is JSONB — we'll search it by casting to text via SQL-side ilike conditions.
  // Supabase client .or doesn't support raw cast easily, so include `courses_taught` as courses_taught::text
  // Build pieces like: "name.ilike.%tok%","department.ilike.%tok%",...
  const pieces = [];
  tokens.forEach((tok) => {
    const pat = `%${tok}%`;
    cols.forEach((c) => {
      pieces.push(`${c}.ilike.${pat}`);
    });
    // also add courses_taught (as textual match) and email_official
    pieces.push(`courses_taught.ilike.${pat}`);
    pieces.push(`email_official.ilike.${pat}`);
    pieces.push(`mobile.ilike.${pat}`);
  });
  // supabase .or string uses commas to separate OR clauses
  return pieces.join(",");
}

// Gemini LLM call (fallback)
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
    // Google-style response shape: candidates[0].content.parts[0].text
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { answer: text || "No answer from LLM.", source: "llm" };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question required" });

  const qRaw = question.trim();
  const qNorm = normalizeText(qRaw);

  // check alias map
  let matched_alias = null;
  if (aliasMap[qNorm]) {
    matched_alias = qNorm;
  } else {
    // also check if any alias key is a substring of the question
    for (const k of Object.keys(aliasMap)) {
      const pat = new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (pat.test(qNorm)) {
        matched_alias = k;
        break;
      }
    }
  }

  // final query text: replace with canonical if alias matched
  const effectiveQuery = matched_alias ? aliasMap[matched_alias] : qRaw;

  // If Supabase not configured -> fallback to LLM
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const llm = await callGemini(effectiveQuery);
    // attach matched_alias if existed
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json(llm);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Tokenize effective query for fuzzy search
    const tokens = normalizeText(effectiveQuery).split(" ").filter(Boolean);
    // If tokens small, also include full phrase as one token
    if (tokens.length === 1 && tokens[0].length > 3) {
      // single token is fine
    }

    // First, try a direct quick search on name/email/mobile (cheap)
    const directQ = effectiveQuery;
    const directSearch = await supabase
      .from("faculty_list")
      .select("*")
      .or(`name.ilike.%${directQ}%,email_official.ilike.%${directQ}%,mobile.ilike.%${directQ}%`)
      .limit(5);

    if (directSearch.error) {
      // proceed to LLM fallback on DB error
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    if (directSearch.data && directSearch.data.length > 0) {
      const r = directSearch.data[0];
      const answer = [
        `${r.name}${r.designation ? " — " + r.designation : ""}`,
        r.department ? `Department: ${r.department}` : null,
        r.courses_taught ? `Courses: ${Array.isArray(r.courses_taught) ? r.courses_taught.join(", ") : r.courses_taught}` : null,
        r.email_official ? `Email: ${r.email_official}` : null,
        r.mobile ? `Phone: ${r.mobile}` : null
      ].filter(Boolean).join("\n");

      return res.json({ answer, source: "supabase", matched_alias });
    }

    // Build OR string for multi-token multi-column search
    // NOTE: supabase-js .or expects comma-separated conditions without explicit OR keywords.
    const orString = buildSupabaseOrStringForTokens(tokens.slice(0, 6)); // limit token count
    // If built filter empty -> fallback to LLM
    if (!orString) {
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    // Run the supabase query using .or
    const dbQuery = await supabase
      .from("faculty_list")
      .select("*")
      .or(orString)
      .limit(10);

    if (dbQuery.error) {
      // fallback to LLM
      const llm = await callGemini(effectiveQuery);
      if (matched_alias) llm.matched_alias = matched_alias;
      return res.json(llm);
    }

    if (dbQuery.data && dbQuery.data.length > 0) {
      // choose best row: prefer exact designation matches (HOD etc) else first result
      let best = dbQuery.data[0];
      for (const r of dbQuery.data) {
        const low = (r.designation || "").toLowerCase();
        if (low.includes("hod") || low.includes("head of department")) {
          best = r;
          break;
        }
      }

      const r = best;
      const answer = [
        `${r.name}${r.designation ? " — " + r.designation : ""}`,
        r.department ? `Department: ${r.department}` : null,
        r.courses_taught ? `Courses: ${Array.isArray(r.courses_taught) ? r.courses_taught.join(", ") : r.courses_taught}` : null,
        r.email_official ? `Email: ${r.email_official}` : null,
        r.mobile ? `Phone: ${r.mobile}` : null,
        r.notes ? `Notes: ${r.notes}` : null
      ].filter(Boolean).join("\n");

      return res.json({ answer, source: "supabase", matched_alias });
    }

    // Nothing in DB -> call LLM fallback
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json(llm);
  } catch (err) {
    const llm = await callGemini(effectiveQuery);
    if (matched_alias) llm.matched_alias = matched_alias;
    return res.json({ answer: llm.answer || String(err), source: llm.source || "llm", matched_alias });
  }
}
