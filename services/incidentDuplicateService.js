import { FieldValue } from "firebase-admin/firestore";
import { isLikelyDuplicateReport, firestoreDocTimeMs } from "./duplicateDetection.js";

const CANDIDATE_LIMIT = 200;

/**
 * Among recent incidents of the same type, find the earliest (original) report
 * that matches the incoming one as a duplicate.
 */
export async function findEarliestDuplicate(db, collectionName, { type, description, location }) {
  let snapshot;
  try {
    snapshot = await db
      .collection(collectionName)
      .where("type", "==", type)
      .limit(CANDIDATE_LIMIT)
      .get();
  } catch {
    snapshot = await db
      .collection(collectionName)
      .limit(CANDIDATE_LIMIT)
      .get();
  }

  const matches = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.type !== type) continue;
    if (
      isLikelyDuplicateReport(
        { type, description, location },
        {
          type: data.type,
          description: data.description || "",
          location: data.location || "",
        }
      )
    ) {
      matches.push({ id: doc.id, ref: doc.ref, data });
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => firestoreDocTimeMs(a.data) - firestoreDocTimeMs(b.data));
  return matches[0];
}

/**
 * Merge a new submission into the canonical (earliest) incident document.
 * Keeps original description, location, and createdAt; aggregates evidence.
 */
export async function mergeIntoCanonical(canonicalRef, canonicalData, { description, mediaUrl, aiResult }) {
  const prevCount = canonicalData.report_count;
  const baseCount =
    typeof prevCount === "number" && Number.isFinite(prevCount) && prevCount >= 1 ? prevCount : 1;

  const updates = {
    report_count: baseCount + 1,
    merged_descriptions: FieldValue.arrayUnion(description.trim()),
    last_merged_at: FieldValue.serverTimestamp(),
  };

  if (mediaUrl && !(canonicalData.media_url && String(canonicalData.media_url).trim())) {
    updates.media_url = mediaUrl;
  }

  const oldTrust = Number(canonicalData.trust_score ?? 0);
  const newTrust = Number(aiResult.trust_score ?? 0);
  if (newTrust > oldTrust) {
    updates.trust_score = newTrust;
    updates.priority = aiResult.priority;
    updates.status = aiResult.status;
    updates.reason = aiResult.reason;
  }

  await canonicalRef.update(updates);
}
