# LittleLingo AI

LittleLingo AI is a responsive English-learning web app for young children. A single Node.js/Express service serves the browser app and REST API. Caregivers create an account and learner profile; Buddy combines saved learning progress with the current conversation and can use optional Gemini responses or a local fallback.

## Features
- Responsive browser interface: a welcome screen, then the dashboard, Word Explorer, lessons, quizzes, feelings vocabulary, and Buddy.
- Level-based curriculum: L1 covers A–Z, numbers 1–10, colors, animals, fruits, family and feelings; L2 covers blending sounds into words, short sentences, numbers 1–100, toys, action words, everyday objects and nature; L3 includes short stories, sentence building, and fill-in-the-blank practice.
- Each level has a 10-question quiz over its core categories. Lessons and word cards include animated, interactive practice; number cards are paged in groups of 20.
- Caregivers can select a level manually; practicing every vocabulary item in that level advances the learner automatically.
- Progress saved in a managed MySQL 8 database (Aiven), including uniquely practiced words, quiz attempts, stars, and lessons played. Connections are pooled and always TLS-verified — against the provider's CA when `AIVEN_CA_CERT` is set, against the system trust store otherwise.
- Caregiver registration and sign-in. Passwords are stored as salted scrypt hashes; authenticated API access uses a signed bearer token that expires after seven days. Signing out adds the token to a server-side denylist so a shared or borrowed device cannot keep answering as that caregiver.
- Login includes a forgot-password screen, but email delivery is not configured yet, so reset requests are disabled. Caregivers must contact the site administrator until a verified email provider is configured.
- Buddy detects conversation, learning, engagement, celebration, emotional-support, and safety-redirect modes. It adapts to the learner's saved level and recent progress without turning every conversation into a lesson.
- Optional Gemini-generated replies adapt to the child's latest message, recent conversation, detected mode, saved learning history, selected lesson, and current word. The server derives bounded curriculum context from trusted lesson data; quiz answer keys are never sent. Replies are requested as structured JSON, validated, and time-limited: each attempt gets the full `AI_TIMEOUT_MS` budget with one retry for a saturated provider, a rolling-window circuit breaker stops waiting on a provider that keeps failing and re-opens on the first failed probe after a cooldown, a visible status reports which path answered, and a local response is used whenever Gemini is missing or unavailable. The local answer also names a curriculum word the child mentioned, including simple plurals such as "cats", instead of replying with unrelated practice.
- Browser text-to-speech and speech recognition where supported.
- Accessibility: WCAG AA text contrast measured in the browser against the composited background (including gradient stops), 44px minimum touch targets, a skip link, one `h1` per view with no skipped heading levels, focus moved to the heading on every screen change, live regions for word, quiz, feedback and AI-status announcements, `aria-pressed` state on feelings and category choices, and a reduced-motion path for every entrance animation.
- Text responses are gzipped in memory and re-read only when the file changes, with an ETag and `Vary: Accept-Encoding`, so the two stylesheets and the browser scripts travel at roughly a quarter of their raw size.
- API input validation, Helmet security headers, rate limiting, and learner ownership checks.

## Requirements

Node.js 20 or newer, npm, and a reachable MySQL 8 server. There is no embedded or fallback store: the app will not start without `DATABASE_URL`, and `npm test` additionally needs `TEST_DATABASE_URL`.

## Local setup

```powershell
npm install
npm start
```

Open <http://localhost:5000>. Copy `.env.example` to `.env` in the project root and fill in `DATABASE_URL` (and the CA, so the connection is verified rather than merely encrypted); the server loads the file at startup. `.env` is git-ignored and `.env.example` holds no secrets. Gemini stays optional — without `GEMINI_API_KEY`, Buddy answers from the local fallback.

