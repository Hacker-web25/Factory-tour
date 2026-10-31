/**
 * lib/journeyScope.ts — which tracked events belong to a person's journey.
 *
 * A person's numbers (pages, time on site, interest) are built from every
 * event their browser sent. That is wrong in two ways when the browser is
 * ALSO one our own team uses (a test scan on the owner's phone, a salesperson
 * opening the admin from the same phone):
 *
 *   1. Pages behind a login (/admin, /dashboard, /login …) are not part of
 *      what a prospect looked at. They are never counted.
 *   2. Events from BEFORE the card was scanned are not the person's. The
 *      journey starts at the scan (or at the first page that carries their
 *      code, whichever is earlier).
 *
 * Pure functions, shared by the roster and the person page so the two always
 * agree.
 */

/** First path segments that are internal or customer-only, never a prospect's reading. */
const INTERNAL_SEGMENTS = new Set([
  "admin",
  "dashboard",
  "login",
  "auth",
  "client",
  "setup",
  "signup",
  "team",
  "present",
  "presenter",
  "upload",
  "leads",
  "visitors",
  "analytics",
  "api",
  "billing",
]);

/** A page a prospect can open from the public site (query strings ignored). */
export function isCustomerFacingPath(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const clean = raw.split("?")[0]!.split("#")[0]!;
  const first = clean.split("/").filter(Boolean)[0]?.toLowerCase();
  return !first || !INTERNAL_SEGMENTS.has(first);
}

type Timed = { created_at: string; path: string | null };

const t = (iso: string) => new Date(iso).getTime();

/**
 * When this person's journey begins: the earliest of their first human scan
 * and the first page view that carries their code (`?vpv=<code>`). Null when
 * neither is known, in which case nothing is cut off by time.
 */
export function journeyStartMs(
  code: string,
  humanScanTimes: string[],
  events: Timed[]
): number | null {
  const marker = `vpv=${code}`.toLowerCase();
  let start: number | null = null;
  const take = (ms: number) => {
    if (Number.isFinite(ms) && (start === null || ms < start)) start = ms;
  };
  for (const s of humanScanTimes) take(t(s));
  for (const e of events) if ((e.path ?? "").toLowerCase().includes(marker)) take(t(e.created_at));
  return start;
}

/** Keep only the events that are this person's: public pages, from the scan on. */
export function scopeEvents<E extends Timed>(events: E[], startMs: number | null): E[] {
  return events.filter(
    (e) => isCustomerFacingPath(e.path) && (startMs === null || t(e.created_at) >= startMs)
  );
}
