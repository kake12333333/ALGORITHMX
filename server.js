import "dotenv/config";
import express from "express";
import cors from "cors";
import "./config/firebase.js";
import incidentsRoutes from "./routes/incidents.js";
import authRoutes from "./routes/auth.js";
import multer from "multer";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/incidents", incidentsRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.includes("Invalid file type")) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log("Incidents: Firebase Cloud Firestore");
});
