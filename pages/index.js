import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { id: 0, role: "bot", text: "Hi 👋 I’m CollegeGPT (HSIT). Ask anything about faculty, placements, admissions." },
  ]);
  const endRef = useRef();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ------------------ NORMAL TEXT CHAT ------------------
  async function send() {
    if (!q.trim()) return;
    const user = { id: Date.now(), role: "user", text: q.trim() };
    setMessages((m) => [...m, user]);
    setLoading(true);
    setQ("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: user.text }),
      });
      const json = await res.json();

      const bot = {
        id: Date.now() + 1,
        role: "bot",
        text: json.answer || json.error || "No answer."
      };

      setMessages((m) => [...m, bot]);
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now() + 2, role: "bot", text: "Error contacting API." }]);
    } finally {
      setLoading(false);
    }
  }

  // ------------------ IMAGE GENERATION ------------------
  async function generateImage() {
    if (!q.trim()) return;

    const user = { id: Date.now(), role: "user", text: q.trim() };
    setMessages((m) => [...m, user]);
    setQ("");

    try {
      const res = await fetch("/api/generateImage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: user.text }),
      });

      const json = await res.json();

      if (json.image) {
        setMessages((m) => [
          ...m,
          { id: Date.now() + 1, role: "bot", image: json.image }
        ]);
      } else {
        setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "No image generated." }]);
      }
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "Image generation error." }]);
    }
  }

  // ------------------ AUDIO GENERATION (VOICE) ------------------
  async function generateAudio() {
    if (!q.trim()) return;

    const user = { id: Date.now(), role: "user", text: q.trim() };
    setMessages((m) => [...m, user]);
    setQ("");

    try {
      const res = await fetch("/api/generateAudio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: user.text })
      });

      const json = await res.json();

      if (json.audio) {
        setMessages((m) => [
          ...m,
          { id: Date.now() + 1, role: "bot", audio: json.audio }
        ]);
      } else {
        setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "No audio generated." }]);
      }
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "Audio error." }]);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-[#161b22] rounded-2xl shadow-xl p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-purple-600 grid place-items-center text-xl">🎓</div>
            <div>
              <div className="text-lg font-semibold">CollegeGPT — HSIT</div>
              <div className="text-sm text-gray-400">Ask about faculty, placements, admissions</div>
            </div>
          </div>
          <div className="text-sm text-green-400">Status: Live</div>
        </div>

        {/* Messages */}
        <div className="h-[56vh] overflow-auto p-4 rounded-lg bg-gradient-to-b from-transparent to-black/10 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "text-right" : "text-left"}
            >
              {/* TEXT */}
              {m.text && (
                <div className={`inline-block p-3 rounded-xl ${
                  m.role === "user" ? "bg-purple-700" : "bg-slate-700"
                }`}>
                  {m.text}
                </div>
              )}

              {/* IMAGE */}
              {m.image && (
                <img
                  src={`data:image/png;base64,${m.image}`}
                  className="max-w-xs rounded-xl mt-2 border border-gray-600"
                />
              )}

              {/* AUDIO */}
              {m.audio && (
                <audio
                  controls
                  className="mt-2"
                  src={`data:audio/wav;base64,${m.audio}`}
                />
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input Row */}
        <div className="mt-4 flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            className="flex-1 p-3 rounded-full bg-slate-900 border border-slate-800 outline-none"
          />

          {/* SEND */}
          <button
            onClick={send}
            disabled={loading || !q.trim()}
            className="px-4 py-2 rounded-full bg-purple-600 text-white"
          >
            {loading ? "…" : "Send"}
          </button>

          {/* IMAGE GENERATOR */}
          <button
            onClick={generateImage}
            className="px-4 py-2 rounded-full bg-blue-600 text-white"
          >
            🎨
          </button>

          {/* VOICE GENERATOR */}
          <button
            onClick={generateAudio}
            className="px-4 py-2 rounded-full bg-green-600 text-white"
          >
            🔊
          </button>
        </div>

      </div>
    </div>
  );
}
