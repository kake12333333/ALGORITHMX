import express from "express";
import { createIncident, getIncidents } from "../controllers/incidentController.js";

const router = express.Router();

router.post("/report", createIncident);
router.get("/all", getIncidents);

export default router;