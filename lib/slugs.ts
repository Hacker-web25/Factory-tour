/**
 * The single source of truth for customer subdomain names ("slugs").
 *
 * Used by the edge middleware (routing), the self-serve /setup flow
 * (lib/orgSlug.ts), the Razorpay auto-provisioning (lib/server/fulfilment.ts)
 * and the Admin → Customers form (api/admin/provision). Before this file
 * each of those kept its own copy of the list and its own slugify(), and
 * the copies had already drifted apart.
 *
 * A reserved word can never become a customer's address — those names
 * belong to the platform (and the middleware sends them to myvpv.com).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "www", "app", "api", "admin", "auth", "cdn", "static", "assets",
  "mail", "email", "docs", "help", "support", "blog", "status",
  "login", "dashboard", "apply", "billing", "pay", "checkout",
]);

/** Company name → URL-safe label (a-z, 0-9, single hyphens, ≤ 40 chars). */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "plant";
}

/* ───────────────────── the address a customer chooses ───────────────────── */

/**
 * A workspace address is <slug>.myvpv.com, and it is the address a
 * customer will put on a business card and send to buyers. So:
 *
 *   · it is chosen by the customer at checkout, not generated for them
 *     — the old code appended a random number when a name was taken,
 *     which is how "LiveTest" became livetest-407.myvpv.com;
 *   · it is ONE label. Two levels (textile.example.myvpv.com) is not a
 *     cosmetic choice: the wildcard certificate covers one level only,
 *     so a second dot means a browser security warning, and the edge
 *     middleware already sends anything deeper back to the apex;
 *   · it is short. A long address is mistyped and looks temporary.
 */
export const SLUG_MAX = 28;
export const SLUG_MIN = 3;
/** Words, not characters, is what a person actually counts. */
export const SLUG_MAX_WORDS = 3;

/**
 * Company name → the address we propose. Strict: letters and digits
 * only, single hyphens between words, nothing appended. Returns "" when
 * there is nothing usable, so the caller can ask rather than invent.
 */
export function workspaceSlug(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, SLUG_MAX_WORDS)
    .join("-")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/**
 * What is wrong with a proposed address, in words a customer can act on.
 * Null means it is well-formed — it may still be taken, which only the
 * database can answer.
 */
export function slugProblem(slug: string): string | null {
  const s = String(slug ?? "");
  if (!s) return "Please choose an address for your VPV.";
  if (s !== s.toLowerCase()) return "Use small letters only.";
  if (s.length < SLUG_MIN) return `Use at least ${SLUG_MIN} letters.`;
  if (s.length > SLUG_MAX) return `Keep it to ${SLUG_MAX} characters — this one is ${s.length}.`;
  if (s.includes(".")) return "Use one name only, without a dot — a dot would break the secure padlock on your address.";
  if (!/^[a-z0-9-]+$/.test(s)) return "Letters, numbers and hyphens only.";
  if (/^-|-$/.test(s)) return "It cannot start or end with a hyphen.";
  if (/--/.test(s)) return "Use one hyphen at a time.";
  if (/^\d+$/.test(s)) return "Please include some letters.";
  if (s.split("-").filter(Boolean).length > SLUG_MAX_WORDS) {
    return `Keep it to ${SLUG_MAX_WORDS} words — shorter is easier for your buyers to type.`;
  }
  if (RESERVED_SLUGS.has(s)) return "That name belongs to VPV itself. Please choose another.";
  return null;
}

/** "acme-steel" → "acme-steel.myvpv.com". */
export function workspaceHost(slug: string, apex = "myvpv.com"): string {
  return `${slug}.${apex}`;
}
