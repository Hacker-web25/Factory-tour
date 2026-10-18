/**
 * Every page of the myvpv.com marketing site.
 *
 * The site is a pre-built single-page app (JS + CSS in /public/static,
 * images in /public/img and /public/assets). Its router owns these paths
 * on the client; this list is what lets the SERVER own them too, so a
 * visitor who types /plans or refreshes on /faq gets the page instead of
 * a 404.
 *
 * One list, three readers:
 *   • app/<path>/route.ts  — serves the HTML shell for that path
 *   • lib/site/home.ts     — the per-page <title>, description, canonical
 *   • app/sitemap.ts       — the indexable pages
 *
 * Adding a page to the site means adding it here AND adding the matching
 * app/<path>/route.ts (three lines). Both are needed: the route file is
 * what Next.js actually mounts.
 *
 * NOT listed on purpose: the app's own /download page, which explains how
 * to upload the build to a cPanel host. That is a note to ourselves, not
 * a page for customers, so it is left unroutable on the server.
 */

import { SITE_PATHS as DECLARED_PATHS } from "@/lib/site/paths";

export type SitePage = {
  /** URL path, exactly as the single-page app's router knows it. */
  path: string;
  title: string;
  description: string;
  /**
   * Funnel steps and post-order pages are deliberately noindex and stay
   * out of the sitemap: they only make sense once the visitor carries
   * state from an earlier step, so a search result landing on one is a
   * dead end.
   */
  indexable: boolean;
  /** Sitemap priority. Only read when indexable. */
  priority?: number;
};

export const SITE_PAGES: SitePage[] = [
  {
    path: "/",
    title: "MyVPV.com | Find the Right VPV for Your Factory",
    description:
      "Let buyers explore your real factory online, before a physical visit. Answer a few questions about your plant and your processes to see the VPV plan and price that fit.",
    indexable: true,
    priority: 1.0,
  },
  {
    path: "/how-it-works",
    title: "How it works | MyVPV.com",
    description:
      "From first click to a live VPV, without stopping your factory. One short meeting with your MD and sales team, one efficient factory shoot, and your plant keeps running as usual.",
    indexable: true,
    priority: 0.8,
  },
  {
    path: "/plans",
    title: "VPV plans and pricing | MyVPV.com",
    description:
      "Three VPV plans, one clear price. Compare the areas, videos, PDFs and sharing controls in each plan. All prices exclude 18% GST.",
    indexable: true,
    priority: 0.9,
  },
  {
    path: "/case-studies",
    title: "Case studies | MyVPV.com",
    description:
      "Real manufacturers, real conversations. How Indian factories use a Virtual Plant Visit to move buyers to the next stage.",
    indexable: true,
    priority: 0.6,
  },
  {
    path: "/faq",
    title: "Questions, answered | MyVPV.com",
    description:
      "Quick answers to the questions buyers and manufacturers usually ask about a Virtual Plant Visit: what you get, how the shoot works, access control, payment and annual maintenance.",
    indexable: true,
    priority: 0.6,
  },

  {
    path: "/booking",
    title: "Book your shoot | MyVPV.com",
    description:
      "Tell us when suits you for the factory shoot. This is a request; we confirm the date with you.",
    indexable: false,
  },
  {
    path: "/order-confirmation",
    title: "Order confirmation | MyVPV.com",
    description: "Your VPV order is confirmed.",
    indexable: false,
  },
];

/** Every path the site owns, for the middleware's apex-only check. */
export const SITE_PATHS: string[] = SITE_PAGES.map((p) => p.path);

/**
 * next.config.js cannot read this file (it is TypeScript, and
 * next.config.js is loaded before anything here is compiled), so the
 * path list is duplicated in lib/site/paths.js for it. Check the two
 * agree. A mismatch means a page would be served without the CSP that
 * lets it frame the Kuula demo, or an unused rule would linger — both
 * silent in production, so fail the build instead.
 */
{
  const declared = [...DECLARED_PATHS].sort();
  const actual = [...SITE_PATHS].sort();
  if (declared.join("\n") !== actual.join("\n")) {
    const missing = actual.filter((p) => !declared.includes(p));
    const extra = declared.filter((p) => !actual.includes(p));
    throw new Error(
      "lib/site/paths.js is out of step with lib/site/pages.ts." +
        (missing.length ? ` Missing from paths.js: ${missing.join(", ")}.` : "") +
        (extra.length ? ` Not a page: ${extra.join(", ")}.` : "")
    );
  }
}

const BY_PATH = new Map(SITE_PAGES.map((p) => [p.path, p]));

/**
 * The page record for a path. Throws rather than falling back, so a
 * route file that names a path missing from this list fails the build
 * instead of silently serving the wrong <title> and canonical.
 */
export function sitePage(path: string): SitePage {
  const page = BY_PATH.get(path);
  if (!page) {
    throw new Error(
      `lib/site/pages.ts has no entry for "${path}" \u2014 add it there as well as app${path}/route.ts`
    );
  }
  return page;
}
