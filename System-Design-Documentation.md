# LittleLingo AI - System Design

## 1. Product scope

LittleLingo AI is a responsive English-learning web app for young children, with caregiver accounts, learner progress, curated lessons and quizzes, Word Explorer, feelings vocabulary, and a conversational companion called Buddy. It is a learning aid, not childcare, therapy, a diagnostic tool, or a substitute for caregiver supervision.

The application is a single-service deployment: a Node.js/Express process serves both the browser files in `public/` and the JSON API. Caregiver accounts, learner state, quiz attempts and uniquely practiced words live in a managed MySQL 8 service (Aiven) reached over a pooled, TLS-verified connection. Gemini is optional; local Buddy responses remain available when Gemini is not configured or a response cannot be used.

## 2. Requirements and design goals

### Functional
- Register and sign in caregivers; associate generated learner profiles with caregiver accounts.
- Provide L1 Beginner, L2 Intermediate, and L3 Expert learning content.
- Teach the level-specific sequence: alphabet, early numbers and familiar words in L1; word blending, short sentences, and numbers 1–100 in L2; short-story reading, sentence building, and fill-in-the-blank work in L3.
- Provide one aligned 10-question quiz for each level.
- Allow caregivers to select a learner's level manually and advance automatically after every vocabulary word in a level has been practiced.
- Track unique word practices, quiz attempts, stars, lessons played, and mastery.
- Let Buddy choose among conversation, learning, engagement, emotional-support, celebration, and safety-redirect modes.
- Personalize Buddy using the learner's saved level and progress, the current activity/topic, and bounded recent conversation turns.
- Resolve optional selected lesson and word IDs against the learner's current level, then give Buddy only relevant trusted curriculum materials; never include quiz answer keys.
- Work without a Gemini key and fall back locally when Gemini is unavailable or returns an invalid response.
- Provide browser text-to-speech and speech recognition when available.

### Non-functional
- Responsive layout and age-appropriate, concise responses.
- Text contrast, 44px touch targets, visible keyboard focus, and a per-screen heading order that meets WCAG AA at narrow viewports.
- Validate API input, constrain request size and rate, and verify caregiver ownership of learner-specific operations.
- Keep Gemini credentials server-side.
- Persist state in a managed relational database that survives restarts and redeploys, reached only over a verified TLS connection.
- Render user-facing text safely and fail over when the optional model cannot provide a valid response.

## 3. High-level architecture

See [System-Diagram.jpeg](./System-Diagram.jpeg) for the component and data-flow diagram.

1. The child or caregiver uses the browser app. HTML, CSS, and JavaScript are served from `public/`; optional speech features use browser APIs. Browser assets are gzip-compressed in memory and cached by file modification time, with a SHA-1 `ETag` and `Vary: Accept-Encoding`.
2. Express serves static files and the REST API from the same origin. Helmet applies response security headers, API requests are rate-limited, request bodies are size-limited, and Zod schemas validate route inputs. Word practice and listening have a separate higher rate limit to support the 100-number Level 2 curriculum, and `/api` paths that no route claims answer with JSON `404` instead of the single-page app shell.
3. The API exposes separate content, chat, authentication, and progress routes. `src/data/curriculum.js` combines the base word list with level-specific cards, generated number names, lesson challenges, and three server-checked quiz sets.
4. Chat verifies caregiver ownership, reads saved learner context through the learning engine, detects the child's current mode and mood, and calls Gemini when appropriate. Gemini output is validated; otherwise the local fallback generates a response. The reply returns through the chat route, not through the progress API.
5. Progress routes validate ownership and update MySQL. Every database-touching handler and the `requireAuth` middleware are asynchronous, because the store is now a network service rather than an in-process file; Express 5 forwards a rejected handler to the error middleware, so an unreachable database answers with the child-safe JSON `500` instead of crashing the process. The chat service reads the saved learner summary through the same learning engine; it does not route messages through progress mutation logic.

### Main modules

