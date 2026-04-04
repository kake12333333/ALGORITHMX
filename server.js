import "dotenv/config";
import express from "express";
import cors from "cors";
import "./config/firebase.js";
import incidentsRoutes from "./routes/incidents.js";
import chatRoutes from "./routes/chat.js";
import authRoutes from "./routes/auth.js";
import assignmentSessionsRoutes from "./routes/assignmentSessions.js";
import volunteersRoutes from "./routes/volunteers.js";
import multer from "multer";
import http from "http";
import { Server } from "socket.io";
import { registerChatSocket } from "./services/chatSocket.js";

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || "*";
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
  },
});
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/", express.static("frontend")); // Serve frontend files

app.use("/api/incidents", (req, _res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  if (req.method !== "GET") {
    console.log("[API] body:", req.body);
  }
  next();
});

// Volunteers mounted first so route is always registered (POST /api/volunteers/register)
app.use("/api/volunteers", volunteersRoutes);

app.use("/api/incidents", incidentsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/assignment-sessions", assignmentSessionsRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "veriPulse-backend",
    routes: [
      "POST /api/volunteers/register",
      "GET /api/volunteers",
      "POST /api/incidents/report",
      "GET /api/incidents/all",
      "GET /api/chat/history?roomId=Mumbai%20Relief%20Group",
      "POST /api/chat/messages",
      "POST /api/assignment-sessions/start",
    ],
  });
});

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.includes("Invalid file type")) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

registerChatSocket(io);

server.listen(port, () => {
  console.log(`Server & Websockets running on port ${port}`);
  console.log("Incidents & volunteers: Firebase Cloud Firestore");
  console.log("Health: GET /api/health");
});
