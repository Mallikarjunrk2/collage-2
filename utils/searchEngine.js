import data from "../data/college_local.json";
import { normalize } from "./normalize.js";
import { detectIntent } from "./intent.js";

export function handleQuery(question) {
  const q = normalize(question);
  const intent = detectIntent(q);

  /* ================= 🔥 COLLEGE INFO (NEW BLOCK) ================= */
  if (
    q.includes("hirasugar") ||
    q.includes("hsit") ||
    q.includes("college") ||
    q.includes("nidasoshi")
  ) {
    return `${data.college.name}
Location: ${data.college.location.village}, ${data.college.location.district}
Established: ${data.college.established_year}
Affiliation: ${data.college.affiliation}`;
  }

  /* ================= PRINCIPAL ================= */
  if (intent === "principal") {
    const p = data.principal;
    return `${p.name} is the Principal of HSIT. Qualification: ${p.qualification}`;
  }

  /* ================= OFFICE STAFF ================= */
  if (intent === "office_staff") {
    return data.office_staff
      .map((s) => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= FACULTY ================= */
  if (intent === "faculty") {
    return data.cse_faculty
      .map((f) => `${f.name} - ${f.designation}`)
      .join("\n");
  }

  /* ================= ADMISSIONS ================= */
  if (intent === "admissions") {
    return `Exams: ${data.admissions.entrance_exams.join(", ")}
Eligibility: ${data.admissions.eligibility.qualification}`;
  }

  /* ================= FACILITIES ================= */
  if (intent === "facilities") {
    return data.facilities.join(", ");
  }

  /* ================= DEPARTMENTS ================= */
  if (intent === "departments") {
    return data.departments.map((d) => d.name).join(", ");
  }

  /* ================= EVENTS ================= */
  if (intent === "events") {
    return data.events.join(", ");
  }

  /* ================= RESEARCH ================= */
  if (intent === "research") {
    return `PhD Available: ${data.research_center.phd_available}
Recognized by: ${data.research_center.recognized_by}`;
  }

  /* ================= CALENDAR ================= */
  if (intent === "calendar") {
    return data.academic_calendar.key_events.join("\n");
  }

  /* ================= FALLBACK ================= */
  return "not found";
}
