# SEO Ledger — NexIT multi-tenant SEO reporting platform

Next.js + React frontend, Node/Express backend, Postgres via Prisma. Uses
Postgres by default (rather than SQLite) because it needs to run on Vercel,
where the filesystem is ephemeral — a SQLite file wouldn't survive between
serverless invocations. [Neon](https://neon.tech) is a good free option and
has a native Vercel integration.

## What's real vs. mocked

- **Auth, roles, the access ledger, and all routing/permission logic are
  fully working** — this is a real running app, not a static mockup.
- **Report data (GA4 / GMB / conversions) is mocked** in
  `backend/src/services/*.service.js`. Each file has a comment showing the
  exact real API call it replaces (GA4 Data API, Google Business Profile
  API) — swapping in real credentials only touches those files, nothing
  else in the stack changes.
- **Keyword rankings work differently from the other three** — see below.

## All four report modules: weekly snapshots, not live calls

None of GA4, Business Profile, Conversions, or keyword rankings are ever
called live from a dashboard page load. All four are captured together
every **Sunday**, covering the week that just completed (Monday through
Saturday), and read from stored snapshots:

- `ReportSnapshot` — one row per (client, module, capture date) for GA4,
  GMB, and Conversions — each stores its whole report payload as JSON. GA4's
  payload includes a `dailyBreakdown` array of the 6 completed days, not
  just a single weekly total — that's what the "Daily users" chart plots.
- `RankSnapshot` / `TrackedKeyword` — keyword rankings use a slightly
  different shape (one row per keyword per capture, not one blob) since the
  dashboard needs to query/aggregate per keyword, not just show one blob.
- `backend/src/services/poll.service.js` — `pollAllForClient()` captures
  all four for one client in a single call. This is what all of the
  following actually run:
  1. **Every Sunday, automatically** — `backend/vercel.json` defines a
     Vercel Cron job (`0 3 * * 0` UTC) hitting `GET /cron/poll-all`
     (protected by `CRON_SECRET`).
  2. **"Fetch now"** — directly on each client's row in the admin roster
     (`/dashboard`), no need to open the client first. This is the fast
     path for "this one client needs fresher data right now."
  3. **"Refresh all reports now"** — on the Settings page
     (`/dashboard/settings`), same underlying call, reached via the client
     picker instead of the roster row.
- If a module hasn't been captured yet (a client was granted access between
  one Sunday cycle and the next), the dashboard shows a distinct "pending
  first capture" panel — different from the "not granted" locked panel, and
  resolves itself on the next cron run or manual fetch.
- Each of the four mock generators (`ga4.service.js`, `gmb.service.js`,
  `conversions.service.js`, `keywords.service.js`) has exactly one function
  that's the real-API integration point — everything else (routing, the
  cron, the Settings UI, the roster's Fetch now button) stays the same when
  you swap those in.

## Keyword rankings are location- and device-targeted

Google localizes search results by geography and device — a Melbourne
search and a Sydney search can genuinely return different rankings for the
same term, and mobile vs desktop results frequently differ too. So a
tracked keyword isn't fully specified by its text alone:

- Every `TrackedKeyword` has a `location` (defaults to
  `"Melbourne, Victoria, Australia"`) and a `device` (`"mobile"` or
  `"desktop"`, defaults to mobile). Admin sets these per keyword when adding
  it in Settings — the same keyword can be tracked in two different
  locations, or on both mobile and desktop, as separate tracked entries.

## Three ranking sources per keyword, not one number

A single "current position" hides more than it reveals, since every
ranking source has a different accuracy/cost/freshness tradeoff. This app
tracks each keyword three ways side by side rather than picking one as
"the" answer:

| Source | Cost | Cadence | Accuracy |
|---|---|---|---|
| `dataforseo` | Paid | Weekly, automated | Precise single-point rank for the exact location/device |
| `search_console` | Free | Weekly, automated | An *average* position across the date range, not a point-in-time rank, and lags Google's own reporting by 2-3 days — see `backend/src/services/gsc.service.js` for why it isn't a drop-in substitute for a SERP API |
| `manual` | Free (agency time) | Whenever an admin does it \u2014 expect roughly monthly | Most accurate by definition (a human actually checked), but only as fresh as the last time someone did |

- `RankSnapshot.source` is what makes this work — every row is tagged, so
  history for one source never mixes with another.
- The weekly cron and the "Refresh automated sources" button in Settings
  both call `pollRankingsForClient()`, which captures `dataforseo` *and*
  `search_console` together — they're on the same schedule since both are
  automated.
- Manual entries never touch the cron at all — they're a direct write via
  `POST /settings/:clientId/keywords/:id/manual`, triggered by the "Add
  manual" button next to a tracked keyword in Settings. A bulk "Refresh all
  reports now" never overwrites a manual entry.
