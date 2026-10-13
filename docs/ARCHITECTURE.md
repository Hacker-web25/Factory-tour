# VPV — Architecture

The 10-minute tour of the codebase, aimed at a developer who's never
seen the project before. If you only read one doc, read this one.

---

## What VPV is

A multi-tenant web app that lets manufacturers:
1. **Author** immersive 360° tours of their facilities (upload panoramas,
   drop hotspots, add narration).
2. **Share** those tours with their own customers via gated links
   (password, expiry, device limit, one-time).
3. **Measure** engagement — per-scene time, per-hotspot clicks, forwarded
   detection, distinct devices.

Each paying customer gets their own sub-domain (`acme.myvpv.com`) that
drops them straight into their own dashboard.

---

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 14 App Router | Server components + edge middleware + file-based routing |
| Language | TypeScript | Supabase types + three.js types benefit a lot |
| UI | React 18 + Tailwind | Standard React stack; Tailwind for everything but the glass-morphism bits in `app/globals.css` |
| 3D | three.js via `@react-three/fiber` + `@react-three/drei` | Panorama rendering, cinematic scene transitions |
| Data | Supabase (Postgres + Storage + Auth + Realtime) | One vendor covers DB + file storage + session auth + live collab |
| Hosting | Vercel + wildcard `*.myvpv.com` DNS | Edge middleware for subdomain routing |

---

## Routing topology

### How a URL becomes a route

`middleware.ts` is the entry point for every request. In order:

1. **Security shedding** — probe paths (`/.env`, `/wp-login.php`) get
   410, over-sized bodies get 413, scraper user-agents on private paths
   get 403.
2. **IP capture** — real client IP goes into the `x-vpv-ip` header so
   downstream route handlers don't have to parse `x-forwarded-for`.
3. **Subdomain → slug rewrite** — `acme.myvpv.com/owner` becomes
   `/acme/owner` internally. Reserved subdomains (`apply`, `www`,
   `admin`…) pass through untouched. The `/settings` convenience path
   rewrites to `/acme/owner/settings`.
4. **Cache-control** — auth-sensitive paths (`/login`, `/api/*`,
   `/owner`, `/sales`, `/settings`) get hard `no-store` so no shared
   proxy can serve a stale login response to the wrong user.

### Route tree (what lives where)

```
app/
├── layout.tsx                 — root HTML + global metadata + idle guard
├── page.tsx                   — super-owner cross-org tour editor
├── error.tsx                  — themed error boundary (any route crash)
├── not-found.tsx              — themed 404
│
├── [slug]/owner/              — org-admin dashboard (per customer)
│   ├── page.tsx               — thin wrapper that validates slug ↔ user
│   │                            and renders the ClientDashboardPage
│   └── settings/page.tsx      — account + security settings
│
├── [slug]/sales/              — presenter dashboard (per sales rep)
│
├── client/page.tsx            — the actual dashboard body — rendered
│                                by the [slug]/owner wrapper. Big file,
│                                broken into named sections at the top.
│
├── team/                      — team / presenter management
│   ├── page.tsx               — team roster, pending invites
│   └── analytics/page.tsx     — per-rep analytics
│
├── visitors/                  — visitor analytics (shared links + sessions)
│
├── tour/[id]/                 — public tour by UUID
│   ├── page.tsx               — viewer (gates + attribution)
│   ├── edit/page.tsx          — authoring UI (hotspots, scenes, media)
│   └── share/                 — share-management surface
│
├── v/[token]/page.tsx         — token-gated public viewer link
├── present/                   — presenter-led live session
├── embed/                     — iframe-embeddable viewer
│
├── login/page.tsx             — email+password + Google + sales-team entry
├── signup/sales/page.tsx      — sales-rep signup (name/mobile/email/pw + code)
├── auth/
│   ├── callback/              — Supabase OAuth landing
│   └── reset/page.tsx         — password reset landing
│
├── apply/                     — public qualification form (apply.myvpv.com)
├── setup/                     — post-signup org bootstrap
├── admin/                     — super-owner cross-org admin
├── upload/, presenter/, leads/, analytics/
│
├── api/
│   ├── health/                — public /api/health for uptime monitors
│   ├── notify-new-device/     — "new device signed in" email
│   └── report-abuse/          — public abuse-report submission
│
├── privacy/, terms/, security/ — legal pages
├── robots.ts, sitemap.ts, llms.txt/route.ts
└── globals.css                — Tailwind + liquid-glass CSS primitives
```

---

## Data layer

### Supabase schema (public tables)

