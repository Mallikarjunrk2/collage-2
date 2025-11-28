import { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";

export default function Home() {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore history on load
  useEffect(() => {
    const saved = localStorage.getItem("cgpt-hist");
    if (saved) setMessages(JSON.parse(saved));
  }, []);

  // Save on every update
  useEffect(() => {
    localStorage.setItem("cgpt-hist", JSON.stringify(messages));
  }, [messages]);

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
      const bot = {
        id: Date.now() + 1,
        role: "bot",
        text: json.answer || "No answer.",
        source: json.source || "",
      };

      setMessages((m) => [...m, bot]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: Date.now() + 2, role: "bot", text: "Error contacting API." },
      ]);
    }

    setLoading(false);
  }

  // Image upload → describe
  async function handleImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    // We send to our endpoint
    const res = await fetch("/api/describeImage", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();

    setMessages((m) => [
      ...m,
      {
        id: Date.now(),
        role: "bot",
        text: json.answer || "Could not describe the image",
        source: "image-vision",
      },
    ]);

    setLoading(false);
  }

  return (
    <div className="flex h-screen bg-[#0b0f17] text-white">
      <Sidebar messages={messages} setMessages={setMessages} />

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col p-6">

        {/* HEADER WITH LOGO */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
          <img
            src="/hsit-logo.png"
            alt="HSIT Logo"
            className="w-12 h-12 rounded-lg object-cover border border-white/20"
          />
          <div>
            <div className="text-xl font-bold">CollegeGPT — HSIT</div>
            <div className="text-sm text-gray-400">
              Ask about faculty, placements, admissions or upload image
            </div>
          </div>
          <div className="ml-auto text-green-400 text-sm">Status: Live</div>
        </div>

        {/* MESSAGE WINDOW */}
        <div className="flex-1 overflow-auto pr-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`mb-5 flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-lg p-3 rounded-xl text-sm ${
                  m.role === "user"
                    ? "bg-purple-700"
                    : "bg-gray-800 border border-white/10"
                }`}
              >
                {m.text}

                {m.source && (
                  <div className="mt-2 text-[10px] opacity-70">
                    {m.source === "supabase" && (
                      <span className="px-2 py-1 bg-green-800 rounded text-[10px]">
                        Database
                      </span>
                    )}
                    {m.source === "llm" && (
                      <span className="px-2 py-1 bg-blue-800 rounded text-[10px]">
                        LLM
                      </span>
                    )}
                    {m.source === "image-vision" && (
                      <span className="px-2 py-1 bg-yellow-700 rounded text-[10px]">
                        Vision
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* INPUT AREA */}
        <div className="flex items-center gap-3 mt-4">

          {/* TEXT BOX */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type your question… (e.g., Who teaches OS?)"
            className="flex-1 p-3 rounded-full bg-[#111827] border border-white/10 outline-none"
          />

          {/* IMAGE UPLOAD */}
          <label className="cursor-pointer bg-yellow-600 px-4 py-2 rounded-full text-sm">
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImage}
            />
          </label>

          {/* SEND BUTTON */}
          <button
            onClick={send}
            disabled={loading}
            className="px-5 py-2 rounded-full bg-purple-600 disabled:opacity-40"
          >
            {loading ? "…" : "Send"}
          </button>
        </div>

        {/* FOOTER */}
        <div className="mt-6 text-center text-gray-500 text-xs pb-4 opacity-80">
          ⚠️ This AI may make mistakes. Still under training by HSIT students ❤️
        </div>
      </div>
    </div>
  );
}
