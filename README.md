# QuizMaster — Online Quiz Competition Platform

A MERN-stack platform for running timed, secure MCQ competitions. An organiser (admin) creates participant accounts and competitions; participants sign in with the credentials they were given, take the quiz inside a server-enforced time window, and see their score, answer key and leaderboard **only when the organiser releases them**.

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, React Router, Tailwind CSS 3, lucide icons |
| Backend | Node 18+, Express 4, Mongoose 8, Zod validation |
| Database | MongoDB Atlas |
| Auth | JWT in an `httpOnly` cookie, bcrypt (`bcryptjs`, cost 12), token versioning, lockout |
| Hosting | Vercel (client) · Render (API) · Atlas (DB) |

```
quizmaster/
├── client/                 React app (deploys to Vercel)
│   ├── vercel.json         /api → Render rewrite + security headers
│   └── src/pages/{admin,student}
├── server/                 Express API (deploys to Render)
│   ├── src/{models,controllers,routes,middleware,services,validators}
│   ├── scripts/createAdmin.js   secure initial-admin creation (CLI only)
│   ├── scripts/seed.js          sample competition + demo participants
│   ├── data/sample-quiz.json    sample quiz data (10 questions)
│   └── tests/e2e.test.js        API tests (in-memory MongoDB)
├── render.yaml             Render blueprint
└── README.md
```

---

## 1. Features

**Admin** — secure login · create/edit/deactivate participants with auto-generated IDs (`QM-XXXXXX`) and one-time temporary passwords (single or bulk, downloadable as CSV) · reset passwords · create and manage multiple competitions · MCQ questions with options, correct answer, explanation and marks (add, edit, reorder, JSON import) · schedule start/end, set duration, negative marking, shuffling, attempt limits · assign to everyone or selected participants · live monitoring (not started / in progress / submitted, force-submit) · grant extra attempts per participant · publish **results** and **answer key** independently, immediately or on a schedule · re-grade after correcting the key · export results to CSV · full audit log.

**Participant** — sign in with admin-issued credentials only · forced password change on first login · dashboard with live / upcoming / completed competitions · lobby with rules and a server-synced countdown · quiz with timer, question palette, flag-for-review, keyboard shortcuts, autosave with offline retry · resume after disconnect · manual or automatic submission at the deadline · submission receipt (no score) · result, answer review with explanations, and leaderboard once released.

**Design** — responsive from phone to desktop, accessible colours and focus states, `aria-live` timer warnings, skeleton loaders, empty states, human-readable error messages, reduced-motion support.

---

## 2. How each critical rule is enforced

| # | Rule | Where / how |
|---|---|---|
| 1 | No public registration | No register route exists. Participants are created by an authenticated admin (`POST /api/admin/users`). The first admin is created only by the CLI script on a trusted terminal. |
| 2 | Backend authorization on every protected API | `requireAuth` → `requireRole('admin' \| 'student')` is applied at the **router** level for `/api/admin/*` and `/api/student/*`, so a new route can't forget it. The user is re-loaded from the DB on each request (deactivation takes effect immediately). |
| 3 | Correct answers never exposed early | `Question.correctOption` and `.explanation` are `select: false`. Quiz endpoints select `text options marks` only and map to explicit shapes. The one student endpoint that reads the key (`/review`) runs after the release check. Nothing is put in browser storage except the participant's *own* flagged-question numbers. |
| 4 | Scores computed on the backend | `services/attempts.js → gradeAnswers()` runs when an attempt is finalised; React never sees or computes scores. |
| 5 | Server-time deadlines | Attempt `deadline = min(start + duration, competition end)` is computed and stored on the server. Autosaves/submits after it (plus a small network grace) are refused; a 30-second sweeper and lazy checks auto-submit expired attempts. Shortening a competition's end time also clamps running attempts. |
| 6 | No duplicate attempts/submissions | Unique index `(competition, user, attemptNumber)` + a partial unique index allowing **one in-progress attempt per user per competition**. Finalising uses an atomic `findOneAndUpdate` state transition, so double-clicks, two tabs and retries are idempotent. Extra attempts only via an explicit admin grant. |
| 7 | Participants can't see others' data | Attempts are always queried with `{ _id, user: req.user._id }` and return **404** (not 403) otherwise. Competitions the user isn't assigned to also 404. The leaderboard returns name, score and time only — never participant IDs (they are login identifiers). |
| 8 | Answer publication separate from closure | `resultsRelease` and `answerRelease` each support publish / unpublish / schedule. Neither can take effect before the competition has closed — enforced on write *and* re-checked on every read (`isReleased`). |
| 9 | Timestamps + audit trail | `startedAt`, `submittedAt`, `finalizedAt`, submission type on each attempt; `AuditLog` records logins, participant changes, competition/question edits, releases, exports, force-submits, regrades. |
| 10 | Secrets, validation, rate limiting, cookies | Env validated at boot with Zod (server refuses to start with a weak `JWT_SECRET`). Every body/query validated with Zod; Mongo operator injection stripped. Global, per-account login, per-user autosave and admin-write rate limits. `httpOnly` + `Secure` + `SameSite` cookie, `helmet`, strict CORS allow-list, CSRF guard (custom header + Origin check), `Cache-Control: no-store` on all API responses. |

