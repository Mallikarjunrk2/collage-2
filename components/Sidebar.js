// components/Sidebar.js
export default function Sidebar({
  chats = [],
  onSelectChat = () => {},
  onNewChat = () => {},
  onClear = () => {},
}) {
  // ensure chats is always array
  const safeChats = Array.isArray(chats) ? chats : [];

  return (
    <div className="w-72 h-screen bg-[#0b1220] border-r border-white/6 p-4 flex flex-col text-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold">Chats</div>
        <button
          onClick={onNewChat}
          className="px-2 py-1 bg-purple-600 rounded text-xs"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-auto space-y-2 py-1">
        {safeChats.length === 0 && (
          <div className="text-gray-400 text-sm">No chats yet — start a new chat</div>
        )}

        {safeChats.map((chat, i) => {
          const title = chat?.title || `Chat ${i + 1}`;
          const first = Array.isArray(chat?.messages) && chat.messages.length > 0 ? chat.messages[0].text : "";
          return (
            <div
              key={i}
              onClick={() => onSelectChat(i)}
              className="p-3 bg-gray-800/30 rounded hover:bg-gray-800/50 cursor-pointer"
            >
              <div className="font-medium truncate">{title}</div>
              <div className="text-xs text-gray-400 truncate">{first}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <button
          onClick={onClear}
          className="w-full py-2 rounded bg-red-600 text-xs"
        >
          🗑 Clear History
        </button>
      </div>
    </div>
  );
}
