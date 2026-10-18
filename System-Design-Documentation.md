# LittleLingo AI - System Design

## 1. Product scope

LittleLingo AI is a responsive English-learning web app for young children, with caregiver accounts, learner progress, curated lessons and quizzes, Word Explorer, feelings vocabulary, and a conversational companion called Buddy. It is a learning aid, not childcare, therapy, a diagnostic tool, or a substitute for caregiver supervision.

The application is a single-service deployment: a Node.js/Express process serves both the browser files in `public/` and the JSON API. SQLite stores caregiver accounts, learner state, quiz attempts, and uniquely practiced words. Gemini is optional; local Buddy responses remain available when Gemini is not configured or a response cannot be used.

## 2. Requirements and design goals

### Functional
- Register and sign in caregivers; associate generated learner profiles with caregiver accounts.
- Provide L1 Beginner, L2 Intermediate, and L3 Expert learning content.
- Allow caregivers to select a learner's level manually and advance automatically after every vocabulary word in a level has been practiced.
- Track unique word practices, quiz attempts, stars, lessons played, and mastery.
- Let Buddy choose among conversation, learning, engagement, emotional-support, celebration, and safety-redirect modes.
- Personalize Buddy using the learner's saved level and progress, the current activity/topic, and bounded recent conversation turns.
- Work without a Gemini key and fall back locally when Gemini is unavailable or returns an invalid response.
- Provide browser text-to-speech and speech recognition when available.

### Non-functional
- Responsive layout and age-appropriate, concise responses.
- Validate API input, constrain request size and rate, and verify caregiver ownership of learner-specific operations.
- Keep Gemini credentials server-side.
- Persist state in SQLite, with deployment documentation that distinguishes persistent storage from ephemeral hosting storage.
- Render user-facing text safely and fail over when the optional model cannot provide a valid response.

## 3. High-level architecture

See [System-Diagram.jpeg](./System-Diagram.jpeg) for the component and data-flow diagram.

1. The child or caregiver uses the browser app. HTML, CSS, and JavaScript are served from `public/`; optional speech features use browser APIs.
2. Express serves static files and the REST API from the same origin. Helmet applies response security headers, `/api` requests are rate-limited, request bodies are size-limited, and Zod schemas validate route inputs.
3. The API exposes separate content, chat, authentication, and progress routes. Curated lessons, vocabulary, and quizzes are loaded from JSON files in `src/data/`.
4. Chat verifies caregiver ownership, reads saved learner context through the learning engine, detects the child's current mode and mood, and calls Gemini when appropriate. Gemini output is validated; otherwise the local fallback generates a response. The reply returns through the chat route, not through the progress API.
5. Progress routes validate ownership and update SQLite. The chat service reads the saved learner summary directly from the database-backed learning engine; it does not route messages through progress mutation logic.

### Main modules

- `public/`: responsive browser interface and speech feature detection.
- `src/server.js`: loads environment variables, opens SQLite, starts Express, and uses the hosting-provided `PORT` or port `5000`.
- `src/app.js`: middleware, caregiver authentication routes, content/chat/progress APIs, and static frontend delivery.
- `src/services/auth.service.js`: salted scrypt password hashes and signed, seven-day bearer tokens.
- `src/services/mode-detection.service.js`: rule-based mode and mood cues.
- `src/services/learning-engine.service.js`: learner progress, quiz mastery, and saved chat context.
- `src/services/gemini.service.js`: optional Gemini request, response validation, timeout, and failure fallback signaling.
- `src/services/fallback.service.js`: mode-aware local replies.
- `src/services/safety.service.js`: bounded text/output checks and basic safety keyword guardrails.
- `src/database/`: SQLite connection and schema.
- `src/data/`: curated lesson, vocabulary, and quiz JSON.

## 4. Storage model

The SQLite schema defines:

- `caregivers`: unique email address and salted scrypt password hash.
- `learners`: generated learner ID, caregiver association, selected level, stars, and lesson-play count.
- `attempts`: quiz item, skill/category, correctness, session ID, and timestamp.
- `word_practices`: unique learner/item pairs, so practicing the same word repeatedly counts once toward that learner's vocabulary progress.
- `activities`: learner activity records reserved for activity history/summary use; the current progress flows do not depend on it.

Foreign keys link learner-owned records to their learner and cascade deletion at the database level. The application currently resets a learner's attempts, activities, word practices, stars, lesson-play count, and level through the authenticated reset endpoint. There is no caregiver account deletion API.

`DATABASE_PATH` selects the SQLite database file. If unset, the default is `./data/littlelingo.sqlite`, relative to the process working directory. Startup creates the parent directory, enables SQLite foreign keys and write-ahead logging, and loads the schema. SQLite storage is durable only if the deployment filesystem is durable.