Additional hardening: bcrypt with constant-time dummy compare for unknown accounts · account lockout (5 failures → 15 min) · `tokenVersion` revokes all sessions on password change/reset/deactivation · temporary passwords must be changed before any other API works · CSV export neutralises spreadsheet formula injection · 404-not-403 to prevent probing.

---

## 3. Local development

### Prerequisites
Node.js ≥ 18.18, npm, and a MongoDB Atlas cluster (the free M0 tier is fine for development).

### 3.1 MongoDB Atlas
1. Create a cluster at <https://cloud.mongodb.com>.
2. **Database Access** → add a database user with a strong password and the `readWrite` role on `quizmaster`.
3. **Network Access** → add your current IP (for development). For Render, see §5.
4. **Connect → Drivers** → copy the `mongodb+srv://…` string and put `/quizmaster` before the `?`.

### 3.2 Backend
```bash
cd server
cp .env.example .env
# edit .env: MONGODB_URI, JWT_SECRET (generate one):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install
```

### 3.3 Create the first admin (secure initial-admin procedure)
There is **no admin sign-up page or endpoint**. The first admin is created from a terminal that already has database access:
```bash
npm run create-admin
```
It prompts for a username (optional email), name and a password (hidden input, min 10 chars with upper/lower/number), bcrypt-hashes it, and writes an audit entry. For non-interactive environments (e.g. the Render Shell):
```bash
ADMIN_USERNAME=yourname ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-long-Passw0rd' npm run create-admin
```
Afterwards, clear the variable from your shell history. Admins sign in with the username (or email). Run it again to add more admins; it refuses duplicates. `MONGO_URI` is accepted as an alias for `MONGODB_URI`.

### 3.4 (Optional) Load sample data
```bash
npm run seed
```
Creates a **draft** competition from `data/sample-quiz.json` (10 questions, negative marking, shuffling) and three demo participants whose random temporary passwords are printed once. Refuses to run in production unless `ALLOW_SEED=true`. You can also import the same questions from the admin UI (Questions → Import JSON).

### 3.5 Run
```bash
# terminal 1
cd server && npm run dev        # http://localhost:5000
# terminal 2
cd client && npm install && npm run dev   # http://localhost:5173
```
Vite proxies `/api` to the API, so the auth cookie stays first-party — exactly like production.

**Try it:** sign in as admin → *Competitions* → open the seeded draft → adjust the schedule → *Publish* → sign in as a demo participant (new private window), change the temporary password, and take the quiz.

---

## 4. Data model (MongoDB / Mongoose)

