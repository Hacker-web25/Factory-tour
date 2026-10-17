# VPV — Virtual Plant Visit

Premium 360° virtual tour platform for factories and manufacturing sites.
Clients can walk through a plant from anywhere, with per-scene narration,
hotspot information, and secure share links.

---

## Where to start reading

| If you want to… | Read |
|---|---|
| Understand what VPV is and where every file lives | **`docs/ARCHITECTURE.md`** |
| Match our code style for a new file / change | **`docs/CONVENTIONS.md`** |
| Know what we do about security | **`/security`** page (served at build) + `supabase/*_security.sql` |
| See the live privacy policy / terms | **`/privacy`**, **`/terms`** pages |

**New here?** Read `docs/ARCHITECTURE.md` end to end (15 min). It maps
the whole app — routing, data model, auth, security surface. Then skim
`docs/CONVENTIONS.md` so your first commit matches the house style.

---

## Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Three.js via `@react-three/fiber` + `@react-three/drei`
- Supabase (Postgres + Storage + Auth + Realtime)
- Tailwind CSS
- Hosted on Vercel + wildcard `*.myvpv.com` DNS

---

## Local setup

```bash
npm install
```

Copy the env template:

```bash
cp .env.local.example .env.local
```

Fill in the Supabase keys (project → Settings → API). Optionally add
Resend keys for the "new device" email alerts; without them that
feature silently no-ops.

Apply the SQL migrations in `supabase/` in filename order to a fresh
Supabase project. Each file is idempotent, so re-running is safe.

```bash
npm run dev
```

Open http://localhost:3000.

---

## Deployment

Pushes to `main` on GitHub trigger a Vercel build. The wildcard DNS
record for `*.myvpv.com` points at the single `factory-tour` Vercel
project. Subdomain → slug rewriting happens in `middleware.ts`.

For a new customer:
1. Run the SQL block in `docs/ARCHITECTURE.md` → "Adding a customer".
2. Send them the login URL + temp password printed in the SQL
   editor's Messages panel.
3. They log in and change the password from Settings → Security.

---

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Start the dev server with hot-reload |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint over the whole repo |

---

## Reporting bugs or vulnerabilities

- **Bugs**: open a GitHub issue with a reproduction and the browser
  you saw it in.
- **Security**: email `support@myvpv.com` instead of filing publicly.
  See `/security` for our disclosure policy.

---

## License

Proprietary. Copyright © The Next Design.
