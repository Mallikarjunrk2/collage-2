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

  // send text question
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
        time: new Date().toLocaleTimeString(),
      };

      setMessages((m) => [...m, bot]);
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now() + 2, role: "bot", text: "Error contacting API.", source: "error", time: new Date().toLocaleTimeString() }]);
    } finally {
      setTyping(false);
    }
  }

  // regenerate answer for given text (re-ask)
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
        time: new Date().toLocaleTimeString(),
      };
      setMessages((m) => [...m, bot]);
    } catch {
      setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "Regenerate failed.", source: "error", time: new Date().toLocaleTimeString() }]);
    } finally {
      setTyping(false);
    }
  }

  // handle image upload and describe
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(",")[1];

      // show user's uploaded image
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
          time: new Date().toLocaleTimeString(),
        };
        setMessages((m) => [...m, bot]);
      } catch (err) {
        setMessages((m) => [...m, { id: Date.now(), role: "bot", text: "Describe failed.", source: "error", time: new Date().toLocaleTimeString() }]);
      } finally {
        setTyping(false);
      }
    };
    reader.readAsDataURL(file);
    // reset input so same file can be reselected later
    e.target.value = "";
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-[#161b22] p-6 rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-600 w-12 h-12 rounded-xl grid place-items-center text-2xl">🎓</div>
          <div>
            <div className="text-xl font-semibold">CollegeGPT — HSIT</div>
            <div className="text-sm text-gray-400">Ask about faculty, placements, or upload an image to describe</div>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[56vh] overflow-auto p-4 rounded-lg bg-gradient-to-b from-transparent to-black/10 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
              {/* text block */}
              {m.text && (
                <div className={`inline-block p-3 rounded-xl ${m.role === "user" ? "bg-purple-700" : "bg-slate-700"}`}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

                  {/* source badge for bot messages */}
                  {m.role === "bot" && (
                    <div className="mt-2 flex items-center gap-2">
                      {m.source === "supabase" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-green-700/30 rounded-full text-green-200">Database</span>
                      ) : m.source === "vision" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-yellow-700/30 rounded-full text-yellow-200">Vision</span>
                      ) : m.source === "llm" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-700/30 rounded-full text-blue-200">LLM</span>
                      ) : m.source === "system" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-gray-700/30 rounded-full text-gray-200">System</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-red-700/20 rounded-full text-red-200">Error</span>
                      )}

                      {/* regenerate button for bot messages */}
                      <button onClick={() => regenerate(m.text)} className="text-xs text-blue-300 ml-2 hover:underline">Regenerate</button>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">{m.time}</div>
                </div>
              )}

              {/* image preview if uploaded */}
              {m.image && <img src={`data:image/png;base64,${m.image}`} alt="uploaded" className="max-w-xs rounded-xl mt-2 border border-gray-600" />}
            </div>
          ))}

          {/* typing indicator */}
          {typing && (
            <div className="text-left">
              <div className="inline-block px-4 py-2 rounded-xl bg-slate-700 animate-pulse text-gray-300">• • •</div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* input area */}
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
