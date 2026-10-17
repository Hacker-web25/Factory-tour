/**
 * GET / — the front page of myvpv.com (the marketing site).
 * See lib/site/home.ts for the shell and lib/site/pages.ts for the list
 * of pages. The owner dashboard lives at /dashboard.
 */

import { siteRoute } from "@/lib/site/route";

export const dynamic = "force-static";
export const GET = siteRoute("/");
