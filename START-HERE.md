# Start here

```
quizmaster/
├── START-HERE.md        <- you are here
├── README.md            full documentation, security model, deployment guide
├── package.json         one-command helpers (see below)
├── render.yaml          Render deployment blueprint (API)
├── preview/index.html   open in a browser: clickable preview with sample data
├── client/              React + Tailwind website  (deploys to Vercel)
│   ├── vercel.json
│   └── src/
│       ├── pages/student/   dashboard, lobby, quiz, submitted, result, review, leaderboard
│       ├── pages/admin/     dashboard, participants, competitions, manage, audit log
│       ├── components/      UI kit + layouts
│       ├── context/  lib/   auth, toasts, API client, helpers
├── server/              Node + Express API       (deploys to Render)
│   ├── .env             your settings (private - never share or commit)
│   ├── .env.example     documented template
│   ├── src/
│   │   ├── models/      MongoDB schemas
│   │   ├── routes/  controllers/  middleware/  services/  validators/
│   ├── scripts/         createAdmin.js, seed.js
│   ├── data/            sample-quiz.json
│   └── tests/           e2e.test.js
```

## Run it (about 5 minutes)

Run these from this folder:

```bash
npm run install:all     # installs server + client
npm run admin           # creates the first admin (uses ADMIN_USERNAME / ADMIN_PASSWORD from server/.env)
npm run seed            # optional: sample quiz + demo participants
npm run dev:server      # terminal 1  -> http://localhost:5000
npm run dev:client      # terminal 2  -> http://localhost:5173
```

Sign in at http://localhost:5173 with your admin username and password.

`npm run admin` needs a password of at least 10 characters with upper case, lower case and a number.
Delete `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `server/.env` once the admin exists.

Other helpers: `npm run build` (production build of the website), `npm test` (API tests).
