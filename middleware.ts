import { NextResponse, type NextRequest } from "next/server";

/**
 * Subdomain routing for myvpv.com.
 *
 * Marketing site lives on the apex (myvpv.com). This Next.js app is
 * served on the wildcard `*.myvpv.com`, and every org gets its own
 * subdomain, e.g. `aryan.myvpv.com`.
 *
 * The app internally has `app/[slug]/owner/page.tsx` and
 * `app/[slug]/sales/page.tsx`. This middleware turns
 *
 *    aryan.myvpv.com/owner   →  internal route  /aryan/owner
 *    aryan.myvpv.com/sales   →  internal route  /aryan/sales
 *    aryan.myvpv.com/        →  internal route  /aryan/owner
 *
 * as a *rewrite* (URL bar stays clean). Every other path
 * (/tour/*, /v/*, /present/*, /embed/*, /login, /setup, /auth/*,
 * /admin, /team, /analytics/*, /upload, /presenter, /client) is
 * org-agnostic and passes through unchanged.
 *
 * A visit to a path that already has the slug embedded
 * (aryan.myvpv.com/aryan/owner) is 308-redirected to the canonical
 * bare form so links stay tidy.
 */

const APEX = "myvpv.com";

// Subdomains that must never be treated as an org slug. Requests to
// these pass through to the app as-is (or redirect, for `www`).
const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "cdn",
  "static",
  "assets",
  "mail",
  "email",
  "docs",
  "help",
  "support",
  "blog",
  "status",
  "login",
  "dashboard",
  "apply",
]);

// Paths that live INSIDE a [slug] segment when accessed via a
// per-org subdomain. Everything else is org-agnostic.
const SLUG_SCOPED_PREFIXES = ["/owner", "/sales"];

function isSlugScopedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return SLUG_SCOPED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const url = req.nextUrl.clone();

  // Local dev, Vercel preview deployments (*.vercel.app), or any host
  // that isn't under our production apex — leave everything alone so
  // path-based routing (`/aryan/owner`) still works there.
  if (!host.endsWith(APEX)) return NextResponse.next();
  if (host === APEX) return NextResponse.next(); // apex is marketing

  // "aryan.myvpv.com" -> "aryan"; "staging.aryan.myvpv.com" -> "aryan"
  const subPart = host.slice(0, -(APEX.length + 1));
  const slug = subPart.split(".").pop() ?? "";

  // www.myvpv.com is not the app — bounce to the marketing apex.
  // On apply.myvpv.com the site is the qualification form —
  // rewrite / to /apply so the visitor lands on the form immediately.
  // APPLY_HOST_REWRITE
  if (slug === "apply") {
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/apply";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  if (slug === "www") {
    return NextResponse.redirect(
      `https://${APEX}${url.pathname}${url.search}`,
      308
    );
  }

  // Reserved for future services — pass through untouched.
  if (RESERVED.has(slug)) return NextResponse.next();

  // Canonicalise: if someone lands on `aryan.myvpv.com/aryan/owner`,
  // 308 them to the bare `/owner` form so shared/bookmarked URLs
  // stabilise on one shape.
  if (
    url.pathname === `/${slug}` ||
    url.pathname.startsWith(`/${slug}/`)
  ) {
    const stripped = url.pathname.slice(slug.length + 1) || "/";
    url.pathname = stripped;
    return NextResponse.redirect(url, 308);
  }

  // Rewrite slug-scoped bare paths to the internal [slug] route.
  if (isSlugScopedPath(url.pathname)) {
    const tail =
      url.pathname === "/" || url.pathname === "" ? "/owner" : url.pathname;
    url.pathname = `/${slug}${tail}`;
    return NextResponse.rewrite(url);
  }

  // Everything else is org-agnostic — /tour/*, /v/*, /present/*,
  // /embed/*, /login, /signup, /setup, /auth/*, /admin, /team,
  // /analytics/*, /upload, /presenter, /client — pass through.
  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static files, and API routes. Anything with a
  // `.` in the last segment (favicon.ico, robots.txt, images) is
  // treated as static and passes through.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
