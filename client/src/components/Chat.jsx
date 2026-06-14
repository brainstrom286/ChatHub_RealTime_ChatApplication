import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

// HTTP calls use relative URLs so Vite proxy handles them in dev,
// and the full SERVER_URL is used in production builds.
const API =
  import.meta.env.DEV ? "" : SERVER_URL;

const socket = io(SERVER_URL, { transports: ["websocket"] });

// ── helpers ──────────────────────────────────────────────────────────────────

function isImage(fileType) {
  return fileType && fileType.startsWith("image/");
}

function FileMessage({ fileUrl, fileName, fileType }) {
  if (isImage(fileType)) {
    return (
      <a href={fileUrl} target="_blank" rel="noreferrer">
        <img
          src={fileUrl}
          alt={fileName}
          className="max-w-[220px] rounded-xl object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 underline underline-offset-2 text-sm"
    >
      <span>📎</span>
      <span className="truncate max-w-[180px]">{fileName}</span>
    </a>
  );
}

// ── main component ────────────────────────────────────────────────────────────

function Chat() {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [mode, setMode] = useState("create"); // "create" | "join"
  const [lobbyError, setLobbyError] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [roomUsers, setRoomUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("chathub-theme") || "dark";
  });

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const usernameRef = useRef("");
  const roomRef = useRef("");
  const fileInputRef = useRef(null);

  const notificationSound = useRef(
    new Audio("https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3")
  );

  const isDark = theme === "dark";

  const t = useMemo(
    () =>
      isDark
        ? {
            app: "bg-slate-950 text-slate-100",
            panel: "bg-slate-900/95",
            panelSoft: "bg-slate-900/80",
            border: "border-slate-800",
            text: "text-slate-100",
            muted: "text-slate-400",
            input: "bg-gray-700 border border-gray-600 text-slate-100 placeholder:text-slate-400",
            bubbleMine: "bg-indigo-500 text-white",
            bubbleOther: "bg-slate-800 text-slate-100",
            bubbleSystem: "bg-emerald-600 text-white",
            chip: "bg-slate-800 text-slate-200",
            subtleButton: "bg-slate-800 hover:bg-slate-700 text-slate-100",
            dangerButton: "bg-stone-600 hover:bg-stone-700 text-white",
            pageBg: "bg-slate-950",
            cardShadow: "shadow-2xl shadow-black/30",
            tab: "bg-slate-800 text-slate-400",
            tabActive: "bg-indigo-500 text-white",
          }
        : {
            app: "bg-slate-100 text-slate-900",
            panel: "bg-white/95",
            panelSoft: "bg-white/80",
            border: "border-slate-200",
            text: "text-slate-900",
            muted: "text-slate-500",
            input: "bg-gray-100 border border-slate-300 text-slate-900 placeholder:text-slate-400",
            bubbleMine: "bg-indigo-600 text-white",
            bubbleOther: "bg-white text-slate-900",
            bubbleSystem: "bg-emerald-500 text-white",
            chip: "bg-slate-100 text-slate-700",
            subtleButton: "bg-slate-200 hover:bg-slate-300 text-slate-900",
            dangerButton: "bg-stone-600 hover:bg-stone-700 text-white",
            pageBg: "bg-slate-100",
            cardShadow: "shadow-2xl shadow-slate-400/20",
            tab: "bg-slate-200 text-slate-500",
            tabActive: "bg-indigo-500 text-white",
          },
    [isDark]
  );

  const typingText = useMemo(() => {
    const visible = [...new Set(typingUsers)].filter(
      (u) => u && u !== usernameRef.current
    );
    if (visible.length === 0) return "";
    if (visible.length === 1) return `${visible[0]} is typing...`;
    if (visible.length === 2) return `${visible[0]} and ${visible[1]} are typing...`;
    return `${visible[0]}, ${visible[1]} and ${visible.length - 2} others are typing...`;
  }, [typingUsers]);

  // ── effects ──

  useEffect(() => {
    localStorage.setItem("chathub-theme", theme);
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme, isDark]);

  useEffect(() => { usernameRef.current = username; }, [username]);
  useEffect(() => { roomRef.current = roomId; }, [roomId]);

  useEffect(() => {
    const handleMessage = (message) => {
      setMessages((prev) => [...prev, message]);
      if (message.username !== usernameRef.current && message.username !== "System") {
        notificationSound.current.play().catch(() => {});
      }
    };
    const handlePreviousMessages = (msgs) => setMessages(msgs || []);
    const handleRoomUsers = (payload) => {
      setRoomUsers(Array.isArray(payload) ? payload : payload?.users || []);
      if (payload?.adminName) setAdminName(payload.adminName);
    };
    const handleRoomInfo = ({ roomId: id, roomName: name, isAdmin: admin, adminName: aName }) => {
      setRoomId(id);
      setRoomName(name);
      setIsAdmin(!!admin);
      if (aName) setAdminName(aName);
    };
    const handleRoomCleared = () => { setMessages([]); setTypingUsers([]); };
    const handleTypingUsers = (users) => setTypingUsers(Array.isArray(users) ? users : []);
    const handleMessageDeletedForEveryone = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, text: "This message was deleted", deleted: true } : msg
        )
      );
    };
    const handleRoomDeleted = () => {
      setMessages([]); setJoined(false); setRoomId(""); setRoomName("");
      setIsAdmin(false); setAdminName(""); setCreatedRoomId("");
      setRoomUsers([]); setTypingUsers([]); setMessageInput(""); setSidebarOpen(false);
    };
    const handleJoinError = (msg) => setLobbyError(msg);
    const handleActionError = (msg) => alert(msg);

    socket.on("message", handleMessage);
    socket.on("previous_messages", handlePreviousMessages);
    socket.on("room_users", handleRoomUsers);
    socket.on("room_info", handleRoomInfo);
    socket.on("room_cleared", handleRoomCleared);
    socket.on("typing_users", handleTypingUsers);
    socket.on("message_deleted_everyone", handleMessageDeletedForEveryone);
    socket.on("room_deleted", handleRoomDeleted);
    socket.on("join_error", handleJoinError);
    socket.on("action_error", handleActionError);

    return () => {
      socket.off("message", handleMessage);
      socket.off("previous_messages", handlePreviousMessages);
      socket.off("room_users", handleRoomUsers);
      socket.off("room_info", handleRoomInfo);
      socket.off("room_cleared", handleRoomCleared);
      socket.off("typing_users", handleTypingUsers);
      socket.off("message_deleted_everyone", handleMessageDeletedForEveryone);
      socket.off("room_deleted", handleRoomDeleted);
      socket.off("join_error", handleJoinError);
      socket.off("action_error", handleActionError);
    };
  }, []);

  useEffect(() => {
    if (isNearBottom) scrollToBottom("smooth");
  }, [messages, typingUsers, isNearBottom]);

  // ── actions ──

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };

  const emitStopTyping = () => {
    if (!roomRef.current || !usernameRef.current) return;
    socket.emit("stop_typing", { room: roomRef.current, username: usernameRef.current });
  };

  const createRoom = async () => {
    const cleanUsername = username.trim();
    const cleanRoomName = roomName.trim();
    if (!cleanUsername || !cleanRoomName) return;
    setLobbyError("");
    try {
      const res = await fetch(`${API}/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, roomName: cleanRoomName }),
      });
      const data = await res.json();
      if (!res.ok) { setLobbyError(data.error || "Failed to create room"); return; }
      setCreatedRoomId(data.roomId);
    } catch {
      setLobbyError("Server error. Try again.");
    }
  };

  const enterRoom = (id) => {
    const cleanUsername = username.trim();
    if (!cleanUsername || !id) return;
    setMessages([]); setRoomUsers([]); setTypingUsers([]);
    setMessageInput(""); setIsAdmin(false); setAdminName("");
    setJoined(true); setSidebarOpen(false);
    socket.emit("join_room", { username: cleanUsername, roomId: id });
    requestAnimationFrame(() => scrollToBottom("auto"));
  };

  const joinRoom = async () => {
    const cleanUsername = username.trim();
    const cleanRoomId = joinRoomId.trim().toUpperCase();
    if (!cleanUsername || !cleanRoomId) return;
    setLobbyError("");
    try {
      const res = await fetch(`${API}/rooms/${cleanRoomId}`);
      if (!res.ok) { setLobbyError("Room not found. Check the room ID."); return; }
      enterRoom(cleanRoomId);
    } catch {
      setLobbyError("Server error. Try again.");
    }
  };

  const sendMessage = (extra = {}) => {
    const cleanMessage = messageInput.trim();
    const cleanRoom = roomRef.current.trim();
    const cleanUsername = usernameRef.current.trim();
    if ((!cleanMessage && !extra.fileUrl) || !cleanRoom || !cleanUsername) return;

    socket.emit("message", {
      text: cleanMessage,
      username: cleanUsername,
      room: cleanRoom,
      timestamp: new Date(),
      ...extra,
    });

    setMessageInput("");
    emitStopTyping();
    setTypingUsers([]);
    setIsNearBottom(true);
    requestAnimationFrame(() => scrollToBottom("smooth"));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Upload failed"); return; }
      sendMessage({ fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType });
    } catch {
      alert("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const exitRoom = () => {
    if (!window.confirm("Exit this room?")) return;
    // Disconnect and reconnect so the server fires the disconnect handler
    socket.disconnect();
    socket.connect();
    setMessages([]); setJoined(false); setRoomId(""); setRoomName("");
    setIsAdmin(false); setAdminName(""); setCreatedRoomId("");
    setRoomUsers([]); setTypingUsers([]); setMessageInput(""); setSidebarOpen(false);
  };

  const clearChat = () => {
    if (!window.confirm("Clear all messages?")) return;
    socket.emit("clear_room", roomRef.current.trim());
  };

  const deleteRoom = () => {
    if (!window.confirm("Delete this room permanently?")) return;
    socket.emit("delete_room", roomRef.current.trim());
  };

  const deleteMessage = (messageId, type) => {
    if (type === "me") { setMessages((prev) => prev.filter((msg) => msg._id !== messageId)); return; }
    socket.emit("delete_message_everyone", { messageId, room: roomRef.current.trim() });
  };

  const handleMessageInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);
    const cleanRoom = roomRef.current.trim();
    const cleanUsername = usernameRef.current.trim();
    if (!cleanRoom || !cleanUsername) return;
    if (value.length > 0) socket.emit("typing", { room: cleanRoom, username: cleanUsername });
    else emitStopTyping();
  };

  const themeToggleButton = (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${t.border} ${t.subtleButton} transition`}
      aria-label="Toggle theme"
      type="button"
    >
      <span className="text-lg leading-none">{isDark ? "☀️" : "🌙"}</span>
    </button>
  );

  // ── LOBBY ──────────────────────────────────────────────────────────────────

  if (!joined) {
    // Step 2: show room ID after creation
    if (createdRoomId) {
      return (
        <div className={`flex min-h-[100dvh] items-center justify-center px-4 ${t.pageBg}`}>
          <div className={`w-full max-w-md rounded-3xl border p-6 sm:p-8 ${t.panel} ${t.border} ${t.cardShadow}`}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className={`text-3xl font-bold ${t.text}`}>Room Created!</h1>
                <p className={`mt-1 text-sm ${t.muted}`}>Share this ID with others</p>
              </div>
              {themeToggleButton}
            </div>

            <div className={`rounded-2xl border p-5 text-center ${t.border} ${t.panelSoft}`}>
              <p className={`text-xs uppercase tracking-widest mb-2 ${t.muted}`}>Room ID</p>
              <p className={`text-4xl font-mono font-bold tracking-widest ${t.text}`}>{createdRoomId}</p>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(createdRoomId)}
                className={`mt-3 rounded-xl px-4 py-2 text-sm transition ${t.subtleButton}`}
              >
                Copy ID
              </button>
            </div>

            <button
              type="button"
              onClick={() => enterRoom(createdRoomId)}
              className="mt-4 w-full rounded-2xl bg-indigo-500 px-4 py-4 font-semibold text-white transition hover:bg-indigo-600"
            >
              Enter Room
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex min-h-[100dvh] items-center justify-center px-4 ${t.pageBg}`}>
        <div className={`w-full max-w-md rounded-3xl border p-6 sm:p-8 ${t.panel} ${t.border} ${t.cardShadow}`}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className={`text-4xl font-bold ${t.text}`}>ChatHub</h1>
              <p className={`mt-1 text-sm ${t.muted}`}>Realtime room-based chat</p>
            </div>
            {themeToggleButton}
          </div>

          {/* Tabs */}
          <div className={`mb-6 flex rounded-2xl p-1 ${t.tab}`}>
            {["create", "join"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setLobbyError(""); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${mode === m ? t.tabActive : ""}`}
              >
                {m === "create" ? "Create Room" : "Join Room"}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full rounded-2xl border px-4 py-4 outline-none transition ${t.input}`}
            />

            {mode === "create" ? (
              <>
                <input
                  type="text"
                  placeholder="Room name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className={`w-full rounded-2xl border px-4 py-4 outline-none transition ${t.input}`}
                />
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={!username.trim() || !roomName.trim()}
                  className="w-full rounded-2xl bg-indigo-500 px-4 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Room
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Room ID (e.g. A3F9B2C1)"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                  className={`w-full rounded-2xl border px-4 py-4 font-mono outline-none transition ${t.input}`}
                />
                <button
                  type="button"
                  onClick={joinRoom}
                  disabled={!username.trim() || !joinRoomId.trim()}
                  className="w-full rounded-2xl bg-indigo-500 px-4 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Room
                </button>
              </>
            )}

            {lobbyError && (
              <p className="text-center text-sm text-red-400">{lobbyError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CHAT UI ────────────────────────────────────────────────────────────────

  const visibleRoomUsers = [...new Set(roomUsers)].filter(Boolean);

  return (
    <div className={`relative flex h-[100dvh] w-full overflow-hidden ${t.app}`}>
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[300px] max-w-[86vw] flex-col border-r ${t.panel} ${t.border} ${t.cardShadow} transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className={`border-b ${t.border} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-lg font-bold text-indigo-400">
                C
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className={`truncate text-2xl font-bold ${t.text}`}>ChatHub</h1>
                  <div className="hidden lg:block">{themeToggleButton}</div>
                </div>
                <p className={`text-xs ${t.muted}`}>Realtime room controls</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${t.border} ${t.subtleButton} transition lg:hidden`}
              aria-label="Close sidebar"
            >✕</button>
          </div>

          <div className="mt-4 rounded-2xl bg-indigo-500/10 px-4 py-3">
            <p className={`text-xs uppercase tracking-wide ${t.muted}`}>Room</p>
            <h2 className={`truncate text-lg font-semibold ${t.text}`}>{roomName || roomId}</h2>
            <p className={`text-xs font-mono ${t.muted}`}>ID: {roomId}</p>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(roomId)}
                className={`text-xs underline underline-offset-2 ${t.muted}`}
              >Copy ID</button>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                {visibleRoomUsers.length} online
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <p className={`mb-2 text-sm font-medium ${t.muted}`}>Actions</p>
              <div className="space-y-3">
                <button onClick={exitRoom} className={`w-full rounded-2xl px-4 py-3 font-medium transition ${t.subtleButton}`} type="button">Exit Room</button>
                <button onClick={clearChat} className={`w-full rounded-2xl px-4 py-3 font-medium transition ${t.subtleButton}`} type="button">Clear Chat</button>
                <button onClick={deleteRoom} className="w-full rounded-2xl px-4 py-3 font-medium transition bg-red-600 hover:bg-red-700 text-white" type="button">Delete Room</button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={`text-sm font-medium ${t.muted}`}>Active Users</p>
                <span className={`text-xs ${t.muted}`}>{visibleRoomUsers.length}</span>
              </div>
              <div className="space-y-2">
                {visibleRoomUsers.length === 0 ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${t.border} ${t.panelSoft} ${t.muted}`}>No one else is here yet.</div>
                ) : (
                  visibleRoomUsers.map((user, index) => (
                    <div key={`${user}-${index}`} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${t.border} ${t.panelSoft}`}>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span className={`truncate text-sm font-medium ${t.text}`}>{user}</span>
                      {user === adminName && (
                        <span className="ml-auto text-xs rounded-full bg-indigo-500/20 text-indigo-400 px-2 py-0.5 font-medium">admin</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`border-t p-4 text-xs ${t.border} ${t.muted}`}>Connected to room controls and message history.</div>
      </aside>

      {/* Main */}
      <main className={`flex min-w-0 flex-1 flex-col ${t.pageBg}`}>
        <header className={`sticky top-0 z-10 border-b backdrop-blur-xl ${t.panel} ${t.border}`}>
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${t.border} ${t.subtleButton} transition lg:hidden`}
                aria-label="Open sidebar"
              >☰</button>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className={`truncate text-lg font-semibold ${t.text}`}>{roomName || roomId}</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${t.chip}`}>{visibleRoomUsers.length} online</span>
                </div>
                <p className={`mt-1 text-xs ${t.muted}`}>{typingText || "Connected"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden lg:block">{themeToggleButton}</div>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`inline-flex rounded-2xl border px-3 py-2 text-sm lg:hidden ${t.border} ${t.subtleButton}`}
              >Users</button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <section
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 ${t.pageBg}`}
        >
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const isMine = msg.username === usernameRef.current;
              const isSystem = msg.username === "System";
              return (
                <div
                  key={msg._id || `${msg.username}-${msg.timestamp}-${index}`}
                  className={`flex w-full ${isSystem ? "justify-center" : isMine ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex max-w-[92%] flex-col ${isMine ? "items-end" : "items-start"} sm:max-w-[78%]`}>
                    {!isSystem && (
                      <div className={`mb-1 text-xs ${isMine ? "text-right" : "text-left"} ${t.muted}`}>{msg.username}</div>
                    )}
                    <div className={`inline-block w-fit max-w-full rounded-2xl px-4 py-3 shadow-sm ${isSystem ? t.bubbleSystem : isMine ? t.bubbleMine : t.bubbleOther} ${msg.deleted ? "italic opacity-80" : ""}`}>
                      {msg.fileUrl && !msg.deleted ? (
                        <FileMessage fileUrl={msg.fileUrl} fileName={msg.fileName} fileType={msg.fileType} />
                      ) : null}
                      {msg.text && <p className="max-w-full break-words whitespace-pre-wrap mt-1">{msg.text}</p>}
                    </div>
                    {!isSystem && (
                      <div className={`mt-1 text-xs ${isMine ? "text-right" : "text-left"} ${t.muted}`}>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    )}
                    {isMine && !msg.deleted && !isSystem && (
                      <div className={`mt-2 flex gap-3 ${isMine ? "justify-end" : "justify-start"}`}>
                        <button type="button" onClick={() => deleteMessage(msg._id, "me")} className={`text-xs transition hover:text-current ${t.muted}`}>Delete for me</button>
                        <button type="button" onClick={() => deleteMessage(msg._id, "everyone")} className={`text-xs transition hover:text-current ${t.muted}`}>Delete for everyone</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </section>

        {/* Input */}
        <div className={`border-t px-3 py-3 sm:px-6 ${t.panel} ${t.border}`}>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          >
            {/* File attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border transition ${t.border} ${t.subtleButton} ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
              aria-label="Attach file"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <span className="text-lg">📎</span>
              )}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

            <input
              type="text"
              placeholder="Type a message..."
              value={messageInput}
              onChange={handleMessageInputChange}
              onBlur={emitStopTyping}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } }}
              className={`min-w-0 flex-1 rounded-2xl px-4 py-3 outline-none transition ${t.input}`}
            />

            <button
              type="submit"
              disabled={!messageInput.trim()}
              className={`rounded-2xl px-5 py-3 font-semibold transition ${messageInput.trim() ? "bg-indigo-500 text-white hover:bg-indigo-600" : "cursor-not-allowed bg-indigo-500/40 text-white/70"}`}
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default Chat;