| Table | Role |
|---|---|
| `organizations` | One row per customer. `slug` is the subdomain. |
| `profiles` | One row per auth user. Links `auth.users.id` → `org_id` + `role`. |
| `tours`, `scenes`, `hotspots` | The content model — a tour has scenes, a scene has hotspots. |
| `share_links` | One row per shareable public link. Carries password hash, expiry, device limit, recipient. |
| `tour_events` | Analytics event stream — scene views, hotspot clicks, session starts/ends. |
| `active_sessions` | Device enforcement — one row per (user, device fingerprint). |
| `login_attempts` | Login rate-limit backing store. |
| `rate_limits` | Generalised rate-limit backing store (apply form, API routes). |
| `security_audit_log` | Append-only log of sensitive events (password changes, new devices, blocked share links). |
| `invite_codes` | Bulk codes an org_admin generates for sales reps to redeem. |
| `qualification_leads` | Rows written by the public /apply form. |

**Row-Level Security is on for every table.** Each policy scopes rows to
either `auth.uid()` directly or to the user's `org_id`. A user from
org A can never see org B's rows, even by crafting the HTTP request by
hand. See `supabase/*.sql` for the current policies, or run
`SELECT * FROM public.rls_review();` to list every table's RLS status.

### Migration files

`supabase/` holds timestamped SQL migrations. Apply them in file-name
order to a fresh Supabase project. Each file is self-contained and
idempotent (`create table if not exists`, `drop policy if exists`), so
re-running one is safe.

---

## Auth and sessions

### Who's who

Three roles live in `profiles.role`:

| Role | What they see |
|---|---|
| `owner` | You (super-owner) — every tour across every org at `/` |
| `org_admin` | A customer's boss — their org's dashboard at `/owner` |
| `presenter` | A sales rep — their assigned tours at `/sales` |

### Sign-in flow (`app/login/page.tsx`)

1. Rate-limit check (5 fails per 15 min per email → lock)
2. `supabase.auth.signInWithPassword()`
3. Record the attempt (success or fail)
4. Check whether this fingerprint has been seen before (`is_new_device` RPC)
5. Claim a device slot (`claim_device_slot` RPC). If full → sign back
   out, show "signed in elsewhere" screen.
6. Fire the new-device email alert (fire-and-forget, non-blocking)
7. Redirect based on role + presence of `?next=…` param

### Sales signup flow (`app/signup/sales/page.tsx`)

Two-step: fill form (name/mobile/email/password) → enter invite code
provided by the org_admin. If Supabase email confirmation is on, we
park the user on a "check your email" screen between the two steps,
and on their next login detect "signed-in presenter with no org" and
re-enter the code step automatically.

### Device enforcement

Every logged-in user has a configurable `device_limit` (default 1,
inherited from the invite code they redeemed). On every sign-in,
`claim_device_slot` either accepts the new device (bumping the count)
or returns `full` if the cap is reached. Sessions that haven't been
seen in 30 minutes idle out, freeing their slot.

---

## Security surface summary

| Risk | Mitigation |
|---|---|
| Credential stuffing | Email-based lockout (`check_login_rate_limit`) |
| Device sharing | Per-user `active_sessions` cap enforced on sign-in |
| Share-link token enumeration | localStorage brute-force shield + constant-time null |
| API spam | Per-IP `check_and_bump_rate` RPC called from each handler |
| Vuln scanner probes | Edge middleware probe path block → 410 |
| Click-jacking | CSP `frame-ancestors` + `X-Frame-Options` |
| MITM | HSTS 2yr preload |
| Oversized body (OOM) | Middleware 10 MB cap + per-API 4 KB cap |
| New-device alerts | Resend-powered email on first login from unseen fingerprint |
| Audit trail | `security_audit_log` + typed events, scoped per org via RLS |

See `/security` for the public-facing summary, `next.config.js` for the
header stack, `middleware.ts` for the edge layer.

---

## Sales Team MIS and AI meeting analysis

`/team/analytics` (org_admin only) renders `components/dashboard/SalesTeamMIS.tsx`.

- **Team view** — KPIs, leaderboard, charts, then **All presentations**.
- **Presenter drill-down** — click a leaderboard row (or pick from *Team
  View*). URL gets `?presenter=<id>`; the same widgets render through
  `scopeOverviewToMember()` in `lib/salesAnalytics.ts`, plus a
  *Tours presented* table.
- **All presentations** — `components/dashboard/mis/PresentationsList.tsx`,
  rows built by `mis/presentationRows.ts` (tour_events ⨝
  presentation_sessions by `session_id`). Large / Medium / Compact zoom,
  remembered in localStorage.
