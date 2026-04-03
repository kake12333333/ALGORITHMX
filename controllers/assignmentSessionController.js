import db from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { rankVolunteersForIncident } from "../services/volunteerMatching.js";
import { volunteerToResponse } from "./volunteerController.js";

const SESSIONS_COLLECTION = "assignment_sessions";

function serializeTimestamp(value) {
  if (value == null) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return value;
}

/**
 * POST /api/assignment-sessions/start  { incidentId }
 * Creates (or reuses) an open session and returns the first volunteer to offer.
 */
export const startAssignmentSession = async (req, res) => {
  try {
    const { incidentId, type, description, location } = req.body || {};
    if (!incidentId || !String(incidentId).trim()) {
      return res.status(400).json({ error: "incidentId is required" });
    }

    // 1. Direct Firestore lookup by ID.
    let incSnap = await db.collection("incidents").doc(incidentId).get();

    // 2. Strict fallback: query by type + description + location.
    if (!incSnap.exists && type && description && location) {
      const q = await db
        .collection("incidents")
        .where("type", "==", String(type).trim())
        .where("description", "==", String(description).trim())
        .where("location", "==", String(location).trim())
        .limit(1)
        .get();
      if (!q.empty) incSnap = q.docs[0];
    }

    // 3. Broader fallback: match by location only.
    if (!incSnap.exists && location) {
      const q = await db
        .collection("incidents")
        .where("location", "==", String(location).trim())
        .limit(1)
        .get();
      if (!q.empty) incSnap = q.docs[0];
    }

    // 4. Virtual-incident: build from body fields so ranking works even
    //    when the ID is stale / incident not yet persisted.
    let incident;
    if (!incSnap || !incSnap.exists) {
      if (!type || !location) {
        return res.status(404).json({
          error:
            "Incident not found. Pass type and location in the body alongside incidentId to start a session without a stored incident.",
        });
      }
      incident = {
        id: String(incidentId).trim(),
        type: String(type).trim(),
        description: String(description || "").trim(),
        location: String(location).trim(),
      };
    } else {
      incident = { id: incSnap.id, ...incSnap.data() };
    }

    const existing = await db
      .collection(SESSIONS_COLLECTION)
      .where("incidentId", "==", incidentId)
      .limit(25)
      .get();

    const openDoc = existing.docs.find((d) => d.data().status === "open");
    if (openDoc) {
      const data = openDoc.data();
      const enriched = await enrichOffer(openDoc.id, data);
      return res.status(200).json(enriched);
    }

    const volSnap = await db.collection("volunteers").get();
    const volunteers = volSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ranked = rankVolunteersForIncident(incident, volunteers);

    if (ranked.length === 0) {
      return res.status(200).json({
        session_id: null,
        incident_id: incidentId,
        offered_volunteer: null,
        queue: [],
        message: "No suitable volunteers at this incident location with matching skills.",
      });
    }

    const volunteerIds = ranked.map((r) => r.volunteer.id);

    const sessionPayload = {
      incidentId,
      volunteerIds,
      currentIndex: 0,
      status: "open",
      acceptedVolunteerId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection(SESSIONS_COLLECTION).add(sessionPayload);
    const snap = await ref.get();
    const enriched = await enrichOffer(ref.id, snap.data());
    return res.status(201).json(enriched);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to start assignment session" });
  }
};

function formatSessionResponse(sessionId, data) {
  if (!data) return { session_id: sessionId };
  const ids = data.volunteerIds || [];
  const idx = typeof data.currentIndex === "number" ? data.currentIndex : 0;
  const currentId = ids[idx] ?? null;

  return {
    session_id: sessionId,
    incident_id: data.incidentId,
    status: data.status,
    current_index: idx,
    queue_volunteer_ids: ids,
    offered_volunteer_id: currentId,
    accepted_volunteer_id: data.acceptedVolunteerId ?? null,
    updated_at: serializeTimestamp(data.updatedAt),
    created_at: serializeTimestamp(data.createdAt),
  };
}

async function enrichOffer(sessionId, data) {
  const base = formatSessionResponse(sessionId, data);
  const oid = base.offered_volunteer_id;
  if (!oid) {
    return { ...base, offered_volunteer: null };
  }
  const vs = await db.collection("volunteers").doc(oid).get();
  if (!vs.exists) {
    return { ...base, offered_volunteer: null };
  }
  return { ...base, offered_volunteer: volunteerToResponse(vs.id, vs.data()) };
}

/**
 * POST /api/assignment-sessions/:sessionId/respond  { accept: boolean }
 */
export const respondToAssignment = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { accept } = req.body || {};

    if (typeof accept !== "boolean") {
      return res.status(400).json({ error: "accept must be a boolean" });
    }

    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return res.status(404).json({ error: "Assignment session not found" });
    }

    const data = sessionSnap.data();
    if (data.status !== "open") {
      // For any already-closed session (completed or exhausted),
      // return its current state — making the endpoint idempotent.
      const enriched = await enrichOffer(sessionId, data);
      return res.status(200).json({
        ...enriched,
        message:
          data.status === "completed"
            ? "Assignment already accepted. Session is completed."
            : "Session is already closed (exhausted). No volunteers remain.",
      });
    }

    const ids = data.volunteerIds || [];
    let idx = typeof data.currentIndex === "number" ? data.currentIndex : 0;

    if (idx >= ids.length) {
      return res.status(400).json({ error: "No volunteer is currently offered for this session" });
    }

    const offeredVolunteerId = ids[idx];

    if (accept) {
      await sessionRef.update({
        status: "completed",
        acceptedVolunteerId: offeredVolunteerId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const volRef = db.collection("volunteers").doc(offeredVolunteerId);
      await volRef.update({
        tasks_completed: FieldValue.increment(1),
      });

      const updated = await sessionRef.get();
      const enriched = await enrichOffer(sessionId, updated.data());
      return res.status(200).json({
        ...enriched,
        message: "Assignment accepted. Task count updated for volunteer.",
      });
    }

    const nextIndex = idx + 1;
    if (nextIndex >= ids.length) {
      await sessionRef.update({
        status: "exhausted",
        currentIndex: nextIndex,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const updated = await sessionRef.get();
      const enriched = await enrichOffer(sessionId, updated.data());
      return res.status(200).json({
        ...enriched,
        offered_volunteer_id: null,
        offered_volunteer: null,
        message: "Offer declined. No more volunteers in queue.",
      });
    }

    await sessionRef.update({
      currentIndex: nextIndex,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await sessionRef.get();
    const ud = updated.data();
    const enriched = await enrichOffer(sessionId, ud);

    return res.status(200).json({
      ...enriched,
      message: "Offer declined. Next volunteer in queue is now offered.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to process response" });
  }
};
