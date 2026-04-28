import { createClient } from "@supabase/supabase-js";
import { handleQuery } from "../../utils/searchEngine";

/* ===================== ENV ===================== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

/* ===================== HELPERS ===================== */
function normalizeText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s = "") {
  return normalizeText(s).split(" ").filter(Boolean);
}

/* ===================== 🔥 GROQ LLM ===================== */
async function callLLM(question) {
  if (!GROQ_API_KEY) {
    return { answer: "LLM not configured.", source: "llm" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "You are CollegeGPT for HSIT. Answer ONLY if not college-specific. Keep it short (2–3 lines).",
            },
            {
              role: "user",
              content: question,
            },
          ],
          max_tokens: 300,
          temperature: 0.6,
        }),
      }
    );

    clearTimeout(timeout);

    if (!resp.ok) {
      return { answer: "Server busy. Try again.", source: "llm" };
    }

    const json = await resp.json();

    return {
      answer:
        json?.choices?.[0]?.message?.content || "No response.",
      source: "llm",
    };
  } catch (err) {
    return {
      answer: "Request timeout. Try again.",
      source: "llm",
    };
  }
}

/* ===================== MAIN ===================== */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST supported" });
  }

  const { question } = req.body || {};
  if (!question) {
    return res.status(400).json({ error: "question required" });
  }

  const q = question.trim();
  const normalizedQ = normalizeText(q);

  /* ===================== GREETING ===================== */
  if (["hi", "hello", "hey"].includes(normalizedQ)) {
    return res.json({
      answer: "Hi 👋HSIT GPT here, how can I help you?",
      source: "generic",
    });
  }

  /* ===================== 🔥 1. LOCAL JSON (HIGHEST PRIORITY) ===================== */
  try {
    const localAnswer = handleQuery(normalizedQ);

    // STRICT CHECK (important fix)
    if (
      localAnswer &&
      typeof localAnswer === "string" &&
      localAnswer.trim().length > 5 &&
      !localAnswer.toLowerCase().includes("not found") &&
      !localAnswer.toLowerCase().includes("no data")
    ) {
      return res.json({
        answer: localAnswer,
        source: "local-data",
      });
    }
  } catch (e) {
    console.log("Local error:", e);
  }

  /* ===================== 🔥 2. SUPABASE ===================== */
  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
      const tokens = tokenize(normalizedQ);

      const { data } = await supabase
        .from("faculty_list")
        .select("*")
        .limit(200);

      if (data && data.length) {
        const match = data.find((row) => {
          const name = normalizeText(row.name);
          return tokens.every((t) => name.includes(t));
        });

        if (match) {
          return res.json({
            answer: `${match.name} — ${match.designation}
Department: ${match.department}
Email: ${match.email}`,
            source: "supabase",
          });
        }
      }
    } catch (e) {
      console.log("Supabase error:", e);
    }
  }

  /* ===================== 🔥 3. LLM (LAST FALLBACK) ===================== */
  const llm = await callLLM(q);
  return res.json(llm);
}
