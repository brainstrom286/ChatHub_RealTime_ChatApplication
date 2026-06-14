require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const Message = require("./models/Message");
const Room = require("./models/Room");

const app = express();
const server = http.createServer(app);

// ===============================
// CORS — allow all origins
// ===============================
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

// ===============================
// UPLOADS FOLDER
// ===============================

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use("/uploads", express.static(uploadsDir));

// ===============================
// MULTER CONFIG
// ===============================

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ===============================
// SOCKET.IO CONFIG
// ===============================

const io = new Server(server, {
  cors: { origin: "*", credentials: true },
});

// ===============================
// ACTIVE DATA STORAGE
// ===============================

const activeRooms = new Map(); // room -> Map(socketId -> username)
const typingRooms = new Map(); // room -> Map(socketId -> username)

const getRoomUsers = (room) => {
  const usersMap = activeRooms.get(room);
  return usersMap ? Array.from(usersMap.values()) : [];
};

const emitRoomUsers = async (room) => {
  const users = getRoomUsers(room);
  const roomDoc = await Room.findOne({ roomId: room }).lean();
  io.to(room).emit("room_users", {
    users,
    count: users.length,
    adminName: roomDoc?.createdBy || null,
  });
};

const getTypingUsers = (room) => {
  const typingMap = typingRooms.get(room);
  if (!typingMap) return [];
  return Array.from(new Set(Array.from(typingMap.values())));
};

const emitTypingUsers = (room) => {
  io.to(room).emit("typing_users", getTypingUsers(room));
};

// ===============================
// MONGODB CONNECTION
// ===============================

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((error) => console.log("❌ MongoDB Error:", error));

// ===============================
// ROUTES
// ===============================

app.get("/", (req, res) => {
  res.send("✅ ChatHub backend is running");
});

// GET ALL ROOMS
app.get("/rooms", async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// CREATE ROOM (REST)
app.post("/rooms/create", async (req, res) => {
  try {
    const { username, roomName } = req.body;
    if (!username || !roomName) {
      return res.status(400).json({ error: "username and roomName required" });
    }

    const roomId = uuidv4().slice(0, 8).toUpperCase(); // e.g. "A3F9B2C1"

    const room = await Room.create({
      roomId,
      roomName: roomName.trim(),
      createdBy: username.trim(),
    });

    res.json({ roomId: room.roomId, roomName: room.roomName });
  } catch (error) {
    console.log("❌ Create room error:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// VALIDATE ROOM ID (JOIN)
app.get("/rooms/:roomId", async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId.toUpperCase() });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ roomId: room.roomId, roomName: room.roomName });
  } catch (error) {
    res.status(500).json({ error: "Failed to find room" });
  }
});

// FILE UPLOAD
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.json({
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
    });
  } catch (error) {
    res.status(500).json({ error: "Upload failed" });
  }
});

