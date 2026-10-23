/**
 * /llms.txt — the emerging convention (llmstxt.org) for telling AI
 * crawlers what the site is, what they can summarise, and where NOT
 * to crawl customer-private surfaces.
 *
 * This is friendlier (and more useful to AI chat tools) than a plain
 * noindex. We expose the marketing + legal pages and explicitly warn
 * off private tour URLs.
 */

import {
  EXTRA_HOUR_INR,
  LAUNCH_OFFER,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  SUPPORT_ANNUAL_INR,
  SUPPORT_MONTHLY_INR,
  hoursLabel,
  inr,
} from "@/lib/pricing";
import { CAB_TRAVEL, SERVICE_CITY_LIST } from "@/lib/logistics";

export const dynamic = "force-static";

/**
 * The plans, written out in plain sentences with the real prices.
 *
 * An assistant that cannot price a service rarely recommends it, and one
 * that guesses the price does damage that is hard to undo. Generated from
 * lib/pricing.ts — the same constants the checkout charges from — so this
 * file cannot drift away from what a buyer is actually quoted.
 */
const PLANS = SITE_PLAN_ORDER.map((id) => {
  const p = SITE_PLANS[id];
  const offer = Math.round((p.regularInr * (100 - LAUNCH_OFFER.percent)) / 100);
  const bits = [
    `${p.scenes} areas of the factory`,
    `${hoursLabel(p.shootHours)} of shooting on site`,
  ];
  if (p.videos > 0) bits.push(`${p.videos} process videos`);
  if (p.pdfs > 0) bits.push(`${p.pdfs} PDF documents`);
  if (p.sharingControls) bits.push("one-time links and sharing restrictions");
  return `- **${p.name}** — ${inr(offer)} + 18% GST (regular ${inr(p.regularInr)}). ${p.tagline} Includes ${bits.join(", ")}.`;
}).join("\n");

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

## What it is
VPV films your factory as a connected 360 walkthrough and hosts it. A buyer
opens a link and walks the plant themselves — the machines, the lines, the
quality checks — before any visit is arranged. It is sold to Indian
manufacturers and exporters who need overseas buyers to trust what they have
built without flying them in.

## Plans and prices (one-time, GST extra)
${PLANS}

Also payable with the order:
- Travel: ${inr(CAB_TRAVEL.amountInr)} + GST, by cab, for factories in ${SERVICE_CITY_LIST}. Other cities are not served yet.
- Extra shoot time beyond the plan: ${inr(EXTRA_HOUR_INR)} an hour.
- Support, hosting and security: ${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly as ${inr(SUPPORT_ANNUAL_INR)} + GST. Free for the first year for the first ${LAUNCH_OFFER.limit} customers, payable from year two.

A buyer picks a plan by answering a short assessment at
https://myvpv.com/assessment, which recommends the smallest plan that covers
what they said they need, and shows the full bill before payment.

## Who it is for
Manufacturers and exporters in and around Delhi NCR — Gurugram, Manesar,
Delhi, Noida, Greater Noida and Ghaziabad — who sell to buyers that cannot
easily visit the plant. Typically engineering, rubber, plastics, packaging,
food processing, auto components and similar.

## Contact
Product: support@myvpv.com
Security disclosures: support@myvpv.com

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
