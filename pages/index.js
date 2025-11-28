// pages/index.js
import { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";

export default function Home() {
  const [history, setHistory] = useState([]); // array of { title, messages: [] }
  const [activeIndex, setActiveIndex] = useState(null); // index into history
  const [messages, setMessages] = useState([]); // current chat messages
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  // Load history from localStorage on client only
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("cgpt_history_all");
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistory(parsed);
          setActiveIndex(0);
          setMessages(Array.isArray(parsed[0].messages) ? parsed[0].messages : []);
        } else {
          // create one empty chat so UI isn't empty
          const initial = [{ title: "New Chat", messages: [] }];
          setHistory(initial);
          setActiveIndex(0);
          setMessages([]);
          localStorage.setItem("cgpt_history_all", JSON.stringify(initial));
        }
      }
    } catch (err) {
      console.warn("Failed to load saved history:", err);
      const initial = [{ title: "New Chat", messages: [] }];
      setHistory(initial);
      setActiveIndex(0);
      setMessages([]);
      try { localStorage.setItem("cgpt_history_all", JSON.stringify(initial)); } catch {}
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("cgpt_history_all", JSON.stringify(history));
      }
    } catch (err) {
      console.warn("Failed to save history:", err);
    }
  }, [history]);

  // auto-scroll on messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Utility: persist current messages into history at activeIndex
  function persistCurrentChat(msgs) {
    const safeMsgs = Array.isArray(msgs) ? msgs : [];
    const updated = Array.isArray(history) ? [...history] : [];
    const title = safeMsgs[0]?.text?.slice(0, 30) || (updated[activeIndex]?.title || "New Chat");
    updated[activeIndex] = { title, messages: safeMsgs };
    setHistory(updated);
  }

  // New chat
  function newChat() {
    const updated = Array.isArray(history) ? [...history] : [];
    updated.push({ title: "New Chat", messages: [] });
    setHistory(updated);
    setActiveIndex(updated.length - 1);
    setMessages([]);
  }

  // Load chat from sidebar
  function loadChat(idx) {
    if (!Array.isArray(history) || !history[idx]) return;
    setActiveIndex(idx);
    setMessages(Array.isArray(history[idx].messages) ? history[idx].messages : []);
  }

  // Clear everything
  function clearHistory() {
    setHistory([]);
    setActiveIndex(null);
    setMessages([]);
    try { localStorage.removeItem("cgpt_history_all"); } catch {}
  }

  // send question
  async function send() {
    const text = (q || "").trim();
    if (!text) return;

    const userMsg = { id: Date.now(), role: "user", text, time: new Date().toLocaleTimeString() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setQ("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();
      const botMsg = {
        id: Date.now() + 1,
        role: "bot",
        text: json?.answer || json?.error || "No answer.",
        source: json?.source || "llm",
        time: new Date().toLocaleTimeString(),
      };
      const updated = [...nextMessages, botMsg];
      setMessages(updated);

      // ensure history has this chat
      if (activeIndex === null) {
        const newHist = Array.isArray(history) ? [...history, { title: "Chat", messages: updated }] : [{ title: "Chat", messages: updated }];
        setHistory(newHist);
        setActiveIndex(newHist.length - 1);
      } else {
        persistCurrentChat(updated);
      }
    } catch (err) {
      console.error("ask error", err);
      const botMsg = { id: Date.now() + 2, role: "bot", text: "Error contacting API.", source: "error", time: new Date().toLocaleTimeString() };
      const updated = [...messages, botMsg];
      setMessages(updated);
      if (activeIndex !== null) persistCurrentChat(updated);
    } finally {
      setLoading(false);
    }
  }

  // IMAGE upload handler: tries /api/describeImage then /api/generateImage
  async function handleImageUpload(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setLoading(true);

    // convert to base64 only if backend expects; here we try multipart/form-data request
    const form = new FormData();
    form.append("file", file);

    // helper to POST and parse JSON safely
    async function tryPost(url) {
      try {
        const r = await fetch(url, { method: "POST", body: form });
        if (!r.ok) {
          return { ok: false, status: r.status, text: await r.text().catch(() => "") };
        }
        const j = await r.json().catch(() => null);
        return { ok: true, json: j };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }

    // try both endpoints
    let result = await tryPost("/api/describeImage");
    if (!result.ok) result = await tryPost("/api/generateImage");

    if (result.ok && result.json) {
      const botMsg = { id: Date.now(), role: "bot", text: result.json.answer || "Image described.", source: "vision", time: new Date().toLocaleTimeString() };
      const updated = [...messages, botMsg];
      setMessages(updated);
      if (activeIndex === null) {
        const newHist = Array.isArray(history) ? [...history, { title: "Image", messages: updated }] : [{ title: "Image", messages: updated }];
        setHistory(newHist);
        setActiveIndex(newHist.length - 1);
      } else {
        persistCurrentChat(updated);
      }
    } else {
      const botMsg = { id: Date.now(), role: "bot", text: `Image API failed (${result.status || result.error || "unknown"})`, source: "vision-error", time: new Date().toLocaleTimeString() };
      const updated = [...messages, botMsg];
      setMessages(updated);
      if (activeIndex !== null) persistCurrentChat(updated);
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen bg-[#0b1220] text-white">
      <Sidebar
        chats={history}
        onSelectChat={loadChat}
        onNewChat={newChat}
        onClear={clearHistory}
      />

      <div className="flex-1 p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/6">
          <img src="/hsit-logo.png" alt="HSIT Logo" className="w-12 h-12 rounded object-cover border border-white/6" />
          <div>
            <div className="text-xl font-bold">🎓 CollegeGPT — HSIT</div>
            <div className="text-sm text-gray-400">Ask about faculty, placements, admissions or upload an image to describe it.</div>
          </div>
          <div className="ml-auto text-green-400 text-sm">Status: Live</div>
        </div>

        {/* Message area */}
        <div className="flex-1 overflow-auto pr-3">
          {(Array.isArray(messages) ? messages : []).map((m) => (
            <div key={m.id} className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-3xl p-3 rounded-xl text-sm ${m.role === "user" ? "bg-purple-700" : "bg-gray-800 border border-white/5"}`}>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                <div className="mt-2 text-xs text-gray-300">
                  {m.source === "supabase" && "📘 Database"}
                  {m.source === "llm" && "🤖 LLM"}
                  {m.source === "vision" && "🖼 Vision"}
                  {m.source === "vision-error" && "⚠️ Vision error"}
                </div>
                <div className="text-xs mt-1 text-gray-500">{m.time}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input row */}
        <div className="mt-4 flex items-center gap-3">
          <label className="cursor-pointer bg-yellow-600 px-4 py-2 rounded-full text-sm">
            📷 Image
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type your question... (e.g., Who teaches Operating Systems?)"
            className="flex-1 p-3 rounded-full bg-gray-900 border border-white/6 outline-none"
          />

          <button onClick={send} disabled={loading} className="px-5 py-2 rounded-full bg-purple-600 disabled:opacity-60">
            {loading ? "..." : "Send"}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-xs pb-4 opacity-80">
          ⚠️ This AI may make mistakes. Still learning from HSIT students ❤️
        </div>
      </div>
    </div>
  );
}