// ===============================
// SOCKET CONNECTION
// ===============================

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // JOIN ROOM
  socket.on("join_room", async ({ username, roomId }) => {
    try {
      const cleanUsername = (username || "").trim();
      const cleanRoomId = (roomId || "").trim().toUpperCase();

      if (!cleanUsername || !cleanRoomId) return;

      const roomDoc = await Room.findOne({ roomId: cleanRoomId });
      if (!roomDoc) {
        socket.emit("join_error", "Room not found. Check the room ID.");
        return;
      }

      socket.username = cleanUsername;
      socket.room = cleanRoomId;
      socket.join(cleanRoomId);

      console.log(`👤 ${cleanUsername} joined room: ${cleanRoomId}`);

      if (!activeRooms.has(cleanRoomId)) activeRooms.set(cleanRoomId, new Map());
      activeRooms.get(cleanRoomId).set(socket.id, cleanUsername);

      if (!typingRooms.has(cleanRoomId)) typingRooms.set(cleanRoomId, new Map());
      typingRooms.get(cleanRoomId).delete(socket.id);
      emitTypingUsers(cleanRoomId);

      const previousMessages = await Message.find({ room: cleanRoomId }).sort({ timestamp: 1 });
      socket.emit("previous_messages", previousMessages);

      // Send room info to the joiner — include admin flag
      const isAdmin = roomDoc.createdBy === cleanUsername;
      socket.isAdmin = isAdmin;
      console.log(`ℹ️ ${cleanUsername} isAdmin: ${isAdmin} (createdBy: ${roomDoc.createdBy})`);
      socket.emit("room_info", {
        roomId: roomDoc.roomId,
        roomName: roomDoc.roomName,
        isAdmin,
        adminName: roomDoc.createdBy,
      });

      const joinMessage = new Message({
        text: `${cleanUsername} joined the room`,
        username: "System",
        room: cleanRoomId,
        timestamp: new Date(),
      });
      await joinMessage.save();
      io.to(cleanRoomId).emit("message", joinMessage);

      await emitRoomUsers(cleanRoomId);
    } catch (error) {
      console.log("❌ Join room error:", error);
    }
  });

  // SEND MESSAGE
  socket.on("message", async (messageData) => {
    try {
      const room = (messageData?.room || "").trim();
      const text = (messageData?.text || "").trim();
      const username = (messageData?.username || "").trim();

      if (!room || !username) return;
      if (!text && !messageData.fileUrl) return;

      const newMessage = new Message({
        text,
        username,
        room,
        timestamp: messageData.timestamp || new Date(),
        fileUrl: messageData.fileUrl || null,
        fileName: messageData.fileName || null,
        fileType: messageData.fileType || null,
      });

      await newMessage.save();

      if (typingRooms.has(room)) {
        typingRooms.get(room).delete(socket.id);
        emitTypingUsers(room);
      }

      io.to(room).emit("message", newMessage);
    } catch (error) {
      console.log("❌ Message save error:", error);
    }
  });

  // TYPING
  socket.on("typing", ({ room, username }) => {
    const cleanRoom = (room || "").trim();
    const cleanUsername = (username || "").trim();
    if (!cleanRoom || !cleanUsername) return;

    if (!typingRooms.has(cleanRoom)) typingRooms.set(cleanRoom, new Map());
    typingRooms.get(cleanRoom).set(socket.id, cleanUsername);
    emitTypingUsers(cleanRoom);
  });

  socket.on("stop_typing", ({ room }) => {
    const cleanRoom = (room || socket.room || "").trim();
    if (!cleanRoom || !typingRooms.has(cleanRoom)) return;
    typingRooms.get(cleanRoom).delete(socket.id);
    emitTypingUsers(cleanRoom);
  });

  // DELETE MESSAGE FOR EVERYONE
  socket.on("delete_message_everyone", async ({ messageId, room }) => {
    try {
      if (!messageId || !room) return;
      await Message.findByIdAndUpdate(messageId, { text: "This message was deleted", deleted: true });
      io.to(room).emit("message_deleted_everyone", { messageId });
    } catch (error) {
      console.log("❌ Delete message error:", error);
    }
  });

  // CLEAR CHAT — admin only
  socket.on("clear_room", async (room) => {
    try {
      const cleanRoom = (room || "").trim();
      if (!cleanRoom) return;

      const roomDoc = await Room.findOne({ roomId: cleanRoom });
      if (!roomDoc || roomDoc.createdBy !== socket.username) {
        socket.emit("action_error", "Only the room creator can clear the chat.");
        return;
      }

      await Message.deleteMany({ room: cleanRoom });
      typingRooms.delete(cleanRoom);
      emitTypingUsers(cleanRoom);
      io.to(cleanRoom).emit("room_cleared");
    } catch (error) {
      console.log("❌ Clear room error:", error);
    }
  });

  // DELETE ROOM — admin only
  socket.on("delete_room", async (room) => {
    try {
      const cleanRoom = (room || "").trim();
      if (!cleanRoom) return;

      const roomDoc = await Room.findOne({ roomId: cleanRoom });
      if (!roomDoc || roomDoc.createdBy !== socket.username) {
        socket.emit("action_error", "Only the room creator can delete the room.");
        return;
      }

      await Message.deleteMany({ room: cleanRoom });
      await Room.deleteOne({ roomId: cleanRoom });
      activeRooms.delete(cleanRoom);
      typingRooms.delete(cleanRoom);
      io.to(cleanRoom).emit("typing_users", []);
      io.to(cleanRoom).emit("room_deleted");
      const sockets = await io.in(cleanRoom).fetchSockets();
      sockets.forEach((s) => s.leave(cleanRoom));
    } catch (error) {
      console.log("❌ Delete room error:", error);
    }
  });

  // DISCONNECT
  socket.on("disconnect", async () => {
    try {
      const room = socket.room;
      const username = socket.username;

      if (room && username) {
        if (activeRooms.has(room)) {
          activeRooms.get(room).delete(socket.id);
          if (activeRooms.get(room).size === 0) activeRooms.delete(room);
          await emitRoomUsers(room);
        }

        if (typingRooms.has(room)) {
          typingRooms.get(room).delete(socket.id);
          if (typingRooms.get(room).size === 0) typingRooms.delete(room);
          emitTypingUsers(room);
        }

        const leaveMessage = new Message({
          text: `${username} left the room`,
          username: "System",
          room,
          timestamp: new Date(),
        });
        await leaveMessage.save();
        io.to(room).emit("message", leaveMessage);
      }

      console.log("🔌 User disconnected:", socket.id);
    } catch (error) {
      console.log("❌ Disconnect error:", error);
    }
  });
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