- `public/`: responsive browser interface and speech feature detection.
- `src/server.js`: loads environment variables, opens the database pool, starts Express, logs the measured startup round trip, and uses the hosting-provided `PORT` or port `5000`. `SIGINT`/`SIGTERM` drain the HTTP server and the pool before exiting.
- `src/app.js`: middleware, caregiver authentication routes, content/chat/progress APIs, server-side tutor curriculum-context resolution, and static frontend delivery.
- `src/services/static-assets.js`: in-memory gzip cache for `public/` files, keyed by modification time, with path-traversal guards, strong `ETag`s, and `Vary: Accept-Encoding`.
- `src/services/auth.service.js`: salted scrypt password hashes, signed seven-day bearer tokens, the hashed revocation denylist, and a short in-process failed-login window.
- `src/services/mode-detection.service.js`: rule-based mode and mood cues.
- `src/services/learning-engine.service.js`: learner progress, quiz mastery, and saved chat context.
- `src/services/gemini.service.js`: optional Gemini request with constrained JSON output, response validation, timeout, safe status, and failure fallback signaling.
- `src/services/fallback.service.js`: mode-aware local replies with selected-lesson and curriculum-word responses.
- `src/services/safety.service.js`: bounded text/output checks and basic safety keyword guardrails.
- `src/database/`: the MySQL connection pool (`connection.js`, which parses the Service URI, builds the TLS options and applies `schema.sql`) and the MySQL schema itself.
- `src/data/curriculum.js`: level-specific teaching materials, generated alphabet/number cards, lesson challenges, and quiz answer keys. `src/data/vocabulary.json` supplies the base vocabulary.

## 4. Storage model

The MySQL 8 schema defines:

- `caregivers`: unique email address and salted scrypt password hash.
- `learners`: generated learner ID, caregiver association, selected level, stars, and lesson-play count.
- `attempts`: the quiz question ID, skill/category, correctness, session ID, and timestamp, on an auto-increment surrogate key so the newest tries can be read with `ORDER BY id DESC`. The question ID is stored rather than the option the child tapped, so repeated tries on one question accumulate toward that question's mastery instead of scattering across options. Indexed by `(learner_id, item_id)` and `(learner_id, session_id)`.
- `word_practices`: unique learner/item pairs on a composite unique key, so practicing the same word repeatedly counts once toward that learner's vocabulary progress; the surrogate key also gives "most recently practiced" an unambiguous order.
- `revoked_tokens`: the SHA-256 hash and expiry of every bearer token that has been signed out. Hashes rather than raw tokens are stored so the table is useless if the database leaks, and an index on `expires_at` lets stale rows be pruned.

Foreign keys link learner-owned records to their learner and cascade deletion at the database level. The application currently resets a learner's attempts, word practices, stars, lesson-play count, and level through the authenticated reset endpoint; the response returns the learner's fresh progress so the caregiver screen cannot keep showing the old level. There is no caregiver account deletion API.

`DATABASE_URL` is the Service URI copied from the hosting console, including its `?ssl-mode=` query parameter, which the application reads only to confirm the connection is meant to be encrypted: `ssl-mode=DISABLED` is refused with an error rather than honoured. mysql2 is handed discrete host, port, user, password and database values, with percent-encoded credentials decoded. `DATABASE_POOL_SIZE` sets the pool width, defaulting to 5, and idle sockets are kept alive because ephemeral application hosts go quiet between children.

`AIVEN_CA_CERT` (a PEM, escaped-newline PEM, or base64 of either) or `AIVEN_CA_CERT_FILE` pins the provider's certificate authority, and the URI's hostname is sent as the TLS server name because Aiven serves many databases from one certificate host. Whether or not a CA is configured, `rejectUnauthorized` stays on. Because Aiven signs its server certificates with its own CA — which no system trust store contains — an unset CA means the handshake is refused with `self-signed certificate in certificate chain` and startup exits with a message naming the two variables that fix it; that failure was reproduced against the live service rather than assumed. The rows here are children's records, so an unverified connection is not an available option.

Multi-statement execution is switched off for the whole pool. Startup applies `schema.sql` one statement at a time from a trusted file, so no request can ever stack statements. Writes that must succeed together — an attempt with its star update, a reset with its two deletes and level-clearing update, and registration's caregiver-plus-learner pair — run inside a transaction that checks out one pooled connection and releases it on completion or rollback; a duplicate registration is recognised from MySQL's `ER_DUP_ENTRY` and answered as the `409` it is. Because a round trip to a networked database is no longer free, the dashboard's two attempt aggregates are read in one query and the post-write mastery and progress reads are issued concurrently.

## 5. Caregiver authentication and API access

