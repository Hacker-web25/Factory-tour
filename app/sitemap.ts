/**
 * /sitemap.xml — sitemap of the PUBLIC pages.
 *
 * Customer tours are private per-link, so they're deliberately excluded.
 * Policy and company pages come from the link registry, so a page added
 * to components/legal/nav.ts is listed here automatically.
 */

import type { MetadataRoute } from "next";
import { COMPANY_LINKS, POLICY_LINKS } from "@/components/legal/nav";

const SITE = "https://myvpv.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const legal: MetadataRoute.Sitemap = POLICY_LINKS.map((l) => ({
    url: `${SITE}${l.href}`,
    lastModified: now,
    changeFrequency: l.href === "/security" ? "monthly" : "yearly",
    priority: l.href === "/security" ? 0.5 : 0.3,
  }));
  const company: MetadataRoute.Sitemap = COMPANY_LINKS.map((l) => ({
    url: `${SITE}${l.href}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: l.href === "/pricing" ? 0.8 : 0.5,
  }));

  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/apply`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    ...company,
    { url: `${SITE}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...legal,
  ];
}
