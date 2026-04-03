import express from "express";
import upload from "../middleware/upload.js";
import { registerVolunteer, listVolunteers } from "../controllers/volunteerController.js";

const router = express.Router();

function maybeIdUploadVolunteer(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return upload.single("id_document")(req, res, next);
  }
  return next();
}

router.post("/register", maybeIdUploadVolunteer, registerVolunteer);
router.get("/", listVolunteers);

export default router;
