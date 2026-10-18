# System Design

## Goals and non-goals
LittleLingo AI gives children under seven short English practice, vocabulary, quizzes, voice conveniences and basic feelings vocabulary. It is not childcare, therapy, a diagnostic tool or a substitute for a caregiver.

## Requirements
Functional: anonymous learner ID; L1/L2/L3 content; chat; local fallback; vocabulary; quizzes; progress; voice where browser APIs exist. Non-functional: responsive layout, short outputs, safe DOM rendering, rate limits, input validation, persistent progress, and graceful provider failure.

## Architecture and responsibilities
- `public/`: responsive interface and browser-native speech.
- `src/app.js`: REST API, validation, security middleware and static delivery.
- `mode-detection.service.js`: fast rule-based mode classification.
- `context` passed by frontend is bounded and filtered; the backend does not trust submitted mastery values.
- `fallback.service.js`: local conversational responses independent of Gemini.
- `gemini.service.js`: optional Gemini call with timeout and schema validation.
- `learning-engine.service.js`: mastery and level progression from persisted attempts.
- SQLite stores anonymous IDs, levels, aggregate counters and item attempts.

## Data model
`learners(id, level, stars, lessons_completed, created_at, updated_at)` is the parent row. `attempts` references learners and stores item, skill, correctness, session ID and timestamp. `activities` is available for future event summaries. Foreign keys and indexes support integrity and lookups.

## API contracts
- `GET /api/health` → `{status, aiConfigured, timestamp}`.
- `POST /api/chat` body: `{learnerId, message, context?}` → `{mode,message,suggestedActivity,learningFeedback,source,durationMs}`.
- `GET /api/lessons?level=L1`, `GET /api/lessons/:id` return curated lesson data.
- `GET /api/vocabulary?category=animals&level=L1` returns curated word cards.
- `GET /api/quizzes?level=L1&category=colors` returns quiz questions without answer keys.
- `POST /api/progress/attempt` body: `{learnerId,itemId,skill,correct,sessionId,lessonCompleted?}`; the server calculates mastery and progress.
- `GET /api/progress/:learnerId` returns level, stars, attempts, accuracy and mastery counts.
- `POST /api/progress/reset` requires a configured `RESET_TOKEN` and matching `x-reset-token` plus `x-learner-id` headers. This is an administrative shared-token mechanism, not a strong identity proof; deploy behind caregiver-authenticated access for real use.

## Learning progression
An item is provisionally mastered after at least three correct attempts over at least two session IDs. L1 promotion requires at least four mastered words, at least 80% accuracy, and two completed lessons. L2 promotion requires eight mastered words, at least 80% accuracy, and four completed lessons. Previous content remains accessible. These starter thresholds should be tuned with educator evaluation.

## Mode detection and context
Deterministic cues identify safety, feelings, celebration, engagement and learning. Uncertain messages default to conversation. Gemini receives level, current topic/activity and at most four recent turns. The child-facing interface never displays internal reasons or confidence scores.

## AI and validation
Gemini is optional. The server reads `GEMINI_API_KEY` and `GEMINI_MODEL` from environment. Output is parsed as JSON and checked against allowed modes, message type and length. Invalid responses fall back locally. Safety regexes are only basic guardrails and cannot guarantee safe behavior; production requires independent evaluation and stronger moderation.

## Privacy and safety
No real name or account is required. Avoid asking for identifying data. Chat messages may be sent to Google when Gemini is enabled; inform caregivers before use. Do not retain raw audio intentionally. HTTPS, caregiver supervision, data deletion controls, retention policy, appropriate consent and jurisdiction-specific legal review are necessary before public use with children. This implementation is not a claim of COPPA, GDPR-K or other legal compliance.

## Latency and failure handling
Common greetings use local responses; curated content is bundled; Gemini has a configurable timeout (default 1300ms); failure returns a local response. The benchmark script measures the health endpoint round-trip and explicitly does not represent model latency. Measure actual `/api/chat` paths under a documented deployment and sample before making performance claims.

## Tests and deployment
`npm test` runs unit tests with Node's test runner and does not require Gemini. `npm run benchmark` measures the health route. Render config includes a persistent disk for SQLite; configure environment secrets in the hosting dashboard. Live deployment still requires account access, provisioning and verification.

## Trade-offs and limitations
Vanilla JS is light but can become harder to maintain as screens grow. SQLite is simple but needs persistent disk and is not ideal for horizontally scaled instances. Gemini provides flexible dialogue but adds latency, quota and privacy considerations. Deterministic progression is auditable but pedagogically simplistic. Browser speech varies by browser/device and is not a validated pronunciation scorer. Anonymous IDs are not strong authentication. Future work: caregiver authentication, independent safety evaluation, richer lessons, accessibility testing, analytics with privacy safeguards and educator-reviewed curriculum.
