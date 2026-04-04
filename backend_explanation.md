# VeriPulse Backend Explanation

## 1. Backend Tech Stack

### Core Runtime and Framework
- **Node.js**
  - Used as the backend runtime.
  - Good fit for hackathon speed: fast setup, huge ecosystem, easy JSON handling.
- **Express.js**
  - Used to build REST APIs and route management.
  - Lightweight and simple for modular controllers/routes.

### Database and Cloud Services
- **Firebase Admin SDK + Cloud Firestore**
  - Used as the primary database for incidents, volunteers, chat messages, and assignment sessions.
  - Firestore gives flexible document storage and quick cloud setup.
- **Firebase Authentication (Admin SDK)**
  - Used in auth routes to create users and look up users by email.

### Realtime Communication
- **Socket.IO**
  - Used for realtime group chat (join room, send message, typing state, online users).

### File Uploads
- **Multer**
  - Used for uploading incident media and volunteer ID documents.
  - Configured with file type and size validation.

### Environment and Security Utilities
- **dotenv**
  - Loads environment variables like `PORT` and `CLIENT_ORIGIN`.
- **cors**
  - Allows frontend-to-backend cross-origin communication.

### AI Dependency Status
- **`@google/generative-ai` is installed but not actively used in backend source execution paths.**
  - Current incident analysis is done by internal rule-based logic (`services/aiService.js`).

---

## 2. API Structure

## Base
- Backend base: `http://localhost:5000`
- Common API prefix: `/api`

## Health and Root
- `GET /`
  - Returns: `Backend running 🚀`
- `GET /api/health`
  - Returns service status and key route list.

## Auth APIs (`/api/auth`)
- `POST /api/auth/register`
- `POST /api/auth/signup` (alias)
  - Purpose: Create Firebase Auth user.
  - Body: `{ email, password }`
  - Response: `{ status, email, role }`
- `POST /api/auth/login`
  - Purpose: Lookup user by email (hackathon-style login flow).
  - Body: `{ email, password }`
  - Response: `{ status, user: { email, role } }`

## Incident APIs (`/api/incidents`)
- `POST /api/incidents`
- `POST /api/incidents/`
- `POST /api/incidents/report` (alias)
  - Purpose: Create incident, run AI scoring, detect duplicates, save/merge.
  - Supports JSON and multipart (`media` file).
- `GET /api/incidents`
  - Purpose: Citizen feed (filtered, dashboard-ready shape).
- `GET /api/incidents/all`
  - Purpose: Full raw incidents list (admin use).
- `GET /api/incidents/summary`
  - Purpose: Aggregated summary counts.
- `GET /api/incidents/:incidentId/volunteer-candidates`
  - Purpose: Rank suitable volunteers for an incident.
- `PATCH /api/incidents/:id/assignment`
  - Purpose: Record volunteer accept/reject for incident assignment.
- `PATCH /api/incidents/:id/status`
  - Purpose: Manually update incident status.

## Volunteer APIs (`/api/volunteers`)
- `POST /api/volunteers/register`
  - Purpose: Register volunteer profile (+ optional `id_document`).
- `GET /api/volunteers`
  - Purpose: List volunteers.
- `PATCH /api/volunteers/:id/status`
  - Purpose: Update volunteer status (`pending`, `active`, etc.).

## Assignment Session APIs (`/api/assignment-sessions`)
- `POST /api/assignment-sessions/start`
  - Purpose: Create/reuse assignment session and offer first ranked volunteer.
- `POST /api/assignment-sessions/:sessionId/respond`
  - Purpose: Accept/decline current volunteer offer and move queue.

## Chat REST APIs (`/api/chat`)
- `GET /api/chat/history?roomId=...&limit=...`
  - Purpose: Fetch room chat history.
- `POST /api/chat/messages`
  - Purpose: Save chat message.

## Static + Upload Routes
- `GET /uploads/...` serves uploaded files.
- `GET /...` serves frontend static files from `frontend/`.

