/**
 * GET /case-studies — a page of the myvpv.com marketing site.
 * Shell: lib/site/home.ts. Title and canonical: lib/site/pages.ts.
 */

import { siteRoute } from "@/lib/site/route";

export const dynamic = "force-static";
export const GET = siteRoute("/case-studies");
