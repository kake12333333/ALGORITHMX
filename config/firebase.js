import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("../../serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

if (serviceAccount.project_id) {
  console.log(`[Firebase] Firestore project: ${serviceAccount.project_id}`);
}

export default db;