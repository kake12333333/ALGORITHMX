import db from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { rankVolunteersForIncident } from "../services/volunteerMatching.js";

const VOLUNTEERS_COLLECTION = "volunteers";

function serializeTimestamp(value) {
  if (value == null) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return value;
}

export function volunteerToResponse(id, data) {
  if (!data) return { id };
  return {
    id,
    name: data.name ?? "",
    age: data.age ?? null,
    email: data.email ?? "",
    phone: data.phone ?? "",
    location: data.location ?? "",
    skills: data.skills ?? "",
    reason: data.reason ?? "",
    status: data.status ?? "pending",
    id_document_url: data.id_document_url ?? "",
    tasks_completed: typeof data.tasks_completed === "number" ? data.tasks_completed : 0,
    createdAt: serializeTimestamp(data.createdAt),
  };
}

export const registerVolunteer = async (req, res) => {
  try {
    const { name, age, location, skills, reason, email, phone } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const ageNum = Number(age);
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 120) {
      return res.status(400).json({ error: "age must be a valid number" });
    }
    if (!location || !String(location).trim()) {
      return res.status(400).json({ error: "location is required" });
    }
    if (!skills || !String(skills).trim()) {
      return res.status(400).json({ error: "skills is required" });
    }

    const idUrl = req.file ? `/uploads/${req.file.filename}` : "";

    const payload = {
      name: String(name).trim(),
      age: ageNum,
      email: email ? String(email).trim() : "",
      phone: phone ? String(phone).trim() : "",
      location: String(location).trim(),
      skills: String(skills).trim(),
      reason: reason ? String(reason).trim() : "",
      id_document_url: idUrl,
      tasks_completed: 0,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection(VOLUNTEERS_COLLECTION).add(payload);
    const snap = await ref.get();
    return res.status(201).json(volunteerToResponse(ref.id, snap.data()));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to register volunteer" });
  }
};

export const listVolunteers = async (_req, res) => {
  try {
    const snapshot = await db.collection(VOLUNTEERS_COLLECTION).orderBy("createdAt", "desc").get();
    const items = snapshot.docs.map((doc) => volunteerToResponse(doc.id, doc.data()));
    return res.json(items);
  } catch {
    const snapshot = await db.collection(VOLUNTEERS_COLLECTION).get();
    const items = snapshot.docs.map((doc) => volunteerToResponse(doc.id, doc.data()));
    return res.json(items);
  }
};

/**
 * GET /api/incidents/:incidentId/volunteer-candidates
 * Ranked list of suitable volunteers (same location, workload-balanced order).
 */
export const getVolunteerCandidatesForIncident = async (req, res) => {
  try {
    const { incidentId } = req.params;
    const providedId = String(incidentId || "").trim();

    // Merge query-string params + body so this works whether the client
    // sends fields as ?type=...&location=... OR as a JSON body on the GET request.
    const merged = { ...(req.query || {}), ...(req.body || {}) };
    const { type, description, location } = merged;

    if (!providedId) {
      return res.status(400).json({ error: "incidentId is required" });
    }

    // 1. Try direct document lookup by the provided ID.
    let incidentSnap = await db.collection("incidents").doc(providedId).get();

    // 2. Strict fallback: match all three fields from query/body.
    if (!incidentSnap.exists && type && description && location) {
      const fallbackQuery = await db
        .collection("incidents")
        .where("type", "==", String(type).trim())
        .where("description", "==", String(description).trim())
        .where("location", "==", String(location).trim())
        .limit(1)
        .get();

      if (!fallbackQuery.empty) {
        incidentSnap = fallbackQuery.docs[0];
      }
    }

    // 3. Broader fallback: match by location only.
    if ((!incidentSnap || !incidentSnap.exists) && location) {
      const locationQuery = await db
        .collection("incidents")
        .where("location", "==", String(location).trim())
        .limit(1)
        .get();

      if (!locationQuery.empty) {
        incidentSnap = locationQuery.docs[0];
      }
    }

    // 4. Virtual-incident fallback: build the incident from the request body
    //    so ranking works even when the ID is stale or the incident hasn't
    //    been persisted yet (covers TC5 "no assignment session yet" scenario).
    let incident;
    if (!incidentSnap || !incidentSnap.exists) {
      if (!type || !location) {
        return res.status(404).json({
          error:
            "Incident not found. Provide type and location in the request body to rank volunteers without a stored incident.",
        });
      }
      // Use a virtual incident built entirely from the request body.
      incident = {
        id: providedId,
        type: String(type).trim(),
        description: String(description || "").trim(),
        location: String(location).trim(),
      };
    } else {
      incident = { id: incidentSnap.id, ...incidentSnap.data() };
    }

    const volSnap = await db.collection(VOLUNTEERS_COLLECTION).get();
    const volunteers = volSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const ranked = rankVolunteersForIncident(incident, volunteers);
    return res.json({
      incident_id: incident.id,
      candidates: ranked.map((r) => ({
        volunteer: volunteerToResponse(r.volunteer.id, r.volunteer),
        suitability_score: r.suitability_score,
        tasks_completed: r.tasks_completed,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to rank volunteers" });
  }
};

export const updateVolunteerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    const ref = db.collection(VOLUNTEERS_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Volunteer not found" });
    }

    await ref.update({ status: String(status).trim() });
    const updatedSnap = await ref.get();
    
    return res.json(volunteerToResponse(updatedSnap.id, updatedSnap.data()));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update volunteer status" });
  }
};
