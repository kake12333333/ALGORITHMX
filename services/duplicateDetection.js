/**
 * Heuristic duplicate detection: same incident type + similar location + similar description.
 */

const DESC_JACCARD_MIN = 0.32;
const DESC_JACCARD_RELAXED = 0.22;
const LOCATION_MAX_NORMALIZED_DISTANCE = 0.34;

export function normalizeLocation(location) {
  return String(location || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeDescriptionText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tokenize(text) {
  const words = String(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  return words ? new Set(words) : new Set();
}

export function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array(n + 1);
  for (let j = 0; j <= n; j += 1) row[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

export function locationsRoughlyMatch(loc1, loc2) {
  const a = normalizeLocation(loc1);
  const b = normalizeLocation(loc2);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;
  const dist = levenshtein(a, b);
  return dist / maxLen <= LOCATION_MAX_NORMALIZED_DISTANCE;
}

function oneDescriptionContainsOther(d1, d2) {
  const a = normalizeDescriptionText(d1);
  const b = normalizeDescriptionText(d2);
  if (a.length < 12 || b.length < 12) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * True if the new report likely describes the same incident as an existing one.
 */
export function isLikelyDuplicateReport(newReport, existingReport) {
  const { type: t1, description: d1, location: l1 } = newReport;
  const { type: t2, description: d2, location: l2 } = existingReport;

  if (!t1 || !t2 || String(t1) !== String(t2)) return false;
  if (!locationsRoughlyMatch(l1, l2)) return false;

  const words1 = tokenize(d1);
  const words2 = tokenize(d2);
  const jac = jaccardSimilarity(words1, words2);

  if (jac >= DESC_JACCARD_MIN) return true;
  if (oneDescriptionContainsOther(d1, d2)) return true;

  const locExact = normalizeLocation(l1) === normalizeLocation(l2);
  if (locExact && jac >= DESC_JACCARD_RELAXED) return true;

  return false;
}

export function firestoreDocTimeMs(data) {
  const c = data?.createdAt;
  if (c == null) return Number.MAX_SAFE_INTEGER;
  if (typeof c.toDate === "function") {
    try {
      return c.toDate().getTime();
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  if (c instanceof Date) return c.getTime();
  if (typeof c === "string") {
    const t = new Date(c).getTime();
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  }
  if (typeof c === "number") return c;
  return Number.MAX_SAFE_INTEGER;
}
