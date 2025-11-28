// components/Sidebar.js
export default function Sidebar({ chats, onSelectChat, onNewChat, onClear }) {
  return (
    <div className="w-64 h-screen bg-[#111827] border-r border-gray-800 p-4 flex flex-col text-gray-200">
      
      <button
        onClick={onNewChat}
        className="w-full mb-4 py-2 rounded-lg bg-purple-600 text-white text-sm"
      >
        ➕ New Chat
      </button>

      <div className="flex-1 overflow-auto space-y-2">
        {chats.length === 0 && (
          <div className="text-gray-500 text-sm">No history yet</div>
        )}

        {chats.map((chat, i) => (
          <div
            key={i}
            onClick={() => onSelectChat(i)}
            className="p-3 bg-gray-800/40 rounded-lg cursor-pointer hover:bg-gray-700/40 text-sm"
          >
            <div className="font-medium truncate">{chat.title}</div>
            <div className="text-xs truncate text-gray-400">
              {chat.messages[0]?.text}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onClear}
        className="mt-4 w-full py-2 rounded-lg bg-red-600 text-white text-sm"
      >
        🗑 Clear History
      </button>
    </div>
  );
}