| Collection | Key fields |
|---|---|
| `users` | `role` (`admin`/`student`), `participantId` (unique), `email` (unique, sparse), `passwordHash` (`select:false`), `mustChangePassword`, `isActive`, `tokenVersion`, `failedLoginCount`, `lockUntil` |
| `competitions` | `status` (draft/published/archived), `startTime`, `endTime`, `durationMinutes`, `negativeMarking{enabled,fraction}`, `shuffleQuestions/Options`, `maxAttempts`, `visibility` (`all`/`assigned`), `assignedParticipants[]`, `attemptOverrides[]`, `resultsRelease{published,publishedAt,scheduledAt}`, `answerRelease{…}`, `showLeaderboard`, cached `questionCount/totalMarks` |
| `questions` | `competition`, `order`, `text`, `options[{_id,text}]`, `correctOption` (`select:false`), `explanation` (`select:false`), `marks` |
| `attempts` | `competition`, `user`, `attemptNumber`, `status`, `startedAt`, `deadline`, `submittedAt`, `questionOrder[]`, `optionOrders[]`, `answers[{question,option,savedAt}]`, `score`, `maxScore`, `correct/wrong/unansweredCount`, `timeTakenSeconds`, `ip`, `userAgent` |
| `auditlogs` | `actor`, `actorLabel`, `action`, `entityType`, `entityId`, `meta`, `ip`, `userAgent`, `createdAt` |

Indexes of note: `attempts (competition,user,attemptNumber) unique`, `attempts (competition,user) unique where status=in_progress`, `attempts (status,deadline)` for the sweeper.

## 5. API overview

All routes are under `/api`. State-changing requests must send `X-Requested-With: quizmaster` (the bundled client does).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password` |
| Admin · participants | `GET/POST /admin/users` · `POST /admin/users/bulk` · `GET/PATCH /admin/users/:id` · `POST /admin/users/:id/reset-password` |
| Admin · competitions | `GET/POST /admin/competitions` · `GET/PATCH/DELETE /admin/competitions/:id` · `POST …/status` · `PUT …/assignments` · `POST …/release` · `POST …/grant-attempt` · `POST …/recalculate` |
| Admin · questions | `GET/POST …/questions` · `POST …/questions/import` · `PUT …/questions/order` · `PUT/DELETE …/questions/:qid` |
| Admin · monitoring | `GET …/attempts` · `GET …/results` · `GET …/export.csv` · `GET /admin/attempts/:id` · `POST /admin/attempts/:id/force-submit` · `GET /admin/stats` · `GET /admin/audit-logs` |
| Student | `GET /student/competitions[/:id]` · `POST …/:id/start` · `GET /student/attempts/:id` · `PUT …/answer` · `POST …/submit` · `GET …/summary` · `GET …/:id/result` · `GET …/:id/review` · `GET …/:id/leaderboard` |

## 6. Testing

```bash
cd server && npm install && npm test
```
`tests/e2e.test.js` boots the real Express app against an in-memory MongoDB and exercises: absence of public registration, CSRF guard, forced password change, role enforcement, answer-key leakage in quiz payloads, cross-participant access, autosave/resume, idempotent submit, duplicate-attempt blocking, server-side scoring with negative marking, release gating (including "cannot release before close" and results vs answer key separately), leaderboard privacy, deadline enforcement/auto-submit, CSV export, audit trail, deactivation and lockout. The first run downloads a `mongod` binary.

> **Status note.** The package-registry was unreachable in the environment where this code was written, so dependencies could not be installed there. What was verified in that environment: syntax of every client and server source file, resolution of every relative import and named export, and 20 stubbed unit checks of scoring, release gating, access rules, credential generation and CSV escaping. The full API test-suite and the production build (`npm run build`) were **not** executed there — run `npm test` and `npm run build` once after installing, before relying on the project.

---

## 7. Deployment

Order: **Atlas → Render (API) → Vercel (client)**, then point Vercel's rewrite at Render. The client calls `/api` on its own origin and Vercel rewrites to Render, so the auth cookie is first-party (`SameSite=Lax`) and works in Safari/Firefox without third-party-cookie problems.

### 7.1 MongoDB Atlas
1. Use a dedicated cluster for production (M10+ recommended for competition day; M0 has connection and throughput limits).
2. Create a database user with `readWrite` on `quizmaster` only. Use a long random password.
3. **Network Access**: Render's outbound IPs change on the free/starter plans, so either allow `0.0.0.0/0` **with** a strong DB password (acceptable, commonly used) or, on plans with static outbound IPs, allow just those. Never leave `0.0.0.0/0` with a weak password.
4. Enable continuous backups (M10+) or schedule `mongodump` before each competition.

### 7.2 Render (API)
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo (uses `render.yaml`), or create a **Web Service** manually: root directory `server`, build `npm ci`, start `npm start`, health check `/health`, Node 20.
3. Set environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas string (include `/quizmaster`) |
| `JWT_SECRET` | ≥ 32 random chars (Render can generate it) |
| `CLIENT_URL` | your Vercel URL, e.g. `https://quizmaster.vercel.app` (comma-separate extra domains) |
| `COOKIE_SAMESITE` | `lax` |
| `TRUST_PROXY` | `2` (browser → Vercel → Render) |
| `JWT_EXPIRES_HOURS` | `8` |

