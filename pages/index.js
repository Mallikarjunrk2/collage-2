import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { id: 0, role: "bot", text: "Hi 👋 I’m CollegeGPT (HSIT). Ask college-related questions." },
  ]);
  const endRef = useRef();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!q.trim()) return;
    const user = { id: Date.now(), role: "user", text: q.trim() };
    setMessages((m) => [...m, user]);
    setQ("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: user.text }),
      });
      const json = await res.json();
      const bot = { id: Date.now() + 1, role: "bot", text: json.answer || json.error || "No answer." };
      setMessages((m) => [...m, bot]);
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now()+2, role: "bot", text: "Error contacting API." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-[var(--card)] rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-purple-600 grid place-items-center">🎓</div>
            <div>
              <div className="text-lg font-semibold">CollegeGPT — HSIT</div>
              <div className="text-sm text-[var(--muted)]">Ask about faculty, placements, admissions</div>
            </div>
          </div>
          <div className="text-sm text-green-400">Status: Live</div>
        </div>

        <div className="h-[56vh] overflow-auto p-4 rounded-lg bg-gradient-to-b from-transparent to-black/10">
          {messages.map((m) => (
            <div key={m.id} className={`mb-4 ${m.role === "user" ? "text-right" : "text-left"}`}>
              <div className={`inline-block p-3 rounded-xl ${m.role === "user" ? "bg-slate-700" : "bg-slate-800"}`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type your question... (e.g., Who teaches Operating Systems?)"
            className="flex-1 p-3 rounded-full bg-slate-900 border border-slate-800 outline-none"
          />
          <button onClick={send} disabled={loading || !q.trim()} className="px-4 py-2 rounded-full bg-purple-600 text-white">
            {loading ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