### How frontend interacts
- `frontend/report-submission.js` -> incident creation APIs.
- `frontend/dashboard-integration.js` -> `GET /api/incidents`, `GET /api/incidents/summary`.
- `frontend/admin-alerts.js` + `frontend/admin-reports.js` -> `/api/incidents/all`, PATCH status.
- `frontend/volunteer.html` + `frontend/admin-volunteers.js` -> volunteer + assignment APIs.
- `frontend/chat.html` -> Socket.IO events + chat REST support.

---

## 3. Gemini AI Integration

### Current state in this backend
- Gemini SDK package exists in dependencies.
- **No active Gemini API invocation is present in backend execution files (`server.js`, `routes/`, `controllers/`, `services/`, `middleware/`).**
- Current AI behavior is implemented by local heuristic logic in `services/aiService.js`.

### Practical implication
- **Input to Gemini:** Not applicable in current backend flow.
- **Output from Gemini:** Not applicable in current backend flow.
- **Processing path used today:** Rule-based scoring -> trust/priority/status.

---

## 4. AI Logic (Very Important)

Current AI logic is in `services/aiService.js` via `analyzeIncident(description, type, location, hasMedia)`.

## Inputs (parameters used)
- `description` (incident text)
- `type` (one of Fire, Medical, Crime, Flood, Power Outage, Other)
- `location` (string)
- `hasMedia` (boolean from uploaded file presence)

## Keyword sets
- High severity keywords: `fire`, `explosion`, `accident`, `trapped`, `injured`, `flood`, `emergency`
- Medium severity keywords: `smoke`, `suspicious`, `outage`, `issue`
- Type boost types: `medical`, `crime`

## Priority determination
- Start `priority = "Low"`
- If high keyword found OR type is `medical/crime` -> `priority = "High"`
- Else if medium keyword found -> `priority = "Medium"`

## Trust score calculation
- Start: `trust_score = 0.5`
- If high keyword -> `+0.3`
- If medium keyword -> `+0.15`
- If media provided -> `+0.1`
- Cap to max `1.0`
- Round to 2 decimals

So formula is:
- `trust_score = min(1.0, 0.5 + high*0.3 + medium*0.15 + media*0.1)`

Where `high`, `medium`, `media` are 0/1 flags.

## Verified vs Not Verified decision
- `status = "Verified"` if `trust_score >= 0.8`
- Otherwise `status = "Pending"`

## Additional derived logic in controller
- `required_volunteers` based on priority:
  - High -> 3
  - Medium -> 2
  - Low -> 1

## AI reason text
- The service returns an explanatory reason string including:
  - severity keyword match result
  - type risk boost
  - media evidence
  - location availability
  - vague description warning

### Note on score scale interpretation
- AI service outputs trust in **0 to 1 scale**.
- Some dashboard/admin logic later converts it to percentage for display.
- Some summary checks compare against 80/50 thresholds, which implies a 0-100 expectation; this is an implementation inconsistency to be aware of.

---

## 5. Authentication

## What is used
- Firebase Authentication via Firebase Admin SDK in backend auth routes.

## How it works currently
- Registration: `createUser(email, password)` via Admin SDK.
- Login: `getUserByEmail(email)` to verify account existence.
- Role assignment:
  - `admin@gmail.com` -> `admin`
  - others -> `citizen`

## Why this approach was chosen
- Very fast to implement for hackathon timeline.
- No custom user table needed.
- Works well with existing Firebase setup.

## Important limitation
- Current login flow is simplified and does not perform full token-based password verification/authorization middleware.
- Good for prototype/demo; should be hardened for production.

---

## 6. End-to-End Data Flow

## Incident report flow
1. User submits report in frontend (`report.html`/`report-submission.js`).
2. Frontend sends JSON or multipart request to `POST /api/incidents`.
3. Backend validates type/description/location.
4. Backend computes AI result (`analyzeIncident`).
5. Backend checks duplicates (`findEarliestDuplicate`).
6. If duplicate: merge into original (`mergeIntoCanonical`).
7. Else: create new Firestore document in `incidents`.
8. Backend returns merged/new incident object.
9. Dashboard fetches updated list and summary.

## Volunteer assignment flow
1. Admin/logic starts session: `POST /api/assignment-sessions/start`.
2. Backend ranks volunteers by location + skill suitability.
3. Session stores queue and current offer.
4. Frontend responds accept/reject via `POST /:sessionId/respond`.
5. On accept: session `completed`, volunteer `tasks_completed` incremented.
6. On reject: session advances queue or becomes `exhausted`.

