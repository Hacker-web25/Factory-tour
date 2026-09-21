/**
 * Cross-subdomain aware navigation helpers.
 *
 * On production myvpv.com the app lives on per-org subdomains
 * (aryan.myvpv.com, dukaan.myvpv.com, ...), plus a canonical login
 * subdomain (login.myvpv.com). After a successful sign-in on
 * login.myvpv.com we want the browser to end up on the ORG's
 * subdomain — not the login subdomain with the org path appended.
 *
 * A same-origin router.push() cannot make that jump; we need a real
 * browser navigation (window.location.href). The Supabase session
 * cookie is scoped to .myvpv.com (see lib/supabase.ts) so it carries
 * over between subdomains.
 *
 * On localhost / Vercel preview URLs / non-myvpv hosts we fall back
 * to path-based routing.
 */

export function dashboardHref(slug: string, role: "owner" | "sales"): string {
  if (typeof window === "undefined") return `/${slug}/${role}`;
  const host = window.location.hostname.toLowerCase();
  const onMyVpv = host === "myvpv.com" || host.endsWith(".myvpv.com");
  const alreadyOnOrgSub = host === `${slug}.myvpv.com`;
  if (onMyVpv && !alreadyOnOrgSub) {
    return `https://${slug}.myvpv.com/${role}`;
  }
  return `/${slug}/${role}`;
}

/**
 * Navigate to the org dashboard. On myvpv.com cross-subdomain hops we
 * force a full-page navigation so the browser sends the .myvpv.com
 * session cookie to the org subdomain. Locally we fall through to a
 * relative path — the caller can decide whether to use router.push or
 * router.replace with the returned href instead by calling
 * dashboardHref() directly.
 */
export function goToDashboard(slug: string, role: "owner" | "sales"): void {
  const href = dashboardHref(slug, role);
  if (typeof window === "undefined") return;
  window.location.href = href;
}
