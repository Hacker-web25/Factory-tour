/**
 * Safe post-login redirect targets.
 *
 * `?next=` values come from the URL, which anyone can craft. Without
 * validation, `/login?next=https://evil.example` (or `javascript:…`)
 * would send a freshly signed-in user — or run script — wherever the
 * attacker chose. We therefore only ever accept a same-site, path-only
 * target: it must start with a single "/" (no "//", no backslashes, no
 * scheme, no control characters).
 */
export function safeNext(
  raw: string | null | undefined,
  fallback: string = "/"
): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}

/** True for the literal internal tenant-dashboard paths (/{slug}/owner,
 *  /{slug}/sales). Those must never be used as a login `next` — a tenant
 *  dashboard is only reachable on its own subdomain, via the session
 *  hand-off in lib/authRedirect.ts, never by pushing the raw path. */
export function isTenantPath(p: string): boolean {
  return /^\/[^/]+\/(owner|sales)(\/|$|\?)/.test(p);
}
