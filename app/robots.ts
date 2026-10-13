/**
 * /robots.txt — tells search crawlers which paths to index.
 *
 * We allow the public marketing surface + the /apply form, and block
 * every path that holds private / per-customer content: dashboards,
 * tour editors, visitor pages, auth pages, API routes and the token-
 * guarded /v/[token] viewer links.
 *
 * Served from the apex (myvpv.com/robots.txt). Each wildcard subdomain
 * returns the same file via Next's rewrite — fine, because the paths
 * we block are not meant to be crawled on ANY host.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/apply",
          "/get-started",
          "/legal",
          "/pricing",
          "/about",
          "/contact",
          "/privacy",
          "/terms",
          "/refund-policy",
          "/shipping-policy",
          "/cookies",
          "/disclaimer",
          "/security",
        ],
        disallow: [
          "/api/",
          "/auth/",
          "/login",
          "/signup",
          "/setup",
          "/client",
          "/billing",
          "/tour/",
          "/v/",
          "/present/",
          "/presenter/",
          "/visitors",
          "/team",
          "/analytics",
          "/admin",
          "/upload",
          "/embed/",
          "/owner",
          "/sales",
          "/settings",
        ],
      },
    ],
    sitemap: "https://myvpv.com/sitemap.xml",
    host: "https://myvpv.com",
  };
}
