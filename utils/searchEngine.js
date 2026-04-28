import data from "../data/college_local.json";
import { normalize } from "./normalize.js";
import { detectIntent } from "./intent.js";

/* ================= 🔥 SCORE FUNCTION ================= */
function getScore(query, text) {
  const qWords = query.split(" ");
  const tWords = text.split(" ");

  let match = 0;

  qWords.forEach((q) => {
    if (tWords.some((t) => t.includes(q))) {
      match++;
    }
  });

  return match / qWords.length;
}

/* ================= 🔥 BEST MATCH FINDER ================= */
function findBestMatch(list, query, key = "name") {
  let best = null;
  let bestScore = 0;

  list.forEach((item) => {
    const text = normalize(item[key] || "");
    const score = getScore(query, text);

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });

  return { best, bestScore };
}

/* ================= 🔥 NEW: ROLE DETECTION ================= */
function detectRole(q) {
  if (q.includes("hod") || q.includes("head of department")) return "hod";
  if (q.includes("principal")) return "principal";
  if (q.includes("assistant")) return "assistant";
  if (q.includes("associate")) return "associate";
  if (q.includes("professor")) return "professor";

  return null;
}

/* ================= 🔥 NEW: ROLE FILTER ================= */
function filterByRole(list, role) {
  if (!role) return list;

  return list.filter((p) => {
    const d = (p.designation || "").toLowerCase();

    if (role === "hod") return d.includes("hod");
    if (role === "principal") return d.includes("principal");
    if (role === "assistant") return d.includes("assistant");
    if (role === "associate") return d.includes("associate");
    if (role === "professor") return d.includes("professor");

    return false;
  });
}

export function handleQuery(question) {
  const q = normalize(question);
  const intent = detectIntent(q);

  /* ================= 🔥 ALL PEOPLE ================= */
  const allPeople = [
    ...(data.cse_faculty || []),
    ...(data.technical_staff || []),
    ...(data.support_staff || []),
    ...(data.office_staff || []),
  ];

  /* ================= 🔥 NEW: APPLY ROLE FILTER FIRST ================= */
  const role = detectRole(q);
  const filteredPeople = filterByRole(allPeople, role);

  /* ================= 🔥 SCORE MATCH ================= */
  const { best: person, bestScore } = findBestMatch(
    filteredPeople.length ? filteredPeople : allPeople,
    q
  );

  if (person && bestScore > 0.5) {
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
${ac.members.map((m) => m.name).join("\n")}`;
  }

  if (q.includes("governing council")) {
    return data.governing_council.members
      .map((m) => `${m.name} - ${m.role || ""}`)
      .join("\n");
  }

  /* ================= 🔥 FACULTY ================= */
  if (q.includes("faculty")) {
    return data.cse_faculty
      .map((f) => `${f.name} - ${f.designation}`)
      .join("\n");
  }

  /* ================= 🔥 OFFICE ================= */
  if (q.includes("office staff") || q.includes("office")) {
    return data.office_staff
      .map((s) => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= 🔥 TECH STAFF ================= */
  if (q.includes("technical staff") || q.includes("tech staff")) {
    return data.technical_staff
      .map((s) => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= 🔥 SUPPORT STAFF ================= */
  if (q.includes("support staff")) {
    return data.support_staff
      .map((s) => `${s.name} - ${s.designation} (${s.phone})`)
      .join("\n");
  }

  /* ================= 🔥 PRINCIPAL (SAFE KEEP) ================= */
  if (q.includes("principal")) {
    return `${data.principal.name}
${data.principal.designation}
${data.principal.qualification}`;
  }

  /* ================= 🔥 DEPARTMENTS ================= */
  if (q.includes("department")) {
    return data.departments.map((d) => d.name).join("\n");
  }

  /* ================= 🔥 ADMISSIONS ================= */
  if (q.includes("admission")) {
    return `Exams: ${data.admissions.entrance_exams.join(", ")}
Eligibility: ${data.admissions.eligibility.qualification}`;
  }

  /* ================= 🔥 FALLBACK ================= */
  return "Sorry, I couldn't understand. Try asking about college, faculty, or admissions.";
}