## Chat flow
1. User joins socket room (`join` / `join_room`).
2. Backend sends `chat_history` and online count.
3. User sends message (`chatMessage` / `send_message`).
4. Backend stores message in Firestore (or memory fallback).
5. Backend emits `new_message` + compatibility `message` event.

---

## 7. Database

## Primary database
- **Cloud Firestore**

## Collections in use
- `incidents`
  - Fields include: `type`, `description`, `location`, `media_url`, `trust_score`, `priority`, `status`, `reason`, `report_count`, `merged_descriptions`, `required_volunteers`, `assignments`, `createdAt`, reporter fields.
- `volunteers`
  - Fields include: `name`, `age`, `email`, `phone`, `location`, `skills`, `reason`, `id_document_url`, `tasks_completed`, `status`, `createdAt`.
- `assignment_sessions`
  - Fields include: `incidentId`, `volunteerIds`, `currentIndex`, `status`, `acceptedVolunteerId`, timestamps.
- `chatMessages`
  - Fields include: `roomId`, `senderName`, `content`, `status`, `createdAt`.

## Retrieval pattern
- Mostly collection queries + orderBy/where.
- Includes fallback logic if ordered query fails.
- Duplicate detection scans recent candidate incidents.

## Fallback behavior
- If Firebase init fails:
  - incidents and chat use in-memory fallback arrays/maps.

---

## 8. Design Decisions

## Why this stack
- Node + Express: rapid API development.
- Firestore: schema flexibility, cloud-ready, quick integration.
- Socket.IO: easy realtime chat integration.
- Multer: straightforward media upload support.

## Why internal heuristic AI (current)
- Predictable behavior, no external latency/cost.
- Works offline from external AI APIs.
- Easy to explain to judges and demo reliably.

## Trade-offs
- Pros:
  - Fast development.
  - Lower operational complexity.
  - Deterministic outputs.
- Cons:
  - Less semantic understanding than LLM-based scoring.
  - Hard-coded keywords may miss nuanced reports.
  - Simplified auth is not production-grade security.

---

## 9. Alternatives and Comparisons

## AI alternatives
- **Gemini API (planned/possible, dependency installed)**
  - Pros: richer language understanding, context reasoning.
  - Cons: API cost, latency, prompt tuning complexity, external dependency.
- **OpenAI / Claude APIs**
  - Similar pros/cons to Gemini for this use-case.
- **Current heuristic model (used now)**
  - Pros: fast, transparent, cheap.
  - Cons: lower intelligence and flexibility.

## Database alternatives
- **MongoDB Atlas**
  - Pros: flexible docs, powerful aggregation.
  - Cons: extra setup compared to existing Firebase footprint.
- **PostgreSQL**
  - Pros: strong relational integrity.
  - Cons: more schema and migration overhead for hackathon speed.
- **Firestore (chosen)**
  - Pros: fastest path with Firebase auth + server SDK in same ecosystem.

## Auth alternatives
- **JWT with custom user DB**
  - Pros: full control over token lifecycle.
  - Cons: more implementation/security work.
- **Firebase Auth (chosen)**
  - Pros: managed auth infrastructure, quick integration.
  - Cons: current project’s login flow needs token hardening for production.

---

## 10. Final Summary

VeriPulse backend is a modular Node.js + Express system backed by Firestore, with REST APIs for incidents, volunteers, assignment workflows, auth, and chat. Realtime communication is handled using Socket.IO. Incident intelligence currently uses an internal rule-based scoring engine (trust, priority, verified/pending), then stores and serves results through dashboard/admin endpoints. Duplicate incident merging and volunteer suitability ranking provide practical decision support. The architecture is hackathon-friendly: fast, understandable, and demo-stable, while leaving clear upgrade paths for stronger auth and true LLM-based Gemini scoring.

---

## 11. File Location

Saved at:
- `backend_explanation.md`
- Full path: `C:\Users\ARJUN KEDAR\OneDrive\Desktop\ALGORITHMX\ALGORITHMX\backend_explanation.md`
