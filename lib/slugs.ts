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
