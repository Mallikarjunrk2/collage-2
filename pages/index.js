// pages/index.js
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  // Auto scroll on new messages
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

  // Image Upload Describe: compress client-side and send to /api/describeImage_alt
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    // convert File -> compressed dataURL
    const toDataURL = (file, maxWidth = 1200, quality = 0.7) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
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
      // 1) compress the image
      const dataUrl = await toDataURL(file, 1200, 0.75);

      // 2) show the image as a user message (preview in chat)
      const userImageMsg = {
        id: Date.now(),
        role: "user",
        text: null,
        image: dataUrl,
        filename: file.name || "photo.jpg",
        time: new Date().toLocaleTimeString(),
      };
      setMessages((m) => [...m, userImageMsg]);

      // 3) send to describe endpoint (alt uses Gemini inlineData or fallback)
      const payload = { image: dataUrl, filename: file.name || "photo.jpg" };

      let resp = await fetch("/api/describeImage_alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

      // fallback to original describeImage if alt not present
      if (!resp || !resp.ok) {
        resp = await fetch("/api/describeImage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => null);
      }

      if (resp && resp.ok) {
        const j = await resp.json();
        const botMsg = {
          id: Date.now() + 1,
          role: "bot",
          text: j.answer || j.note || j.error || "Image described.",
          source: j.source || "vision",
          time: new Date().toLocaleTimeString(),
        };
        setMessages((m) => [...m, botMsg]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: Date.now() + 1,
            role: "bot",
            text: "⚠️ Image description failed",
            source: "vision-error",
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }
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
    <div className="min-h-screen bg-[#071024] text-white flex justify-center p-6">
      <div className="w-full max-w-4xl flex flex-col">

        {/* Hero / Headline (replacement header) */}
        <div className="hero-wrapper mb-6">
          <div className="hero-inner">
            <div className="hero-top">
              <div className="brand">🎓 CollegeGPT — <span className="brand-sub">HSIT</span></div>
              <div className="cta-row">
                <button className="cta-primary">Enroll now for $499</button>
              </div>
            </div>

            <h1 className="hero-title">
              Master prompt engineering for your college projects — <span className="accent">Supercharge your workflow</span>
            </h1>

            <p className="hero-sub">
              Ask about faculty, placements, admissions, or upload an image to get a short, friendly summary.
            </p>

            <div className="hero-input">
              <div className="hero-input-left">
                <button className="icon-btn">+</button>
                <button className="icon-btn">⚙️</button>
                <span className="tools-label">Tools</span>
              </div>

              <input
                placeholder="Summarize meeting notes or upload a screenshot…"
                className="hero-search"
                onKeyDown={(e) => e.key === "Enter" && send()}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <div className="hero-input-right">
                <button onClick={send} className="send-btn-hero" disabled={loading}>{loading ? "…" : "Send"}</button>
                <label className="upload-hero">
                  📷
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Window */}
        <div className="flex-1 overflow-auto bg-[#0f1720] p-4 rounded-xl border border-white/6 min-h-[55vh]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`mb-5 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xl p-3 rounded-xl ${m.role === "user" ? "bg-purple-700" : "bg-gray-800 border border-white/10"}`}
                style={{ wordBreak: "break-word" }}
              >
                {/* image preview for messages that include one */}
                {m.image ? (
                  <div className="mb-2">
                    <img
                      src={m.image}
                      alt={m.filename || "uploaded image"}
                      style={{ maxWidth: "520px", width: "100%", borderRadius: 12, display: "block" }}
                    />
                    {/* optional filename line */}
                    {m.filename ? <div className="text-xs text-gray-400 mt-1">{m.filename}</div> : null}
                  </div>
                ) : null}

                {/* message text */}
                {m.text ? <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div> : null}

                {/* source label */}
                {m.source && (
                  <div className="mt-1 text-xs text-gray-400">
                    {m.source === "supabase" && "📘 Database"}
                    {m.source === "llm" && "🤖 LLM"}
                    {m.source === "vision" && "🖼 Vision"}
                    {m.source === "vision-error" && "⚠️ Vision Error"}
                    {m.source === "gemini-vision" && "🖼 Gemini"}
                    {m.source === "openai" && "🧠 OpenAI"}
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-1">{m.time}</div>
              </div>
            </div>
          ))}

          <div ref={endRef}></div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-xs pb-4 opacity-80">
          ⚠️ This AI may make mistakes. Still learning from HSIT students ❤️
        </div>
      </div>
    </div>
  );
}
