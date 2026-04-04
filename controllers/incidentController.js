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
    report_count: data.report_count ?? 1,
    merged_descriptions: data.merged_descriptions ?? [],
    last_merged_at: serializeTimestamp(data.last_merged_at),
    required_volunteers: data.required_volunteers ?? 1,
    assignments: data.assignments ?? [],
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
    reporter_name: incident.reporter_name || "",
    reporter_email: incident.reporter_email || "",
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

    const requiredVols = aiResult.priority === 'High' ? 3 : aiResult.priority === 'Medium' ? 2 : 1;

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
      required_volunteers: requiredVols,
      assignments: [],
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
    // Filter out fake and removed incidents from the public citizen feed
    const visibleItems = items.filter(inc => {
      const s = String(inc.status || '').toLowerCase();
      return s !== 'fake' && s !== 'closed' && s !== 'removed';
    });
    return res.json(visibleItems.map(toDashboardReport));
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

export const updateIncidentAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { volunteerId, action } = req.body; // action: 'accept' | 'reject'

    if (!volunteerId || !action) {
      return res.status(400).json({ error: "volunteerId and action are required." });
    }

    if (!db) {
       return res.status(500).json({ error: "Firestore unavailable for update" });
    }

    const docRef = db.collection(INCIDENTS_COLLECTION).doc(id);
    const snap = await docRef.get();
    
    if (!snap.exists) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const data = snap.data();
    let currentAssignments = data.assignments || [];
    const required_volunteers = data.required_volunteers || 1;

    // Filter out existing record for this volunteer to avoid duplicate states
    currentAssignments = currentAssignments.filter(a => a.volunteerId !== volunteerId);
    
    currentAssignments.push({
      volunteerId,
      action: action.toLowerCase(),
      timestamp: new Date().toISOString()
    });

    const acceptedCount = currentAssignments.filter(a => a.action === 'accept').length;
    let newStatus = data.status;

    if (acceptedCount >= required_volunteers && (String(data.status || '').toLowerCase() === 'verified' || String(data.status || '').toLowerCase() === 'active')) {
      newStatus = 'Assigned'; // Fully matched out
    }

    await docRef.update({
      assignments: currentAssignments,
      status: newStatus
    });

    return res.json({ success: true, status: newStatus, acceptedCount, required_volunteers, assignments: currentAssignments });
  } catch (err) {
    console.error("[Incidents][PATCH assignment] error:", err);
    return res.status(500).json({ error: err.message || "Failed to update incident assignment" });
  }
};

export const updateIncidentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) return res.status(400).json({ error: "status is required" });
    if (!db) return res.status(500).json({ error: "Firestore unavailable" });
    
    const docRef = db.collection(INCIDENTS_COLLECTION).doc(id);
    const snap = await docRef.get();
    
    if (!snap.exists) return res.status(404).json({ error: "Incident not found" });
    
    await docRef.update({ status: status.toLowerCase() });
    return res.json({ success: true, status: status.toLowerCase() });
  } catch (err) {
    console.error("[Incidents][PATCH status] error:", err);
    return res.status(500).json({ error: err.message });
  }
};
