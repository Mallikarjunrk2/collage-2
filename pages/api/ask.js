// pages/api/ask.js
import { createClient } from "@supabase/supabase-js";

/**
 * Multi-table ask endpoint
 * - Uses Supabase DB tables (college_basic, faculty_list, staff, placements / Collage_placements,
 *   subjects, semesters, branches, "Students list")
 * - Routes queries by keywords; fuzzy matches for people (faculty/staff)
 * - Falls back to LLM only when DB is not configured or DB errors occur
 *
 * Required env:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (recommended) OR NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - GEMINI_API_URL / GEMINI_API_KEY (optional; used only for fallback when DB unavailable)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

/* ---------------- utilities ---------------- */
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
async function callGemini(question) {
  if (!GEMINI_API_KEY || !GEMINI_API_URL) return { answer: "LLM not configured.", source: "llm" };
  try {
    const body = { contents: [{ parts: [{ text: `You are CollegeGPT for HSIT. Answer concisely: ${question}` }] }] };
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
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || json?.output?.[0]?.content?.[0]?.text || null;
    return { answer: text || "No answer from LLM.", source: "llm" };
  } catch (err) {
    return { answer: `LLM exception: ${String(err)}`, source: "llm" };
  }
}

/* ---------------- routing keywords ---------------- */
const COLLEGE_KEYS = ["college", "hsit", "hit", "hirasugar", "nidasoshi", "campus", "established", "affiliation", "website", "contact", "phone", "email"];
const FACULTY_KEYS = ["who", "teacher", "teaches", "hod", "prof", "professor", "assistant", "associate", "lecturer", "instructor", "faculty", "teach"];
const STAFF_KEYS = ["staff", "peon", "helper", "mechanic", "instructor", "lab", "lab assistant", "lab instructor", "helper", "clerk"];
const PLACEMENTS_KEYS = ["placement", "placements", "company", "salary", "offer", "offers", "placement 2024", "placement 2023", "recruit"];
const SUBJECT_KEYS = ["subject", "subjects", "syllabus", "curriculum", "semester", "sem", "subject_code", "subject_title"];
const STUDENT_KEYS = ["student", "students", "usn", "roll", "name", "passed", "batch"];
const BRANCH_KEYS = ["branch", "branches", "cse", "ece", "me", "ce", "eee", "computer science", "mechanical", "civil", "electronics"];

/* small alias map (add more if you want) */
const aliasMap = {
  rcb: "royal challengers bengaluru",
  cse: "computer science and engineering",
  hsit: "hirasugar institute of technology",
  hit: "hirasugar institute of technology",
  mallikarjun: "prof. mallikarjun g. ganachari",
  sapna: "prof. sapna b patil"
};

/* ---------------- scoring for people ---------------- */
function parseCourses(row) {
  if (!row) return [];
  try {
    if (Array.isArray(row)) return row.map((c) => normalizeText(String(c)));
    if (typeof row === "string") {
      const parsed = JSON.parse(row);
      if (Array.isArray(parsed)) return parsed.map((c) => normalizeText(String(c)));
    }
  } catch (e) {}
  // fallback comma split
  return String(row || "").split(/,|;|\|/).map((s) => normalizeText(s)).filter(Boolean);
}

function scorePersonRow(row, tokens) {
  // returns numeric score
  let score = 0;
  const name = normalizeText(row.name || "");
  const dept = normalizeText(row.department || "");
  const spec = normalizeText(row.specialization || row.qualifications || "");
  const notes = normalizeText(row.notes || "");
  const email = normalizeText(row.email_official || row.email || row.email_other || "");
  const mobile = normalizeText(row.mobile || "");
  const courses = parseCourses(row.courses_taught || row.courses || row.subjects);

  let matched = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (name.includes(t)) { score += 6; matched++; }
    else if (name.split(" ").some(n => n === t)) { score += 4; matched++; }
    if (dept.includes(t)) { score += 3; matched++; }
    if (spec.includes(t)) { score += 2; matched++; }
    for (const c of courses) { if (c.includes(t)) { score += 4; matched++; break; } }
    if (notes.includes(t)) { score += 1; matched++; }
    if (email.includes(t)) { score += 2; matched++; }
    if (mobile.includes(t)) { score += 2; matched++; }
  }
  // coverage bonus
  const coverage = tokens.length ? matched / tokens.length : 0;
  if (coverage >= 0.6) score += 2;
  else if (coverage >= 0.35) score += 1;
  return score;
}

