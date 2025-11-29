// pages/index.js
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send question to API
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
        { id: Date.now(), role: "bot", text: "Error contacting API." },
      ]);
    }

    setLoading(false);
  }

  // Image Upload Describe (compressed client-side -> JSON POST to /api/describeImage_alt)
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    // helper: convert File -> compressed dataURL
    const toDataURL = (file, maxWidth = 1200, quality = 0.7) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            // compute target size
            const scale = Math.min(1, maxWidth / img.width);
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            try {
              const dataUrl = canvas.toDataURL("image/jpeg", quality);
              resolve(dataUrl);
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = () => reject(new Error("Image load failed"));
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });

    try {
      const dataUrl = await toDataURL(file, 1200, 0.7); // resize + compress
      const payload = { image: dataUrl, filename: file.name || "photo.jpg" };

      // POST JSON to alt endpoint (no extra server deps)
      const resp = await fetch("/api/describeImage_alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        // fallback: try original describeImage endpoint if alt fails
        try {
          const fallbackResp = await fetch("/api/describeImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (fallbackResp && fallbackResp.ok) {
            const jf = await fallbackResp.json();
            setMessages((m) => [
              ...m,
              {
                id: Date.now(),
                role: "bot",
                text: jf.answer || "Image described.",
                source: jf.source || "vision",
                time: new Date().toLocaleTimeString(),
              },
            ]);
            setLoading(false);
            return;
          }
        } catch (e) {
          // ignore fallback error, we'll show generic failure below
        }

        // If we reached here, both endpoints failed
        setMessages((m) => [
          ...m,
          {
            id: Date.now(),
            role: "bot",
            text: "⚠️ Image description failed",
            source: "vision-error",
            time: new Date().toLocaleTimeString(),
          },
        ]);
        setLoading(false);
        return;
      }

      const j = await resp.json();
      const botMsg = {
        id: Date.now(),
        role: "bot",
        text: j.answer || j.error || "Image described.",
        source: j.source || "vision",
        time: new Date().toLocaleTimeString(),
      };
      setMessages((m) => [...m, botMsg]);
    } catch (err) {
      console.error("handleImageUpload error", err);
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: "bot",
          text: "⚠️ Image description failed",
          source: "vision-error",
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white flex justify-center p-6">
      <div className="w-full max-w-3xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
          
          <div>
            <div className="text-xl font-bold">🎓 CollegeGPT — HSIT</div>
            <div className="text-sm text-gray-400">
              Ask about faculty, placements, admissions or upload an image.
            </div>
          </div>
          <div className="ml-auto text-green-400 text-sm">Status: Live</div>
        </div>

        {/* Chat Window */}
        <div className="flex-1 overflow-auto bg-[#111827] p-4 rounded-xl border border-white/10 min-h-[60vh]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`mb-5 flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xl p-3 rounded-xl ${
                  m.role === "user"
                    ? "bg-purple-700"
                    : "bg-gray-800 border border-white/10"
                }`}
              >
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

                {m.source && (
                  <div className="mt-1 text-xs text-gray-400">
                    {m.source === "supabase" && "📘 Database"}
                    {m.source === "llm" && "🤖 LLM"}
                    {m.source === "vision" && "🖼 Vision"}
                    {m.source === "vision-error" && "⚠️ Vision Error"}
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-1">{m.time}</div>
              </div>
            </div>
          ))}
          <div ref={endRef}></div>
        </div>

        {/* Input Area */}
        <div className="mt-4 flex items-center gap-3">

          {/* Image Upload */}
          <label className="cursor-pointer bg-yellow-600 px-4 py-2 rounded-full text-sm">
            📷 Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </label>

          {/* Text Input */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            className="flex-1 p-3 rounded-full bg-gray-900 border border-white/10 outline-none"
          />

          {/* Send */}
          <button
            onClick={send}
            disabled={loading}
            className="px-5 py-2 rounded-full bg-purple-600 disabled:opacity-40"
          >
            {loading ? "…" : "Send"}
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