- **AI Analysis drawer** — `mis/AiAnalysisDrawer.tsx`. Tabs: Conversation,
  AI analysis, Tour journey. ULTRA only (`organizations.plan = 'ultra'`).

Pipeline (all server-side, user's own JWT, RLS applies — no service key).
Three fallback layers so the panel always returns something useful:

1. **Capture.** Presenter's device records audio
   (`lib/presentationRecorder.ts`, only when the org has *Auto-record*
   on) and live-transcribes with the browser's Web Speech API in
   Chrome/Edge. Both end up on `presentation_sessions` — the raw audio
   in the `recordings` bucket and the text in `transcript`.
2. **Split into Customer / Sales turns.** `POST /api/ai/transcribe`
   runs a provider chain, first success wins:
   - **NVIDIA NIM** (`lib/ai/nvidiaDialogue.ts`) when `NVIDIA_API_KEY`
     is set. OpenAI-compatible API at `integrate.api.nvidia.com`,
     `meta/llama-3.3-70b-instruct` by default — free credits last
     longer than Gemini's daily cap for small teams.
   - **Google Gemini** (`lib/ai/geminiDialogue.ts`) when
     `GEMINI_API_KEY` is set.
   - **Rule-based splitter** (`lib/ai/heuristicDialogue.ts`) — zero
     cost, instant, marked `source: "heuristic"` in the saved
     dialogue so the UI shows an "approximate speakers" chip.
3. **Coaching report.** `POST /api/ai/analyze` runs the same chain:
   NVIDIA (`nvidiaReport.ts`) → Gemini (`geminiReport.ts`) →
   `heuristicReport.ts`. The fallback report carries `is_fallback:
   true` and the drawer shows a "based on rules" banner. The overall
   0–100 score is always a weighted average of the 8 criteria in
   `RUBRIC`, no matter which provider scored them.
4. **Persistence.** All `ai_*` writes go through the
   `save_presentation_ai` RPC, which checks org_admin/owner of the
   session's org. `ai_model` records which provider produced the saved
   report (e.g. `nvidia:meta/llama-3.3-70b-instruct`).

Guards: plan check + org match in `lib/server/presentationAccess.ts`;
rate limits 200 split and 200 analyse calls per org per day.

Env (Vercel → Settings → Environment Variables, all optional —
the drawer degrades gracefully to the rule-based fallback):
- `NVIDIA_API_KEY` + optional `NVIDIA_MODEL`
  (default `meta/llama-3.3-70b-instruct`; swap in e.g.
  `nvidia/llama-3.3-nemotron-super-49b-v1`,
  `mistralai/mixtral-8x22b-instruct-v0.1`, or
  `qwen/qwen2.5-72b-instruct` for better Hindi).
- `GEMINI_API_KEY` + optional `GEMINI_MODEL`
  (default `gemini-2.0-flash`).

Add one key, both, or neither — the chain picks the first one that
responds, so you can start on NVIDIA free credits and switch to
Gemini when they run out without redeploying code.

Migration: `supabase/ai_presentation_analysis.sql`.

---

## File-naming conventions

Short list — the full ruleset lives in `docs/CONVENTIONS.md`.

- **Pages** use the Next.js file convention: `page.tsx`, `layout.tsx`,
  `error.tsx`, `not-found.tsx`.
- **Components** are PascalCase + `.tsx`: `ChangePassword.tsx`,
  `AddTeamMemberModal.tsx`.
- **Library modules** are camelCase + `.ts`: `shareLinks.ts`,
  `deviceSessions.ts`.
- **SQL migrations** are snake_case + `.sql`: `login_security.sql`.
- **Routes** that live under a subdomain prefix (middleware rewrites
  them) are kept in `app/[slug]/…`; routes that are the same on every
  subdomain live at the top level (e.g. `app/login/page.tsx`).

---

## Where to start when fixing a bug

- **UI bug on the dashboard** → `app/client/page.tsx`
- **UI bug on the tour editor** → `app/tour/[id]/edit/page.tsx` +
  `components/builder/RightPanel.tsx`
- **UI bug in the viewer** → `components/viewer/TourPlayer.tsx`
- **Share link not working** → `lib/shareLinks.ts` + `app/v/[token]/page.tsx`
- **Auth flow bug** → `lib/auth.ts` + `app/login/page.tsx`
- **"Why can my user see X?"** — check the RLS policies on that table in
  `supabase/*.sql`. If no policy, that's the bug.
- **Edge-layer behaviour** (headers, redirects, probe shedding) →
  `middleware.ts` + `next.config.js`
