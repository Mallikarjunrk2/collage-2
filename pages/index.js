import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!q.trim()) return;

    const userMsg = {
      id: Date.now(),
      role: "user",
      text: q.trim(),
      time: new Date().toLocaleTimeString(),
    };

    setMessages((m) => [...m, userMsg]);
    setQ("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: userMsg.text }),
      });

      const json = await res.json();

      const botMsg = {
        id: Date.now() + 1,
        role: "bot",
        text: json.answer,
        source: json.source,
        time: new Date().toLocaleTimeString(),
      };

      setMessages((m) => [...m, botMsg]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: "bot",
          text: "Error contacting API.",
          time: new Date().toLocaleTimeString(),
        },
      ]);
    }

    setLoading(false);
  }

  return (
    <div className="container min-h-screen flex justify-center p-6">
      <div className="w-full max-w-3xl flex flex-col">

        {/* HEADER */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b">
          <div>
            <div className="text-xl font-bold">
              🎓 CollegeGPT — HSIT
            </div>
            <div className="text-sm muted">
              Ask about faculty, placements, admissions.
            </div>
          </div>
          <div className="ml-auto text-green-600 text-sm">
            Status: Live
          </div>
        </div>

        {/* CHAT BOX */}
        <div className="chat-container flex-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex mb-4 ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={
                  m.role === "user"
                    ? "message user-message"
                    : "message bot-message"
                }
              >
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

                {/* SOURCE */}
                {m.source && (
                  <div className="muted mt-1">
                    {m.source === "supabase" && "📘 Database"}
                    {m.source === "llm" && "🤖 LLM"}
                    {m.source === "local-data" && "📂 Local"}
                  </div>
                )}

                {/* TIME */}
                <div className="muted mt-1">{m.time}</div>
              </div>
            </div>
          ))}

          <div ref={endRef}></div>
        </div>

        {/* INPUT */}
        <div className="mt-4">
          <div className="input-container">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask anything about your college..."
              className="input-box"
            />

            <button
              onClick={send}
              disabled={loading}
              className="send-button"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-6 text-center muted pb-4">
          ⚠️ This AI may make mistakes. Still learning from HSIT students ❤️
        </div>

      </div>
    </div>
  );
}
