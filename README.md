# LittleLingo AI

LittleLingo AI is a responsive English-learning web app for young children. A single Node.js/Express service serves the browser app and REST API. Caregivers create an account and learner profile; Buddy combines saved learning progress with the current conversation and can use optional Gemini responses or a local fallback.

## Features
- Responsive browser interface with dashboard, Word Explorer, lessons, quizzes, feelings vocabulary, and Buddy.
- Level-based curriculum: L1 covers A–Z, numbers 1–10, colors, animals, and fruits; L2 covers blending sounds into words, short sentences, and numbers 1–100; L3 includes short stories, sentence building, and fill-in-the-blank practice.
- Each level has a 10-question quiz aligned to its lessons. Lessons and word cards include animated, interactive practice; number cards are paged in groups of 20.
- Caregivers can select a level manually; practicing every vocabulary item in that level advances the learner automatically.
- Progress saved in SQLite, including uniquely practiced words, quiz attempts, stars, and lessons played.
- Caregiver registration and sign-in. Passwords are stored as salted scrypt hashes; authenticated API access uses a signed bearer token that expires after seven days.
- Login includes a forgot-password screen, but email delivery is not configured yet, so reset requests are disabled. Caregivers must contact the site administrator until a verified email provider is configured.
- Buddy detects conversation, learning, engagement, celebration, emotional-support, and safety-redirect modes. It adapts to the learner's saved level and recent progress without turning every conversation into a lesson.
- Optional Gemini-generated replies adapt to the child's latest message, recent conversation, detected mode, and saved learning history. Replies are validated and time-limited; Buddy switches to local responses if Gemini is missing or unavailable.
- Browser text-to-speech and speech recognition where supported.
- API input validation, Helmet security headers, rate limiting, and learner ownership checks.

## Requirements

Node.js 20 or newer and npm. `better-sqlite3` may require a supported prebuilt binary or local build tools on your platform.

## Local setup

```powershell
npm install
npm start
```

Open <http://localhost:5000>. The app works locally without a `.env` file. To configure optional services or a custom database path, create a `.env` file in the project root with the variables below. The server loads it at startup.

The app works without Gemini. To enable it, create an API key through Google's AI developer tooling and set `GEMINI_API_KEY` in `.env`. Set `GEMINI_MODEL` to a model available to your account. Keep the key server-side; never put it in `public/` or commit it. Provider availability, quotas, and pricing can change.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `5000`. Hosting platforms such as Render provide this value. |
| `AUTH_SECRET` | Production | Long, random secret used to sign caregiver bearer tokens. There is a development-only fallback; caregiver authentication on a production deployment requires this value. |
| `DATABASE_PATH` | No | SQLite file path. Defaults to `./data/littlelingo.sqlite`, relative to the process working directory. The database directory is created automatically. |
| `GEMINI_API_KEY` | No | Server-side Gemini API key. Without it, Buddy uses local fallback responses. |
| `GEMINI_MODEL` | No | Gemini model name; defaults to `gemini-2.5-flash`. |
| `AI_TIMEOUT_MS` | No | Maximum wait for a Gemini response before using local fallback; defaults to `10000`. |
| `RATE_LIMIT_WINDOW_MS` | No | API rate-limit window in milliseconds; defaults to `60000`. |
| `RATE_LIMIT_MAX_REQUESTS` | No | Requests allowed per IP per window on `/api`; defaults to `30`. |
| `LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS` | No | Word-practice and listen requests allowed per IP per window; defaults to `240` so learners can work through the 100-number Level 2 set. |

## API quick reference

All `/api` requests are rate-limited. Word-practice and listen actions use their separate `LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS` limit; other API requests use `RATE_LIMIT_MAX_REQUESTS`. Authenticated endpoints require `Authorization: Bearer <token>`.

| Method and path | Authentication | Purpose |
| --- | --- | --- |
| `GET /api/health` | No | Health status and whether Gemini is configured. |
| `POST /api/auth/register` | No | Create a caregiver account and initial learner. Body: `{ "email": "...", "password": "at least 10 characters" }`. |
| `POST /api/auth/login` | No | Sign in and receive a bearer token and learner ID. |
| `GET /api/auth/me` | Bearer token | Return caregiver email and linked learner profiles. |
| `POST /api/auth/logout` | No | Client-side logout acknowledgement; discard the token in the browser. |
| `GET /api/lessons?level=L1` | No | List level-aligned lessons and their practice challenges for L1, L2, or L3. |
| `GET /api/lessons/:id` | No | Return one lesson. |
| `GET /api/vocabulary?category=animals&level=L1` | No | Filter curated vocabulary. |
| `GET /api/quizzes?level=L1&category=colors` | No | Return the level's 10 quiz questions without answer keys. There are 10 questions for each level. |
| `POST /api/chat` | Bearer token | Send a learner message and receive Buddy's response. |
| `GET /api/progress/:learnerId` | Bearer token | Read progress for a learner linked to the caregiver. |
| `POST /api/progress/attempt` | Bearer token | Submit a quiz answer. Body: `{ "learnerId": "...", "quizId": "...", "selectedItemId": "...", "sessionId": "..." }`. |
| `POST /api/progress/practice` | Bearer token | Record a uniquely practiced word; may automatically advance a completed level. Body: `{ "learnerId": "...", "itemId": "..." }`. |
| `POST /api/progress/listen` | Bearer token | Record a word listen as a lesson played. Body: `{ "learnerId": "...", "itemId": "..." }`. |
| `POST /api/progress/level` | Bearer token | Manually select `L1`, `L2`, or `L3`. Body: `{ "learnerId": "...", "level": "L1" }`. |
| `POST /api/progress/reset` | Bearer token | Reset one linked learner's progress. Supply the learner ID in `x-learner-id`. |