## 5. Caregiver authentication and API access

Registration accepts an email and a password between 10 and 128 characters, hashes the password with scrypt and a random salt, and creates an initial learner profile. Login returns a signed bearer token with a seven-day expiry. The frontend stores that token in `sessionStorage`; closing the browser session may require signing in again. Logout is a client-side acknowledgement and does not revoke an issued token.

Set `AUTH_SECRET` to a long, random value in production. The development fallback secret must not be used on a public deployment. Protected routes require an `Authorization: Bearer <token>` header. Chat and progress routes additionally verify that the requested learner belongs to the authenticated caregiver. Content routes and health are public.

All `/api` routes are rate-limited. The default is 30 requests per 60 seconds per IP and can be changed using `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`. JSON request bodies are limited to 12 KB. Validation errors return client errors rather than accepting malformed data.

## 6. API contracts

| Method and path | Access | Behavior |
| --- | --- | --- |
| `GET /api/health` | Public | Returns service status, whether a Gemini key is configured, and a timestamp. |
| `POST /api/auth/register` | Public | Creates caregiver and initial learner. Body: `{email, password}`. |
| `POST /api/auth/login` | Public | Verifies credentials and returns a bearer token, learner ID, and expiry. |
| `GET /api/auth/me` | Bearer token | Returns caregiver email and linked learner profiles. |
| `POST /api/auth/logout` | Public | Returns an acknowledgement; browser code discards its token. |
| `GET /api/lessons?level=L1` | Public | Returns curated lessons for a valid level; defaults to L1. |
| `GET /api/lessons/:id` | Public | Returns one lesson or `404`. |
| `GET /api/vocabulary?category=animals&level=L1` | Public | Returns curated words filtered by optional category and level. |
| `GET /api/quizzes?level=L1&category=colors` | Public | Returns quiz data without correct-answer keys. |
| `POST /api/chat` | Bearer token | Accepts `{learnerId, message, context?}` and returns Buddy's mode, mood, message, activity/feedback fields, response source, and duration. |
| `GET /api/progress/:learnerId` | Bearer token | Returns level, stars, quiz counts/accuracy/mastery, practiced word totals, and level progress. |
| `POST /api/progress/attempt` | Bearer token | Accepts `{learnerId, quizId, selectedItemId, sessionId}`. The server checks the answer against the bundled quiz and updates attempts/stars. |
| `POST /api/progress/practice` | Bearer token | Accepts `{learnerId, itemId}`; records a unique word practice and may advance the level. |
| `POST /api/progress/listen` | Bearer token | Accepts `{learnerId, itemId}`; increments the lessons-played count. |
| `POST /api/progress/level` | Bearer token | Accepts `{learnerId, level}` for manual selection of L1, L2, or L3. |
| `POST /api/progress/reset` | Bearer token | Resets one linked learner; provide its ID in the `x-learner-id` header. |

### Chat request and context

Example request:

```json
{
  "learnerId": "11111111-1111-4111-8111-111111111111",
  "message": "Teach me a word",
  "context": {
    "level": "L1",
    "currentTopic": "animals",
    "currentActivity": "word-explorer",
    "history": [
      { "role": "child", "text": "I like animals." },
      { "role": "buddy", "text": "Animals are fun!" }
    ]
  }
}
```

The chat schema limits a message to 500 characters, history to six supplied entries, and each history text to 250 characters. The service uses at most the last four turns. Saved learner history is derived server-side from level, practiced vocabulary, lesson plays, quiz accuracy, and recent quiz attempts. Client-supplied mastery values are not accepted. Chat transcripts themselves are not stored in SQLite by the current API.

## 7. Learning progress and level changes

### Word practice and level progress

Each learner/item pair is stored once in `word_practices`. Progress is the share of vocabulary items in the currently selected level that have been practiced. When the final unpracticed item makes the level reach 100%, the server advances L1 to L2 or L2 to L3. L3 is the highest level and does not auto-advance. A caregiver can also manually select any of the three levels; the level's progress is calculated from that level's vocabulary practices.

Practices remain recorded when the level changes, and the next level's progress is calculated against its own vocabulary set. Quiz mastery and quiz correctness are tracked separately; they do not gate the word-practice-based level advance.

### Quiz progress

Each quiz submission is checked against the server's bundled quiz answer. A correct answer earns one star. An item is counted as mastered after at least three correct attempts across at least two distinct session IDs. Overall quiz accuracy is based on submitted attempts. These metrics support dashboard feedback and learner context but do not control automatic level advancement.

### Lesson-play count

