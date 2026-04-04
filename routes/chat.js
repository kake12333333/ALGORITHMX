import express from "express";
import { getChatHistoryHandler, postChatMessageHandler } from "../controllers/chatController.js";

const router = express.Router();

router.get("/history", getChatHistoryHandler);
router.post("/messages", postChatMessageHandler);

export default router;
