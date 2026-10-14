/**
 * Subdomain labels that must never be assigned to a tenant org.
 *
 * The platform itself reserves these — generic/legacy hosts (www, app),
 * infra (api, cdn, static, assets), auth/admin tooling (auth, admin,
 * login, dashboard), mail (mail, email), and a few content hosts (docs,
 * help, support, blog, status). "apply" is the public sign-up funnel.
 *
 * Shared by middleware.ts (edge routing) and lib/orgSlug.ts (slug
 * generation for new orgs) so the two can never drift out of sync —
 * before this, orgSlug.ts didn't check this list at all, so a new org
 * named e.g. "App Solutions" or "Admin Co" could be assigned a slug
 * that collided with one of these and silently broke that tenant's
 * subdomain.
 */
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "auth", "cdn", "static", "assets",
  "mail", "email", "docs", "help", "support", "blog", "status",
  "login", "dashboard", "apply",
]);
