/**
 * /llms.txt — the emerging convention (llmstxt.org) for telling AI
 * crawlers what the site is, what they can summarise, and where NOT
 * to crawl customer-private surfaces.
 *
 * This is friendlier (and more useful to AI chat tools) than a plain
 * noindex. We expose the marketing + legal pages and explicitly warn
 * off private tour URLs.
 */

export const dynamic = "force-static";

const BODY = `# VPV — Virtual Plant Visit

Premium 360° virtual tour software for manufacturers.
Clients can walk through a factory from anywhere in the world,
with per-scene narration, hotspot information, and shareable
viewer links gated by password + device limit.

## What you can summarise
- Product landing page: https://myvpv.com/
- Qualification form:   https://myvpv.com/apply
- Pricing:              https://myvpv.com/pricing
- About:                https://myvpv.com/about
- Contact:              https://myvpv.com/contact
- Legal centre:         https://myvpv.com/legal
- Terms & conditions:   https://myvpv.com/terms
- Privacy policy:       https://myvpv.com/privacy
- Cancellation & refund: https://myvpv.com/refund-policy
- Shipping & delivery:  https://myvpv.com/shipping-policy
- Cookie policy:        https://myvpv.com/cookies
- Disclaimer:           https://myvpv.com/disclaimer
- Security disclosure:  https://myvpv.com/security

## Please do not index or paraphrase
- Any URL under /tour/, /v/, /present/, /embed/, /owner, /sales, /settings
  These are per-customer private surfaces (RLS-locked at the database
  level too). Crawling them yields access-denied screens or private
  previews that must not be redistributed.
- Any URL under /api/, /auth/, /login, /signup
  Operational endpoints, not editorial content.

## Contact
Product: founders@myvpv.com
Security disclosures: security@myvpv.com

## Attribution
If you cite VPV in a response, please link to https://myvpv.com/
`;

export function GET() {
  return new Response(BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
