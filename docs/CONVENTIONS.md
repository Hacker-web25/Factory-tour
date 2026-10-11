# VPV — Code Conventions

The patterns we follow consistently so a new reader can grok a file
without context switching. If a change in review doesn't match
something below, flag it.

---

## Files and folders

| Kind | Convention | Example |
|---|---|---|
| Next.js page | `page.tsx` under `app/<route>/` | `app/login/page.tsx` |
| Next.js layout / error / 404 | `layout.tsx`, `error.tsx`, `not-found.tsx` | — |
| API route | `app/api/<endpoint>/route.ts` | `app/api/health/route.ts` |
| React component | PascalCase `.tsx` | `AddTeamMemberModal.tsx` |
| Library module | camelCase `.ts` | `deviceSessions.ts` |
| SQL migration | snake_case `.sql`, chronological apply order | `login_security.sql` |
| Hook | `useXxx.ts` | `useAutoTour.ts` |

Never commit `*.tmp`, `*.NEW_REDIRECT`, `.DS_Store`, `Claude outputs/`,
business CSVs, or `.env*`. `.gitignore` already handles these.

---

## File header

Every non-trivial file starts with a block comment explaining what it
does and why it exists. Pattern:

```ts
/**
 * <one-line summary>
 *
 * <two-to-four sentences on the file's role in the system and any
 * non-obvious design decisions.>
 */
```

If the file is longer than ~300 lines, add top-level `/* ---- Section ---- */`
separators between logical blocks so a reader can scan the shape.

---

## Imports

Order top to bottom:

1. React / Next
2. Third-party packages
3. Our own `@/lib/*`
4. Our own `@/components/*`
5. Types (as a separate line with `import type { … }`)
6. Side-effect CSS / shim imports last

Group with blank lines. Alphabetise within each group when it's not
too disruptive.

---

## State and effects

- `useState` names are nouns, not verbs: `isOpen`, `tourId`, `rows`.
  The setter name follows automatically: `setIsOpen`, `setTourId`.
- `useEffect` should either have an explicit empty deps array
  (`[]` — "mount only") OR list every reactive value it reads. We
  don't disable eslint-react-hooks rules.
- Every effect that subscribes / sets a timer / creates a listener
  returns a cleanup function. No exceptions.
- Async work inside `useEffect` lives in an inner `async` IIFE that
  checks a `cancelled` flag the cleanup sets to `true`.

```tsx
useEffect(() => {
  let cancelled = false;
  (async () => {
    const data = await fetchStuff();
    if (!cancelled) setStuff(data);
  })();
  return () => { cancelled = true; };
}, [dep]);
```

---

## Error handling

- Never swallow errors silently with `catch {}`. If a catch legitimately
  has nothing to do, leave a `/* intentional — <reason> */` comment.
- Fire-and-forget network calls (audit log, notifications) catch and
  `console.warn` instead of throwing — a logging failure must never
  bring down the real work.
- User-facing errors go into local `error` state and render as a
  dedicated error UI block; never `alert()`.

---

## Supabase queries

- Prefer `.maybeSingle()` over `.single()` for lookups that may miss.
  `.single()` throws when zero rows; `.maybeSingle()` returns `null`.
- Always `select(...)` the exact columns you need — never
  `select("*")` on hot paths.
- Writes that MUST be atomic go through a SQL RPC in
  `supabase/*.sql`. Don't try to chain two client-side updates and
  hope they both succeed.
- RLS does the real access control. Never add client-side filters as
  a substitute for a policy.

---

## Rate-limited endpoints

Every public-facing endpoint goes through `enforceRateLimit(key, max,
windowSeconds)` from `lib/rateLimit.ts`. Keys follow the convention:

```
<endpoint>:<dimension>:<value>
```

e.g. `signup-sales:fp:<fingerprint>`, `apply:fp:<fingerprint>`,
`notify-new-device:ip:<ip>`.

On a 429, return `Retry-After` in seconds and a plain
`{ok: false, error: "rate_limited"}` body. The client shows a user-
friendly countdown.

---

## Security events

Any time something security-adjacent happens, log it:

```ts
import { logSecurityEvent } from "@/lib/audit";

await logSecurityEvent({
  event: "password.changed",     // from the typed union
  orgId: me.org_id,
  subject: me.email,
  ip,
  userAgent,
  meta: { triggered_by: "settings" },
});
```

The `event` must come from `AuditEvent` in `lib/audit.ts`. If you
need a new one, add it to the union there.

---

## Styling

- Tailwind for 90% of UI. Custom CSS lives in `app/globals.css`
  behind named classes (`.vpv-modal-panel`, `.vpv-input`,
  `.vpv-glass-panel`). Those are the glass-morphism + aurora bits
  Tailwind can't express cleanly.
- Inline `style={{ ... }}` for one-off values that depend on JS
  computation (dynamic sizes, animated transforms). Static values
  belong in Tailwind.
- Design tokens live in `tailwind.config.ts` under theme.extend —
  colours are `vpv-navy`, `vpv-blue`, `vpv-ink`, `vpv-tint`,
  `vpv-canvas`, `vpv-muted`, `vpv-line`.

---

## Hotspot and tour model

- A `Tour` has many `Scene`s. Each `Scene` is a 360° equirectangular
  image (or a flat photo, if `is_flat`).
- A `Hotspot` lives on a scene and has:
  - A **type** (visual style: info, image, video, person, nav, document, audio)
  - An **action** (click behaviour: nav / info_popup / image_popup / video_popup / pdf_popup / audio_popup / url / none)
- Legacy hotspots have `type` only; new ones have both `type` and
  `action`. `effectiveAction(h)` in `lib/hotspotCard.ts` resolves to
  the right one.
- Cross-tour nav uses `nav_tour_id` + `target_scene_id` and routes
  through `?scene=` on the destination tour's URL.

---

## Commits

- One logical change per commit.
- Message style: `<verb> <object>: <short why>`.
  Good: `Fix cross-tour nav: honour ?scene= to land on target scene`.
  Bad: `fixes`, `updates`, `wip`.
- Never commit `console.log` sprinkled through code — use the
  compiler's `removeConsole` prod stripping (`next.config.js`) for
  `console.error`/`warn` only, and remove `log` calls before pushing.

---

## When in doubt

If a convention above doesn't cover your case, match the closest
existing file and leave a one-line comment explaining your choice.
Future readers (including you) will thank you.
