import { locationsRoughlyMatch } from "./duplicateDetection.js";

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "was",
  "are",
  "not",
]);

const TYPE_SKILL_HINTS = {
  Fire: ["fire", "smoke", "rescue", "evacuation", "extinguisher", "hose", "ladder"],
  Medical: ["medical", "first", "aid", "ambulance", "health", "nurse", "doctor", "cpr"],
  Crime: ["crime", "security", "police", "law", "patrol", "safety"],
  Flood: ["flood", "water", "rescue", "boat", "swim", "evacuation"],
  "Power Outage": ["power", "electric", "electrical", "outage", "utility"],
  Other: ["logistics", "coordination", "communication", "transport", "help", "volunteer"],
};

function tokenizeMeaningful(text) {
  const words = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  if (!words) return new Set();
  return new Set(words.filter((w) => w.length > 2 && !STOP.has(w)));
}

/**
 * Heuristic "AI" suitability: overlap between incident context and volunteer skills + reason.
 * Returns a non-negative score; higher is better.
 */
export function computeSuitabilityScore(incident, volunteer) {
  const incidentText = `${incident.type || ""} ${incident.description || ""}`.toLowerCase();
  const volunteerText = `${volunteer.skills || ""} ${volunteer.reason || ""}`.toLowerCase();

  const incTokens = tokenizeMeaningful(incidentText);
  const volTokens = tokenizeMeaningful(volunteerText);

  let overlap = 0;
  for (const t of incTokens) {
    if (volTokens.has(t)) overlap += 1;
  }

  const hints = TYPE_SKILL_HINTS[incident.type] || TYPE_SKILL_HINTS.Other;
  let hintHits = 0;
  for (const h of hints) {
    if (volunteerText.includes(h)) hintHits += 1;
  }

  return overlap + Math.min(hintHits, 3) * 0.5;
}

/**
 * Volunteer is "suitable" if location matches (caller checks) and skills align enough with the incident.
 */
export function isVolunteerSuitableForIncident(incident, volunteer, minScore = 0.5) {
  return computeSuitabilityScore(incident, volunteer) >= minScore;
}

/**
 * Rank volunteers: same location as incident, suitable, then fewer tasks_completed first, then higher suitability.
 */
export function rankVolunteersForIncident(incident, volunteers) {
  const list = [];

  for (const v of volunteers) {
    if (!locationsRoughlyMatch(v.location, incident.location)) continue;
    const score = computeSuitabilityScore(incident, v);
    if (!isVolunteerSuitableForIncident(incident, v, 0.25)) continue;

    list.push({
      volunteer: v,
      suitability_score: Number(score.toFixed(2)),
      tasks_completed: typeof v.tasks_completed === "number" ? v.tasks_completed : 0,
    });
  }

  list.sort((a, b) => {
    if (a.tasks_completed !== b.tasks_completed) {
      return a.tasks_completed - b.tasks_completed;
    }
    return b.suitability_score - a.suitability_score;
  });

  return list;
}
