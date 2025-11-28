import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [q, setQ] = useState("");
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: "bot",
      text: "Hi 👋 I’m CollegeGPT (HSIT). Ask about faculty, placements, admissions, or upload an image to describe.",
      time: new Date().toLocaleTimeString(),
      source: "system",
    },
  ]);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  async function send() {
    if (!q.trim()) return;
    const user = { id: Date.now(), role: "user", text: q.trim(), time: new Date().toLocaleTimeString() };
    setMessages((m) => [...m, user]);
    setQ("");
    setTyping(true);

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
        text: json.answer || json.error || "No answer.",
        source: json.source || "llm",
        matched_alias: json.matched_alias || null,
        time: new Date().toLocaleTimeString(),
      };

      setMessages((m) => [...m, bot]);
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now() + 2, role: "bot", text: "Error contacting API.", source: "error", time: new Date().toLocaleTimeString() }]);
    } finally {
      setTyping(false);
    }
  }

  // regenerate: re-ask prompt (sends bot.text to API)
  async function regenerate(promptText) {
    if (!promptText) return;
    setTyping(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: promptText }),
      });
      const json = await res.json();
      const bot = {
        id: Date.now(),
        role: "bot",
        text: json.answer || json.error || "No answer.",
        source: json.source || "llm",
        matched_alias: json.matched_alias || null,
        time: new Date().toLocaleTimeString(),
      };
      setMessages((m) => [...m, bot]);
    } catch {
      setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "Regenerate failed.", source: "error", time: new Date().toLocaleTimeString() }]);
    } finally {
      setTyping(false);
    }
  }

  // image describe (uploads base64 to describeImage API)
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(",")[1];
      // show image
      setMessages((m) => [...m, { id: Date.now(), role: "user", image: base64, time: new Date().toLocaleTimeString() }]);

      setTyping(true);
      try {
        const res = await fetch("/api/describeImage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        const json = await res.json();
        const bot = {
          id: Date.now() + 1,
          role: "bot",
          text: json.answer || json.error || "No description.",
          source: json.source || "vision",
          matched_alias: json.matched_alias || null,
          time: new Date().toLocaleTimeString(),
        };
        setMessages((m) => [...m, bot]);
      } catch {
        setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "Describe failed.", source: "error", time: new Date().toLocaleTimeString() }]);
      } finally {
        setTyping(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-[#0f1724] p-6 rounded-xl shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-600 w-12 h-12 rounded-xl grid place-items-center text-2xl">🎓</div>
          <div>
            <div className="text-xl font-semibold">CollegeGPT — HSIT</div>
            <div className="text-sm text-gray-400">Ask about faculty, placements, or upload an image to describe</div>
          </div>
          <div className="ml-auto text-sm text-green-400">Status: Live</div>
        </div>

        <div className="h-[56vh] overflow-auto p-4 rounded-lg bg-gradient-to-b from-transparent to-black/10 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
              {m.text && (
                <div className={`inline-block p-3 rounded-xl ${m.role === "user" ? "bg-purple-700" : "bg-slate-700"}`}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

                  {/* source badge + matched alias */}
                  {m.role === "bot" && (
                    <div className="mt-2 flex items-center gap-2">
                      {m.source === "supabase" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-green-700/30 rounded-full text-green-200">Database</span>
                      ) : m.source === "vision" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-yellow-700/30 rounded-full text-yellow-200">Vision</span>
                      ) : m.source === "llm" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-700/30 rounded-full text-blue-200">LLM</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-red-700/20 rounded-full text-red-200">Error</span>
                      )}

                      {m.matched_alias && (
                        <span className="text-[10px] px-2 py-0.5 bg-gray-700/30 rounded-full text-gray-200">alias: {m.matched_alias}</span>
                      )}

                      <button onClick={() => regenerate(m.text)} className="text-xs text-blue-300 ml-2 hover:underline">Regenerate</button>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">{m.time}</div>
                </div>
              )}

              {m.image && <img src={`data:image/png;base64,${m.image}`} alt="uploaded" className="max-w-xs rounded-xl mt-2 border border-gray-600" />}
            </div>
          ))}

          {typing && (
            <div className="text-left">
              <div className="inline-block px-4 py-2 rounded-xl bg-slate-700 animate-pulse text-gray-300">• • •</div>
            </div>
          )}

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

          <button onClick={send} className="px-4 py-2 rounded-full bg-purple-600 text-white">Send</button>

          <label className="px-4 py-2 rounded-full bg-yellow-600 text-white cursor-pointer">
            🖼 Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>
    </div>
  );
}
