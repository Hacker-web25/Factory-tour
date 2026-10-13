import { NextResponse, type NextRequest } from "next/server";

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

// Subdomains that must never be treated as an org slug.
const RESERVED = new Set([
  "www", "app", "api", "admin", "auth", "cdn", "static", "assets",
  "mail", "email", "docs", "help", "support", "blog", "status",
  "login", "dashboard", "apply",
]);

// Paths that live INSIDE a [slug] segment on a per-org subdomain.
const SLUG_SCOPED_PREFIXES = ["/owner", "/sales", "/settings"];

function isSlugScopedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return SLUG_SCOPED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/* ───────────────── Security helpers ──────────────────────────────── */

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
const PRIVATE_PATHS = /^\/(login|signup|setup|auth|owner|sales|settings|visitors|team|analytics|admin|client|tour|v|present|presenter|embed|upload|api)(\/|$)/;

// Hard cap on request body size we'll even LOOK at (10 MB). Larger
// uploads happen through signed URLs direct to Supabase Storage,
// not through our server.
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function getIp(req: NextRequest): string {
  const first = (v: string | null) => (v ? v.split(",")[0]!.trim() : "");
  return (
    first(req.headers.get("cf-connecting-ip")) ||
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

  // ── 5. Subdomain routing (unchanged behaviour) ──────────────────
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];

  // Local dev / Vercel previews — no apex, no rewriting.
  if (!host.endsWith(APEX)) {
    return nextWithHeaders(requestHeaders, path);
  }
  if (host === APEX) {
    return nextWithHeaders(requestHeaders, path); // apex = marketing
  }

  const subPart = host.slice(0, -(APEX.length + 1));
  const slug = subPart.split(".").pop() ?? "";

  // ── Domain-exclusivity guard ─────────────────────────────────────
  // A tenant's dashboard must only ever be reachable through THAT
  // tenant's own subdomain. The underlying pages physically live at
  // /{slug}/owner and /{slug}/sales (see the rewrite below), which
  // means that literal path is technically routable on ANY host —
  // app.myvpv.com, the bare apex, or even a different org's own
  // subdomain — if something ever links to it directly. That has
  // already happened once (an app-side redirect bug). This is the
  // backstop: no matter what application code does, the edge refuses
  // to RENDER a slug-scoped page on the wrong host. It redirects to
  // where that page actually belongs instead.
  const directSlugMatch = path.match(/^\/([^/]+)\/(owner|sales)(\/.*)?$/);
  if (directSlugMatch) {
    const [, pathSlug, kind, rest = ""] = directSlugMatch;
    const lowerPathSlug = pathSlug.toLowerCase();
    if (!RESERVED.has(lowerPathSlug) && lowerPathSlug !== slug) {
      const dest = url.clone();
      dest.hostname = `${lowerPathSlug}.${APEX}`;
      dest.pathname = `/${kind}${rest}`;
      return NextResponse.redirect(dest, 308);
    }
  }

  if (slug === "apply") {
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/apply";
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
    return nextWithHeaders(requestHeaders, path);
  }

  if (slug === "www") {
    return NextResponse.redirect(
      `https://${APEX}${url.pathname}${url.search}`,
      308
    );
  }

  if (RESERVED.has(slug)) return nextWithHeaders(requestHeaders, path);

  // Canonicalise: subdomain + path-slug = strip the path-slug.
  if (url.pathname === `/${slug}` || url.pathname.startsWith(`/${slug}/`)) {
    const stripped = url.pathname.slice(slug.length + 1) || "/";
    url.pathname = stripped;
    return NextResponse.redirect(url, 308);
  }

  // Rewrite slug-scoped bare paths into the internal [slug] route.
  if (isSlugScopedPath(url.pathname)) {
    let tail =
      url.pathname === "/" || url.pathname === "" ? "/owner" : url.pathname;
    // /settings pages physically live under /owner/settings/… in the app
    // tree, but customers see them at the bare /settings URL.
    if (tail === "/settings" || tail.startsWith("/settings/")) {
      tail = `/owner${tail}`;
    }
    url.pathname = `/${slug}${tail}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return nextWithHeaders(requestHeaders, path);
}

/* ───────────────── Response-side headers ─────────────────────────── */

function nextWithHeaders(requestHeaders: Headers, path: string) {
  const res = NextResponse.next({ request: { headers: requestHeaders } });

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
    path.startsWith("/admin")
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
