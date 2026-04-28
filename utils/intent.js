import { normalize } from "./normalize.js";

export function detectIntent(q) {
  const text = normalize(q);

  if (text.includes("principal")) return "principal";

  if (text.includes("office") || text.includes("staff"))
    return "office_staff";

  if (text.includes("faculty") || text.includes("teacher"))
    return "faculty";

  if (text.includes("admission") || text.includes("kcet") || text.includes("comedk"))
    return "admissions";

  if (text.includes("facility") || text.includes("hostel") || text.includes("gym"))
    return "facilities";

  if (text.includes("department") || text.includes("branch"))
    return "departments";

  if (text.includes("event") || text.includes("fest"))
    return "events";

  if (text.includes("research") || text.includes("phd"))
    return "research";

  if (text.includes("calendar") || text.includes("exam"))
    return "calendar";

  return "unknown";
}