4. Deploy, then open **Shell** on the service and create the first admin:
   ```bash
   ADMIN_USERNAME=yourname ADMIN_NAME="Your Name" ADMIN_PASSWORD='…' npm run create-admin
   ```
5. Visit `https://<service>.onrender.com/health` → `{"status":"ok"}`.

> Free Render services sleep after inactivity (cold start ≈ 30–60 s). For a real competition use a paid instance that stays awake.

### 7.3 Vercel (client)
1. Edit `client/vercel.json` and replace `YOUR-RENDER-SERVICE.onrender.com` with your Render hostname.
2. Vercel → **Add New Project** → import the repo → **Root Directory: `client`** (framework Vite is auto-detected; build `npm run build`, output `dist`).
3. Leave `VITE_API_URL` **unset**.
4. Deploy, then put the final Vercel URL into Render's `CLIENT_URL` and redeploy the API.

**Alternative (no rewrite):** set `VITE_API_URL=https://<service>.onrender.com/api` in Vercel, `COOKIE_SAMESITE=none` and `TRUST_PROXY=1` on Render. This makes the cookie third-party and some browsers will block it — prefer the rewrite, or put both apps on subdomains of one domain.

### 7.4 Post-deploy checklist
- [ ] Sign in as admin; change nothing else yet.
- [ ] Create a test participant, sign in privately, change the password.
- [ ] Publish a 3-question test competition and take it end to end.
- [ ] In DevTools → Network, confirm quiz responses contain no `correct*` or `explanation` fields.
- [ ] Confirm the `qm_token` cookie is `HttpOnly; Secure`.
- [ ] Delete the test data (archive/delete test competition; deactivate test users).

### 7.5 Competition-day tips
- Publish the competition well before the start; participants can see it and read the lobby.
- Keep the API instance warm (paid plan, or ping `/health` every few minutes).
- Watch **Monitor** for participants who haven't started; *Force-submit* closes a stuck attempt.
- Release results and the answer key from **Results & release**; schedule them if you want a delay.
- If you fix a wrong answer key after submissions, editing the question automatically re-grades; or press *Recalculate scores*.

---

## 8. Configuration reference (`server/.env`)

See [`server/.env.example`](server/.env.example) — every variable is documented there. Highlights: `SUBMIT_GRACE_SECONDS` (network grace after the deadline for the last autosave, default 5), `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES`, `BCRYPT_ROUNDS`.

## 9. Known limitations / ideas

- Participants are created by the admin; there is no email delivery or self-service password reset (admins issue a new temporary password). Add an SMTP provider if you need that.
- No proctoring (tab-switch detection, webcam). Tab-switch counters are an easy addition to `Attempt` + the Quiz page.
- Single-choice MCQs only; images in questions are not supported yet.
- The expired-attempt sweeper runs inside the API process. It is safe with multiple instances (atomic transitions) but not needed more than once.
- Leaderboards compute on request; for very large competitions (10k+ participants) cache them after release.
# KLE-BBA-CLUSTER-EVENT-QUIZMASTER