The Word Explorer listen action records a play and increments `lessons_completed`. This is a usage counter for the dashboard; it should not be interpreted as completion of a full lesson curriculum.

## 8. Child mode, SEL, and AI behavior

Mode detection is rule-based and examines the current child message. Precedence is safety redirect, emotional support, celebration, engagement/play, explicit learning, and ordinary conversation. A general feeling may populate a mood label while remaining in conversational mode; distress cues take the support path. A learning screen does not itself force Buddy to teach. Unmatched messages default to conversation.

Buddy's context combines the detected mode/mood with the saved learner summary, current topic/activity, and bounded recent turns. Gemini is prompted to use age-appropriate language, teach only when requested, acknowledge feelings without diagnosis, encourage effort and curiosity, avoid pressure or shame, and direct a child to a trusted grown-up when they describe danger or being hurt. The local fallback is also mode-aware. Quick greetings/thanks and messages flagged by basic safety rules use local handling rather than a Gemini request.

The child mode and mood outputs are heuristic signals, not reliable mental-state classification. Safety keyword rules can miss context or produce false positives. This system is not therapy or a safety guarantee; caregiver supervision and independent child-safety evaluation are necessary.

## 9. Gemini integration and failure handling

Gemini is optional. The service reads `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`), and `AI_TIMEOUT_MS` (default `10000`) from the server environment. The key must never be sent to browser code or committed to source control.

For eligible chat turns, the service sends the child message and a bounded serialized context to Gemini and requests JSON. The response is parsed and validated against supported modes and output requirements. Missing credentials, a timeout, provider error, invalid JSON, or invalid response shape results in the local fallback. A timeout bounds how long the app waits before falling back; it does not establish a latency guarantee for the model provider.

When Gemini is enabled, child messages and bounded learning/conversation context are sent to Google. Caregivers should be informed before enabling it, and the deployed service must follow applicable provider terms, privacy commitments, and child-data requirements.

## 10. Deployment and persistence

The repository is intended for a single Render Web Service. Configure the repository root, Node runtime, build command `npm install`, start command `npm start`, and health check `/api/health`. Set `NODE_ENV=production` and a secure `AUTH_SECRET`; optionally set Gemini environment variables. Render supplies `PORT`. There is no required `render.yaml`.

On ephemeral hosting, the default SQLite file may be lost on restart or redeploy. Durable progress requires a persistent disk mounted by the host and `DATABASE_PATH` pointed to that mount (for example `/var/data/littlelingo.sqlite`), or migration to a managed database. Do not horizontally scale multiple instances against independent local SQLite files. Configure backups and test restoration separately.

The Express service serves the frontend and API from one origin, simplifying deployment and browser API calls. Browser speech recognition may require HTTPS and depends on device/browser support.

## 11. Privacy, safety, and operational limits

- Caregiver registration stores an email address; child profiles use generated identifiers and do not require a child's real name.
- SQLite contains caregiver password hashes and learner progress. Protect the database file and backups with appropriate access controls.
- The app does not intentionally persist raw microphone recordings; browser speech recognition behavior is outside the app's control.
- Define caregiver consent, retention, deletion, and incident-response practices before public deployment. The API currently has learner progress reset, but no caregiver account deletion or full data export route.
- Obtain jurisdiction-specific legal review for child privacy obligations. This document does not claim COPPA, GDPR-K, or other compliance.
- Browser speech features, content accessibility, safety behavior, and Gemini output require testing on target browsers and devices.
- Anonymous or generated learner IDs are not credentials; access control relies on the caregiver token and server-side ownership checks.

## 12. Testing, trade-offs, and future work

Run `npm test` for the Node test suite and `npm run benchmark` for the health endpoint benchmark. The benchmark does not measure Gemini latency. Neither command alone verifies a production deployment, real provider availability, browser speech support, or child safety.

Key trade-offs:

- Vanilla JavaScript avoids a frontend build pipeline and keeps the deployed service simple, but UI complexity may become harder to manage as the app grows.
- SQLite is lightweight and straightforward for one service instance, but requires durable mounted storage and is not configured for multi-instance coordination.
- Optional Gemini adds flexible responses but introduces latency, quota, provider dependency, and data-sharing considerations; local fallback improves availability but is less expressive.
- Rule-based mode detection and progression are inspectable and predictable, but pedagogically simple and not reliable measures of a child's emotional state or learning ability.
- Browser speech APIs avoid sending raw audio through this app, but support and recognition quality vary and are not pronunciation assessment.

Potential future work includes account deletion/export controls, a managed database for multi-instance scaling, stronger independently evaluated safety controls, educator-reviewed curriculum, accessibility testing, and privacy-preserving operational monitoring.
