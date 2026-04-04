# VeriPulse Database Explanation

## 1) Database Overview

### Which database is used
- Primary database: Firebase Cloud Firestore
- Authentication store: Firebase Authentication (separate from Firestore collections)

### Why it was chosen
- Very fast to set up for a hackathon
- Works well with JavaScript backend (Node.js)
- Flexible schema for incident and chat style data
- Easy scaling for read and write traffic

### Database type
- Firestore is a NoSQL document database
- Data is stored in collections of JSON-like documents

---

## 2) Collections and Purpose

### incidents
- Stores all incident reports submitted by users
- Also stores AI scoring results, merge metadata, and assignment state

### volunteers
- Stores volunteer registration details and lifecycle status
- Used for candidate matching and assignment

### assignment_sessions
- Stores the volunteer assignment queue for each incident
- Tracks current offer index and accept/decline progress

### chatMessages
- Stores room-based chat history
- Supports realtime chat playback and status updates

### Not a Firestore collection, but important
- Firebase Authentication users
  - Used for register and login lookup
  - Managed by Firebase Auth service, not in Firestore documents

---

## 3) Data Structure by Collection

## A) incidents collection

### Main fields
- id: string (document id)
- type: string
- description: string
- location: string
- media_url: string
- trust_score: number
- priority: string
- status: string
- reason: string
- reporter_name: string or null
- reporter_email: string or null
- createdAt: timestamp
- report_count: number
- merged_descriptions: array of strings
- last_merged_at: timestamp
- required_volunteers: number
- assignments: array of objects

### assignments array item
- volunteerId: string
- action: string (accept or reject)
- timestamp: string (ISO datetime)

### Sample incident document
{
  "type": "Fire",
  "description": "Large fire near market, smoke spreading quickly",
  "location": "Bandra West",
  "media_url": "/uploads/1740000000000-123456789.jpg",
  "trust_score": 0.9,
  "priority": "High",
  "status": "Verified",
  "reason": "Critical emergency keywords detected. Media evidence increases confidence. Location provided",
  "reporter_name": "Aarav",
  "reporter_email": "aarav@example.com",
  "createdAt": "server timestamp",
  "report_count": 2,
  "merged_descriptions": [
    "Fire spreading near market road"
  ],
  "last_merged_at": "server timestamp",
  "required_volunteers": 3,
  "assignments": [
    {
      "volunteerId": "VOL123",
      "action": "accept",
      "timestamp": "2026-04-04T10:22:00.000Z"
    }
  ]
}

---

## B) volunteers collection

### Main fields
- id: string (document id)
- name: string
- age: number
- email: string
- phone: string
- location: string
- skills: string
- reason: string
- status: string
- id_document_url: string
- tasks_completed: number
- createdAt: timestamp

### Sample volunteer document
{
  "name": "Neha Sharma",
  "age": 24,
  "email": "neha@example.com",
  "phone": "9999999999",
  "location": "Bandra West",
  "skills": "medical first aid, rescue",
  "reason": "I want to support local emergency response",
  "status": "pending",
  "id_document_url": "/uploads/1740000000000-555111222.pdf",
  "tasks_completed": 0,
  "createdAt": "server timestamp"
}

---

## C) assignment_sessions collection

### Main fields
- id: string (document id)
- incidentId: string
- volunteerIds: array of strings
- currentIndex: number
- status: string (open, completed, exhausted)
- acceptedVolunteerId: string or null
- createdAt: timestamp
- updatedAt: timestamp

### Sample assignment session document
{
  "incidentId": "INCIDENT_DOC_ID",
  "volunteerIds": ["VOL1", "VOL2", "VOL3"],
  "currentIndex": 1,
  "status": "open",
  "acceptedVolunteerId": null,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}

---

## D) chatMessages collection

### Main fields
- id: string (document id)
- roomId: string
- senderName: string
- content: string
- status: string (sent or delivered)
- createdAt: string or timestamp (stored as ISO string in current implementation)

### Sample chat message document
{
  "roomId": "Mumbai Relief Group",
  "senderName": "Volunteer A",
  "content": "Ambulance reached location",
  "status": "sent",
  "createdAt": "2026-04-04T10:40:00.000Z"
}

---

## 4) Relationships Between Collections

Because Firestore is NoSQL, relationships are handled by ids and application logic.

### incident and volunteers
- Relationship type: many-to-many style through assignments data
- incidents document stores assignment actions with volunteerId values
- Volunteer suitability is computed at runtime from volunteer profile fields and incident data

### assignment_sessions and incidents
- assignment_sessions.incidentId points to an incidents document id
- One incident can have one active session and multiple historical sessions

### assignment_sessions and volunteers
- assignment_sessions.volunteerIds holds ordered volunteer document ids
- currentIndex points to the volunteer currently being offered
- acceptedVolunteerId stores the final accepted volunteer id

