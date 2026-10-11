# VPV — Virtual Plant Visit

Premium 360° virtual tour platform for factories and manufacturing sites.
Clients can walk through a plant from anywhere, with per-scene narration,
hotspot information, and secure share links.

## Stack

- Next.js 14 (App Router)
- React 18 · TypeScript
- Three.js (via `@react-three/fiber` + `@react-three/drei`)
- Supabase (Postgres + Storage + Auth)
- Tailwind CSS
- Hosted on Vercel · wildcard `*.myvpv.com`

## Local setup

```bash
npm install
```

Create `.env.local` from `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Optional — enables "new device signed in" email alerts
RESEND_API_KEY=
RESEND_FROM="VPV Alerts <alerts@myvpv.com>"
```

Apply the SQL migrations in `supabase/` to your Supabase project in
chronological order (the files are small and well-commented).

Then:

```bash
npm run dev
```

Open http://localhost:3000.

## Architecture

- `app/[slug]/owner/` — per-organisation dashboard, routed via subdomain
  rewrite in `middleware.ts` (so `acme.myvpv.com` → `/acme/owner`).
- `app/[slug]/sales/` — presenter dashboard for sales reps.
- `app/tour/[id]/` — public viewer + editor for a tour.
- `app/v/[token]/` — token-gated public viewer link.
- `app/login/`, `app/signup/sales/`, `app/auth/reset/` — auth surfaces.
- `components/viewer/TourPlayer.tsx` — the Three.js 360° scene player.
- `components/builder/` — the tour authoring UI.
- `lib/` — Supabase helpers, device-session enforcement, invite codes,
  share links, analytics, offline cache.

## Security

See [`/security`](https://myvpv.com/security) for the public-facing
summary. Code-level highlights:

- Row-level security on every database table (per-org isolation).
- bcrypt password hashing via Supabase Auth.
- Login rate-limit + account lockout (`supabase/login_security.sql`).
- Per-user device cap, enforced in `lib/deviceSessions.ts`.
- Content Security Policy + HSTS set in `next.config.js`.

To report a vulnerability: `security@myvpv.com`.

## License

Proprietary. Copyright © The Next Design.
