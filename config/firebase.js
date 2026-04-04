import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let db = null;

try {
  const serviceAccount = require("../serviceAccountKey.json");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  db = admin.firestore();

  if (serviceAccount.project_id) {
    console.log(`[Firebase] Firestore project: ${serviceAccount.project_id}`);
  }
} catch (err) {
  console.warn("[Firebase] Initialization failed. Running with in-memory incident fallback.");
  console.warn(`[Firebase] Reason: ${err.message}`);
}

export default db;