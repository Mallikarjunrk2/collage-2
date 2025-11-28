import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState([
    { id: 0, role: "bot", text: "Hi — CollegeGPT ready.", time: new Date().toLocaleTimeString() }
  ]);
  const endRef = useRef();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  async function send() {
    if (!q.trim()) return;
    const user = { id: Date.now(), role: "user", text: q.trim(), time: new Date().toLocaleTimeString() };
    setMessages(m => [...m, user]);
    setQ(""); setTyping(true);

    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: user.text }) });
      const json = await res.json();
      console.log("ask ->", json);
      setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: json.answer || json.error || "No answer.", time: new Date().toLocaleTimeString() }]);
    } catch (err) {
      console.error("send error", err);
      setMessages(m => [...m, { id: Date.now()+2, role: "bot", text: "Error contacting API.", time: new Date().toLocaleTimeString() }]);
    } finally { setTyping(false); }
  }

  // image generation
  async function generateImage() {
    if (!q.trim()) { alert("Type prompt first"); return; }
    const user = { id: Date.now(), role: "user", text: q.trim(), time: new Date().toLocaleTimeString() };
    setMessages(m => [...m, user]); setQ(""); setTyping(true);

    try {
      const res = await fetch("/api/generateImage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: user.text }) });
      const json = await res.json();
      console.log("generateImage ->", json);
      if (json.image) {
        setMessages(m => [...m, { id: Date.now()+1, role: "bot", image: json.image, time: new Date().toLocaleTimeString() }]);
      } else {
        setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: json.error || "No image", time: new Date().toLocaleTimeString() }]);
      }
    } catch (err) {
      console.error("generateImage error", err);
      setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: "Image generation failed", time: new Date().toLocaleTimeString() }]);
    } finally { setTyping(false); }
  }

  // audio generation
  async function generateAudio() {
    if (!q.trim()) { alert("Type text first"); return; }
    const user = { id: Date.now(), role: "user", text: q.trim(), time: new Date().toLocaleTimeString() };
    setMessages(m => [...m, user]); setQ(""); setTyping(true);

    try {
      const res = await fetch("/api/generateAudio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: user.text }) });
      const json = await res.json();
      console.log("generateAudio ->", json);
      if (json.audio) {
        setMessages(m => [...m, { id: Date.now()+1, role: "bot", audio: json.audio, time: new Date().toLocaleTimeString() }]);
      } else {
        setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: json.error || "No audio", time: new Date().toLocaleTimeString() }]);
      }
    } catch (err) {
      console.error("generateAudio error", err);
      setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: "Audio generation failed", time: new Date().toLocaleTimeString() }]);
    } finally { setTyping(false); }
  }

  // file input handler
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(",")[1];
      setMessages(m => [...m, { id: Date.now(), role: "user", image: base64, time: new Date().toLocaleTimeString() }]);
      setTyping(true);
      try {
        const res = await fetch("/api/describeImage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: base64 }) });
        const json = await res.json();
        console.log("describeImage ->", json);
        setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: json.answer || json.error || "No description", time: new Date().toLocaleTimeString() }]);
      } catch (err) {
        console.error("describeImage error", err);
        setMessages(m => [...m, { id: Date.now()+1, role: "bot", text: "Describe failed", time: new Date().toLocaleTimeString() }]);
      } finally { setTyping(false); }
    };
    reader.readAsDataURL(file);
  }

  // mic STT
  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Voice not supported"); return; }
    const recog = new SpeechRecognition();
    recog.lang = "en-IN";
    recog.start();
    recog.onresult = (e) => setQ(e.results[0][0].transcript);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-[#161b22] p-6 rounded-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-purple-600 w-12 h-12 rounded-xl grid place-items-center text-2xl">🎓</div>
          <div>
            <div className="text-xl font-semibold">CollegeGPT Advanced</div>
            <div className="text-sm text-gray-400">Chat • Image • Voice • Vision</div>
          </div>
        </div>

        <div className="h-[60vh] overflow-y-auto p-4 bg-black/20 rounded-xl space-y-4">
          {messages.map(m => (
            <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
              {m.text && <div className="inline-block bg-slate-700 p-3 rounded-xl">{m.text}<div className="text-xs text-gray-400 mt-1">{m.time}</div></div>}
              {m.image && <img src={`data:image/png;base64,${m.image}`} className="max-w-xs rounded-xl mt-2 border border-gray-600" />}
              {m.audio && <audio controls src={`data:audio/wav;base64,${m.audio}`} className="mt-2" />}
            </div>
          ))}

          {typing && <div className="inline-block bg-slate-700 p-3 rounded-xl animate-pulse text-gray-300">• • •</div>}
          <div ref={endRef} />
        </div>

        <div className="mt-4 flex gap-3 items-center">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Type or use mic…" className="flex-1 p-3 rounded-full bg-slate-900 border border-slate-800" />
          <button onClick={send} className="px-4 py-2 bg-purple-600 rounded-full text-white">Send</button>
          <button onClick={generateImage} className="px-4 py-2 bg-blue-600 rounded-full text-white">🎨 Image</button>
          <button onClick={generateAudio} className="px-4 py-2 bg-green-600 rounded-full text-white">🔊 Voice</button>
          <button onClick={startListening} className="px-4 py-2 bg-red-600 rounded-full text-white">🎤</button>
          <label className="px-4 py-2 bg-yellow-600 rounded-full text-white cursor-pointer">
            🖼
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>
    </div>
  );
}
