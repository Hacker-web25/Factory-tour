import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_SLUGS } from "@/lib/slugs";
import { PUBLIC_LEGAL_PATHS } from "@/components/legal/nav";
import { SITE_PATHS } from "@/lib/site/pages";
import {
  VISITOR_COOKIE,
  VISITOR_HEADER,
  VISITOR_MAX_AGE,
} from "@/lib/analytics/attribution";

/**
 * Edge middleware — subdomain routing + security hardening.
 *
 * Two jobs:
 *
 *   1. Subdomain-to-slug rewrite (acme.myvpv.com/… → /acme/owner/…).
 *      This is the original purpose; unchanged behaviour.
 *
 *   2. Front-door security:
 *      - Capture the real client IP into x-vpv-ip so downstream handlers
 *        don't have to care about the x-forwarded-for parsing dance.
 *      - Reject obvious crawler / vuln-scanner User-Agents from private
 *        paths (dashboards, auth, viewer). The marketing surface stays
 *        open to legitimate bots.
 *      - Reject requests with payloads over our hard cap, so an attacker
 *        can't tie up server memory by streaming a 10 GB body.
 *      - Block known-bad path probes (wp-login.php, .env, phpmyadmin…).
 *      - Set strict no-cache headers on auth paths so a shared proxy
 *        can never cache a login response and serve it to someone else.
 *
 *  Edge middleware runs on EVERY request, so everything in this file
 *  is cheap: a few header reads, a regex or two, no I/O.
 */

const APEX = "myvpv.com";

// Subdomains that must never be treated as an org slug. Single source
// of truth lives in lib/slugs.ts (also used by lib/orgSlug.ts
// when generating a new org's slug, so the two can never drift apart).
const RESERVED = RESERVED_SLUGS;

// Pages that only ever make sense on the main domain: the policy /
// company pages (single source: components/legal/nav.ts — the seven
// consent pages plus pricing/about/contact/the /legal hub) and the
// login/signup entry points. A tenant opening any of these from their
// own subdomain is sent to the identical path on the apex instead of
// getting a confusing second copy of the page under their own URL.
// Deliberately does NOT include /auth/* — that is the cross-subdomain
// sign-in handoff goToDashboard() relies on (lib/authRedirect.ts), and
// redirecting it to the apex would break login outright.
const APEX_ONLY_PATHS = [
  ...PUBLIC_LEGAL_PATHS,
  // The marketing site (/plans, /faq, /assessment/…). "/" is dropped on
  // purpose: on a subdomain it is the customer's own dashboard, and a
  // bare "/" here would match every path and send the whole subdomain
  // to the apex.
  ...SITE_PATHS.filter((p) => p !== "/"),
  "/checkout",       // paying for a plan chosen on the site
  "/login",
  "/signup",
  "/setup",          // post-signup org creation (you sign in on the apex)
  "/apply",          // public qualification form
  "/why-vpv",        // the loss calculator, linked from the site
  "/demo",           // the live demo tour, in the site menu
  "/experience",     // the live tour the homepage hero frames
  "/admin",          // platform-owner admin
  "/dashboard",      // platform-owner dashboard
  "/auth/callback",  // Google sign-in lands on the apex
  "/auth/reset",     // password-reset link lands on the apex
];

// Paths that live INSIDE a [slug] segment on a per-org subdomain.
const SLUG_SCOPED_PREFIXES = ["/owner", "/sales", "/settings"];

function isSlugScopedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return SLUG_SCOPED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/* ───────────────── Security helpers ──────────────────────────────── */

/**
 * A tenant dashboard physically lives at /{slug}/owner|sales, so that
 * literal path is routable on any host unless we stop it. It may only
 * be served through the subdomain rewrite, on that tenant's own host.
 * Returns the redirect to the right host, or null if the path is fine.
 */
function tenantPathRedirect(url: URL, path: string, currentSlug: string) {
  const m = path.match(/^\/([^/]+)\/(owner|sales)(\/.*)?$/);
  if (!m) return null;
  const [, pathSlug, kind, rest = ""] = m;
  const lower = pathSlug.toLowerCase();
  if (RESERVED.has(lower) || lower === currentSlug) return null;
  const dest = new URL(url.toString());
  dest.hostname = `${lower}.${APEX}`;
  dest.pathname = `/${kind}${rest}`;
  return NextResponse.redirect(dest, 308);
}

