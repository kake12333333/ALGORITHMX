import admin from "firebase-admin";
import serviceAccount from "../serviceAccountKey.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

if (serviceAccount.project_id) {
  console.log(`[Firebase] Firestore project: ${serviceAccount.project_id}`);
}

export default db;