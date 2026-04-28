import { useState, useEffect, useRef } from "react";

const SUGGESTIONS = [
  { icon: "🎓", text: "hsit president" },
  { icon: "👤", text: "tech staff?" },
  { icon: "📚", text: "office staff details" },
  { icon: "📋", text: "How do I apply for admission?" },
];

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const question = (text || q).trim();
    if (!question) return;

    const userMsg = {
      id: Date.now(),
      role: "user",
      text: question,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((m) => [...m, userMsg]);
    setQ("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const json = await res.json();

      const botMsg = {
        id: Date.now() + 1,
        role: "bot",
        text: json.answer,
        source: json.source,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((m) => [...m, botMsg]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: "bot",
          text: "⚠️ Error contacting API. Please try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }

    setLoading(false);
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="container min-h-screen flex justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl flex flex-col">

        {/* ── HEADER ── */}
        <header className="flex items-center gap-3 mb-5 pb-4 border-b border-orange-100">
          <div className="logo-icon">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l1.5 4.5H18l-3.75 2.7 1.5 4.5L12 11.1l-3.75 2.6 1.5-4.5L6 6.5h4.5z"/>
              <circle cx="12" cy="17" r="3" opacity=".5"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
              HSIT <span className="text-orange-500">GPT</span>
            </h1>
            <p className="muted">Ask about faculty, placements, admissions.</p>
          </div>

          <div className="ml-auto">
            <a href="https://hsit-gpt-hub.vercel.app/#features" target="_blank" rel="noopener noreferrer">
              <button className="px-4 py-2 rounded-full text-white text-sm font-semibold
                bg-gradient-to-r from-orange-400 to-orange-500
                hover:opacity-90 transition shadow-sm">
                How it works?
              </button>
            </a>
          </div>
        </header>

        {/* ── CHAT BOX ── */}
        <div className="chat-container flex-1">

          {/* Empty state */}
          {isEmpty && (
            <div className="h-full flex flex-col items-center justify-center gap-5 py-6">
              <div className="logo-icon w-16 h-16 rounded-2xl" style={{ width: 64, height: 64, borderRadius: 20 }}>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.091z"/>
                </svg>
              </div>

              <div className="text-center">
                <h2 style={{ fontFamily: 'Sora, sans-serif' }} className="text-xl font-bold text-stone-800">
                  How can I help you today?
                </h2>
                <p className="muted mt-1">Pick a suggestion or type your question below.</p>
              </div>

              {/* Suggestion chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    className="chip text-left"
                    onClick={() => send(s.text)}
                  >
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-sm font-medium text-stone-700">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex mb-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`message ${m.role === "user" ? "user-message" : "bot-message"}`}>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

                {m.source && (
                  <div className="muted mt-1.5">
                    {m.source === "supabase" && "📘 Database"}
                    {m.source === "llm" && "🤖 LLM"}
                    {m.source === "local-data" && "📂 Local"}
                  </div>
                )}

                <div className="muted mt-1">{m.time}</div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start mb-3">
              <div className="bot-message message flex items-center gap-1.5">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* ── INPUT ── */}
        <div className="mt-4">
          <div className="input-container">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && send()}
              placeholder="Ask anything about your college..."
              className="input-box"
            />
            <button onClick={() => send()} disabled={loading} className="send-button">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
              </svg>
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="mt-5 text-center muted pb-4">
          ⚠️ HSIT GPT may make mistakes. Always verify important info. Powered by Gemini AI ❤️
        </div>

      </div>
    </div>
  );
}