// Classic "I'm a scanner, hi!" paths. Returning 410 Gone sheds load
// faster than letting Next.js route them and 404.
const PROBE_PATHS = [
  "/wp-login.php", "/wp-admin", "/xmlrpc.php",
  "/.env", "/.env.local", "/.git/config",
  "/phpmyadmin", "/mysqladmin", "/pma",
  "/vendor/phpunit",
  "/.aws/credentials",
  "/actuator/health",   // Spring probing
  "/HNAP1",
];

// Crawlers to allow on PUBLIC paths and block on private ones.
const SCRAPER_UA = /(bytespider|semrush|ahrefs|mj12bot|dotbot|seznam|petalbot|dataforseo)/i;

// Paths considered private — scrapers get a 403 even if they ignored
// robots.txt (which these ones always do).
const PRIVATE_PATHS = /^\/(login|signup|setup|auth|owner|sales|settings|visitors|team|analytics|admin|dashboard|client|tour|v|present|presenter|embed|upload|api)(\/|$)/;

// Hard cap on request body size we'll even LOOK at (10 MB). Larger
// uploads happen through signed URLs direct to Supabase Storage,
// not through our server.
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function getIp(req: NextRequest): string {
  const first = (v: string | null) => (v ? v.split(",")[0]!.trim() : "");
  // We run on Vercel, which sets these itself and overwrites anything the
  // client sent. cf-connecting-ip is deliberately NOT trusted: we are not
  // behind Cloudflare, so any visitor could forge it to dodge IP limits.
  return (
    first(req.headers.get("x-vercel-forwarded-for")) ||
    first(req.headers.get("x-real-ip")) ||
    first(req.headers.get("x-forwarded-for")) ||
    (req as unknown as { ip?: string }).ip ||
    "unknown"
  );
}

