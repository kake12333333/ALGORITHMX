import { getChatHistory, markDelivered, saveChatMessage } from "./chatStore.js";

const DEFAULT_ROOM = "Mumbai Relief Group";

export function registerChatSocket(io) {
  const roomUsers = new Map();
  const socketProfile = new Map();

  function getRoomSet(roomId) {
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Set());
    }
    return roomUsers.get(roomId);
  }

  function onlineCount(roomId) {
    return getRoomSet(roomId).size;
  }

  function broadcastOnline(roomId) {
    io.to(roomId).emit("online_users", {
      roomId,
      count: onlineCount(roomId),
    });
  }

  async function handleJoin(socket, payload = {}) {
    const roomId = String(payload.roomId || payload.room || DEFAULT_ROOM).trim();
    const senderName = String(payload.senderName || payload.name || "Anonymous").trim();

    socket.join(roomId);
    socketProfile.set(socket.id, { roomId, senderName });
    getRoomSet(roomId).add(socket.id);

    const history = await getChatHistory(roomId, 100);
    socket.emit("chat_history", history);

    broadcastOnline(roomId);
    socket.to(roomId).emit("system_message", {
      roomId,
      text: `${senderName} joined ${roomId}`,
      timestamp: new Date().toISOString(),
    });
  }

  async function handleSend(socket, payload = {}) {
    const profile = socketProfile.get(socket.id) || {};
    const roomId = String(payload.roomId || profile.roomId || DEFAULT_ROOM).trim();
    const senderName = String(payload.senderName || profile.senderName || "Anonymous").trim();
    const content = String(payload.content || payload.text || "").trim();

    if (!content) {
      socket.emit("chat_error", { message: "Message content is empty." });
      return;
    }

    const saved = await saveChatMessage({ roomId, senderName, content });

    const delivered = onlineCount(roomId) > 1;
    if (delivered) {
      await markDelivered(saved.id, roomId);
      saved.status = "delivered";
    }

    io.to(roomId).emit("new_message", saved);

    // Backward compatibility with legacy frontend events.
    io.to(roomId).emit("message", {
      id: socket.id,
      meta: `${senderName} • ${new Date(saved.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      text: saved.content,
      author: senderName,
      role: "citizen",
    });
  }

  io.on("connection", (socket) => {
    console.log(`[Chat][Socket] connected: ${socket.id}`);

    socket.on("join_room", (payload) => {
      handleJoin(socket, payload).catch((err) => {
        console.error("[Chat][Socket] join_room error:", err);
        socket.emit("chat_error", { message: "Failed to join room." });
      });
    });

    // Backward compatibility alias.
    socket.on("join", (payload) => {
      handleJoin(socket, payload).catch((err) => {
        console.error("[Chat][Socket] join error:", err);
        socket.emit("chat_error", { message: "Failed to join room." });
      });
    });

    socket.on("send_message", (payload) => {
      handleSend(socket, payload).catch((err) => {
        console.error("[Chat][Socket] send_message error:", err);
        socket.emit("chat_error", { message: "Failed to send message." });
      });
    });

    // Backward compatibility alias.
    socket.on("chatMessage", (payload) => {
      handleSend(socket, payload).catch((err) => {
        console.error("[Chat][Socket] chatMessage error:", err);
        socket.emit("chat_error", { message: "Failed to send message." });
      });
    });

    socket.on("typing_start", (payload = {}) => {
      const profile = socketProfile.get(socket.id) || {};
      const roomId = String(payload.roomId || profile.roomId || DEFAULT_ROOM).trim();
      const senderName = String(payload.senderName || profile.senderName || "Anonymous").trim();
      socket.to(roomId).emit("typing", { roomId, senderName, isTyping: true });
    });

    socket.on("typing_stop", (payload = {}) => {
      const profile = socketProfile.get(socket.id) || {};
      const roomId = String(payload.roomId || profile.roomId || DEFAULT_ROOM).trim();
      const senderName = String(payload.senderName || profile.senderName || "Anonymous").trim();
      socket.to(roomId).emit("typing", { roomId, senderName, isTyping: false });
    });

    socket.on("disconnect", () => {
      const profile = socketProfile.get(socket.id);
      if (profile?.roomId) {
        const set = getRoomSet(profile.roomId);
        set.delete(socket.id);
        broadcastOnline(profile.roomId);
        socket.to(profile.roomId).emit("system_message", {
          roomId: profile.roomId,
          text: `${profile.senderName || "A user"} left ${profile.roomId}`,
          timestamp: new Date().toISOString(),
        });
      }
      socketProfile.delete(socket.id);
      console.log(`[Chat][Socket] disconnected: ${socket.id}`);
    });
  });
}
