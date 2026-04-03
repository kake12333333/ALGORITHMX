import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure .env is loaded even if this module is imported
// before the server's dotenv.config() runs.
import "dotenv/config";

function getModel(modelName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment (.env).");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err) {
  const msg = String(err?.message || "");
  return (
    msg.includes("503") ||
    msg.includes("Service Unavailable") ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("UNAVAILABLE")
  );
}

export async function analyzeIncident(text) {
  // Primary model (latest free Flash) + fallback when under high demand.
  const primary = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";
  const modelNames = [primary, fallback].filter(Boolean);

  const prompt = `
You are an AI system for emergency analysis.

Analyze this report:
"${text}"

Return ONLY JSON:
{
  "trust_score": number,
  "priority": "High" | "Medium" | "Low",
  "status": "Verified" | "Suspicious" | "Fake",
  "reason": "short explanation"
}
`;

  let lastErr;

  for (const name of modelNames) {
    const model = getModel(name);

    // 3 tries per model with exponential backoff (handles 503/429 spikes).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response.text();

        const clean = response.replace(/```json|```/g, "").trim();

        try {
          return JSON.parse(clean);
        } catch {
          const match = clean.match(/\{[\s\S]*\}/);
          if (!match) throw new Error(`AI response was not valid JSON: ${clean}`);
          return JSON.parse(match[0]);
        }
      } catch (err) {
        lastErr = err;
        if (!isRetryableGeminiError(err) || attempt === 2) break;
        await sleep(400 * 2 ** attempt);
      }
    }
  }

  throw lastErr;
}