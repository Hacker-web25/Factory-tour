/**
 * lib/site/bundleData.ts — the plan, offer and travel data the marketing
 * single-page app is built around, GENERATED from lib/pricing.ts.
 *
 * The site in /public/static is a pre-built bundle with no source in this
 * repo. Every price, AOA count and inclusion it shows — the plan cards,
 * the comparison table, the FAQ answers — reads from three small objects
 * inside it. Rather than hand-edit minified JavaScript, those objects are
 * regenerated from the same constants the checkout charges from, and
 * written into the bundle by scripts/sync-site-bundle.ts.
 *
 * tests/billing/13-site-bundle.test.ts fails if the deployed bundle ever
 * disagrees with what this file generates, so a price changed in
 * lib/pricing.ts without re-running the sync cannot reach the public site.
 */

import {
  EXTRA_HOUR_INR,
  LAUNCH_OFFER,
  SALES_TEAM,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  TRAVEL_FEES,
  discountBands,
  hoursLabel,
  inr,
} from "@/lib/pricing";
import { LOGISTICS_TIERS } from "@/lib/logistics";

const js = (v: unknown) => JSON.stringify(v);

const SHARING = [
  "One-time link expiry",
  "Restrictions designed to prevent VPV links being shared with competitors",
];
const BASE_SECURITY = ["Password-protected dashboard", "Custom domain", "Customer branding"];

function inclusions(id: (typeof SITE_PLAN_ORDER)[number]): string[] {
  const p = SITE_PLANS[id];
  const out = [`${p.scenes} AOAs`, `${hoursLabel(p.shootHours)} of shoot time`, "Information icons"];
  if (p.videos > 0) out.push(`${p.videos} process videos`);
  if (p.pdfs > 0) out.push(`${p.pdfs} PDF reports`);
  if (p.sharingControls) out.push(...SHARING);
  out.push(...BASE_SECURITY);
  return out;
}

/** `ln={…},sn=[…]` — the offer and the three plans, as the bundle names them. */
export function bundlePlanData(): string {
  const ln =
    `ln={active:${LAUNCH_OFFER.active},percent:${LAUNCH_OFFER.percent},` +
    `label:${js(`${LAUNCH_OFFER.short} (${LAUNCH_OFFER.percent}% off)`)},` +
    `banner:${js(`${LAUNCH_OFFER.short}: ${LAUNCH_OFFER.percent}% off for our first ${LAUNCH_OFFER.limit} customers.`)}}`;
  const plans = SITE_PLAN_ORDER.map((id) => {
    const p = SITE_PLANS[id];
    return (
      `{id:${js(id)},name:${js(p.name)},tagline:${js(p.tagline)},price:${p.regularInr},placeholder:false,` +
      `limits:{aoas:${p.scenes},videos:${p.videos},pdfs:${p.pdfs},infoIcons:true,sharingControls:${p.sharingControls}},` +
      `infoIconsLabel:"Information icons",inclusions:${js(inclusions(id))},` +
      `security:${js(p.sharingControls ? [...SHARING, ...BASE_SECURITY] : BASE_SECURITY)}}`
    );
  });
  return `${ln},sn=[${plans.join(",")}]`;
}

/** `un={…}` — the travel object. Kept in its old two-zone shape because the
 *  bundle's code expects it; the amounts are the real tier 1 and tier 4. */
export function bundleTravelData(): string {
  return (
    `un={question:"Where is your factory?",label:"Travel & logistics",gstApplies:true,payableNow:true,` +
    `options:{ncr:{label:"Delhi NCR",amount:${TRAVEL_FEES.ncr.amountInr}},` +
    `outside:{label:"Outside Delhi NCR",amount:${TRAVEL_FEES.outside.amountInr}}}}`
  );
}

/**
 * Hard-coded sentences in the bundle that quote numbers the data objects do
 * not drive. Each is an exact [old, new] pair; the sync applies a pair only
 * while `old` is still present, so running it twice changes nothing.
 */