Registration accepts an email and a password between 10 and 128 characters, hashes the password with scrypt and a random salt, and creates an initial learner profile. Login returns a signed bearer token with a seven-day expiry. The frontend stores that token in `sessionStorage`; closing the browser session may require signing in again. Sign-in and a restored session both open the welcome screen, where "Start Learning" moves into the dashboard and gives the dashboard heading keyboard and screen-reader focus.

Tokens are stateless, so revocation needs a denylist rather than a session table. `POST /api/auth/logout` stores the SHA-256 hash of the presented token in `revoked_tokens` and `requireAuth` rejects any token whose hash appears there, which makes signing out effective on the server instead of only clearing browser storage. The hash is stored rather than the token itself so a database read cannot hand back usable credentials. Revoked rows are pruned opportunistically; a token that has expired is unreachable whether or not it was revoked.

Repeated failed sign-ins for one email are held in a short in-process window rather than locked permanently, so a caregiver who mistypes a password can try again shortly while an attacker cannot cheaply enumerate passwords. The revocation denylist is shared because it lives in the database, so signing out takes effect for every instance; that in-process window and the rate-limit counters are not, so scaling out still assumes one instance until a shared store is added.

Set `AUTH_SECRET` to a long, random value in production. The development fallback secret must not be used on a public deployment. Protected routes require an `Authorization: Bearer <token>` header. Chat and progress routes additionally verify that the requested learner belongs to the authenticated caregiver. Content routes and health are public.

The login page includes a forgot-password screen, but password reset is intentionally disabled until a verified email-delivery provider and a single-use, expiring reset-token flow are configured. The interface does not reveal or display reset tokens; caregivers are told to contact the site administrator in the meantime.

All `/api` routes are rate-limited per visitor, keyed on the real client address because `trust proxy` is set to one hop for the hosting load balancer. There are deliberately three budgets: `RATE_LIMIT_MAX_REQUESTS` (default 120 per 60s) for chat, quiz and lesson submissions; `LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS` (default 240) for word practice and listening, which a child working through the 100-number Level 2 set exhausts long before they exhaust their conversational budget; and `HEALTH_RATE_LIMIT_MAX_REQUESTS` (default 120) scoped to the health probe so a platform monitor can neither be starved by users nor starve users. A limited request returns `429` with a JSON body. JSON request bodies are limited to 12 KB. Malformed JSON returns `400`, an oversized body `413`, and any unmatched path under `/api` returns a JSON `404` instead of falling through to the browser app's HTML.

## 6. API contracts

| Method and path | Access | Behavior |
| --- | --- | --- |
| `GET /api/health` | Public | Returns service status, whether a Gemini key is configured, the configured model, whether the breaker is cooling down, and a timestamp. |
| `POST /api/auth/register` | Public | Creates caregiver and initial learner. Body: `{email, password}`. |
| `POST /api/auth/login` | Public | Verifies credentials and returns a bearer token, learner ID, and expiry. |
| `GET /api/auth/me` | Bearer token | Returns caregiver email and linked learner profiles. |
| `POST /api/auth/logout` | Bearer token | Revokes the presented token in the denylist table and acknowledges. |
| `GET /api/lessons?level=L1` | Public | Returns level-specific lessons and child-facing practice challenges; defaults to L1. |
| `GET /api/lessons/:id` | Public | Returns one lesson or `404`. |
| `POST /api/lessons/:id/challenge` | Bearer token | Accepts `{selectedOptionIndex}`; grades the challenge against the bundled answer key and returns correctness with the index of the right option. |
| `GET /api/vocabulary?category=animals&level=L1` | Public | Returns curated words filtered by optional category and level. |
| `GET /api/quizzes?level=L1&category=colors` | Public | Returns 10 level-aligned questions as `{label, emoji}` options without correct-answer keys. Each of the three levels has one 10-question set. |
| `POST /api/chat` | Bearer token | Accepts `{learnerId, message, context?}` and returns Buddy's mode, mood, message, activity/feedback fields, response source, safe `aiStatus`, and duration. |
| `GET /api/progress/:learnerId` | Bearer token | Returns level, stars, quiz counts/accuracy/mastery, practiced word totals, and level progress. |
| `POST /api/progress/attempt` | Bearer token | Accepts `{learnerId, quizId, selectedOptionIndex, sessionId}`. The server grades the position against the bundled quiz, records the attempt under the question's own ID, updates stars, and returns `correctOptionIndex`. A quiz from another level returns `409`. |
| `POST /api/progress/practice` | Bearer token | Accepts `{learnerId, itemId}`; records a unique word practice and may advance the level. An unknown word returns `404`, a word outside the learner's level `409`. |
| `POST /api/progress/listen` | Bearer token | Accepts `{learnerId, itemId}`; increments the lessons-played count with the same level checks. |
| `POST /api/progress/level` | Bearer token | Accepts `{learnerId, level}` for manual selection of L1, L2, or L3. |
| `POST /api/progress/reset` | Bearer token | Resets one linked learner and returns their fresh progress so the caregiver screen can resync; provide the ID in the `x-learner-id` header. |