The app works without Gemini. To enable it, create an API key through Google's AI developer tooling and set `GEMINI_API_KEY` in `.env`. Set `GEMINI_MODEL` to a model available to your account; on the key used during development, `models.list()` returns no entries, so availability has to be probed by calling the model directly. Keep the key server-side; never put it in `public/` or commit it. Provider availability, quotas, and pricing can change.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `5000`. Hosting platforms such as Render provide this value. |
| `AUTH_SECRET` | Production | Long, random secret used to sign caregiver bearer tokens. There is a development-only fallback; caregiver authentication on a production deployment requires this value. |
| `DATABASE_URL` | Yes | MySQL Service URI from the hosting console, e.g. `mysql://user:password@host.aivencloud.com:16707/defaultdb?ssl-mode=REQUIRED`. The query string is read for TLS intent only; `ssl-mode=DISABLED` is refused instead of being honoured. The server exits at startup if this is missing. |
| `TEST_DATABASE_URL` | For tests | URI used by `npm test`. The suite drives the same pool, TLS pinning and schema as the app, seeds rows under generated identifiers and deletes those again, so it writes only its own rows into whichever database this points at. |
| `AIVEN_CA_CERT` / `AIVEN_CA_CERT_FILE` | No | Provider CA certificate, as a PEM (escaped or real newlines), base64 of the PEM, or a path to the downloaded file — conventionally `certs/aiven-ca.pem`, ignored by git and resolved against the directory you start the app from. The PEM value wins if both are set; a configured-but-missing file fails startup. Required in practice: Aiven signs its certificates with its own CA, which no system trust store contains, so without it the connection is refused with `self-signed certificate in certificate chain` — the app rejects the session rather than proceeding unverified. |
| `DATABASE_POOL_SIZE` | No | Pooled connections per process; defaults to `5`. Keep `instances × DATABASE_POOL_SIZE` inside the server's connection limit. |
| `GEMINI_API_KEY` | No | Server-side Gemini API key. Without it, Buddy uses local fallback responses. |
| `GEMINI_MODEL` | No | Gemini model name; defaults to `gemini-3.1-flash-lite`. Retired model names are rejected by the provider with `404`, which Buddy reports as `provider_error` and answers locally. |
| `AI_TIMEOUT_MS` | No | Budget for a single Gemini attempt; defaults to `8000`. Successful replies on the current account complete in 2.4–4.6s, so a longer budget only makes a waiting child wait. |
| `GEMINI_FAILURE_THRESHOLD` | No | Provider failures within the breaker window that open the circuit breaker; defaults to `3`. |
| `GEMINI_BREAKER_WINDOW_MS` | No | Rolling window those failures are counted in; defaults to `60000`. Counting within a window rather than as a consecutive streak lets the breaker trip on an intermittently failing provider, which is the observed real-world pattern. |
| `GEMINI_BREAKER_COOLDOWN_MS` | No | How long an open breaker answers locally without calling the provider; defaults to `30000`. When it expires, exactly one request is allowed through as a recovery probe: a success closes the breaker, a failure re-opens it without needing a fresh set of failures. |
| `RATE_LIMIT_WINDOW_MS` | No | API rate-limit window in milliseconds; defaults to `60000`. |
| `RATE_LIMIT_MAX_REQUESTS` | No | Requests allowed per visitor per window on `/api`; defaults to `120`. Chat and quiz traffic is chattier than the human browsing it represents, and `trust proxy` means the bucket is the real client IP behind a hosting load balancer. |
| `LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS` | No | Word-practice and listen requests allowed per visitor per window; defaults to `240` so learners can work through the 100-number Level 2 set. |
| `HEALTH_RATE_LIMIT_MAX_REQUESTS` | No | Requests allowed per monitor per window on `/api/health`; defaults to `120`. A platform health check must not be starved by ordinary traffic, and traffic to it must not starve real users. |

## API quick reference

All `/api` requests are rate-limited per visitor. Chat, quiz and lesson submissions use `RATE_LIMIT_MAX_REQUESTS`; word-practice and listen actions use their separate `LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS` budget; `/api/health` uses `HEALTH_RATE_LIMIT_MAX_REQUESTS`. The three groups are deliberately separated so a monitoring probe or a child working through a word set cannot exhaust the other's budget. A limited request answers as `429` with a JSON body the browser can read aloud to a caregiver. Authenticated endpoints require `Authorization: Bearer <token>`.

| Method and path | Authentication | Purpose |
| --- | --- | --- |
| `GET /api/health` | No | Health status and whether Gemini is configured. |
| `POST /api/auth/register` | No | Create a caregiver account and initial learner. Body: `{ "email": "...", "password": "at least 10 characters" }`. |
| `POST /api/auth/login` | No | Sign in and receive a bearer token and learner ID. |
| `GET /api/auth/me` | Bearer token | Return caregiver email and linked learner profiles. |
| `POST /api/auth/logout` | Bearer token | Add the presented token to a server-side denylist so it stops authenticating immediately, then discard it in the browser. |
| `GET /api/lessons?level=L1` | No | List level-aligned lessons and their practice challenges for L1, L2, or L3. |
| `GET /api/lessons/:id` | No | Return one lesson. |
| `GET /api/vocabulary?category=animals&level=L1` | No | Filter curated vocabulary. |
| `GET /api/quizzes?level=L1&category=colors` | No | Return the level's 10 quiz questions without answer keys. There are 10 questions for each level. |
| `POST /api/lessons/:id/challenge` | Bearer token | Grade a lesson practice challenge on the server. Body: `{ "selectedOptionIndex": 0 }`. The response reports `correct` and `correctOptionIndex`; nothing is stored. |
| `POST /api/chat` | Bearer token | Send a learner message and receive Buddy's response. |
| `GET /api/progress/:learnerId` | Bearer token | Read progress for a learner linked to the caregiver. |
| `POST /api/progress/attempt` | Bearer token | Submit a quiz answer. Body: `{ "learnerId": "...", "quizId": "...", "selectedOptionIndex": 0, "sessionId": "..." }`. The response reports `correctOptionIndex` so the browser can mark the right card. |
| `POST /api/progress/practice` | Bearer token | Record a uniquely practiced word; may automatically advance a completed level. Body: `{ "learnerId": "...", "itemId": "..." }`. |
| `POST /api/progress/listen` | Bearer token | Record a word listen as a lesson played. Body: `{ "learnerId": "...", "itemId": "..." }`. |
| `POST /api/progress/level` | Bearer token | Manually select `L1`, `L2`, or `L3`. Body: `{ "learnerId": "...", "level": "L1" }`. |
| `POST /api/progress/reset` | Bearer token | Reset one linked learner's progress and return their fresh progress so the interface can resync. Supply the learner ID in `x-learner-id`. |

