/**
 * The route handler behind every page of the marketing site.
 *
 * The site's router owns a dozen paths on the client (lib/site/pages.ts).
 * Each one also needs a real route on the server, or typing the URL or
 * refreshing the page would 404. Rather than repeat the handler a dozen
 * times, each app/<path>/route.ts is three lines that call this.
 */

import { renderSiteHtml } from "@/lib/site/home";

export function siteRoute(path: string) {
  return function GET(): Response {
    return new Response(renderSiteHtml(path), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // The shell is tiny and its asset names are hashed; revalidating
        // every time means a new build is live the moment it deploys.
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  };
}
