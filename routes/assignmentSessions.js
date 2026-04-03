import express from "express";
import { startAssignmentSession, respondToAssignment } from "../controllers/assignmentSessionController.js";

const router = express.Router();

router.post("/start", startAssignmentSession);
router.post("/:sessionId/respond", respondToAssignment);

export default router;
