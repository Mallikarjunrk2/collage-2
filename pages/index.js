import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: "bot",
      text: "Hi 👋 I’m CollegeGPT (HSIT). Ask about faculty, placements, admissions, or generate images/voice!",
      time: new Date().toLocaleTimeString(),
    },
  ]);

  const endRef = useRef();
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // ---------------------------------------
  // NORMAL TEXT SEND
  // ---------------------------------------
  async function send() {
    if (!q.trim()) return;

    const user = {
      id: Date.now(),
      role: "user",
      text: q.trim(),
      time: new Date().toLocaleTimeString(),
    };

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
        text: json.answer || "No answer.",
        time: new Date().toLocaleTimeString(),
      };

      setMessages((m) => [...m, bot]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: Date.now(), role: "bot", text: "API error.", time: new Date().toLocaleTimeString() },
      ]);
    }

    setTyping(false);
  }

  // ---------------------------------------
  // REGENERATE ANSWER
  // ---------------------------------------
  async function regenerate(prompt) {
    setTyping(true);

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: prompt }),
    });

    const json = await res.json();

    const bot = {
      id: Date.now(),
      role: "bot",
      text: json.answer,
      time: new Date().toLocaleTimeString(),
    };

    setMessages((m) => [...m, bot]);
    setTyping(false);
  }

  // ---------------------------------------
  // IMAGE GENERATION
  // ---------------------------------------
  async function generateImage() {
    if (!q.trim()) return;

    const user = {
      id: Date.now(),
      role: "user",
      text: q.trim(),
      time: new Date().toLocaleTimeString(),
    };
    setMessages((m) => [...m, user]);
    setQ("");

    const res = await fetch("/api/generateImage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: user.text }),
    });

    const json = await res.json();

    if (json.image) {
      setMessages((m) => [
        ...m,
        { id: Date.now(), role: "bot", image: json.image, time: new Date().toLocaleTimeString() },
      ]);
    }
  }

  // ---------------------------------------
  // AUDIO GENERATION
  // ---------------------------------------
  async function generateAudio() {
    if (!q.trim()) return;

    const user = {
      id: Date.now(),
      role: "user",
      text: q.trim(),
      time: new Date().toLocaleTimeString(),
    };
    setMessages((m) => [...m, user]);
    setQ("");

    const res = await fetch("/api/generateAudio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: user.text }),
    });

    const json = await res.json();

    if (json.audio) {
      setMessages((m) => [
        ...m,
        { id: Date.now(), role: "bot", audio: json.audio, time: new Date().toLocaleTimeString() },
      ]);
    }
  }

  // ---------------------------------------
  // IMAGE UPLOAD → DESCRIPTION
  // ---------------------------------------
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(",")[1];

      setMessages((m) => [
        ...m,
        { id: Date.now(), role: "user", image: base64, time: new Date().toLocaleTimeString() },
      ]);

      const res = await fetch("/api/describeImage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });

      const json = await res.json();

      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, role: "bot", text: json.answer, time: new Date().toLocaleTimeString() },
      ]);
    };

    reader.readAsDataURL(file);
  }

  // ---------------------------------------
  // VOICE (STT)
  // ---------------------------------------
  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported");
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = "en-IN";
    recog.start();

    recog.onresult = (e) => {
      setQ(e.results[0][0].transcript);
    };
  }

  return (
    <div className="min-h-screen flex justify-center items-center p-6">
      <div className="w-full max-w-3xl bg-[#161b22] p-6 rounded-xl">

        {/* HEADER */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-600 w-12 h-12 rounded-xl grid place-items-center text-2xl">🎓</div>
          <div>
            <h1 className="text-xl font-semibold">CollegeGPT Advanced</h1>
            <p className="text-gray-400 text-sm">Chat • Images • Voice • Vision</p>
          </div>
        </div>

        {/* MESSAGES */}
        <div className="h-[60vh] overflow-y-auto space-y-4 p-3 bg-black/20 rounded-xl">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>

              {/* TEXT */}
              {m.text && (
                <div className="inline-block bg-slate-700 p-3 rounded-xl">
                  {m.text}
                  <div className="text-xs text-gray-400 mt-1">{m.time}</div>
                  {m.role === "bot" && (
                    <button
                      onClick={() => regenerate(m.text)}
                      className="block text-blue-400 text-xs mt-1"
                    >
                      Regenerate
                    </button>
                  )}
                </div>
              )}

              {/* IMAGE */}
              {m.image && (
                <img
                  src={`data:image/png;base64,${m.image}`}
                  className="max-w-xs rounded-xl border border-gray-600 mt-2"
                />
              )}

              {/* AUDIO */}
              {m.audio && (
                <audio
                  controls
                  src={`data:audio/wav;base64,${m.audio}`}
                  className="mt-2"
                />
              )}

            </div>
          ))}

          {/* TYPING INDICATOR */}
          {typing && (
            <div className="text-left">
              <div className="inline-block bg-slate-700 p-3 rounded-xl animate-pulse text-gray-300">
                • • •
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* INPUT AREA */}
        <div className="mt-4 flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type or use mic…"
            className="flex-1 p-3 rounded-full bg-slate-900 border border-slate-800"
          />

          <button onClick={send} className="px-4 py-2 bg-purple-600 rounded-full text-white">
            Send
          </button>

          <button onClick={generateImage} className="px-4 py-2 bg-blue-600 rounded-full text-white">
            🎨
          </button>

          <button onClick={generateAudio} className="px-4 py-2 bg-green-600 rounded-full text-white">
            🔊
          </button>

          <button onClick={startListening} className="px-4 py-2 bg-red-600 rounded-full text-white">
            🎤
          </button>

          <label className="px-4 py-2 bg-yellow-600 rounded-full text-white cursor-pointer">
            🖼
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>

      </div>
    </div>
  );
}