### Chat request and context

Example request:

```json
{
  "learnerId": "11111111-1111-4111-8111-111111111111",
  "message": "Teach me a word",
  "context": {
    "level": "L1",
    "currentTopic": "animals",
    "currentActivity": "animal-names",
    "lessonId": "animal-names",
    "itemId": "cat",
    "history": [
      { "role": "child", "text": "I like animals." },
      { "role": "buddy", "text": "Animals are fun!" }
    ]
  }
}
```

The chat schema limits a message to 500 characters, history to six supplied entries, and each history text to 250 characters. The service uses at most the last four turns. Saved learner history is derived server-side from level, practiced vocabulary, lesson plays, quiz accuracy, and recent quiz attempts. Lesson and item IDs are resolved against bundled curriculum at the learner's level; arbitrary client-supplied lesson text and mastery values are not trusted. The Gemini prompt receives a bounded set of matching lesson summaries and word examples, never quiz answer keys. The response's safe `aiStatus` is `ready`, `not_configured`, `timeout`, `provider_error`, `unavailable`, `invalid_response`, or `not_requested`; it does not expose provider error text or credentials. Chat transcripts themselves are not stored in the database by the current API. Because a shared family device hands the same browser to the next caregiver, signing out erases the on-screen conversation and the in-memory history the browser would otherwise resend as context for the next child; the token is revoked at the same time.

## 7. Learning progress and level changes

### Word practice and level progress

Each learner/item pair is stored once in `word_practices`. Progress is the share of vocabulary items in the currently selected level that have been practiced. When the final unpracticed item makes the level reach 100%, the server advances L1 to L2 or L2 to L3. L3 is the highest level and does not auto-advance. A caregiver can also manually select any of the three levels; the level's progress is calculated from that level's vocabulary practices.

Practices remain recorded when the level changes, and the next level's progress is calculated against its own vocabulary set. Quiz mastery and quiz correctness are tracked separately; they do not gate the word-practice-based level advance.

### Curriculum and quiz sets

L1 contains A–Z letter cards, numbers 1–10, and familiar color, animal, fruit, family and feeling words. L2 contains sound-blending words, short-sentence examples, an independently tracked number sequence from 1–100, and toy, action-word, everyday-object and nature words. L3 presents short reading passages, sentence-order practice, and fill-in-the-blank activities. The Lessons screen filters activities to the learner's selected level; long word lists are shown in pages of 20. Opening a lesson fetches `/api/vocabulary?level=…&category=…`, so a lesson is only teachable once at least four word cards exist for its own level and category; `tests/curriculum.test.js` enforces that and also requires every lesson category to round-trip through the topic matcher that Buddy uses when a child asks for it by name.

The family, feelings, toy, action-word, everyday-object and nature lessons were authored for this project rather than by a curriculum specialist. They follow the existing level and sentence patterns of the bundled content, and each carries a server-checked challenge, but they are starter content pending educator review. The quiz sets were deliberately left at 10 questions per level, so these six lessons are taught and practiced without being quizzed.

There are 10 quiz questions for each level (30 total). Reading questions include the short passage needed to answer them. Correct answers remain in the server curriculum module and are stripped from the public quiz response; the answer endpoint checks selections against that server-side key. Word practice/listen actions have a separate higher rate limit than other API calls so the number curriculum can be explored without weakening limits for chat and authentication.

### Quiz progress

Each quiz submission is checked against the server's bundled quiz answer. A correct answer earns one star. Attempts are recorded against the question ID rather than the option the child chose, so a question answered wrongly and then correctly accumulates history on the same question; an item counts as mastered after at least three correct attempts across at least two distinct session IDs, looking only at that learner's most recent 20 tries on it. Overall quiz accuracy is based on submitted attempts. These metrics support dashboard feedback and learner context but do not control automatic level advancement.

