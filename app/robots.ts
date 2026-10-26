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
 *
 * ── AI assistants ────────────────────────────────────────────────────
 * Buyers increasingly ask ChatGPT, Perplexity, Gemini or Claude for a
 * supplier instead of searching. Those tools can only recommend a company
 * whose pages their crawler was allowed to read, so the assistants are
 * named here explicitly and allowed over the same public pages as Google.
 * Being named matters: several of them look for their own user-agent and
 * do not inherit the "*" group.
 *
 * They get the public marketing pages and nothing else — the same private
 * paths stay blocked, and /llms.txt tells them what the product is.
 */

import type { MetadataRoute } from "next";

/** The marketing surface. Anything not listed here is private by default. */
const PUBLIC_PATHS = [
  "/",
  "/apply",
  // the marketing site (lib/site/pages.ts)
  "/how-it-works",
  "/plans",
  "/case-studies",
  "/why-vpv",
  "/faq",
  "/assessment",
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
  "/llms.txt",
];

/** Per-customer surfaces, auth, and machinery. Never crawled, on any host. */
const PRIVATE_PATHS = [
  "/api/",
  "/checkout",
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
  "/dashboard",
  "/upload",
  "/embed/",
  "/owner",
  "/sales",
  "/settings",
  // Campaign redirects. Real people reach these by scanning a printed QR
  // code; there is no content to index, and letting them into the index
  // would scatter duplicate entry points across the search results.
  "/q/",
];

/**
 * Crawlers behind the AI assistants people ask for supplier recommendations.
 * Split in two only for the comment: both groups get the same access.
 *   …Bot        builds the model's knowledge / search index
 *   …User       fetches a page because someone asked about it right now
 */
const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google (Gemini + AI Overviews grounding)
  "Google-Extended",
  // Microsoft Copilot rides on Bingbot, which the "*" group already covers.
  "Applebot-Extended",
  "meta-externalagent",
  "cohere-ai",
];

/**
 * SEO scrapers that resell our content as "competitor intelligence" and
 * cost bandwidth without ever sending a buyer. Middleware already 403s
 * them on private paths; this asks them to stay out altogether.
 */
const UNWANTED_SCRAPERS = [
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "Bytespider",
  "PetalBot",
  "DataForSeoBot",
  "SeznamBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: UNWANTED_SCRAPERS,
        disallow: ["/"],
      },
    ],
    sitemap: "https://myvpv.com/sitemap.xml",
    host: "https://myvpv.com",
  };
}