/* ───────────────── Middleware entry ──────────────────────────────── */

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  // ── 1. Known-probe short-circuit ────────────────────────────────
  if (PROBE_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return new NextResponse("Gone", { status: 410 });
  }

  // ── 2. Oversized bodies ─────────────────────────────────────────
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new NextResponse("Payload Too Large", { status: 413 });
  }

  // ── 3. Scraper block on private paths ───────────────────────────
  const ua = req.headers.get("user-agent") || "";
  if (SCRAPER_UA.test(ua) && PRIVATE_PATHS.test(path)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── 4. Capture client IP for downstream route handlers ──────────
  const ip = getIp(req);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-vpv-ip", ip);

  // ── 4b. Anonymous visitor id ────────────────────────────────────
  //
  // One random uuid per browser, in a first-party cookie, so a pamphlet
  // scan can be joined to the funnel step and the order that follow it.
  // It identifies a BROWSER, never a person: no name, no e-mail, nothing
  // taken from the device. Issued here rather than in the page so it
  // exists on the very first request — including the /q/<code> redirect,
  // which has to log a scan before any page has rendered.
  //
  // Handed to route handlers on a header (the x-vpv-ip trick again),
  // because a cookie set on the RESPONSE is not visible in the request
  // that created it.
  const existingVid = req.cookies.get(VISITOR_COOKIE)?.value;
  const vid = isUuid(existingVid) ? existingVid! : crypto.randomUUID();
  const freshVid = vid !== existingVid;
  requestHeaders.set(VISITOR_HEADER, vid);

  // ── 5. Host routing ─────────────────────────────────────────────
  //
  // The ONLY hosts that serve the product are:
  //     myvpv.com                (the site, login, pricing, policies …)
  //     <slug>.myvpv.com         (one customer's workspace)
  // Every other name that happens to reach this deployment is sent
  // to the apex: www, app, apply, login, any reserved word, anything
  // two levels deep, and the *.vercel.app address of the production
  // deployment. One front door, no look-alike doors.
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const toApex = (p: string) =>
    NextResponse.redirect(`https://${APEX}${p}${url.search}`, 308);

  // The *.vercel.app address of the production deployment is our own
  // operator side (owner login, /leads, /admin) — kept separate from the
  // customer-facing myvpv.com and left working. It just never serves
  // customer-facing content: policy/company pages go to myvpv.com and a
  // tenant dashboard goes to that tenant's own subdomain.
  // (Preview deployments and localhost are untouched.)
  if (host.endsWith(".vercel.app") && process.env.VERCEL_ENV === "production") {
    // The public front page belongs to myvpv.com; the operator side opens
    // on the sign-in screen.
    if (path === "/" || path === "") {
      return NextResponse.redirect(new URL("/login", req.url), 307);
    }
    if (
      PUBLIC_LEGAL_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ||
      path === "/apply" || path.startsWith("/apply/")
    ) {
      return toApex(path);
    }
    return tenantPathRedirect(url, path, "") ?? nextWithHeaders(requestHeaders, path, vid, freshVid);
  }

  const onMyVpv = host === APEX || host.endsWith(`.${APEX}`);
  // localhost / previews — no real subdomains, nothing to enforce.
  if (!onMyVpv) return nextWithHeaders(requestHeaders, path, vid, freshVid);

  const isApex = host === APEX;
  const sub = isApex ? "" : host.slice(0, -(APEX.length + 1));

  if (!isApex) {
    // Not a single-label tenant name → apex. (apply.myvpv.com keeps
    // working as a short link to the form.)
    if (sub.includes(".") || RESERVED.has(sub)) {
      return toApex(sub === "apply" && (path === "/" || path === "") ? "/apply" : path);
    }
    // Policy / company / login / admin pages exist on the apex only.
    if (APEX_ONLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      return toApex(path);
    }
  }
  const slug = sub; // "" on the apex

  // ── Domain-exclusivity guard (applies on EVERY host, apex included) ──
  // A tenant dashboard physically lives at /{slug}/owner|sales, so that
  // literal path is routable on any host unless we stop it here. It is
  // only ever served through the middleware rewrite below, on the
  // tenant's own subdomain.
  const leak = tenantPathRedirect(url, path, slug);
  if (leak) return leak;

  if (isApex) return nextWithHeaders(requestHeaders, path, vid, freshVid);

  // Canonicalise: subdomain + path-slug = strip the path-slug.
  if (path === `/${slug}` || path.startsWith(`/${slug}/`)) {
    url.pathname = path.slice(slug.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  // Rewrite slug-scoped bare paths into the internal [slug] route.
  if (isSlugScopedPath(path)) {
    let tail = path === "/" || path === "" ? "/owner" : path;
    // /settings pages physically live under /owner/settings/… in the app
    // tree, but customers see them at the bare /settings URL.
    if (tail === "/settings" || tail.startsWith("/settings/")) {
      tail = `/owner${tail}`;
    }
    url.pathname = `/${slug}${tail}`;
    return withVisitor(
      NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
      vid,
      freshVid
    );
  }

  return nextWithHeaders(requestHeaders, path, vid, freshVid);
}

/* ───────────────── Response-side headers ─────────────────────────── */

function isUuid(v: string | undefined): boolean {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/** Write the visitor cookie, but only when it was just minted. Re-setting
 *  it on every request would renew the expiry forever and add a Set-Cookie
 *  header to responses a CDN would otherwise be free to cache. */
function withVisitor(res: NextResponse, vid: string, fresh: boolean): NextResponse {
  if (!fresh) return res;
  res.cookies.set(VISITOR_COOKIE, vid, {
    maxAge: VISITOR_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true, // the browser never needs to read it; our server does
    secure: true,
  });
  return res;
}

function nextWithHeaders(requestHeaders: Headers, path: string, vid: string, freshVid: boolean) {
  const res = withVisitor(
    NextResponse.next({ request: { headers: requestHeaders } }),
    vid,
    freshVid
  );

  // No caching for auth / sensitive paths. If a shared proxy ever cached
  // one of these responses, the next unrelated visitor could see the
  // previous user's dashboard. Set these headers hard.
  if (
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/auth") ||
    path.startsWith("/setup") ||
    path.startsWith("/api") ||
    path.startsWith("/owner") ||
    path.startsWith("/sales") ||
    path.startsWith("/settings") ||
    path.startsWith("/admin") ||
    path.startsWith("/dashboard")
  ) {
    res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    res.headers.set("Pragma", "no-cache");
  }

  return res;
}

export const config = {
  // Default matcher: skip Next internals and static files (paths with
  // a dot — favicon.ico, robots.txt, images, fonts). That keeps
  // middleware off the hot path for assets, but it ALSO excludes
  // dotted probe paths (/.env, /wp-login.php) — so we add those
  // explicitly below. Everything else is covered by the broad pattern.
  matcher: [
    "/((?!_next/|.*\\..*).*)",
    // Dotted probe paths we want to catch + reject with 410.
    "/wp-login.php",
    "/xmlrpc.php",
    "/.env",
    "/.env.local",
    "/.env.production",
    "/.git/:path*",
    "/.aws/:path*",
    "/vendor/phpunit/:path*",
    "/actuator/:path*",
    "/HNAP1",
  ],
};