export function bundleTextPatches(): [string, string][] {
  const conf = SITE_PLANS.confidence;
  const ctrl = SITE_PLANS.control;
  const ctrlBands = discountBands("control");
  const tierAmounts = Object.values(LOGISTICS_TIERS).map((t) => t.amountInr);
  const travelFrom = inr(Math.min(...tierAmounts));
  const travelTo = inr(Math.max(...tierAmounts));
  return [
    [
      "Travel & logistics (${mn(un.options.ncr.amount)} for Delhi NCR or ${mn(un.options.outside.amount)} outside Delhi NCR, + GST) is paid with your order.",
      `Travel & logistics depends on your factory's city, from ${travelFrom} to ${travelTo} + GST, and is shown before you pay. For cities we fly to, you book the crew's flights. Shoot time beyond what your plan includes is ${inr(EXTRA_HOUR_INR)} an hour.`,
    ],
    ['q:"What if I need more than 20 AOAs?"', 'q:"What if I need more areas than my plan includes?"'],
    [
      "Our current plans cover up to ${Lr.limits.aoas} AOAs. If you need more, the assessment keeps all your selections and gives you a direct route to our team so we can plan it together.",
      `Every plan lets you add extra areas, and each one costs less than the last. On ${ctrl.name}, extra areas start at ${inr(ctrlBands[0].each)} and fall to ${inr(ctrlBands[ctrlBands.length - 1].each)}. You see the price of every extra area, and the total, before you pay.`,
    ],
    [
      "${Mr.name} includes unlimited information icons and ${Lr.name} includes information icons. ${Ir.name} does not include them.",
      "Every plan includes them.",
    ],
    [
      '(for example, "You selected 8 areas; ${Ir.name} includes 5")',
      `(for example, "You selected 8 areas; \${Ir.name} includes ${conf.scenes}")`,
    ],
    ['Up to ${e.limits.aoas} AOAs.`', '${e.limits.aoas} AOAs included, and more can be added.`'],
    // The plans page's travel line, rendered from the old two-zone object.
    [
      'mn(un.options.ncr.amount)," for Delhi NCR, ",mn(un.options.outside.amount)," outside Delhi NCR, + GST."',
      JSON.stringify(
        `depends on your factory's city: from ${travelFrom} to ${travelTo} + GST, shown before you pay. For cities we fly to, you book the crew's flights.`
      ),
    ],
    // The introductory-offer block and its FAQ, written for a 100-customer
    // offer; the count now comes from LAUNCH_OFFER.limit.
    [
      '"A Special Introductory Offer for Our First 100 Customers."',
      JSON.stringify(`A Special Introductory Offer for Our First ${LAUNCH_OFFER.limit} Customers.`),
    ],
    ["Be among the first 100 customers to experience", `Be among the first ${LAUNCH_OFFER.limit} customers to experience`],
    ['"Available to the first 100 verified paid orders."', JSON.stringify(`Available to the first ${LAUNCH_OFFER.limit} verified paid orders.`)],
    ['q:"What is the first 100 customers offer?"', `q:${JSON.stringify(`What is the first ${LAUNCH_OFFER.limit} customers offer?`)}`],
    [
      "The ${ln.percent}% applies to the plan price only; travel & logistics and ${cn.name} are not discounted.",
      `The \${ln.percent}% applies to the plan price, and Sales Team logins are ${SALES_TEAM.percentOff}% off. Extra areas, videos, shoot time, travel & logistics and \${cn.name} are not discounted.`,
    ],
    // "No per-salesperson fee" stopped being true when Sales Team logins
    // arrived; and the prices are no longer placeholders.
    ['"No per-salesperson fee to use it"', '"Every salesperson can present it"'],
    [
      "Your whole sales team can use the VPV, with no per-salesperson fee. Plan prices shown are placeholders, to be confirmed.",
      `Your whole sales team can present the VPV. Sales Team logins, which give you a dashboard of every meeting they hold, are an optional one-time add-on: ${inr(SALES_TEAM.offerInr)} per salesperson for our first ${LAUNCH_OFFER.limit} customers, ${inr(SALES_TEAM.regularInr)} after that.`,
    ],
    [
      '"The whole sales team can use your VPV. There is no per-salesperson fee. Multiple factories are quoted separately based on scope."',
      JSON.stringify(
        `Your whole sales team can present your VPV. Optional Sales Team logins (${inr(SALES_TEAM.offerInr)} per salesperson, one time, for our first ${LAUNCH_OFFER.limit} customers) show you every meeting they hold. Multiple factories are quoted separately based on scope.`
      ),
    ],
    // Digital Care: the first year is free (SUPPORT_FREE_MONTHS), so it is
    // billed from year two — not from go-live, as the old site said.
    [
      'billingStart:"go_live",billingStartLabels:{go_live:"Billed annually, starting from go-live",year_2:"Billed annually, starting from year 2"}',
      'billingStart:"year_2",billingStartLabels:{go_live:"Billed annually, starting from go-live",year_2:"Your first year is free; billed annually from year 2"}',
    ],
  ];
}