### chatMessages and users
- chatMessages stores senderName and roomId directly
- No strict foreign key to volunteers or auth users

---

## 5) Data Flow (Create, Update, Retrieve)

## Incident flow
1. Frontend sends incident report to incident API
2. Backend validates payload
3. Backend computes AI score and checks duplicate candidates in incidents collection
4. Backend either merges into existing document or inserts new incident document
5. Frontend fetches incidents and summary endpoints to render dashboard

## Volunteer flow
1. Frontend sends volunteer registration to volunteer API
2. Backend validates and saves volunteer document
3. Admin frontend fetches volunteer list and updates status via patch endpoint

## Assignment flow
1. Frontend starts session with incident id
2. Backend reads incident and volunteer collections, ranks candidates, writes assignment session
3. Frontend sends accept or reject response
4. Backend updates session and increments volunteer task count on acceptance

## Chat flow
1. Frontend joins socket room and requests history
2. Backend reads chatMessages for room and emits history
3. On send, backend writes chat message document and broadcasts to room

---

## 6) Query Logic (Fetch, Filter, Sort)

## incidents queries
- Create path duplicate search:
  - where type equals incoming type
  - candidate limit applied
  - custom duplicate scoring done in service logic
- List path:
  - orderBy createdAt desc when possible
  - fallback to get all then sort in code by createdAt
- Summary path:
  - compute counts in backend after fetch

## volunteers queries
- List volunteers:
  - orderBy createdAt desc when possible
  - fallback to full get
- Status update:
  - direct document lookup by id and update

## assignment_sessions queries
- Start session:
  - where incidentId equals requested id
  - scans returned docs for open status in application layer
- Respond flow:
  - direct lookup by session id
  - update currentIndex, status, acceptedVolunteerId

## chatMessages queries
- where roomId equals selected room
- orderBy createdAt asc and limit when possible
- fallback query without orderBy, then sort in app logic

---

## 7) Special Logic

## Duplicate incident detection
- Uses incidents collection as candidate pool
- Filters by same incident type
- Applies location similarity check (normalized text + edit distance)
- Applies description similarity check (Jaccard and containment)
- If duplicate found:
  - updates canonical incident with report_count increment
  - appends merged_descriptions
  - sets last_merged_at
  - upgrades trust/priority/status only when new trust score is higher

## Volunteer ranking
- Uses incident fields plus volunteer skills and location
- Location must roughly match
- Suitability score built from keyword overlap and type hints
- Sorted by fewer tasks_completed first, then higher suitability score

## Chat storage
- Each message saved to chatMessages
- Message status starts as sent
- If more than one user online in room, status updated to delivered
- History fetched by room and sent to joining client

---

## 8) Performance and Design

### Why this structure works well
- Document model fits incidents, chat messages, and volunteer profiles naturally
- Minimal joins needed; most reads are direct collection queries
- Easy to evolve schema by adding new fields

### Advantages
- Fast development and iteration
- Good scalability for realtime-style app
- Flexible for optional fields and evolving features

### Limitations
- Some computed logic (summary, sorting fallback) runs in application code
- No strict relational constraints between collections
- Some trust score handling uses mixed scales in UI logic
- Chat createdAt is stored as ISO string, not native Firestore timestamp in current flow

---

## 9) Alternatives

## MongoDB
- Could replace Firestore as NoSQL store
- Strong querying and aggregation
- Not selected because current project already uses Firebase ecosystem

## PostgreSQL
- Could provide strict relational modeling and SQL analytics
- Better for strong foreign keys and transactional constraints
- Not selected because this project optimizes for rapid hackathon delivery and flexible schema

---

## 10) Security

### Current protection in backend
- Input validation in controllers (required fields, allowed incident types, age checks)
- File upload restrictions in Multer (mime type and size)
- CORS enabled
- Firebase Admin SDK uses service account credentials on server side

### Important limitations
- Firestore security rules are not represented in this backend and Admin SDK bypasses client rules
- Auth flow is simplified for hackathon and lacks strong token-based route protection middleware
- Many APIs are callable without authorization checks in current implementation

---

## Final Beginner-Friendly Summary

The project uses Firestore as a NoSQL database with four main collections: incidents, volunteers, assignment_sessions, and chatMessages. Data is connected using document ids and backend logic instead of SQL joins. Incidents are scored and merged, volunteers are ranked and assigned through session queues, and chat is stored per room with realtime updates. The structure is flexible and fast for hackathon use, but production security and stricter data controls should be improved.

---

## File Location

- File name: database_explanation.md
- Save path: C:\Users\ARJUN KEDAR\OneDrive\Desktop\ALGORITHMX\ALGORITHMX\database_explanation.md
