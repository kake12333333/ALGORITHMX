import express from "express";
import { createIncident, getIncidents } from "../controllers/incidentController.js";
import { getVolunteerCandidatesForIncident } from "../controllers/volunteerController.js";
import upload from "../middleware/upload.js";

const router = express.Router();

/**
 * Postman often sends JSON (application/json). Multer only parses multipart/form-data,
 * which can leave req.body empty and block Firestore writes. Use multer only for multipart.
 */
function maybeUploadMedia(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return upload.single("media")(req, res, next);
  }
  return next();
}

router.post("/report", maybeUploadMedia, createIncident);
router.get("/all", getIncidents);
router.get("/:incidentId/volunteer-candidates", getVolunteerCandidatesForIncident);

export default router;