### Lesson-play count

The Word Explorer listen action records a play and increments `lessons_completed`. This is a usage counter for the dashboard; it should not be interpreted as completion of a full lesson curriculum.

## 8. Child mode, SEL, and AI behavior

Mode detection is rule-based and examines the current child message. Precedence is safety redirect, emotional support, celebration, engagement/play, explicit learning, and ordinary conversation. A general feeling may populate a mood label while remaining in conversational mode; distress cues take the support path. A learning screen does not itself force Buddy to teach. Unmatched messages default to conversation.

Buddy's context combines the detected mode/mood with the saved learner summary, current topic/activity, and bounded recent turns. Gemini is prompted to use age-appropriate language, teach only when requested, acknowledge feelings without diagnosis, encourage effort and curiosity, avoid pressure or shame, and direct a child to a trusted grown-up when they describe danger or being hurt. The local fallback is also mode-aware. Quick greetings/thanks and messages flagged by basic safety rules use local handling rather than a Gemini request.

The child mode and mood outputs are heuristic signals, not reliable mental-state classification. Safety keyword rules can miss context or produce false positives. Rules are phrase-shaped rather than single-word so ordinary requests such as "What is fire?" or "you hurt my feelings" are not redirected. Either side can raise a safety redirect: if the model returns `SAFETY_REDIRECT`, the child sees the reviewed local wording rather than model text. This system is not therapy or a safety guarantee; caregiver supervision and independent child-safety evaluation are necessary.

## 9. Gemini integration and failure handling

