/**
 * /sitemap.xml — sitemap of the PUBLIC pages.
 *
 * Customer tours are private per-link, so they're deliberately excluded.
 * Policy and company pages come from the link registry, and the pages of
 * the marketing site come from lib/site/pages.ts, so a page added in
 * either place is listed here automatically.
 *
 * The assessment steps, /booking and /order-confirmation are left out:
 * they are marked indexable: false because each one needs the answers
 * from the step before it, so a visitor arriving straight from a search
 * result would land on an empty form.
 */

import type { MetadataRoute } from "next";
import { COMPANY_LINKS, POLICY_LINKS } from "@/components/legal/nav";
import { SITE_PAGES } from "@/lib/site/pages";

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

  const site: MetadataRoute.Sitemap = SITE_PAGES.filter((p) => p.indexable).map(
    (p) => ({
      url: `${SITE}${p.path === "/" ? "/" : p.path}`,
      lastModified: now,
      changeFrequency: p.path === "/" ? "weekly" : "monthly",
      priority: p.priority ?? 0.5,
    })
  );

  return [
    ...site,
    { url: `${SITE}/apply`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    ...company,
    { url: `${SITE}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...legal,
  ];
}
