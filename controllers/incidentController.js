import db from "../config/firebase.js";
import { analyzeIncident } from "../services/aiService.js";
import { randomUUID } from "crypto";

// Dev-friendly fallback when Firestore isn't enabled/misconfigured.
// This prevents random 500s in Postman while you set up Firebase.
const memoryIncidents = [];

export const createIncident = async (req, res) => {
  try {
    const { description, location } = req.body;
    if (!description || !location) {
      return res
        .status(400)
        .json({ error: "Missing required fields: description, location" });
    }

    // AI analysis
    const aiData = await analyzeIncident(description);

    const incident = {
      description,
      location,
      ...aiData,
      createdAt: new Date(),
      statusFlow: "Pending",
    };

    try {
      const docRef = await db.collection("incidents").add(incident);
      return res.json({
        id: docRef.id,
        ...incident,
        persisted: "firestore",
      });
    } catch (dbErr) {
      const id = randomUUID();
      memoryIncidents.push({ id, ...incident });
      return res.status(200).json({
        id,
        ...incident,
        persisted: "memory",
        warning:
          "Firestore write failed (likely not enabled/misconfigured). Returning saved-in-memory incident for development.",
        firestoreError: dbErr?.message || String(dbErr),
      });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getIncidents = async (req, res) => {
  try {
    const snapshot = await db.collection("incidents").get();

    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(data);
  } catch (dbErr) {
    return res.status(200).json(
      memoryIncidents.map(({ id, ...rest }) => ({
        id,
        ...rest,
        persisted: "memory",
      }))
    );
  }
};