Example chat body:

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

The API verifies that an authenticated caregiver owns the learner ID for chat and progress operations. Request validation bounds message size and the amount of client-supplied conversation context, malformed JSON returns `400` and an oversized body `413`, and any unmatched path under `/api` returns a JSON `404` rather than the browser app's HTML. Practice and listen requests for a word outside the learner's saved level return `409`, and an unknown word returns `404`, so progress can only ever describe the level the learner is actually on. Lesson and item IDs are resolved against the selected level on the server, which builds bounded context from trusted curriculum and saved progress; client-submitted curriculum content and mastery values are not used. Quiz and lesson payloads carry no answer key: the browser submits the option it was shown at, and the server reports which option was right. Gemini replies are requested as structured JSON, and both the child's message and the model's reply pass through safety checks: a reply that solicits personal details, secrecy, or unsafe content is discarded in favour of the local answer. Chat responses include a safe `aiStatus` (`ready`, `not_configured`, `not_requested`, `timeout`, `provider_error`, `unavailable`, or `invalid_response`) so the interface can distinguish Gemini success from local fallback without exposing provider details.

## Tests and benchmark

```powershell
$env:TEST_DATABASE_URL = "mysql://user:password@host.aivencloud.com:16707/defaultdb"
npm test
npm run benchmark
```

The suite runs against a real MySQL server through the same driver, TLS configuration and schema as the app, so `TEST_DATABASE_URL` is required and a missing value fails every database test with that message instead of skipping. `npm test` uses `--test-concurrency=1`: the files share one database, and running them one at a time keeps the rate-limit and latency cases off each other's connections. Cases that only read configuration or pure logic — `tests/database-config.test.js`, `tests/app.test.js`, `tests/mode-detection.test.js`, `tests/tutor-context.test.js`, `tests/gemini.service.test.js` — need no database.

`tests/access-control.test.js` covers token expiry and revocation, learner ownership, the absence of answer keys in lesson and quiz payloads, server-graded challenges, level enforcement, JSON `404`/`400`/`413` handling and the SPA fallback. `tests/rate-limit.test.js` covers `trust proxy`, the three separate budgets and per-visitor buckets. `tests/database-config.test.js` covers URI parsing, the `ssl-mode=DISABLED` refusal, CA decoding and that verification is never disabled. `tests/curriculum.test.js` covers lesson completeness and that every lesson has enough cards to fill its grid. `tests/gemini.service.test.js` covers the structured-reply contract, timeout, retry, rolling-window breaker and recovery probe. `tests/app.test.js`, `tests/mode-detection.test.js` and `tests/tutor-context.test.js` cover mode classification, the local fallback wording, the safety rules, password hashing and token signing, and which lesson material Buddy is given for a request.

The benchmark measures health endpoint round-trip latency, not Gemini response latency. For production evaluation, benchmark `/api/chat` with and without Gemini and record sample size, deployment environment, P50/P95/max, success rate, and fallback rate. Do not claim a two-second guarantee based on the health check.

## Deployment

The frontend and API are served by the same Express service; the database is a managed MySQL 8 service (Aiven) outside it. Deploy manually without a `render.yaml` file:

1. Push the project to GitHub.
2. In the Render Dashboard, create a **New → Web Service**, connect the repository, and use the repository root as the root directory.
3. Choose the Node runtime. Set the build command to `npm install` and the start command to `npm start`.
4. Set the health check path to `/api/health`.
5. In the Aiven console, create the MySQL service, download its CA certificate, restrict the IP allowlist to the app's egress if the host provides one, and add a dedicated database user instead of using the admin account. Then set `NODE_ENV=production`, a long, random `AUTH_SECRET`, `DATABASE_URL` and `AIVEN_CA_CERT` (or `AIVEN_CA_CERT_FILE`) as secret environment values. Optionally set `GEMINI_API_KEY` and `GEMINI_MODEL`. Render supplies `PORT`.
6. Choose a plan and deploy. The service URL serves the web app; `/api/health` checks the API, and the startup log reports the measured database round trip.

