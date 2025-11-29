// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * ask.js - DB-first + LLM fallback (Gemini or OpenAI)
 *
 * Env vars expected:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY OR NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - GEMINI_API_URL (optional)
 * - GEMINI_API_KEY (optional)
 * - OPENAI_API_KEY (optional; used in preference to Gemini if present)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

/* ----------------- helpers ----------------- */
function normalizeText(s = "") {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(s = "") {
  return normalizeText(s).split(" ").filter(Boolean);
}
function levenshtein(a = "", b = "") {
  a = String(a || "");
  b = String(b || "");
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const v0 = new Array(m + 1).fill(0);
  const v1 = new Array(m + 1).fill(0);
  for (let j = 0; j <= m; j++) v0[j] = j;
  for (let i = 0; i < n; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < m; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= m; j++) v0[j] = v1[j];
  }
  return v1[m];
}

/* ---------------- LLM helpers ----------------- */
async function callGemini(question) {
  if (!GEMINI_API_KEY || !GEMINI_API_URL) return { answer: "LLM not configured.", source: "llm" };
  try {
    const body = { contents: [{ parts: [{ text: `You are CollegeGPT for HSIT. Answer concisely: ${question}` }] }] };
    const resp = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { answer: `LLM error ${resp.status}: ${txt}`, source: "llm" };
    }
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || json?.output?.[0]?.content?.[0]?.text || null;
    return { answer: text || "No answer from LLM.", source: "llm" };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

async function callOpenAI(question) {
  if (!OPENAI_API_KEY) return { answer: "OpenAI not configured.", source: "llm" };
  try {
    const payload = {
      model: "gpt-4o-mini", // change if you have different preferred model
      messages: [
        { role: "system", content: "You are CollegeGPT for HSIT. Answer concisely and clearly." },
        { role: "user", content: question },
      ],
      max_tokens: 512,
      temperature: 0.2,
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { answer: `OpenAI error ${resp.status}: ${txt}`, source: "llm" };
    }
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content || null;
    return { answer: text || "No answer from OpenAI.", source: "llm" };
  } catch (err) {
    return { answer: `OpenAI exception: ${String(err)}`, source: "llm" };
  }
}

async function callAnyLLM(question) {
  // prefer OpenAI if configured, else Gemini
  if (OPENAI_API_KEY) return callOpenAI(question);
  return callGemini(question);
}

/* --------------- alias map (extended) --------------- */
const aliasMap = {
  hsit: "hirasugar institute of technology",
  "hsit nidasoshi": "hirasugar institute of technology nidasoshi",
  hit: "hirasugar institute of technology",
  hirasugar: "hirasugar institute of technology",
  nidasoshi: "hirasugar institute of technology nidasoshi",
  cse: "computer science and engineering",
  "computer science": "computer science and engineering",
  ece: "electronics and communication engineering",
  me: "mechanical engineering",
  ce: "civil engineering",
  eee: "electrical and electronics engineering",
  rcb: "royal challengers bengaluru",
  "rcb owner": "royal challengers bengaluru owner",
  mallikarjun: "prof. mallikarjun g. ganachari",
  "mallikarjun ganachari": "prof. mallikarjun g. ganachari",
  mgganachari: "prof. mallikarjun g. ganachari",
  sapna: "prof. sapna b patil",
  "sapna patil": "prof. sapna b patil",
  "kb manwade": "dr. k. b. manwade",
  "k b manwade": "dr. k. b. manwade",
  "kb manawade": "dr. k. b. manwade",
  "kb manwad": "dr. k. b. manwade",
  manwade: "dr. k. b. manwade",
  manjaragi: "dr. s. v. manjaragi",
  "s v manjaragi": "dr. s. v. manjaragi",
  "aruna daptardar": "mrs. aruna anil daptardar",
  "manoj chitale": "manojkumar a chitale",
  "shruti kumbar": "prof. shruti kumbar",
  "sujata mane": "ms. sujata ishwar mane",
  os: "operating systems",
  "operating system": "operating systems",
  ds: "data structures and applications",
  dbms: "database management systems",
  ml: "machine learning",
  cloud: "cloud computing",
  vlsi: "vlsi design",
  embedded: "embedded systems",
};

/* --------- intent keywords --------- */
const COLLEGE_KEYS = ["college", "hsit", "hit", "hirasugar", "nidasoshi", "campus", "established", "affiliation", "website", "contact", "phone", "email"];
const FACULTY_KEYS = ["who", "teacher", "teaches", "hod", "prof", "professor", "assistant", "associate", "lecturer", "instructor", "faculty", "teach"];
const STAFF_KEYS = ["staff", "peon", "helper", "mechanic", "lab", "lab assistant", "lab instructor", "clerk"];
const PLACEMENTS_KEYS = ["placement", "placements", "company", "salary", "offer", "offers", "recruit"];
const SUBJECT_KEYS = ["subject", "subjects", "syllabus", "curriculum", "semester", "sem"];
const STUDENT_KEYS = ["student", "students", "usn", "roll", "name", "batch"];
const BRANCH_KEYS = ["branch", "branches", "cse", "ece", "me", "ce", "eee", "computer", "mechanical", "civil", "electronics"];

/* ---------- parse courses helper ---------- */
function parseCourses(row) {
  if (!row) return [];
  try {
    if (Array.isArray(row)) return row.map((c) => normalizeText(String(c)));
    if (typeof row === "string") {
      const parsed = JSON.parse(row);
      if (Array.isArray(parsed)) return parsed.map((c) => normalizeText(String(c)));
    }
  } catch (e) {}
  return String(row || "").split(/,|;|\|/).map((s) => normalizeText(s)).filter(Boolean);
}

/* ---------- improved person scorer (with fuzzy name) ---------- */
function scorePersonRow(row, tokens) {
  let score = 0;
  const name = normalizeText(row.name || "");
  const nameParts = name.split(" ").filter(Boolean);
  const dept = normalizeText(row.department || "");
  const spec = normalizeText(row.specialization || row.qualifications || "");
  const notes = normalizeText(row.notes || "");
  const email = normalizeText(row.email_official || row.email || row.email_other || "");
  const mobile = normalizeText(row.mobile || "");
  const courses = parseCourses(row.courses_taught || row.courses || row.subjects);

  let matched = 0;
  for (const t of tokens) {
    if (!t) continue;

    // exact token equals a name part
    if (nameParts.includes(t)) { score += 7; matched++; continue; }

    // name contains token (substring)
    if (name.includes(t)) { score += 5; matched++; continue; }

    // fuzzy: compare token to each name part using levenshtein (small tolerance)
    for (const np of nameParts) {
      const dist = levenshtein(t, np);
      const thresh = np.length <= 3 ? 1 : np.length <= 6 ? 2 : 2;
      if (dist <= thresh) { score += 5; matched++; break; }
    }

    if (dept.includes(t)) { score += 3; matched++; }
    if (spec.includes(t)) { score += 2; matched++; }
    for (const c of courses) { if (c.includes(t)) { score += 4; matched++; break; } }
    if (notes.includes(t)) { score += 1; matched++; }
    if (email.includes(t)) { score += 2; matched++; }
    if (mobile.includes(t)) { score += 2; matched++; }
  }

  const coverage = tokens.length ? matched / tokens.length : 0;
  if (coverage >= 0.6) score += 2;
  else if (coverage >= 0.35) score += 1;
  return score;
}

/* ---------- intent detection ---------- */
function detectIntent(norm) {
  for (const k of COLLEGE_KEYS) if (norm.includes(k)) return "college";
  for (const k of PLACEMENTS_KEYS) if (norm.includes(k)) return "placements";
  for (const k of SUBJECT_KEYS) if (norm.includes(k)) return "subjects";
  for (const k of STUDENT_KEYS) if (norm.includes(k)) return "students";
  for (const k of FACULTY_KEYS) if (norm.includes(k)) return "people";
  for (const k of STAFF_KEYS) if (norm.includes(k)) return "people";
  for (const k of BRANCH_KEYS) if (norm.includes(k)) return "branches";
  return "people";
}

/* ---------------- API handler ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST supported" });
  const { question } = req.body || {};
  if (!question || !String(question).trim()) return res.status(400).json({ error: "question required" });

  const qRaw = String(question).trim();
  const qNorm = normalizeText(qRaw);

  // tiny greeting guard
  if (["hi","hello","hey","ok","yo"].includes(qNorm)) return res.json({ answer: "Hi 👋 How can I help you?", source: "generic" });

  // apply alias map replacements before tokenizing
  let effectiveQuery = qRaw;
  for (const [k, v] of Object.entries(aliasMap)) {
    const patt = new RegExp(`\\b${k.replace(/\s+/g,"\\s+")}\\b`, "i");
    if (patt.test(qNorm)) effectiveQuery = effectiveQuery.replace(patt, v);
  }

  const tokens = tokenize(effectiveQuery).filter(Boolean);

  // --- heuristic: route obvious non-college general-knowledge questions to LLM ---
  const GENERAL_ENTITIES = new Set([
    "google","gmail","facebook","twitter","amazon","microsoft","elon","musk","sundar","pichai",
    "modi","narendra","pm","prime","minister","president","owner","owns","owners","who","what","when","where","why"
  ]);
  const hasGeneralEntity = tokens.some(t => GENERAL_ENTITIES.has(t));
  const startsWithWH = /^(who|what|when|where|why|how)\b/.test(qNorm);

  if (startsWithWH && hasGeneralEntity) {
    const llm = await callAnyLLM(effectiveQuery);
    return res.json({ answer: llm.answer, source: llm.source, debug: { route: "wh-general-heuristic" } });
  }

  // If supabase not configured, fallback to LLM immediately
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const llm = await callAnyLLM(effectiveQuery);
    return res.json({ ...llm, debug: { note: "supabase not configured" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const intent = detectIntent(qNorm);

  try {
    /* ---------- college info ---------- */
    if (intent === "college") {
      // support both possible table names: college_info, college_basic
      const tryTables = ["college_info", "college_basic"];
      let collegeRow = null;
      for (const t of tryTables) {
        try {
          const { data, error } = await supabase.from(t).select("*").limit(1).maybeSingle();
          if (!error && data) { collegeRow = data; break; }
        } catch (_) {}
      }
      if (!collegeRow) {
        // fallback to LLM if college info missing
        const llm = await callAnyLLM(effectiveQuery);
        return res.json({ answer: llm.answer, source: llm.source, debug: { route: "college-fallback-llm" } });
      }
      const parts = [];
      if (collegeRow.college_name || collegeRow.name) parts.push(collegeRow.college_name || collegeRow.name);
      if (collegeRow.location) parts.push(`Location: ${collegeRow.location}`);
      if (collegeRow.established) parts.push(`Established: ${collegeRow.established}`);
      if (collegeRow.affiliation) parts.push(`Affiliation: ${collegeRow.affiliation}`);
      if (collegeRow.approved_by) parts.push(`Approved by: ${collegeRow.approved_by}`);
      if (collegeRow.type) parts.push(`Type: ${collegeRow.type}`);
      if (collegeRow.campus_area) parts.push(`Campus area: ${collegeRow.campus_area}`);
      if (collegeRow.phone || collegeRow.contact_phone) parts.push(`Phone: ${collegeRow.phone || collegeRow.contact_phone}`);
      if (collegeRow.email || collegeRow.contact_email) parts.push(`Email: ${collegeRow.email || collegeRow.contact_email}`);
      if (collegeRow.website) parts.push(`Website: ${collegeRow.website}`);
      return res.json({ answer: parts.join("\n"), source: "supabase-college" });
    }

    /* ---------- placements ---------- */
    if (intent === "placements") {
      const tableCandidates = ["placements", "Collage_placements", "college_placements"];
      let rows = [];
      for (const t of tableCandidates) {
        try {
          const { data } = await supabase.from(t).select("*").limit(200);
          if (Array.isArray(data) && data.length) rows = rows.concat(data.map(r => ({ ...r, __table: t })));
        } catch (_) {}
      }
      if (!rows.length) {
        const llm = await callAnyLLM(effectiveQuery);
        return res.json({ answer: llm.answer, source: llm.source, debug: { route: "placements-fallback-llm" } });
      }
      const yearToken = tokens.find(t => /^\d{4}$/.test(t) || /\d{2}-\d{2}/.test(t));
      const companyToken = tokens.find(t => t.length > 2 && !/^\d+$/.test(t));
      let matches = rows;
      if (yearToken) matches = matches.filter(r => String(r.year || "").toLowerCase().includes(yearToken));
      if (companyToken) matches = matches.filter(r => String(r.company_name || "").toLowerCase().includes(companyToken));
      if (!matches.length) matches = rows.slice(0, 6);
      const parts = matches.slice(0, 6).map(r => {
        const s = [];
        if (r.company_name) s.push(`${r.company_name} (${r.year || r.created_at?.slice?.(0,4) || "year"})`);
        if (r.offers) s.push(`Offers: ${r.offers}`);
        if (r.salary_lpa) s.push(`Salary (LPA): ${r.salary_lpa}`);
        if (r.notes) s.push(`Notes: ${r.notes}`);
        return s.join(" — ");
      });
      return res.json({ answer: parts.join("\n"), source: "supabase-placements" });
    }

    /* ---------- subjects ---------- */
    if (intent === "subjects") {
      const subjQuery = tokens.join(" ");
      try {
        const { data: subjRows } = await supabase.from("subjects").select("*").ilike("subject_title", `%${subjQuery}%`).limit(20);
        if (subjRows && subjRows.length) {
          const out = subjRows.map(s => `${s.subject_code} — ${s.subject_title}${s.notes ? " — " + s.notes : ""}`);
          return res.json({ answer: out.join("\n"), source: "supabase-subjects" });
        }
      } catch (_) {}
      const semToken = tokens.find(t => /^\d+$/.test(t));
      if (semToken) {
        try {
          const { data: sems } = await supabase.from("semesters").select("*").eq("semester_no", Number(semToken)).limit(20);
          if (sems && sems.length) return res.json({ answer: `Found ${sems.length} semester rows. Use "subjects sem ${sems[0].semester_no} <branch>"`, source: "supabase-semesters" });
        } catch (_) {}
      }
      const llm = await callAnyLLM(effectiveQuery);
      return res.json({ answer: llm.answer, source: llm.source, debug: { route: "subjects-fallback-llm" } });
    }

    /* ---------- students ---------- */
    if (intent === "students") {
      const nameToken = tokens.find(t => t.length > 2);
      if (!nameToken) return res.json({ answer: "Please include student name or USN.", source: "generic" });
      try {
        const { data: studs } = await supabase.from("Students list").select("*").ilike("Name", `%${nameToken}%`).limit(20);
        if (!studs || studs.length === 0) {
          const llm = await callAnyLLM(effectiveQuery);
          return res.json({ answer: llm.answer, source: llm.source, debug: { route: "students-fallback-llm" } });
        }
        const out = studs.map(s => `${s.Name} — USN: ${s.Usn} — Branch: ${s.Branch}`);
        return res.json({ answer: out.join("\n"), source: "supabase-students" });
      } catch (e) {
        const llm = await callAnyLLM(effectiveQuery);
        return res.json({ answer: llm.answer, source: llm.source, debug: { route: "students-exception-llm", exception: String(e) } });
      }
    }

    /* ---------- branches ---------- */
    if (intent === "branches") {
      try {
        const { data: br } = await supabase.from("branches").select("*").limit(50);
        if (!br || br.length === 0) {
          const llm = await callAnyLLM(effectiveQuery);
          return res.json({ answer: llm.answer, source: llm.source, debug: { route: "branches-fallback-llm" } });
        }
        const out = br.map(b => `${b.branch_code || ""} — ${b.branch_name || ""}`);
        return res.json({ answer: out.join("\n"), source: "supabase-branches" });
      } catch (e) {
        const llm = await callAnyLLM(effectiveQuery);
        return res.json({ answer: llm.answer, source: llm.source, debug: { route: "branches-exception-llm", exception: String(e) } });
      }
    }

    /* ---------- people (faculty + staff) ---------- */
    {
      const hintedBranchToken = tokens.find(t => ["cse","ece","me","ce","eee","computer","electronics","mechanical","civil","electrical"].includes(t));
      const buildQuery = (table) => {
        let q = supabase.from(table).select("*").limit(800);
        if (hintedBranchToken) q = q.ilike("department", `%${hintedBranchToken}%`);
        return q;
      };
      const [facRes, staffRes] = await Promise.allSettled([ buildQuery("faculty_list"), buildQuery("staff") ]);
      let rows = [];
      if (facRes.status === "fulfilled" && Array.isArray(facRes.value.data)) rows = rows.concat(facRes.value.data.map(r => ({ ...r, __table: "faculty_list" })));
      if (staffRes.status === "fulfilled" && Array.isArray(staffRes.value.data)) rows = rows.concat(staffRes.value.data.map(r => ({ ...r, __table: "staff" })));
      if (!rows.length) {
        // no people rows in DB - fallback to LLM (useful for "who is indian pm"-type Qs)
        const llm = await callAnyLLM(effectiveQuery);
        return res.json({ answer: llm.answer, source: llm.source, debug: { route: "people-db-empty-fallback-llm" } });
      }

      // score rows with improved fuzzy
      const scored = rows.map(r => ({ row: r, score: scorePersonRow(r, tokens) }));
      scored.sort((a,b) => b.score - a.score);
      const best = scored[0];
      const second = scored[1] || { score: 0 };

      // thresholds tuned for safety
      const THRESH = 6;
      const MIN_RATIO = 1.15;

      if (best && best.score >= THRESH && (second.score === 0 || best.score >= Math.max(THRESH, second.score * MIN_RATIO))) {
        const r = best.row;
        const lines = [];
        lines.push(`${r.name}${r.designation ? " — " + r.designation : ""}`);
        if (r.department) lines.push(`Department: ${r.department}`);
        if (r.specialization) lines.push(`Specialization: ${r.specialization}`);
        const courses = parseCourses(r.courses_taught || r.courses);
        if (courses.length) lines.push(`Courses: ${courses.slice(0,6).join(", ")}`);
        if (r.email_official || r.email) lines.push(`Email: ${r.email_official || r.email || r.email_other || ""}`);
        if (r.mobile) lines.push(`Phone: ${r.mobile}`);
        if (r.notes) lines.push(`Notes: ${r.notes}`);
        const answer = lines.join("\n");
        const sourceLabel = r.__table === "staff" ? "supabase-staff" : "supabase-faculty";
        return res.json({ answer, source: sourceLabel, debug: { top_score: best.score, second_score: second.score } });
      }

      // if no single confident match, but suggestions exist, return suggestions
      const suggestions = scored.slice(0,8).filter(s => s.score > 0).map(s => ({ name: s.row.name, score: s.score, table: s.row.__table }));
      if (suggestions.length) {
        // But also attempt LLM fallback for general-knowledge questions (user might have asked something outside DB)
        const llm = await callAnyLLM(effectiveQuery);
        // prefer LLM if it returned a meaningful answer; otherwise return suggestions
        if (llm && llm.answer && !/(LLM not configured|No answer)/i.test(llm.answer)) {
          return res.json({ answer: llm.answer, source: llm.source, debug: { route: "people-suggestions-llm-preferred", suggestions } });
        }
        const sugText = suggestions.map(s => `${s.name} (${s.table}) — score ${s.score}`).join("\n");
        return res.json({ answer: `No single confident match. Top suggestions:\n${sugText}`, source: "supabase-suggestions" });
      }

      // final fallback to LLM
      const llm = await callAnyLLM(effectiveQuery);
      if (llm && llm.answer && !/(LLM not configured|No answer)/i.test(llm.answer)) {
        return res.json({ answer: llm.answer, source: llm.source, debug: { route: "people-final-llm-fallback" } });
      }
      return res.json({ answer: "No matching person found in DB.", source: "db-empty" });
    }
  } catch (err) {
    // fallback to LLM on unexpected DB exception
    try {
      const llm = await callAnyLLM(effectiveQuery);
      return res.json({ answer: llm.answer || String(err), source: llm.source || "llm", debug: { exception: String(err) } });
    } catch (e2) {
      return res.json({ answer: String(err), source: "error", debug: { exception: String(err) } });
    }
  }
}
