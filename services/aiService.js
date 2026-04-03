const HIGH_KEYWORDS = ["fire", "explosion", "accident", "trapped", "injured", "flood", "emergency"];
const MEDIUM_KEYWORDS = ["smoke", "suspicious", "outage", "issue"];
const HIGH_TYPES = new Set(["medical", "crime"]);

function includesAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function analyzeIncident(description, type, location, hasMedia = false) {
  const normalizedDescription = String(description || "").trim().toLowerCase();
  const normalizedType = String(type || "").trim().toLowerCase();

  const highKeywords = includesAnyKeyword(normalizedDescription, HIGH_KEYWORDS);
  const mediumKeywords = includesAnyKeyword(normalizedDescription, MEDIUM_KEYWORDS);
  const hasTypeBoost = HIGH_TYPES.has(normalizedType);
  const isVague = !normalizedDescription || normalizedDescription.length < 8;

  let priority = "Low";
  if (highKeywords || hasTypeBoost) {
    priority = "High";
  } else if (mediumKeywords) {
    priority = "Medium";
  }

  let trust_score = 0.5;

  if (highKeywords) {
    trust_score += 0.3;
  }
  if (mediumKeywords) {
    trust_score += 0.15;
  }
  if (Boolean(hasMedia)) {
    trust_score += 0.1;
  }

  trust_score = Math.min(trust_score, 1.0);
  trust_score = Number(trust_score.toFixed(2));

  const status = trust_score >= 0.8 ? "Verified" : "Pending";

  const reasons = [];
  if (highKeywords) reasons.push("Critical emergency keywords detected");
  else if (mediumKeywords) reasons.push("Moderate severity indicators");
  else reasons.push("No strong emergency keywords detected");
  if (hasTypeBoost) reasons.push("Incident type indicates elevated risk");
  if (hasMedia) reasons.push("Media evidence increases confidence");
  if (location && String(location).trim()) reasons.push("Location provided");
  if (isVague) reasons.push("Description is brief, manual validation recommended");

  return {
    trust_score,
    priority,
    status,
    reason: reasons.join(". "),
  };
}