Startup connects to the server and applies `src/database/schema.sql` with `CREATE TABLE IF NOT EXISTS`, so the configured user needs DDL privileges on the first deploy and needs only read/write afterwards. Progress now survives restarts and redeploys because it lives in the managed service rather than on the app's filesystem — but a hosted database is not a substitute for backups: schedule Aiven backups and test a restore separately.

Because the token denylist moved into that shared database, signing out now takes effect for every app instance. The rate-limit buckets and the failed-login counters are still held in process memory, so they only hold with one instance unless a shared store is added. Keep `DATABASE_POOL_SIZE × instances` inside the MySQL connection limit, and remember that a network round trip now sits in front of every authenticated request: `/api/health` deliberately performs no query so a slow database cannot make the app look unhealthy.

## Privacy, child safety, and voice

This is a starter implementation, not a safety-certified or legally compliant product. Buddy's mode and safety detection is based on limited rules and cannot guarantee detection or appropriate handling. Responses are validated and unsafe keyword matches are redirected, but this is not comprehensive moderation. A caregiver should supervise use.

Caregiver registration collects an email address; child profiles use generated IDs and do not require a child's real name. Chat messages are sent to Google when Gemini is enabled. The API accepts a bounded amount of recent conversation context, and saved learner progress is used to personalize replies. Inform caregivers before enabling Gemini, protect account and database data, and establish consent, deletion, and retention policies. Obtain legal review for child privacy requirements applicable to your deployment; do not claim compliance based on this implementation.

The app does not intentionally save raw microphone recordings. Speech recognition is not supported in every browser and generally requires HTTPS (localhost is allowed in development). Recognition results should be checked before sending; it is not a validated pronunciation assessment. Text-to-speech support is separate and varies by browser and device.

## Project map

- `public/`: HTML, CSS, browser JavaScript, and the SVG favicon.
- `src/app.js`: Express API routes, middleware, and static frontend delivery.
- `src/services/`: authentication, Gemini, fallback, mode detection, safety, compressed static assets, and progress logic.
- `src/data/`: `curriculum.js` (lessons and quizzes derived from the vocabulary) and `vocabulary.json`.
- `src/database/`: MySQL connection pool, TLS pinning and schema.
- `tests/`: automated tests.
- `scripts/benchmark.js`: health route benchmark.
- `System-Diagram.jpeg`: system architecture diagram.
- `System-Design-Documentation.md`: detailed architecture and design decisions.

## Known limitations

- The seven-day signed bearer token is stored in browser `sessionStorage`, so caregivers need to sign in again after closing the browser. Signing out revokes that token server-side, but revocation records live in the same database and expire only when the token itself does; there is no way to sign out a caregiver's other devices.
- Password reset is not operational until a secure email delivery provider and reset-token workflow are configured. The login page explains this and keeps reset requests disabled rather than exposing reset links or tokens.
- The MySQL migration is written and checked against the driver's configuration, but has not yet been exercised against the live Aiven service: the schema, the provider's TLS handshake and real query latency are still to be confirmed. No database latency figure is quoted in these documents because none has been measured.
- Rate-limit buckets and failed-login counters are per process, so they only hold with a single app instance; a shared store would be needed to scale out. Token revocation is shared because it lives in the database.
- Level completion is based on practicing every vocabulary item in the selected level; quiz mastery is tracked separately and does not determine automatic level advancement.
- The family, feelings, toy, action-word, everyday-object and nature lessons and their word cards were written for this project, not by a curriculum specialist. They follow the existing level and voice rules and are starter content that needs educator review before a child uses them in a real lesson. The quiz sets were deliberately left at 10 questions per level, so these six lessons are practiced but not quizzed.
- `public/css/styles.css` and `public/css/kid-friendly.css` are loaded in that order and overlap heavily; `kid-friendly.css` is the visual source of truth and many `styles.css` declarations are already overridden. They have not been merged.
- Browser speech varies by browser and device. Some curriculum content and tests are representative starter examples, not a complete curriculum or end-to-end test suite.
- There is no linter, formatter, or CI pipeline. `npm test` covers the server contract; browser behaviour is verified manually.
- No live deployment of this app has been made, and no legal-compliance review has been done. Gemini has been exercised against the provider from a local development machine — including the empty model list, the 2.4–4.6s successful replies and an intermittent provider timeout — but never from a hosted instance of this service.
