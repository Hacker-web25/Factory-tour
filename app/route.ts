/**
 * GET / — the front page of myvpv.com (the original VPV marketing site).
 * See lib/site/home.ts. The owner dashboard now lives at /dashboard.
 */

import { renderHomeHtml } from "@/lib/site/home";

export const dynamic = "force-static";

export function GET() {
  return new Response(renderHomeHtml(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
