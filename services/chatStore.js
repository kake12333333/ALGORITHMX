import db from "../config/firebase.js";

const CHAT_COLLECTION = "chatMessages";
const memoryRooms = new Map();

function toIso(value) {
  if (!value) return new Date().toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function mapMessage(id, data) {
  return {
    id,
    roomId: data.roomId,
    senderName: data.senderName,
    content: data.content,
    status: data.status || "sent",
    timestamp: toIso(data.createdAt || data.timestamp),
  };
}

function getMemoryRoom(roomId) {
  if (!memoryRooms.has(roomId)) {
    memoryRooms.set(roomId, []);
  }
  return memoryRooms.get(roomId);
}

export async function saveChatMessage({ roomId, senderName, content }) {
  const payload = {
    roomId,
    senderName,
    content,
    status: "sent",
    createdAt: new Date().toISOString(),
  };

  if (!db) {
    const message = {
      id: `MEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
      timestamp: payload.createdAt,
    };
    const room = getMemoryRoom(roomId);
    room.push(message);
    return message;
  }

  const docRef = await db.collection(CHAT_COLLECTION).add(payload);
  const snap = await docRef.get();
  return mapMessage(docRef.id, snap.data());
}

export async function getChatHistory(roomId, limit = 100) {
  if (!roomId) return [];

  if (!db) {
    const room = getMemoryRoom(roomId);
    return room.slice(-limit);
  }

  let docs;
  try {
    const snapshot = await db
      .collection(CHAT_COLLECTION)
      .where("roomId", "==", roomId)
      .orderBy("createdAt", "asc")
      .limit(limit)
      .get();
    docs = snapshot.docs;
  } catch {
    const snapshot = await db.collection(CHAT_COLLECTION).where("roomId", "==", roomId).get();
    docs = snapshot.docs.sort((a, b) => {
      const ta = new Date(toIso(a.data().createdAt)).getTime();
      const tb = new Date(toIso(b.data().createdAt)).getTime();
      return ta - tb;
    });
  }

  return docs.map((doc) => mapMessage(doc.id, doc.data())).slice(-limit);
}

export async function markDelivered(messageId, roomId) {
  if (!messageId || !roomId) return;

  if (!db) {
    const room = getMemoryRoom(roomId);
    const msg = room.find((item) => item.id === messageId);
    if (msg) msg.status = "delivered";
    return;
  }

  await db.collection(CHAT_COLLECTION).doc(messageId).update({ status: "delivered" });
}
