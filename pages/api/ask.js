import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ===================== NVIDIA KIMI ===================== */
const KIMI_API_KEY = process.env.GEMINI_API_KEY;
const KIMI_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

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

/* ===================== 🔥 KIMI LLM ===================== */
async function callLLM(question, retry = 1) {
  if (!KIMI_API_KEY) {
    return { answer: "LLM not configured.", source: "llm" };
  }

  try {
    const resp = await fetch(KIMI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KIMI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2.5",
        messages: [
          {
            role: "system",
            content:
              "You are CollegeGPT for HSIT. Answer short, clear, and accurate. If it's a screenshot/news, summarize in 2-3 lines.",
          },
          {
            role: "user",
            content: question,
          },
        ],
        max_tokens: 800,
        temperature: 0.7,
        top_p: 1,
        stream: false, // ✅ IMPORTANT FIX
      }),
    });

    if (!resp.ok) {
      // retry once for 502/500
      if (retry > 0) return await callLLM(question, retry - 1);

      const txt = await resp.text();
      return {
        answer: `LLM error ${resp.status}`,
        source: "llm",
      };
    }

    const json = await resp.json();

    const text =
      json?.choices?.[0]?.message?.content ||
      "No response from Kimi.";

    return { answer: text, source: "llm" };
  } catch (err) {
    if (retry > 0) return await callLLM(question, retry - 1);

    return {
      answer: "LLM failed. Try again.",
      source: "llm",
    };
  }
}

/* ===================== MAIN ===================== */
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST supported" });

  const { question } = req.body || {};
  if (!question)
    return res.status(400).json({ error: "question required" });

  const q = question.trim();
  const tokens = tokenize(q);

  /* ===================== GREETING ===================== */
  if (["hi", "hello", "hey"].includes(q.toLowerCase())) {
    return res.json({
      answer: "Hi 👋 How can I help you?",
      source: "generic",
    });
  }

  /* ===================== DB SEARCH (IMPROVED) ===================== */
  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
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
    } catch (e) {}
  }

  /* ===================== FALLBACK TO KIMI ===================== */
  const llm = await callLLM(q);
  return res.json(llm);
}