- `backend/src/services/keywords.service.js` — `callDataForSeo()` is where
  a real DataForSEO call would pass `location_name`, `gl` (country, e.g.
  `"au"`), `hl` (language, e.g. `"en"`), and `device`. Simply appending a
  city name to the query string isn't enough — a real local search encodes
  the searcher's exact location as a Base64 **UULE** parameter, which is
  what actually forces Google to render results as if the searcher is
  physically there. Most SERP APIs (DataForSEO included) convert a
  canonical `location_name` string into the correct UULE parameter behind
  the scenes, so you don't have to build it by hand.
- **Worth setting client expectations on:** even done correctly, this won't
  be pixel-identical to what one specific person sees in their own browser.
  This dashboard pulls a **clean SERP** (no login, no history, run from the
  target location) — a client's own browser shows a **dirty SERP**, shaped
  by their personal search/click history and by block-level proximity to
  local competitors (especially in the Map Pack). The Settings page has a
  built-in "Why a client's own search might not match this dashboard" note
  covering exactly this, including what to tell a client who wants to
  sanity-check a ranking themselves (Incognito mode + a location-spoofing
  extension gets them closest to a clean SERP, though still not guaranteed
  identical).

## Updating an already-deployed instance

If you've already deployed this and are pulling a later version of the
code (like the keyword-tracking feature above), the database schema needs
to catch up too. Since local dev and Vercel typically point at the *same*
Neon database, running the migration locally applies it directly to the
live database — nothing extra needed on Vercel's side beyond redeploying
the code:

```
cd backend
npx prisma migrate dev --name add_ranking_sources
npm run seed:keywords   # tracked keywords + history for the demo clients
npm run seed:reports    # first GA4/GMB/Conversions capture for the demo clients
```

If `migrate dev` reports schema drift and suggests `prisma migrate reset` —
**do not run that**, it drops all data. Use `npx prisma db push` instead,
which syncs the schema without touching existing rows; this typically
happens when a fresh local folder doesn't have the same
`prisma/migrations` history as whichever folder you originally ran
`migrate dev --name init` from.

Both seed scripts are safe to re-run — they only add what doesn't already
exist, they won't duplicate anything or touch existing clients.

## How access control actually works

1. Admin logs in, sees the client roster (`/dashboard`).
2. Admin opens a client (`/dashboard/clients/[id]`) and stamps modules
   GRANTED or LOCKED via the Access Ledger — this calls
   `PUT /access/:clientId/:module`, which upserts a row in `AccessGrant`.
3. Every report route (`GET /reports/:clientId/ga4` etc.) is wrapped in
   `checkAccess(moduleCode)` middleware — a CLIENT user gets a 403 with
   `{ locked: true }` if their client hasn't been granted that module;
   an ADMIN always passes through (so they can preview any client).
4. The client's own dashboard (`/dashboard`, when logged in as a CLIENT
   user) and the admin's preview pane render the *same* `ReportView`
   component — it reads the ledger and renders each module's charts or a
   locked empty-state, so there's exactly one place the "what does a client
   see" logic lives.

## Deploying to Vercel

Same as Hostinger, this is **two separate Vercel projects** — one for
`frontend/`, one for `backend/` — since they're different apps. Vercel lets
you point a project's root directory at a subfolder of one repo, so you
don't need to split repos the way you might on Hostinger.

### 1. Database
Create a Neon project (vercel.com -> Storage -> Neon, or directly at
neon.tech) — Neon's connections are pooler-friendly, which serverless
functions need, since each invocation can be a fresh connection. Grab both
the pooled and direct connection strings.

### 2. Backend project
- New Vercel project -> import the repo -> set **Root Directory** to
  `backend`.
- Framework preset: Other (it's plain Express wrapped for serverless via
  `backend/api/index.js` + `backend/vercel.json` — already in the repo).
- Environment variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`,
  `FRONTEND_URL` (fill in once you know the frontend's Vercel URL),
  `CRON_SECRET` (any long random string — Vercel Cron sends this
  automatically as a Bearer token once the env var is set, no extra config
  needed for that part).
- Build command: leave default (no build step needed) — but add
  `npx prisma generate` as the build command if Vercel doesn't pick up the
  `postinstall` script automatically.
- After first deploy, run `npx prisma migrate deploy` once against the Neon
  database from your machine (with `DATABASE_URL`/`DIRECT_URL` in a local
  `.env`) and `npm run seed` — Vercel doesn't run migrations for you.

### 3. Frontend project
- New Vercel project -> import the same repo -> **Root Directory**:
  `frontend`. Vercel auto-detects Next.js, no other config needed.
- Environment variable: `BACKEND_URL` = the backend project's URL from
  step 2 (e.g. `https://seo-ledger-backend.vercel.app`).

### 4. Order matters
Deploy the backend first, copy its `.vercel.app` URL into the frontend's
`BACKEND_URL`, deploy the frontend, then copy *its* URL into the backend's
`FRONTEND_URL` and redeploy the backend once to pick it up.

### Notes specific to Vercel
- `backend/src/index.js` only calls `app.listen()` when run directly
  (`require.main === module`) — Vercel imports the Express app as a request
  handler instead, so it must not bind a port there.
