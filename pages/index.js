import { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";

export default function Home() {
  // Chat messages for active chat
  const [messages, setMessages] = useState([]);

  // All chat histories
  const [history, setHistory] = useState([]);

  // Selected chat index
  const [activeChatIndex, setActiveChatIndex] = useState(null);

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  /* -------------------------------
     Load history on first load
  --------------------------------*/
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("cgpt_history_all")) || [];
    setHistory(saved);
  }, []);

  /* -------------------------------
     Auto scroll chat
  --------------------------------*/
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* -------------------------------
     Save history whenever updated
  --------------------------------*/
  useEffect(() => {
    localStorage.setItem("cgpt_history_all", JSON.stringify(history));
  }, [history]);

  /* -------------------------------
     Send message
  --------------------------------*/
  async function send() {
    if (!q.trim()) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      text: q.trim(),
      time: new Date().toLocaleTimeString(),
    };

    setMessages((m) => [...m, userMessage]);
    setQ("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: userMessage.text }),
      });

      const json = await res.json();

      const botMessage = {
        id: Date.now() + 1,
        role: "bot",
        text: json.answer || json.error || "No answer",
        source: json.source || "llm",
        alias: json.alias || null,
        time: new Date().toLocaleTimeString(),
      };

      const updatedMessages = [...messages, userMessage, botMessage];

      setMessages(updatedMessages);

      // Store this chat in history
      saveChatToHistory(updatedMessages);
    } finally {
      setLoading(false);
    }
  }

  /* -------------------------------
     Save current chat into history
  --------------------------------*/
  function saveChatToHistory(chatMessages) {
    const title =
      chatMessages[0]?.text?.slice(0, 25) || "New Chat";

    const newHistory = [...history];
    newHistory[activeChatIndex] = {
      title,
      messages: chatMessages,
    };

    setHistory(newHistory);
  }

  /* -------------------------------
     New Chat
  --------------------------------*/
  function newChat() {
    const newChatData = { title: "New Chat", messages: [] };
    const newHistory = [...history, newChatData];

    setHistory(newHistory);
    setActiveChatIndex(newHistory.length - 1);
    setMessages([]);
  }

  /* -------------------------------
     Select Chat From Sidebar
  --------------------------------*/
  function loadChat(index) {
    setActiveChatIndex(index);
    setMessages(history[index].messages);
  }

  /* -------------------------------
     Clear all chats
  --------------------------------*/
  function clearHistory() {
    setHistory([]);
    setMessages([]);
    setActiveChatIndex(null);
    localStorage.removeItem("cgpt_history_all");
  }

  /* -------------------------------
     If no chat selected, auto-create
  --------------------------------*/
  useEffect(() => {
    if (activeChatIndex === null && history.length > 0) {
      setActiveChatIndex(0);
      setMessages(history[0].messages);
    }
  }, [history]);

  /* -------------------------------
     UI
  --------------------------------*/
  return (
    <div className="flex min-h-screen bg-[#0f1724] text-white">

      {/* Sidebar */}
      <Sidebar
        chats={history}
        onSelectChat={loadChat}
        onNewChat={newChat}
        onClear={clearHistory}
      />

      {/* Chat Window */}
      <div className="flex-1 p-6 flex flex-col">
        <div className="flex-1 overflow-auto space-y-4 p-4 bg-[#111827] rounded-xl">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "text-right" : "text-left"}
            >
              <div
                className={`inline-block max-w-xl p-3 rounded-lg ${
                  m.role === "user" ? "bg-purple-600" : "bg-gray-700"
                }`}
              >
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

                {/* Source badges */}
                {m.role === "bot" && (
                  <div className="mt-1 text-xs text-gray-300">
                    {m.source === "supabase" && "📘 Database"}
                    {m.source === "llm" && "🤖 LLM"}
                    {m.source === "vision" && "🖼 Vision"}
                  </div>
                )}

                <div className="text-xs mt-1 text-gray-400">{m.time}</div>
              </div>
            </div>
          ))}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="mt-4 flex items-center gap-3">
          <input
            className="flex-1 p-3 bg-gray-800 rounded-full outline-none border border-gray-700"
            placeholder="Ask something..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />

          <button
            onClick={send}
            disabled={loading}
            className="px-5 py-2 rounded-full bg-purple-600"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