Gemini is optional. The service reads `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `AI_TIMEOUT_MS` (default `8000`), `GEMINI_FAILURE_THRESHOLD` (default `3`), `GEMINI_BREAKER_WINDOW_MS` (default `60000`) and `GEMINI_BREAKER_COOLDOWN_MS` (default `30000`). The key must never be sent to browser code or committed to source control.

Provider model names are retired over time; a retired name is rejected with `404` and the whole chat path silently answers from the local fallback. `GET /api/health` reports the configured `aiModel`, the breaker's recent-failure count and remaining cooldown, so this failure mode is visible rather than silent. The configured model cannot be confirmed from the model list, which returns no entries for the project key; the only reliable check is a live chat request. With the current key, successful replies arrive in roughly 2.4-4.6 seconds, so Buddy answers locally whenever the provider takes longer than the per-attempt budget.

For eligible chat turns, the service sends the latest child message, up to four bounded recent conversation turns, and learner level, mode, mood, topic, activity, and saved learning history to Gemini. The child's text is fenced as untrusted content that cannot change Buddy's instructions, and the request uses `responseSchema` so the provider returns structured JSON rather than prose that has to be scraped out of a code fence. Reasoning spend is tuned per model family (`thinkingBudget` on 2.5, `thinkingLevel` on 3.x) because default reasoning multiplies the wait for a young child. The reply is parsed and validated against supported modes and output requirements, then re-checked by the same safety rules as the child's message: a reply that solicits personal details, asks a child to keep a secret, or contains unsafe content is discarded.

Missing credentials, a client initialization failure, a timeout, a provider error, invalid JSON, or an unsafe reply all result in the local fallback. `AI_TIMEOUT_MS` is a per-attempt budget, so a retryable provider response (`408`, `429`, or `5xx`) gets a second full attempt rather than sharing one shrinking deadline, and the abandoned request is cancelled with an abort signal instead of being left to run. The circuit breaker counts failures inside a rolling `GEMINI_BREAKER_WINDOW_MS` window instead of requiring them to be strictly consecutive, so intermittent provider faults that arrive over a minute still trip it; opening suppresses provider calls for `GEMINI_BREAKER_COOLDOWN_MS`. The first request after a cooldown is treated as a recovery probe: a single failure re-opens the breaker immediately instead of letting every child wait out the timeout while the provider is still down. A timeout bounds how long the app waits before falling back; it does not establish a latency guarantee for the model provider.

When Gemini is enabled, child messages and bounded learning/conversation context are sent to Google. Caregivers should be informed before enabling it, and the deployed service must follow applicable provider terms, privacy commitments, and child-data requirements.

## 10. Deployment and persistence

The repository is intended for a single Render Web Service plus a managed MySQL 8 service (Aiven) outside it. Configure the repository root, Node runtime, build command `npm install`, start command `npm start`, and health check `/api/health`. Set `NODE_ENV=production`, a secure `AUTH_SECRET`, the `DATABASE_URL` Service URI and the provider CA (`AIVEN_CA_CERT` or `AIVEN_CA_CERT_FILE`); optionally set Gemini environment variables. Render supplies `PORT`. There is no required `render.yaml`.

In the Aiven console, create the MySQL service, download its CA certificate, restrict the IP allowlist to the application's egress where the host publishes one, and add a dedicated database user rather than pointing the app at the admin account. Keep `DATABASE_POOL_SIZE × instances` inside the server's connection limit.

Progress now survives a restart or redeploy because it lives in the managed service, not on the application's ephemeral filesystem. Startup applies `schema.sql` with `CREATE TABLE IF NOT EXISTS`, so the configured user needs DDL privileges for the first deploy and only read/write afterwards. A hosted database is not a backup: schedule the provider's backups and test a restore separately.

The trade-off for durability is a network round trip in front of every authenticated request. `/api/health` deliberately answers without touching the database so a slow or unreachable server cannot be reported as an unhealthy app instance, while `/api` routes that do query surface a failure as the generic JSON `500`. Token revocation is shared through the database; rate-limit buckets and failed-login counters remain in process memory, so horizontal scaling is still unsupported until those move to a shared store.

The Express service serves the frontend and API from one origin, simplifying deployment and browser API calls. Browser speech recognition may require HTTPS and depends on device/browser support.

## 11. Privacy, safety, and operational limits

- Caregiver registration stores an email address; child profiles use generated identifiers and do not require a child's real name.
- The database holds caregiver password hashes and learner progress. Protect the managed service, its credentials and its backups with appropriate access controls, and keep the connection secret in the platform's secret store rather than in the repository.
- The app does not intentionally persist raw microphone recordings; browser speech recognition behavior is outside the app's control.
- Define caregiver consent, retention, deletion, and incident-response practices before public deployment. The API currently has learner progress reset, but no caregiver account deletion or full data export route.
- Obtain jurisdiction-specific legal review for child privacy obligations. This document does not claim COPPA, GDPR-K, or other compliance.
- Text contrast, 44px touch targets, keyboard focus visibility, and heading order have been audited in a real browser at a narrow (531px) viewport across every screen, authenticated and not, and meet WCAG AA. Browser speech features, safety behavior, and Gemini output still require testing on target browsers and devices; screen-reader and magnifier behavior have not been tested.
- Anonymous or generated learner IDs are not credentials; access control relies on the caregiver token and server-side ownership checks.

## 12. Testing, trade-offs, and future work

Run `npm test` for the Node test suite and `npm run benchmark` for the health endpoint benchmark. The suite needs `TEST_DATABASE_URL` and runs its database cases serially (`--test-concurrency=1`) because the files share one server; it seeds rows under generated identifiers and deletes those again rather than clearing tables it does not own. Configuration, curriculum, fallback, safety and provider-contract cases need no database. The benchmark does not measure Gemini latency. Neither command alone verifies a production deployment, real provider availability, browser speech support, or child safety.

Key trade-offs:

- Vanilla JavaScript avoids a frontend build pipeline and keeps the deployed service simple, but UI complexity may become harder to manage as the app grows.
- A managed MySQL service gives durable, restart-proof storage and shared token revocation, at the cost of a network round trip on every queried request, a pool that must be sized against the server's connection limit, and a provider whose TLS handshake and CA the deployment must trust.
- Optional Gemini adds flexible responses but introduces latency, quota, provider dependency, and data-sharing considerations; local fallback improves availability but is less expressive.
- Rule-based mode detection and progression are inspectable and predictable, but pedagogically simple and not reliable measures of a child's emotional state or learning ability.
- Browser speech APIs avoid sending raw audio through this app, but support and recognition quality vary and are not pronunciation assessment.

Potential future work includes account deletion/export controls, a shared store for rate-limit and failed-login counters so the app can scale past one instance, stronger independently evaluated safety controls, educator-reviewed curriculum, screen-reader and magnifier testing beyond the completed visual-contrast audit, and privacy-preserving operational monitoring.