Example chat body:

```json
{
  "learnerId": "11111111-1111-4111-8111-111111111111",
  "message": "Teach me a word",
  "context": {
    "level": "L1",
    "history": [
      { "role": "child", "text": "I like animals." },
      { "role": "buddy", "text": "Animals are fun!" }
    ]
  }
}
```

The API verifies that an authenticated caregiver owns the learner ID for chat and progress operations. Request validation bounds message size and the amount of client-supplied conversation context. The server builds additional learner context from saved progress; client-submitted mastery values are not used.

## Tests and benchmark

```powershell
npm test
npm run benchmark
```

The benchmark measures health endpoint round-trip latency, not Gemini response latency. For production evaluation, benchmark `/api/chat` with and without Gemini and record sample size, deployment environment, P50/P95/max, success rate, and fallback rate. Do not claim a two-second guarantee based on the health check.

## Deployment on Render

The frontend and API are served by the same Express service. Deploy manually without a `render.yaml` file:

1. Push the project to GitHub.
2. In the Render Dashboard, create a **New → Web Service**, connect the repository, and use the repository root as the root directory.
3. Choose the Node runtime. Set the build command to `npm install` and the start command to `npm start`.
4. Set the health check path to `/api/health`.
5. Set `NODE_ENV=production` and a long, random `AUTH_SECRET` in the service environment. Optionally set `GEMINI_API_KEY` and `GEMINI_MODEL`. Render supplies `PORT`; `DATABASE_PATH` is optional.
6. Choose a plan and deploy. The service URL serves the web app; `/api/health` checks the API.

SQLite defaults to `./data/littlelingo.sqlite`, relative to the service's working directory. A free service's filesystem is ephemeral, so database contents and learner progress may be lost on restart or redeploy. To retain progress, use a hosting option with a persistent disk mounted at `/var/data` and set `DATABASE_PATH=/var/data/littlelingo.sqlite`, or use a durable managed database. Do not run multiple service instances with separate local SQLite files. Persistent storage is not a substitute for backups.

## Privacy, child safety, and voice

This is a starter implementation, not a safety-certified or legally compliant product. Buddy's mode and safety detection is based on limited rules and cannot guarantee detection or appropriate handling. Responses are validated and unsafe keyword matches are redirected, but this is not comprehensive moderation. A caregiver should supervise use.

Caregiver registration collects an email address; child profiles use generated IDs and do not require a child's real name. Chat messages are sent to Google when Gemini is enabled. The API accepts a bounded amount of recent conversation context, and saved learner progress is used to personalize replies. Inform caregivers before enabling Gemini, protect account and database data, and establish consent, deletion, and retention policies. Obtain legal review for child privacy requirements applicable to your deployment; do not claim compliance based on this implementation.

The app does not intentionally save raw microphone recordings. Speech recognition is not supported in every browser and generally requires HTTPS (localhost is allowed in development). Recognition results should be checked before sending; it is not a validated pronunciation assessment. Text-to-speech support is separate and varies by browser and device.

## Project map

- `public/`: HTML, CSS, and browser JavaScript.
- `src/app.js`: Express API routes, middleware, and static frontend delivery.
- `src/services/`: authentication, Gemini, fallback, mode detection, safety, and progress logic.
- `src/data/`: curated lessons, vocabulary, and quizzes.
- `src/database/`: SQLite connection and schema.
- `tests/`: automated tests.
- `scripts/benchmark.js`: health route benchmark.
- `System-Diagram.jpeg`: system architecture diagram.
- `System-Design-Documentation.md`: detailed architecture and design decisions.

## Known limitations

- The seven-day signed bearer token is stored in browser `sessionStorage`; caregivers may need to sign in again after closing the browser. The logout endpoint does not revoke an already-issued token.
- Password reset is not operational until a secure email delivery provider and reset-token workflow are configured. The login page explains this and keeps reset requests disabled rather than exposing reset links or tokens.
- SQLite is suitable for a single service instance but is not configured for shared multi-instance storage.
- Level completion is based on practicing every vocabulary item in the selected level; quiz mastery is tracked separately and does not determine automatic level advancement.
- Browser speech varies by browser and device. Some curriculum content and tests are representative starter examples, not a complete curriculum or end-to-end test suite.
- No live deployment, real Gemini request, latency target, or legal compliance has been independently verified.
