import { analyzeIncident } from "../services/aiService.js";
import db from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { findEarliestDuplicate, mergeIntoCanonical } from "../services/incidentDuplicateService.js";

const INCIDENTS_COLLECTION = "incidents";
const memoryIncidents = [];

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

function summarizeIncidents(incidents) {
  const totalAlerts = incidents.length;
  const activeCases = incidents.filter((item) => String(item.status || "").toLowerCase() === "active").length;
  const resolvedCases = incidents.filter((item) => String(item.status || "").toLowerCase() === "resolved").length;
  const highPriority = incidents.filter((item) => String(item.priority || "").toLowerCase() === "high").length;
  const verified = incidents.filter((item) => Number(item.trust_score ?? 0) > 80).length;
  const suspicious = incidents.filter((item) => {
    const score = Number(item.trust_score ?? 0);
    return score >= 50 && score <= 80;
  }).length;
  const fake = incidents.filter((item) => Number(item.trust_score ?? 0) < 50).length;

  return {
    totalAlerts,
    activeCases,
    resolvedCases,
    verified,
    highPriority,
    suspicious,
    fake,
  };
}

function toDashboardReport(incident) {
  const statusRaw = String(incident.status || "pending").toLowerCase();
  const status = statusRaw.includes("verified") || statusRaw.includes("active") ? "verified" : "pending";
  const priorityRaw = String(incident.priority || "low").toLowerCase();
  const priority = priorityRaw.includes("high") ? "high" : "low";
  const title = incident.type ? `${incident.type} Report` : "Incident Report";

  return {
    id: incident.id,
    title,
    description: incident.description || "",
    status,
    priority,
    createdAt: incident.createdAt || null,
    type: incident.type || null,
    location: incident.location || "",
    trust_score: incident.trust_score ?? null,
  };
}

async function fetchIncidentItems() {
  if (!db) {
    return [...memoryIncidents];
  }

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

  return items;
}

export const createIncident = async (req, res) => {
  try {
    console.log("[Incidents][POST] incoming body:", req.body);
    const { type, description, location } = req.body || {};
    const reporterName = String(req.body?.reporterName || req.body?.name || "").trim();
    const reporterEmail = String(req.body?.reporterEmail || req.body?.email || "").trim();
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
      reporter_name: reporterName || null,
      reporter_email: reporterEmail || null,
      createdAt: FieldValue.serverTimestamp(),
      report_count: 1,
      merged_descriptions: [],
    };

    if (!db) {
      const memoryId = `MEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const memoryRecord = incidentDocToResponse(memoryId, {
        ...firestorePayload,
        createdAt: new Date().toISOString(),
      });
      memoryIncidents.unshift(memoryRecord);
      console.log(`[Incidents][POST] saved in memory fallback: ${memoryId}`);
      return res.status(201).json(memoryRecord);
    }

    const docRef = await db.collection(INCIDENTS_COLLECTION).add(firestorePayload);
    const snap = await docRef.get();
    const data = snap.data();
    console.log(`[Incidents][POST] saved in Firestore: ${docRef.id}`);

    return res.status(201).json(incidentDocToResponse(docRef.id, data));
  } catch (err) {
    console.error("[Incidents][POST] error:", err);
    return res.status(500).json({ error: err.message || "Failed to create incident" });
  }
};

export const getIncidents = async (req, res) => {
  try {
    const items = await fetchIncidentItems();
    return res.json(items.map(toDashboardReport));
  } catch (err) {
    console.error("[Incidents][GET all] error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch incidents" });
  }
};

export const getIncidentsAll = async (_req, res) => {
  try {
    const items = await fetchIncidentItems();
    return res.json(items);
  } catch (err) {
    console.error("[Incidents][GET raw all] error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch incidents" });
  }
};

export const getIncidentsSummary = async (_req, res) => {
  try {
    const incidents = await fetchIncidentItems();

    const summary = summarizeIncidents(incidents);
    return res.json(summary);
  } catch (err) {
    console.error("[Incidents][GET summary] error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch incident summary" });
  }
};