/* ---------------- helper: detect intent table ---------------- */
function detectIntent(norm) {
  // college-level
  for (const k of COLLEGE_KEYS) if (norm.includes(k)) return "college";
  for (const k of PLACEMENTS_KEYS) if (norm.includes(k)) return "placements";
  for (const k of SUBJECT_KEYS) if (norm.includes(k)) return "subjects";
  for (const k of STUDENT_KEYS) if (norm.includes(k)) return "students";
  // people: faculty vs staff - use both and decide by scoring
  for (const k of FACULTY_KEYS) if (norm.includes(k)) return "people";
  for (const k of STAFF_KEYS) if (norm.includes(k)) return "people";
  // branches
  for (const k of BRANCH_KEYS) if (norm.includes(k)) return "branches";
  // fallback: people (faculty/staff) first as common queries are about people
  return "people";
}

/* ---------------- API handler ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST supported" });
  const { question } = req.body || {};
  if (!question || !String(question).trim()) return res.status(400).json({ error: "question required" });

  const qRaw = String(question).trim();
  const qNorm = normalizeText(qRaw);

  // quick guard for very short greetings
  if (["hi","hello","hey","ok","yo"].includes(qNorm)) return res.json({ answer: "Hi 👋 How can I help you?", source: "generic" });

  // alias normalization: replace short aliases to canonical phrases before tokenizing
  let effectiveQuery = qRaw;
  for (const k of Object.keys(aliasMap)) {
    if (qNorm.includes(k)) effectiveQuery = effectiveQuery.replace(new RegExp(`\\b${k}\\b`, "i"), aliasMap[k]);
  }
  const tokens = tokenize(effectiveQuery).filter(Boolean);

  // If Supabase not configured -> fallback to LLM (safe)
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const llm = await callGemini(effectiveQuery);
    return res.json({ ...llm, debug: { note: "supabase not configured" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const intent = detectIntent(qNorm);

  try {
    /* ---------------- college_basic ---------------- */
    if (intent === "college") {
      const { data: collegeRow, error } = await supabase.from("college_basic").select("*").limit(1).maybeSingle();
      if (error) {
        const llm = await callGemini(effectiveQuery);
        return res.json({ answer: llm.answer, source: "llm", debug: { db_error: String(error) } });
      }
      if (!collegeRow) return res.json({ answer: "College information not available in DB.", source: "db-empty" });
      const parts = [];
      if (collegeRow.college_name || collegeRow.name) parts.push(collegeRow.college_name || collegeRow.name);
      if (collegeRow.location) parts.push(`Location: ${collegeRow.location}`);
      if (collegeRow.established) parts.push(`Established: ${collegeRow.established}`);
      if (collegeRow.affiliation) parts.push(`Affiliation: ${collegeRow.affiliation}`);
      if (collegeRow.approved_by) parts.push(`Approved by: ${collegeRow.approved_by}`);
      if (collegeRow.type) parts.push(`Type: ${collegeRow.type}`);
      if (collegeRow.campus_area) parts.push(`Campus area: ${collegeRow.campus_area}`);
      if (collegeRow.contact_phone) parts.push(`Phone: ${collegeRow.contact_phone}`);
      if (collegeRow.contact_email) parts.push(`Email: ${collegeRow.contact_email}`);
      if (collegeRow.website) parts.push(`Website: ${collegeRow.website}`);
      if (collegeRow.description) parts.push(collegeRow.description);
      const answer = parts.join("\n");
      return res.json({ answer: answer || "College info present but no fields.", source: "supabase-college" });
    }

    /* ---------------- placements (two possible table names) ---------------- */
    if (intent === "placements") {
      // try both names: "placements" and "Collage_placements"
      const tableCandidates = ["placements", "Collage_placements"];
      let rows = [];
      for (const t of tableCandidates) {
        try {
          const { data } = await supabase.from(t).select("*").limit(200);
          if (Array.isArray(data) && data.length) rows = rows.concat(data.map(r => ({ ...r, __table: t })));
        } catch (_) {}
      }
      if (!rows.length) return res.json({ answer: "No placement records found in DB.", source: "db-empty" });

      // find by year/company tokens
      const yearToken = tokens.find(t => /^\d{4}|\d{2}-\d{2}/.test(t)) || tokens.find(t => t.length === 4 && /^\d{4}$/.test(t));
      const companyToken = tokens.find(t => t.length > 2 && !/^\d+$/.test(t));
      let matches = rows;
      if (yearToken) matches = matches.filter(r => String(r.year || "").toLowerCase().includes(yearToken));
      if (companyToken) matches = matches.filter(r => String(r.company_name || "").toLowerCase().includes(companyToken));
      if (!matches.length) matches = rows.slice(0, 6); // fallback sample

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

    /* ---------------- subjects & semesters ---------------- */
    if (intent === "subjects") {
      // match subject_code or subject_title in subjects table
      const subjQuery = tokens.join(" ");
      const { data: subjRows } = await supabase.from("subjects").select("*").ilike("subject_title", `%${subjQuery}%`).limit(20);
      if (subjRows && subjRows.length) {
        const out = subjRows.map(s => `${s.subject_code} — ${s.subject_title}${s.notes ? " — " + s.notes : ""}`);
        return res.json({ answer: out.join("\n"), source: "supabase-subjects" });
      }
      // try semester info via semesters table (e.g., "sem 3 cse")
      const semToken = tokens.find(t => /^\d+$/.test(t));
      let semMatches = [];
      if (semToken) {
        const { data: sems } = await supabase.from("semesters").select("*").eq("semester_no", Number(semToken)).limit(20);
        if (sems && sems.length) semMatches = sems;
      }
      if (semMatches.length) {
        return res.json({ answer: `Found ${semMatches.length} semester rows. Use specific query like "subjects sem ${semMatches[0].semester_no} cse"`, source: "supabase-semesters" });
      }
      return res.json({ answer: "No subjects found for your query in DB.", source: "db-empty" });
    }

    /* ---------------- students ---------------- */
    if (intent === "students") {
      // table name "Students list" in your DB
      const nameToken = tokens.find(t => t.length > 2);
      if (!nameToken) return res.json({ answer: "Please include student name or USN.", source: "generic" });
      const { data: studs } = await supabase.from("Students list").select("*").ilike("Name", `%${nameToken}%`).limit(20);
      if (!studs || studs.length === 0) return res.json({ answer: "No matching student rows found.", source: "db-empty" });
      const out = studs.map(s => `${s.Name} — USN: ${s.Usn} — Branch: ${s.Branch}`);
      return res.json({ answer: out.join("\n"), source: "supabase-students" });
    }

    /* ---------------- branches ---------------- */
    if (intent === "branches") {
      const { data: br } = await supabase.from("branches").select("*").limit(50);
      if (!br || br.length === 0) return res.json({ answer: "No branches found in DB.", source: "db-empty" });
      const out = br.map(b => `${b.branch_code || ""} — ${b.branch_name || ""}`);
      return res.json({ answer: out.join("\n"), source: "supabase-branches" });
    }

    /* ---------------- people (faculty + staff) ---------------- */
    // fetch faculty_list and staff, merge
    {
      const hintedBranchToken = tokens.find(t => ["cse","ece","me","ce","eee","computer","electronics","mechanical","civil","electrical"].includes(t));
      const buildQuery = (table) => {
        let q = supabase.from(table).select("*").limit(800);
        if (hintedBranchToken) {
          const pattern = `%${hintedBranchToken}%`;
          q = q.ilike("department", pattern);
        }
        return q;
      };
      const [facRes, staffRes] = await Promise.allSettled([ buildQuery("faculty_list"), buildQuery("staff") ]);
      let rows = [];
      if (facRes.status === "fulfilled" && Array.isArray(facRes.value.data)) rows = rows.concat(facRes.value.data.map(r => ({ ...r, __table: "faculty_list" })));
      if (staffRes.status === "fulfilled" && Array.isArray(staffRes.value.data)) rows = rows.concat(staffRes.value.data.map(r => ({ ...r, __table: "staff" })));
      if (!rows.length) return res.json({ answer: "No people rows found in DB.", source: "db-empty" });

      // score each row
      const scored = rows.map(r => ({ row: r, score: scorePersonRow(r, tokens) }));
      scored.sort((a,b) => b.score - a.score);
      const best = scored[0];
      const second = scored[1] || { score: 0 };
      const THRESH = 5;
      const MIN_RATIO = 1.12;
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

      // no confident person match -> provide top suggestions
      const suggestions = scored.slice(0,6).filter(s => s.score > 0).map(s => ({ name: s.row.name, score: s.score, table: s.row.__table }));
      if (suggestions.length) {
        const sugText = suggestions.map(s => `${s.name} (${s.table}) — score ${s.score}`).join("\n");
        return res.json({ answer: `No confident single match. Top suggestions:\n${sugText}`, source: "supabase-suggestions" });
      }

      return res.json({ answer: "No matching person found in DB.", source: "db-empty" });
    }

  } catch (err) {
    // fallback to LLM only if DB throws unexpected exception
    try {
      const llm = await callGemini(effectiveQuery);
      return res.json({ answer: llm.answer || String(err), source: llm.source || "llm", debug: { exception: String(err) } });
    } catch (e2) {
      return res.json({ answer: String(err), source: "error", debug: { exception: String(err) } });
    }
  }
}
