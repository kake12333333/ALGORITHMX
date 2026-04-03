import { analyzeIncident } from "../services/aiService.js";
import db from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { findEarliestDuplicate, mergeIntoCanonical } from "../services/incidentDuplicateService.js";

const INCIDENTS_COLLECTION = "incidents";

const ALLOWED_TYPES = [
  "Fire",
  "Medical",
  "Crime",
  "Flood",
  "Power Outage",
  "Other",
];
const TYPE_MAP = new Map(ALLOWED_TYPES.map((value) => [value.toLowerCase(), value]));

function serializeTimestamp(value) {
  if (value == null) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return value;
}

function incidentDocToResponse(id, data, extras = {}) {
  if (!data) return { id, ...extras };
  return {
    id,
    type: data.type ?? null,
    description: data.description ?? "",
    location: data.location ?? "",
    media_url: data.media_url ?? "",
    trust_score: data.trust_score ?? null,
    priority: data.priority ?? null,
    status: data.status ?? null,
    reason: data.reason ?? "",
    statusFlow: data.statusFlow ?? null,
    createdAt: serializeTimestamp(data.createdAt),
    report_count: data.report_count ?? 1,
    merged_descriptions: data.merged_descriptions ?? [],
    last_merged_at: serializeTimestamp(data.last_merged_at),
    ...extras,
  };
}

export const createIncident = async (req, res) => {
  try {
    const { type, description, location } = req.body || {};
    const normalizedTypeKey = String(type || "").trim().toLowerCase();
    const canonicalType = TYPE_MAP.get(normalizedTypeKey);

    if (!canonicalType) {
      return res.status(400).json({
        error: `Invalid type. Allowed values: ${ALLOWED_TYPES.join(", ")}`,
        received: type ?? null,
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ error: "description is required" });
    }

    if (!location || !location.trim()) {
      return res.status(400).json({ error: "location is required" });
    }

    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : "";

    const aiResult = analyzeIncident(
      description,
      canonicalType,
      location,
      Boolean(req.file)
    );

    const duplicate = await findEarliestDuplicate(db, INCIDENTS_COLLECTION, {
      type: canonicalType,
      description,
      location,
    });

    if (duplicate) {
      await mergeIntoCanonical(duplicate.ref, duplicate.data, {
        description,
        mediaUrl,
        aiResult,
      });
      const mergedSnap = await duplicate.ref.get();
      const mergedData = mergedSnap.data();
      return res.status(200).json(
        incidentDocToResponse(duplicate.id, mergedData, {
          merged: true,
          message: "Duplicate of an earlier report; merged into the original incident.",
        })
      );
    }

    const firestorePayload = {
      type: canonicalType,
      description,
      location,
      media_url: mediaUrl,
      trust_score: aiResult.trust_score,
      priority: aiResult.priority,
      status: aiResult.status,
      reason: aiResult.reason,
      createdAt: FieldValue.serverTimestamp(),
      report_count: 1,
      merged_descriptions: [],
    };

    const docRef = await db.collection(INCIDENTS_COLLECTION).add(firestorePayload);
    const snap = await docRef.get();
    const data = snap.data();

    return res.status(201).json(incidentDocToResponse(docRef.id, data));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create incident" });
  }
};

export const getIncidents = async (req, res) => {
  try {
    let snapshot;
    try {
      snapshot = await db
        .collection(INCIDENTS_COLLECTION)
        .orderBy("createdAt", "desc")
        .get();
    } catch {
      snapshot = await db.collection(INCIDENTS_COLLECTION).get();
    }

    const items = snapshot.docs.map((doc) => incidentDocToResponse(doc.id, doc.data()));

    items.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch incidents" });
  }
};
