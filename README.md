# LittleLingo AI

A playful English-learning web app for children under seven. It includes Buddy chat, vocabulary cards, quizzes, feelings vocabulary, optional browser voice features, a Node/Express API, SQLite progress tracking, optional Gemini integration and a deterministic fallback.

## Features
- Responsive mobile-first UI with mascot and dashboard.
- L1/L2/L3 lesson structure and bundled vocabulary.
- Text chat with local fallback and optional Gemini.
- Word Explorer, quiz feedback, stars and progress tracking.
- Browser text-to-speech and speech recognition where supported.
- Anonymous learner ID; no required registration or real name.
- API validation, Helmet security headers, rate limiting and SQLite persistence.

## Requirements
Node.js 20 or newer and npm. `better-sqlite3` may require a supported prebuilt binary or local build tools on your platform.

## Local setup
```bash
npm install
cp .env.example .env
npm start
```
Open http://localhost:5000. On Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

The application works without a Gemini key. To enable AI, create a Gemini API key through Google's AI developer tooling, set `GEMINI_API_KEY` in `.env`, and set `GEMINI_MODEL` to a model available to your account. Never put the key in `public/` or commit `.env`. Provider availability, quotas and pricing can change.

## Environment variables
- `PORT`: server port (default 5000).
- `GEMINI_API_KEY`: optional server-only API key.
- `GEMINI_MODEL`: model name available to your account.
- `DATABASE_PATH`: SQLite file path; parent directory is created automatically.
- `AI_TIMEOUT_MS`: maximum AI wait before fallback (default 1300).
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`: API rate limit.
- `RESET_TOKEN`: optional shared token for administrative progress reset. Configure carefully; it is not a replacement for caregiver authentication.

## API quick reference
- `GET /api/health`
- `GET /api/lessons?level=L1`
- `GET /api/lessons/:id`
- `GET /api/vocabulary?category=animals&level=L1`
- `GET /api/quizzes?level=L1&category=colors`
- `POST /api/chat`
- `POST /api/progress/attempt`
- `GET /api/progress/:learnerId`
- `POST /api/progress/reset` (requires reset token headers)

Example chat body:
```json
{"learnerId":"11111111-1111-4111-8111-111111111111","message":"Teach me a word","context":{"level":"L1"}}
```

## Tests and benchmark
```bash
npm test
npm run benchmark
```
The benchmark measures health endpoint round-trip latency, not Gemini response latency. For production evaluation, benchmark `/api/chat` with and without Gemini, record sample size, deployment environment, P50/P95/max, success and fallback rates. Do not claim a two-second guarantee based on the health check.

## Deployment (Render example)
1. Push this folder to a Git repository.
2. Create a Render web service from the repository, or use `render.yaml` as a starting point.
3. Ensure the service has a persistent disk mounted at `/var/data` and set `DATABASE_PATH=/var/data/littlelingo.sqlite`.
4. Add `GEMINI_API_KEY` in the host's secret environment settings if using Gemini. Set `GEMINI_MODEL` to a supported model.
5. Deploy, then verify `https://YOUR-SERVICE.onrender.com/api/health` and open the root URL. A public URL is not included because this project has not been deployed from this environment and no hosting account was provided.

SQLite persistence requires a persistent volume. Confirm the hosting plan supports disks; otherwise use a durable managed database. Do not scale multiple stateless instances against separate local SQLite files.

## Child safety and privacy
This project is a starter implementation, not a safety-certified product. Safety keyword rules are limited and cannot guarantee detection. Review data flows, obtain appropriate caregiver consent, publish a privacy notice, establish deletion and retention policies, and obtain legal review for applicable child privacy laws before production use. If Gemini is enabled, child messages and bounded context may be sent to Google. Adult supervision is recommended. Browser speech behavior varies; recognition is not a validated pronunciation assessment.

## Project map
- `public/`: HTML, CSS and browser JS.
- `src/app.js`: API routes and middleware.
- `src/services/`: Gemini, fallback, mode detection, safety and progression.
- `src/data/`: curated JSON learning content.
- `src/database/`: SQLite schema and connection.
- `tests/`: automated unit tests.
- `scripts/benchmark.js`: health route benchmark.
- `docs/`: architecture, system design and presentation script.

## Known limitations
- Anonymous IDs are convenient but not strong authentication.
- Reset endpoint requires server-side caregiver token configuration; UI cannot reset server progress without it.
- Some requested vocabulary categories and lesson formats are starter examples, not a complete curriculum.
- Tests are representative unit tests, not a complete end-to-end suite.
- No deployment, live Gemini call, latency target or legal compliance has been independently verified.


## Caregiver login and saved progress

The app now provides caregiver email/password registration and sign-in. Passwords are stored as salted scrypt hashes; the browser receives a signed, seven-day bearer token. A random learner profile is created for the caregiver, and quiz attempts, stars, mastery, and level progress are stored in SQLite. Progress and chat endpoints require authentication and verify that the learner belongs to the signed-in caregiver. No child real name is required. The token is held in `sessionStorage`, so caregivers may need to sign in again after closing the browser; progress remains in the database.

Set `AUTH_SECRET` to a long, randomly generated secret in production. Never use the development fallback secret on a public deployment. On Render, set the `AUTH_SECRET` environment variable in the service dashboard. The SQLite database must be on a persistent disk.

### Voice and microphone checks

Voice support is feature-detected in the browser. Speech recognition is not supported in every browser and generally requires HTTPS (localhost is allowed during development). Tap the microphone, grant permission when prompted, and check the recognized text before sending. If permission is denied or recognition is unavailable, typing still works. Text-to-speech is separately detected and can be stopped with the stop button. The app does not save raw microphone recordings. Actual microphone functionality must be tested on the target phone/browser because browser support and device permissions cannot be verified from the source code alone.

### Runtime verification caveat

Run `npm install`, `npm test`, and `npm start` on a machine with network access and a supported Node.js version. This development environment could not complete `npm install` within the available runtime window, so end-to-end HTTP/database/browser and real microphone tests remain unverified here.
