import { getChatHistory, saveChatMessage } from "../services/chatStore.js";

export async function getChatHistoryHandler(req, res) {
  try {
    const roomId = String(req.query.roomId || "Mumbai Relief Group").trim();
    const limit = Number(req.query.limit || 100);
    const history = await getChatHistory(roomId, Number.isFinite(limit) ? limit : 100);
    return res.json(history);
  } catch (err) {
    console.error("[Chat][GET history] error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch chat history" });
  }
}

export async function postChatMessageHandler(req, res) {
  try {
    const roomId = String(req.body?.roomId || "Mumbai Relief Group").trim();
    const senderName = String(req.body?.senderName || "Anonymous").trim();
    const content = String(req.body?.content || "").trim();

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const saved = await saveChatMessage({ roomId, senderName, content });
    return res.status(201).json(saved);
  } catch (err) {
    console.error("[Chat][POST message] error:", err);
    return res.status(500).json({ error: err.message || "Failed to save chat message" });
  }
}
