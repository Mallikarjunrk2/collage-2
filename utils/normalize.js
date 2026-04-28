import { aliases } from "./aliases";

export function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(" ")
    .map((word) => aliases[word] || word)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