- `backend/src/lib/prisma.js` caches the Prisma client on `global` so
  repeated warm invocations of the same function instance reuse one
  connection instead of opening a new pool each time.
- If you ever see "too many connections" errors under load, that's Neon's
  free-tier pool limit, not a bug in this setup — either upgrade the Neon
  plan or add Prisma Accelerate.

## Deploying to Hostinger (Business/Cloud hPanel — Node.js Web Apps)

This deploys as **two separate Node.js Web Apps** in hPanel — one for
`backend/`, one for `frontend/` — since Hostinger's Node.js Web Apps hosting
runs one app per site. If hPanel's "Import Git Repository" flow doesn't
expose a subdirectory/root-path field for this repo, put `backend/` and
`frontend/` in their own GitHub repos instead — same files, just split.

### 1. Database
The project already defaults to Postgres (see the top of this README) — a
Neon database works fine on Hostinger too, no schema changes needed. If you'd
rather use Hostinger's own included MySQL database instead, change
`provider = "postgresql"` to `provider = "mysql"` in
`backend/prisma/schema.prisma`, drop the `directUrl` line (MySQL doesn't need
it), and point `DATABASE_URL` at the credentials from hPanel -> Databases ->
MySQL Databases.

Either way, run `npx prisma migrate dev --name init` and `npm run seed` once
against the production database (from your machine, or Hostinger's web
terminal if your plan includes one) before the app goes live.

### 2. Backend Node.js Web App
- hPanel -> Websites -> Add website -> Node.js Web App -> import the repo
  (root: `backend/` if supported, otherwise the split backend repo).
- Startup file: `src/index.js` (or leave the auto-detected `npm start` —
  the `start` script already points here).
- Environment variables: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` (the
  frontend app's URL, once you know it — CORS allow-list).
- Hostinger sets `PORT` itself; the app already reads `process.env.PORT`.

### 3. Frontend Node.js Web App
- Same flow, root: `frontend/` (or the split frontend repo).
- Build command: `npm run build`. Start command: `npm start`.
- Environment variable: `BACKEND_URL` = the backend app's URL from step 2
  (e.g. `https://api.yourdomain.com`). The frontend proxies `/api/*` to it
  server-side, so the browser never talks to the backend origin directly.

### 4. Order matters
Deploy the backend first, note its URL, set that as `BACKEND_URL` on the
frontend. Then deploy the frontend, note its URL, and set that as
`FRONTEND_URL` on the backend (redeploy the backend once to pick it up).

## Dependency notes

Pinned to `next@15.5.21` (the currently patched 15.x release) rather than the
14.x line — Next.js stopped shipping security patches for 14.x after its
July 2026 advisory batch, so 14.x would mean no further fixes. Before
deploying, run `npm audit` in `frontend/` and check the Next.js blog for
anything newer.

`npm audit` may still flag transitive `sharp`/`postcss` advisories bundled
inside Next's own tooling — `sharp` is only exercised by `next/image`, which
this project doesn't use, and the `postcss` issue is a build-time source-map
edge case, not a runtime one. Don't run `npm audit fix --force` on this repo;
it tries to downgrade Next to `9.x`, which is not a real fix.

## Run it (local dev)

### 1. Get a free Postgres database
Create a project at [neon.tech](https://neon.tech) (or point at any Postgres
instance you already have). Neon gives you two connection strings — a
pooled one and a direct one; you need both.

### Backend
```
cd backend
cp .env.example .env
# fill in DATABASE_URL (pooled) and DIRECT_URL (direct) from Neon,
# and JWT_SECRET (any long random string)
npm install
npx prisma migrate dev --name init
npm run seed               # creates 1 admin + 3 demo clients
npm run dev                 # http://localhost:4000
```

### Frontend
```
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

### Demo logins (password: `password123` for all)
- `admin@nexit.demo` — admin roster + access ledger
- `cyberforte@client.demo` — GA4, keywords, conversions granted; GMB locked
- `meridian@client.demo` — everything granted
- `alderton@client.demo` — only GA4 granted, rest locked (shows empty states)

## Wiring in real data sources later

| Module   | Service file                          | Real API |
|----------|----------------------------------------|----------|
| GA4-01   | `backend/src/services/ga4.service.js`        | GA4 Data API (service account, Viewer role per property) |
| KWD-02   | `backend/src/services/keywords.service.js`   | DataForSEO SERP + Keywords Data API |
| GMB-03   | `backend/src/services/gmb.service.js`        | Google Business Profile Performance + Business Information APIs |
| CNV-04   | `backend/src/services/conversions.service.js` | Same GA4 Data API client, filtered to key events |

Rank history (previous vs. current position) needs its own scheduled job —
none of the above APIs return trend data for free. Add a cron (n8n or a
simple node-cron script) that calls `keywords.service.js` daily and writes a
`RankSnapshot` row per keyword; the roster and dashboard queries then read
from that table instead of hitting the API live on every page load.
