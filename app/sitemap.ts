/**
 * /sitemap.xml — minimal sitemap of the PUBLIC pages.
 *
 * Customer tours are private per-link, so they're deliberately excluded.
 * The marketing surface lives on myvpv.com (not in this repo); this
 * sitemap covers the few public app routes a human might want crawled.
 */

import type { MetadataRoute } from "next";

const SITE = "https://myvpv.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`,         lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/apply`,    lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/privacy`,  lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,    lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
