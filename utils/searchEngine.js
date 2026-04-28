import data from "../data/college_local.json";
import { normalize } from "./normalize.js";
import { detectIntent } from "./intent.js";

export function handleQuery(question) {
  const q = normalize(question);
  const intent = detectIntent(q);

  /* ================= 🔥 ALL PEOPLE (DYNAMIC SEARCH) ================= */
  const allPeople = [
    ...(data.cse_faculty || []),
    ...(data.technical_staff || []),
    ...(data.support_staff || []),
    ...(data.office_staff || []),
  ];

  // 🔍 Find by name
  const person = allPeople.find((p) =>
    q.includes(p.name.toLowerCase())
  );

  if (person) {
    return `${person.name}
${person.designation || ""}
${person.email ? "Email: " + person.email : ""}
${person.phone ? "Phone: " + person.phone : ""}`;
  }

  /* ================= 🔥 MANAGEMENT ================= */
  if (q.includes("president")) {
    return data.advisory_committee.president;
  }

  if (q.includes("vice president")) {
    return data.advisory_committee.vice_president;
  }

  if (q.includes("secretary")) {
    return data.advisory_committee.secretary;
  }

  if (q.includes("advisory committee")) {
    const ac = data.advisory_committee;
    return `President: ${ac.president}
Vice President: ${ac.vice_president}
Secretary: ${ac.secretary}
Members:
${ac.members.map(m => m.name).join("\n")}`;
  }

  if (q.includes("governing council")) {
    return data.governing_council.members
      .map(m => `${m.name} - ${m.role || ""}`)
      .join("\n");
  }

  /* ================= 🔥 FACULTY ================= */
  if (q.includes("faculty")) {
    return data.cse_faculty
      .map(f => `${f.name} - ${f.designation}`)
      .join("\n");
  }

  /* ================= 🔥 OFFICE ================= */
  if (q.includes("office staff") || q.includes("office")) {
    return data.office_staff
      .map(s => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= 🔥 TECH STAFF ================= */
  if (q.includes("technical staff")) {
    return data.technical_staff
      .map(s => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= 🔥 SUPPORT STAFF ================= */
  if (q.includes("support staff")) {
    return data.support_staff
      .map(s => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= 🔥 PRINCIPAL ================= */
  if (q.includes("principal")) {
    return `${data.principal.name}
${data.principal.designation}
${data.principal.qualification}`;
  }

  /* ================= 🔥 DEPARTMENTS ================= */
  if (q.includes("department")) {
    return data.departments.map(d => d.name).join("\n");
  }

  /* ================= 🔥 ADMISSIONS ================= */
  if (q.includes("admission")) {
    return `Exams: ${data.admissions.entrance_exams.join(", ")}
Eligibility: ${data.admissions.eligibility.qualification}`;
  }

  /* ================= 🔥 FALLBACK ================= */
  return "not found";
}
