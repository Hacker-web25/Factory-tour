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
  ENTERPRISE_PERSONAL,
  SUPPORT_ANNUAL_INR,
  SUPPORT_INCLUDES,
  SUPPORT_MONTHLY_INR,
  SUPPORT_NAME,
  TRAVEL_FEES,
  LINK_CONTROLS,
  discountBands,
  infoIconsLabel,
  planPrice,
  linkControlLabels,
  inr,
  supportWorthLabel,
} from "@/lib/pricing";
import { CAB_TRAVEL, SERVICE_CITY_LIST } from "@/lib/logistics";

const js = (v: unknown) => JSON.stringify(v);

/**
 * The wording the bundle carried before 26 Oct 2026 (₹4,000 cab, one-time
 * ₹999 Sales Team logins), paired with the index of the patch in
 * bundleTextPatches() whose current text replaces it.
 */
const OCT26_MIGRATIONS: [string, number][] = [
  ["Cab travel for our crew is ₹4,000 + GST, for factories in Gurugram, Manesar, Delhi, Noida, Greater Noida and Ghaziabad. We are coming to more cities soon. Shoot time beyond what your plan includes is ₹999 an hour.", 0],
  ["\"is ₹4,000 + GST, by cab, for factories in Gurugram, Manesar, Delhi, Noida, Greater Noida and Ghaziabad. We are coming to more cities soon.\"", 2],
  ["The ${ln.percent}% applies to the plan price, Sales Team logins are 50% off, and the first year of support, hosting & security is free. Extra areas, process videos, shoot time and cab travel are not discounted.", 13],
  ["Your whole sales team can present the VPV. Sales Team logins, which give you a dashboard of every meeting they hold, are an optional one-time add-on: ₹999 per salesperson for our first 50 customers, ₹1,998 after that.", 16],
  ["\"Your whole sales team can present your VPV. Optional Sales Team logins (₹999 per salesperson, one time, for our first 50 customers) show you every meeting they hold. Multiple factories are quoted separately based on scope.\"", 17],
];

const BASE_SECURITY = ["Password-protected dashboard", "Custom domain", "Customer branding"];

/**
 * The feature list for one plan card.
 *
 * Since 17 Nov 2026 every card lists the SAME rows in the SAME order, so a
 * feature sits on the same line across all the cards (the plans page lines
 * the rows up with CSS subgrid, see PLAN_ROWS in lib/site/home.ts). Since
 * 20 Nov 2026 the factory size and the AOAs are not rows: they are the big
 * figures at the top of the card.
 *
 *   what every plan has  information icons (10 on Lite, 20 on Plus,
 *                        unlimited after), dashboard, custom domain (with a
 *                        "?" showing example.myvpv.com), branding
 *   then the extras      process videos, lab reports, the four link
 *                        controls (LINK_CONTROLS), and the two Mr. Gupta
 *                        lines last
 *
 * (20 Nov 2026, second round: shoot time left the cards; it is still in the
 * quote, the Terms and llms.txt.)
 *
 * A row the plan does not include starts with "!": the card draws it grey
 * with a cross (and "not included" for screen readers). The comparison table
 * still finds included rows by their exact text.
 */
function inclusions(id: (typeof SITE_PLAN_ORDER)[number]): string[] {
  const p = SITE_PLANS[id];
  const ent = p.personal;
  const rows: [boolean, string][] = [
    [true, infoIconsLabel(id)],
    ...BASE_SECURITY.map((r): [boolean, string] => [true, r]),
    [p.videos > 0, p.videos > 0 ? `${p.videos} process videos` : "Process videos"],
    [p.pdfs > 0, p.pdfs > 0 ? `${p.pdfs} lab reports & certifications` : "Lab reports & certifications"],
    ...LINK_CONTROLS.map((c): [boolean, string] => [p.linkControls[c.key], c.label]),
    [ent, ENTERPRISE_PERSONAL.discussion.short],
    [ent, ENTERPRISE_PERSONAL.shoot.short],
  ];
  return rows.map(([has, text]) => (has ? text : `!${text}`));
}

/** How many rows every plan card has (they all have the same number). */
export const PLAN_ROWS = inclusions("light").length;

/**
 * `ln={…},sn=[…]` — the offer and the plans on sale, as the bundle names them.
 *
 * Since 21 Nov 2026 the plans are billed yearly and shown PER MONTH, so the
 * bundle's `price` is the regular price per month: its own offer maths
 * (ga = price − 50%) then gives the offer price per month, the big figure on
 * the card. `billed` is what one year costs today (offer or regular), the
 * "Billed yearly" line under it. `lifeWas` / `lifeNow` are the same plan
 * bought once, for life (regular, and today's price): the "Lifetime" side of
 * the toggle above the cards. `gold` marks White Glove (Mr. Gupta's own
 * plan). There is no factory area any more.
 */
export function bundlePlanData(): string {
  const ln =
    `ln={active:${LAUNCH_OFFER.active},percent:${LAUNCH_OFFER.percent},` +
    `label:${js(`${LAUNCH_OFFER.short} (${LAUNCH_OFFER.percent}% off)`)},` +
    `banner:${js(`${LAUNCH_OFFER.short}: ${LAUNCH_OFFER.percent}% off for our first ${LAUNCH_OFFER.limit} customers.`)}}`;
  const plans = SITE_PLAN_ORDER.map((id) => {
    const p = SITE_PLANS[id];
    return (
      `{id:${js(id)},name:${js(p.name)},tagline:${js(p.tagline)},gold:${p.personal},price:${p.regularMonthlyInr},billed:${planPrice(id)},period:"month",` +
      `lifeWas:${p.regularLifetimeInr},lifeNow:${planPrice(id, LAUNCH_OFFER.active, "lifetime")},placeholder:false,` +
      `limits:{aoas:${p.scenes},videos:${p.videos},pdfs:${p.pdfs},infoIcons:true,sharingControls:${p.sharingControls}},` +
      `infoIconsLabel:"Information icons",inclusions:${js(inclusions(id))},` +
      `security:${js([...linkControlLabels(id), ...BASE_SECURITY])}}`
    );
  });
  return `${ln},sn=[${plans.join(",")}]`;
}

/** `un={…}` — the travel object. Kept in its old two-zone shape because the
 *  bundle's code expects it; the amounts are the real tier 1 and tier 4. */
export function bundleTravelData(): string {
  // Free for our first 50 customers (the bundle cannot count buyers, so it
  // follows LAUNCH_OFFER.active, exactly as it does for the plan prices).
  const free = LAUNCH_OFFER.active;
  const label = free ? `Travel (free for our first ${LAUNCH_OFFER.foundingLimit} customers)` : "Travel & logistics";
  return (
    `un={question:"Where is your factory?",label:${js(label)},gstApplies:true,payableNow:true,` +
    `options:{ncr:{label:"Delhi NCR",amount:${free ? 0 : TRAVEL_FEES.ncr.amountInr}},` +
    `outside:{label:"Outside Delhi NCR",amount:${free ? 0 : TRAVEL_FEES.outside.amountInr}}}}`
  );
}

/** `cn={…}` — the yearly support, hosting & security fee, as the bundle
 *  names it (it used to be "Digital Care"). */
export function bundleCareData(): string {
  return (
    `cn={name:${js(SUPPORT_NAME)},amount:${SUPPORT_ANNUAL_INR},period:"year",mandatory:!0,gstApplies:!0,payableNow:!1,` +
    `includes:${js(SUPPORT_INCLUDES.map((i) => i.title.toLowerCase()))},billingStart:"year_2",` +
    `billingStartLabels:{go_live:"Billed annually, starting from go-live",` +
    `year_2:${js(
      LAUNCH_OFFER.active
        ? `${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly, on every plan, yearly or lifetime. Free for the first ${LAUNCH_OFFER.freeMonths + 12} months for our first ${LAUNCH_OFFER.foundingLimit} customers`
        : `${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly, on every plan, yearly or lifetime`
    )}}}`
  );
}

/** Travel, in one sentence, for the bundle's hard-coded copy. */
function travelSentence(): string {
  return `Cab travel for our crew is ${travelPrice()}, for factories in ${SERVICE_CITY_LIST}. We are coming to more cities soon.`;
}

/** "free for our first 50 customers (normally ₹4,000 + GST)", or "₹4,000 + GST" once the offer ends. */
function travelPrice(): string {
  return LAUNCH_OFFER.active
    ? `free for our first ${LAUNCH_OFFER.foundingLimit} customers (normally ${inr(CAB_TRAVEL.amountInr)} + GST)`
    : `${inr(CAB_TRAVEL.amountInr)} + GST`;
}

/** What the special offer gives, in one sentence, for the bundle's FAQ. */
function offerSentence(): string {
  return (
    `Our first ${LAUNCH_OFFER.limit} customers get \${ln.percent}% off their plan, yearly (kept every year they renew) or lifetime, and Sales Team logins at ${inr(SALES_TEAM.offerInr)} per salesperson per year instead of ${inr(SALES_TEAM.regularInr)}. ` +
    `Our first ${LAUNCH_OFFER.foundingLimit} customers also get ${LAUNCH_OFFER.freeMonths} months free, free cab travel for the shoot, and their first ${LAUNCH_OFFER.freeMonths + 12} months of support, hosting & security free. ` +
    `Places are counted in the order payments reach us. Extra areas, process videos and shoot time are not discounted.`
  );
}
/** offerSentence() as it read before the yearly plans (21 Nov 2026). */
const OFFER_SENTENCE_NOV20 =
  "The ${ln.percent}% applies to the plan price, Sales Team logins are ₹199 per salesperson per year instead of ₹999, and cab travel and the first year of support, hosting & security are free. Extra areas, process videos and shoot time are not discounted.";

/** The Sales Team add-on, in one sentence. */
function salesSentence(): string {
  return `Sales Team logins, which give you a dashboard of every meeting they hold, are an optional yearly add-on: ${inr(SALES_TEAM.offerInr)} per salesperson per year for our first ${LAUNCH_OFFER.limit} customers, ${inr(SALES_TEAM.regularInr)} after that.`;
}

/**
 * Hard-coded sentences in the bundle that quote numbers the data objects do
 * not drive. Each is an exact [old, new] pair; the sync applies a pair only
 * while `old` is still present, so running it twice changes nothing.
 */
/** The plans page's call to action under the four cards, with its nudge. */
const PLANS_CTA =
  '(0,Dt.jsxs)("div",{className:"vpv-plans-nudge","data-testid":"plans-cta-top",children:[(0,Dt.jsx)("p",{className:"vpv-pn-title",children:"Not sure which plan is right for your factory?"}),(0,Dt.jsxs)("p",{className:"vpv-pn-text",children:["Tell us what you produce and what your buyers need to see. We\\u2019ll match you to the VPV that covers ",(0,Dt.jsx)("b",{children:"everything you need, and nothing you don\\u2019t"}),"."]}),(0,Dt.jsx)("div",{className:"mt-5 flex flex-col gap-3 sm:flex-row",children:(0,Dt.jsx)(At,{to:"/assessment",className:"btn-primary","data-testid":"plans-find-vpv-btn",children:"Find the Right VPV for Your Factory"})})]}),';

/**
 * 20 Nov 2026: what the earlier patches wrote that no longer fits seven
 * plans. Applied to the TEXT those patches put in, see the end of
 * bundleTextPatches().
 */
const NOV20_REWORDING: [string, string][] = [
  ['"Four VPV plans. One clear investment."', '"One-time investment, lifetime trust."'],
  ['title:"Confidence, Authority, Control or Enterprise"', 'title:"Seven plans, sized to your factory"'],
  ['q:"What is the difference between Confidence, Authority, Control and Enterprise?"', 'q:"What is the difference between the plans?"'],
  ["${Dr(Ir)} ${Dr(Mr)} ${Dr(Lr)} ${Dr(sn[3])} See the plans page", '${sn.map(Dr).join(" ")} See the plans page'],
  // Mr. Gupta's tagline is no longer drawn on the card (see NOV20_CARD).
  ['className:"mt-1 text-sm text-slate-600"+("enterprise"===t.id?" vpv-gold-tag":""),children:t.tagline}', 'className:"vpv-pc-tag",children:t.tagline}'],
];

/** Sentences that quote a plan's figures, as the last sync wrote them (the
 *  four plans of 17 Nov 2026), paired with what they say now. */
function NOV20_FIGURES(): [string, string][] {
  const ultra = SITE_PLANS.ultra;
  const bands = discountBands("ultra");
  return [
    [
      "Every plan lets you add extra areas, and each one costs less than the last. On VPV Control, extra areas start at ₹4,500 and fall to ₹3,400. You see the price of every extra area, and the total, before you pay.",
      `Every plan lets you add extra areas, and each one costs less than the last. On ${ultra.name}, extra areas start at ${inr(bands[0].each)} and fall to ${inr(bands[bands.length - 1].each)}. You see the price of every extra area, and the total, before you pay.`,
    ],
    ['(for example, "You selected 8 areas; ${Ir.name} includes 4")', `(for example, "You selected 8 areas; \${Ir.name} includes ${SITE_PLANS.light.scenes}")`],
  ];
}

/**
 * 20 Nov 2026: the plan card leads with the factory size, then the AOAs,
 * the price and the cost per AOA (the figure that falls plan by plan). The
 * size and the AOAs left the feature list for it. VPV VIP and VPV Signature get
 * the gold card. Styles: the .vpv-pc rules in lib/site/home.ts.
 */
const NOV20_CARD: [string, string][] = [
  [
    'className:"relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm "+(r?"border-brand ring-2 ring-brand/20":"border-slate-200")',
    'className:"vpv-pc relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm "+(t.gold?"vpv-pc-gold ":"")+(r?"border-brand ring-2 ring-brand/20":"border-slate-200")',
  ],
  ['(0,Dt.jsx)("h3",{className:"text-xl font-bold text-brand-deep",children:t.name})', '(0,Dt.jsx)("h3",{className:"vpv-pc-name",children:t.name})'],
  [
    '(0,Dt.jsx)("div",{className:"mt-5",children:(0,Dt.jsx)(ya,{plan:t,testPrefix:`${o}-${t.id}`})})',
    '(0,Dt.jsxs)("div",{className:"vpv-pc-area",children:[(0,Dt.jsxs)("p",{className:"vpv-pc-area-v","data-testid":`${o}-${t.id}-area`,children:[t.areaNum,(0,Dt.jsx)("span",{className:"vpv-pc-unit",children:" sq ft"})]}),(0,Dt.jsx)("p",{className:"vpv-pc-k vpv-pc-area-k",children:"Recommended for factories with the above covered area"})]}),' +
      '(0,Dt.jsx)("div",{className:"vpv-pc-aoa",children:(0,Dt.jsx)("p",{"data-testid":`${o}-${t.id}-aoas`,children:`${t.limits.aoas} AOAs`})}),' +
      '(0,Dt.jsx)("div",{className:"vpv-pc-price",children:(0,Dt.jsx)(ya,{plan:t,testPrefix:`${o}-${t.id}`})}),' +
      '(0,Dt.jsxs)("div",{className:"vpv-pc-per","data-testid":`${o}-${t.id}-per-aoa`,children:[(0,Dt.jsxs)("p",{className:"vpv-pc-per-v",children:[mn(Math.round(ga(t)/t.limits.aoas)),(0,Dt.jsx)("span",{children:" per AOA"})]}),' +
      '(0,Dt.jsxs)("p",{className:"vpv-pc-k",children:["Cost per AOA",t.id!==sn[0].id&&(0,Dt.jsxs)("span",{className:"vpv-pc-drop",children:["\u2193 ",Math.round(100-100*(ga(t)/t.limits.aoas)/(ga(sn[0])/sn[0].limits.aoas)),"% vs ",sn[0].name.replace(/^VPV /,"")]})]})]})',
  ],
  // The plan-difference answer leads each plan with its factory size.
  ['Dr=e=>`${e.name}: "${e.tagline}" ', 'Dr=e=>`${e.name} (${e.area}): "${e.tagline}" '],
];

/** 20 Nov 2026, second round: the line under the factory size, as the
 *  first round wrote it, to what it says now. */
const NOV20_CARD_ROUND_TWO: [string, string][] = [
  // The plans page heading, as the first round wrote it, to the owner's line.
  ['"Seven VPV plans, sized to your factory."', '"One-time investment, lifetime trust."'],['(0,Dt.jsx)("p",{className:"vpv-pc-k",children:"Factory covered area"})', '(0,Dt.jsx)("p",{className:"vpv-pc-k vpv-pc-area-k",children:"Recommended for factories with the above covered area"})']];

/**
 * 21 Nov 2026: four plans, billed yearly and shown per month; no factory
 * area; support, hosting & security part of every plan. Rewrites the text
 * the earlier patches put in the bundle (applied to every patch's new text,
 * with a migration pair carrying the bundle from the old to the new).
 */
function NOV21_REWORDING(list: [string, string][]): [string, string][] {
  const oldYa = list.find(([, to]) => to.startsWith("const ya=e=>{let{plan:t,testPrefix:n,size:r=\"lg\"}=e;const L="))?.[1];
  if (!oldYa) throw new Error("bundleData: the plan price patch is missing");
  return [
    // The card: name, then the price (per month, the biggest figure), then
    // the AOAs. The factory area and the cost per AOA are gone.
    [NOV20_CARD[2][1], NOV21_CARD_TOP],
    [oldYa, NOV21_PRICE],
    ['Dr=e=>`${e.name} (${e.area}): "${e.tagline}" ', 'Dr=e=>`${e.name}: "${e.tagline}" '],
    ['"One-time investment, lifetime trust."', JSON.stringify(PLANS_HEADING)],
    ['title:"Seven plans, sized to your factory"', 'title:"Four plans for your factory"'],
  ];
}

/** The plans page heading (21 Nov 2026): the plans are no longer one-time. */
export const PLANS_HEADING = "Simple plans. Lifetime trust.";

/** Under the plan's name: the price block, then the AOAs. */
const NOV21_CARD_TOP =
  '(0,Dt.jsx)("div",{className:"vpv-pc-price",children:(0,Dt.jsx)(ya,{plan:t,testPrefix:`${o}-${t.id}`})}),' +
  '(0,Dt.jsx)("div",{className:"vpv-pc-aoa",children:(0,Dt.jsx)("p",{"data-testid":`${o}-${t.id}-aoas`,children:`${t.limits.aoas} AOAs`})})';

/**
 * The price block (21 Nov 2026). On a card: the regular price per month,
 * struck through, with the offer tag; under it the offer price per month,
 * the largest figure on the card; then what one year is billed at. Without
 * the offer only the price per month and the yearly line show.
 */
const NOV21_PRICE =
  'const ya=e=>{let{plan:t,testPrefix:n,size:r="lg"}=e;const L="lg"===r&&ln.active,' +
  'b=(0,Dt.jsx)("span",{className:"rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"+(L?" vpv-off":""),children:ln.label}),' +
  'm=(0,Dt.jsx)("span",{className:"vpv-pm",children:"/month"}),' +
  'p=(0,Dt.jsxs)("p",{className:L?"vpv-now":("lg"===r?"text-3xl":"text-lg")+" mt-1 font-extrabold text-brand-deep","data-testid":`${n}-launch-price`,children:[mn(ga(t)),m]}),' +
  // the same plan, bought once for life (the Lifetime side of the toggle)
  'q=(0,Dt.jsxs)("p",{className:L?"vpv-now":("lg"===r?"text-3xl":"text-lg")+" mt-1 font-extrabold text-brand-deep","data-testid":`${n}-lifetime-price`,children:[mn(t.lifeNow),(0,Dt.jsx)("span",{className:"vpv-pm",children:" once"})]});' +
  'return(0,Dt.jsxs)("div",{"data-testid":`${n}-price`,className:"vpv-pr",children:[' +
  '(0,Dt.jsxs)("div",{className:"vpv-pa",children:[' +
  'ln.active&&(0,Dt.jsxs)("p",{className:L?"vpv-was":"flex flex-wrap items-center gap-2 text-sm text-slate-500",children:[(0,Dt.jsxs)("s",{className:"vpv-strike","data-testid":`${n}-standard-price`,children:[mn(t.price),"/month"]}),b]}),' +
  'p,(0,Dt.jsxs)("p",{className:"vpv-billed","data-testid":`${n}-billed`,children:["Billed yearly: ",mn(t.billed)," + GST"]})]}),' +
  '(0,Dt.jsxs)("div",{className:"vpv-pl","aria-hidden":"true",children:[' +
  'ln.active&&(0,Dt.jsxs)("p",{className:L?"vpv-was":"flex flex-wrap items-center gap-2 text-sm text-slate-500",children:[(0,Dt.jsx)("s",{className:"vpv-strike",children:mn(t.lifeWas)}),b]}),' +
  'q,(0,Dt.jsx)("p",{className:"vpv-billed",children:"One payment, yours for life + GST"})]})]})}';

/** Sentences of the original bundle that quoted the separate yearly support
 *  fee. Since 21 Nov 2026 (second round) the fee is back on every plan, so
 *  the original sentences are true again and nothing is rewritten. */
const NOV21_SUPPORT: [string, string][] = [];

function buildPatches(): [string, string][] {
  const conf = SITE_PLANS.light;
  const ctrl = SITE_PLANS.ultra;
  const ctrlBands = discountBands("ultra");
  const travelLong = `${travelSentence()} Shoot time beyond what your plan includes is ${inr(EXTRA_HOUR_INR)} an hour.`;
  const travelShort = `is ${travelPrice()}, by cab, for factories in ${SERVICE_CITY_LIST}. We are coming to more cities soon.`;
  const list: [string, string][] = [
    [
      "Travel & logistics (${mn(un.options.ncr.amount)} for Delhi NCR or ${mn(un.options.outside.amount)} outside Delhi NCR, + GST) is paid with your order.",
      travelLong,
    ],
    // October 2026: travel became cab only. These two carry the bundle from
    // the city-tier wording it had before to the cab wording above.
    [
      "Travel & logistics depends on your factory's city, from ₹2,000 to ₹15,000 + GST, and is shown before you pay. For cities we fly to, you book the crew's flights. Shoot time beyond what your plan includes is ₹999 an hour.",
      travelLong,
    ],
    [
      JSON.stringify("depends on your factory's city: from ₹2,000 to ₹15,000 + GST, shown before you pay. For cities we fly to, you book the crew's flights."),
      JSON.stringify(travelShort),
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
      JSON.stringify(travelShort),
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
      offerSentence(),
    ],
    [
      `The \${ln.percent}% applies to the plan price, and Sales Team logins are 50% off. Extra areas, videos, shoot time, travel & logistics and \${cn.name} are not discounted.`,
      offerSentence(),
    ],
    // "No per-salesperson fee" stopped being true when Sales Team logins
    // arrived; and the prices are no longer placeholders.
    ['"No per-salesperson fee to use it"', '"Every salesperson can present it"'],
    [
      "Your whole sales team can use the VPV, with no per-salesperson fee. Plan prices shown are placeholders, to be confirmed.",
      `Your whole sales team can present the VPV. ${salesSentence()}`,
    ],
    [
      '"The whole sales team can use your VPV. There is no per-salesperson fee. Multiple factories are quoted separately based on scope."',
      JSON.stringify(
        `Your whole sales team can present your VPV. Optional Sales Team logins (${inr(SALES_TEAM.offerInr)} per salesperson per year, for our first ${LAUNCH_OFFER.limit} customers) show you every meeting they hold. Multiple factories are quoted separately based on scope.`
      ),
    ],
    // The yearly fee is no longer "Digital Care", and travel is a cab.
    [
      '"See every charge upfront, including GST, travel & logistics and the yearly Digital Care, then confirm your order."',
      '"See every charge upfront, including GST, cab travel and support, hosting & security, then confirm your order."',
    ],
    [
      '"Travel & logistics and the yearly Digital Care charge are shown on the next step."',
      '"Cab travel and support, hosting & security are shown on the next step."',
    ],
    // ── Homepage, October 2026 ─────────────────────────────────────────
    // The hero's photo and two buttons become the live product (the
    // /experience stage, framed) with "Why VPV?" and Anuj Anand's result.
    [
      "children:[(0,Dt.jsxs)(\"div\",{children:[(0,Dt.jsx)(\"p\",{className:\"eyebrow\",children:dr}),(0,Dt.jsx)(\"h1\",{className:\"mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-brand-deep sm:text-5xl lg:text-6xl\",\"data-testid\":\"landing-heading\",children:pr}),(0,Dt.jsx)(\"p\",{className:\"mt-5 max-w-xl text-lg text-slate-600 sm:text-xl\",\"data-testid\":\"hero-lead\",children:fr}),(0,Dt.jsxs)(\"div\",{className:\"mt-8 flex flex-col gap-3 sm:flex-row\",children:[(0,Dt.jsxs)(At,{to:\"/assessment\",className:\"btn-primary !min-h-[56px] !px-7 text-base sm:whitespace-nowrap sm:text-lg\",\"data-testid\":\"landing-cta\",children:[\"Find the Right VPV for Your Factory \",(0,Dt.jsx)(cr,{className:\"h-5 w-5\"})]}),(0,Dt.jsx)(\"a\",{href:\"#plans\",className:\"btn-outline !min-h-[56px] whitespace-nowrap\",\"data-testid\":\"hero-explore-plans\",children:\"Explore the plans\"})]})]}),(0,Dt.jsx)(Vr,{src:_n,eager:!0,alt:\"An iPad at an exhibition booth showing a live 360\\xb0 tour of a factory floor\",className:\"aspect-[4/3] w-full rounded-3xl object-cover shadow-[0_30px_65px_rgba(20,104,216,0.18)]\",\"data-testid\":\"landing-hero-image\"})]",
      "children:[(0,Dt.jsxs)(\"div\",{\"data-testid\":\"hero-text\",children:[(0,Dt.jsx)(\"p\",{className:\"eyebrow\",children:dr}),(0,Dt.jsx)(\"h1\",{className:\"mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-brand-deep sm:text-5xl lg:text-6xl\",\"data-testid\":\"landing-heading\",children:pr}),(0,Dt.jsx)(\"p\",{className:\"mt-5 max-w-xl text-lg text-slate-600 sm:text-xl\",\"data-testid\":\"hero-lead\",children:fr})]}),(0,Dt.jsx)(\"div\",{\"data-testid\":\"hero-experience\",children:(0,Dt.jsx)(\"iframe\",{src:\"/experience\",title:\"Live VPV: walk through a real factory in 360\\xb0\",allow:\"fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay\",allowFullScreen:!0})}),(0,Dt.jsxs)(\"div\",{className:\"flex flex-col gap-3 sm:flex-row\",\"data-testid\":\"hero-ctas\",children:[(0,Dt.jsxs)(At,{to:\"/why-vpv\",className:\"btn-primary !min-h-[56px] !px-7 text-base sm:whitespace-nowrap sm:text-lg\",\"data-testid\":\"hero-why-vpv\",children:[\"Why VPV? \",(0,Dt.jsx)(cr,{className:\"h-5 w-5\"})]}),(0,Dt.jsxs)(\"a\",{href:\"/case-studies\",className:\"btn-outline !min-h-[56px]\",\"data-testid\":\"hero-case-study\",children:[(0,Dt.jsx)(\"span\",{className:\"vpv-play\",\"aria-hidden\":\"true\"}),(0,Dt.jsxs)(\"span\",{className:\"vpv-cs-text\",children:[(0,Dt.jsx)(\"b\",{children:\"80%+ conversion with VPV\"}),(0,Dt.jsx)(\"small\",{children:\"Anuj Anand's story \\xb7 See here\"})]})]})]})]",
    ],
    // Anuj Anand's story leads the case studies; Keshav Bhatia's moves to the grid.
    [
      "wr=[{id:\"BUlBN0rw98A\",name:\"Keshav Bhatia\",role:\"MD, GRKC Group\",featured:!0,quote:\"I got just 2 minutes with the CEO of a major Gulf food group. Thanks to VPV, I established trust instantly, he referred me to the biggest distributors in Dubai and I closed an order of 2 containers at a premium price.\"},{id:\"62asCfqRRbw\",name:\"Mr. Anuj Anand\",role:\"Export Head, Kesaria Rubber Industries Pvt. Ltd.\"",
      "wr=[{id:\"62asCfqRRbw\",name:\"Mr. Anuj Anand\",role:\"Export Head, Kesaria Rubber Industries Pvt. Ltd.\",featured:!0,quote:\"VPV became the bridge between us and our customers, and it builds our authority with every buyer. We used to present with slides, but the client could never see our machines or what they could do for him. Now buyers walk through the plant themselves. We have closed orders with international clients on a Zoom call, using only VPV, and our conversion is now above 80%.\"},{id:\"BUlBN0rw98A\",name:\"Keshav Bhatia\",role:\"MD, GRKC Group\",quote:\"I got just 2 minutes with the CEO of a major Gulf food group. Thanks to VPV, I established trust instantly, he referred me to the biggest distributors in Dubai and I closed an order of 2 containers at a premium price.\"",
    ],
    // The featured-story heading was written for Keshav Bhatia's story.
    ["eyebrow:\"Featured story\",title:\"Two minutes with a CEO\"", "eyebrow:\"Featured story\",title:\"Closing Export Orders on Zoom Calls\""],
    // The "Virtual Plant Visit" tagline under the logo shows on phones too.
    ["\"mt-0.5 hidden text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500 sm:block\",children:\"Virtual Plant Visit\"", "\"vpv-tagline mt-0.5 block text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500\",children:\"Virtual Plant Visit\""],
    // ── October 2026, round two ────────────────────────────────────────
    // PLANS PAGE: the "Compare every feature" table goes, and the one CTA
    // moves up to sit straight under the plan cards.
    [
      '(0,Dt.jsx)("h2",{className:"mt-16 text-2xl font-extrabold tracking-tight text-brand-deep sm:text-3xl",children:"Compare every feature"}),(0,Dt.jsx)("div",{className:"mt-6",children:(0,Dt.jsx)(ac,{})}),',
      PLANS_CTA,
    ],
    [
      ',(0,Dt.jsx)("div",{className:"mt-8 flex flex-col gap-3 sm:flex-row",children:(0,Dt.jsx)(At,{to:"/assessment",className:"btn-primary","data-testid":"plans-find-vpv-btn",children:"Find the Right VPV for Your Factory"})}),(0,Dt.jsx)(va,{testId:"speak-cta-plans-page",className:"mt-10"})',
      ',(0,Dt.jsx)(va,{testId:"speak-cta-plans-page",className:"mt-10"})',
    ],
    // A plan is an investment, not a price tag.
    ['children:"Three VPV plans. One clear price."', 'children:"Four VPV plans. One clear investment."'],
    ['children:"Three VPV plans. One clear investment."', 'children:"Four VPV plans. One clear investment."'],
    // October 2026: a fourth plan (Enterprise). The three plan grids and the
    // plan-difference FAQ were written for three.
    ['title:"Confidence, Authority or Control"', 'title:"Confidence, Authority, Control or Enterprise"'],
    ['"mt-10 grid gap-5 md:grid-cols-3",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"home-plan-card"}', '"mt-10 grid gap-5 md:grid-cols-2 vpv-plans-grid",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"home-plan-card"}'],
    ['"mt-10 grid gap-5 md:grid-cols-3",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"plans-page-card"}', '"mt-10 grid gap-5 md:grid-cols-2 vpv-plans-grid",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"plans-page-card"}'],
    ['"grid gap-4 md:grid-cols-3","data-testid":"plan-comparison"', '"grid gap-4 md:grid-cols-2","data-testid":"plan-comparison"'],
    // Enterprise's three Mr. Nitin Gupta lines shine: golden, larger. The
    // card is one component, so these key off the plan id and the text.
    [
      'className:"mt-1 text-sm text-slate-600",children:t.tagline}',
      'className:"mt-1 text-sm text-slate-600"+("enterprise"===t.id?" vpv-gold-tag":""),children:t.tagline}',
    ],
    // (The row renderer's earlier versions are superseded by the PLAN CARDS
    // patch further down, which replaces the whole row.)
    // The first Enterprise sync used a grid class the site's CSS does not ship.
    ['"mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4"', '"mt-10 grid gap-5 md:grid-cols-2 vpv-plans-grid"'],
    // Four cards in a row, rows aligned (see the CSS in lib/site/home.ts).
    ['"mt-10 grid gap-5 md:grid-cols-2",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"home-plan-card"}', '"mt-10 grid gap-5 md:grid-cols-2 vpv-plans-grid",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"home-plan-card"}'],
    ['"mt-10 grid gap-5 md:grid-cols-2",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"plans-page-card"}', '"mt-10 grid gap-5 md:grid-cols-2 vpv-plans-grid",children:sn.map(e=>(0,Dt.jsx)(xa,{plan:e,testPrefix:"plans-page-card"}'],
    ['"grid gap-4 md:grid-cols-2 xl:grid-cols-4"', '"grid gap-4 md:grid-cols-2"'],
    ['q:"What is the difference between Confidence, Authority and Control?"', 'q:"What is the difference between Confidence, Authority, Control and Enterprise?"'],
    ['${Dr(Ir)} ${Dr(Mr)} ${Dr(Lr)} See the plans page', '${Dr(Ir)} ${Dr(Mr)} ${Dr(Lr)} ${Dr(sn[3])} See the plans page'],
    // PLANS: no sub-heading under the title (17 Nov 2026).
    [
      '"Four VPV plans. One clear investment."}),(0,Dt.jsxs)("p",{className:"mt-3 text-lg text-slate-600 sm:text-xl",children:["Not sure which fits? Our assessment recommends the lowest plan that ",(0,Dt.jsx)("span",{className:"font-semibold text-brand",children:"covers everything you need"}),"."]}),',
      '"Four VPV plans. One clear investment."}),',
    ],
    // CASE STUDIES: the client logo strip is a new image, and the page ends
    // on a nudge before the call to action.
    ['Nr=["Kesaria","Nandan","ViR","Daffodil Engravers","AgroMach","Saa Vishnu Group","GRKC","Uttam","JFL","Param"]',
      'Nr=["Kesaria Rubber Industries","Nandan GSE","ViR","Ecoste","Saa Vishnu Group","GRKC","Miicron","JFL"]'],
    ['width:"871",height:"176"', 'width:"1400",height:"291"'],
    // CASE STUDIES: the nudge moves OUT of the page footer (it used to sit
    // above the final CTA) and INTO the testimonial grid, as a blue cell
    // beside the story videos. First pair strips the old footer nudge from
    // an already-patched bundle; second pair appends the grid cell. Both are
    // no-ops on a pristine bundle that never had the footer nudge.
    [
      '(0,Dt.jsx)("div",{className:"mt-10 rounded-3xl p-8 text-center sm:p-10",style:{background:"linear-gradient(120deg,#0B3D91,#1468D8 55%,#19B8F2)"},"data-testid":"case-studies-nudge",children:(0,Dt.jsx)("p",{className:"mx-auto max-w-3xl text-2xl font-extrabold leading-snug tracking-tight text-white sm:text-3xl",children:"Don’t wait for your competitors to get ahead. Start your case study today."})}),',
      "",
    ],
    [
      '(0,Dt.jsx)("div",{className:"grid gap-4 sm:grid-cols-2 lg:grid-cols-3","data-testid":"testimonial-grid",children:wr.filter(e=>!e.featured&&(n||!e.caseStudiesOnly)).map(e=>(0,Dt.jsx)(ea,{video:e,onPlay:t},e.id))})',
      '(0,Dt.jsxs)("div",{className:"grid gap-4 sm:grid-cols-2 lg:grid-cols-3","data-testid":"testimonial-grid",children:[wr.filter(e=>!e.featured&&(n||!e.caseStudiesOnly)).map(e=>(0,Dt.jsx)(ea,{video:e,onPlay:t},e.id)),n&&(0,Dt.jsx)("div",{className:"lg:col-span-2 flex items-center justify-center rounded-2xl p-6 text-center","data-testid":"case-studies-nudge",style:{background:"linear-gradient(120deg,#0B3D91,#1468D8 55%,#19B8F2)"},children:(0,Dt.jsx)("p",{className:"text-xl font-extrabold leading-snug tracking-tight text-white sm:text-2xl",children:"Don’t wait for your competitors to get ahead. Start your case study today."})},"nudge")]})',
    ],
    // "Why VPV" in the site menu.
    ["Un=[{to:\"/\",label:\"Home\",id:\"home\",end:!0},{to:\"/how-it-works\"", "Un=[{to:\"/\",label:\"Home\",id:\"home\",end:!0},{to:\"/why-vpv\",label:\"Why VPV\",id:\"why-vpv\"},{to:\"/how-it-works\""],
    // The bundle's "is your factory in Delhi NCR?" buttons quoted the cab price;
    // with travel free they would read "₹0 + GST".
    [
      "yesLabel:`Yes (${mn(un.options.ncr.amount)} + GST)`,noLabel:`No (${mn(un.options.outside.amount)} + GST)`",
      'yesLabel:"Yes",noLabel:"No"',
    ],
    // ── 31 October 2026: site polish ──────────────────────────────────
    // CASE STUDIES: the handshake photo and the small logo strip make way
    // for one wide "Trusted by manufacturers" logo wall under the heading.
    [
      "(0,Dt.jsx)(Wr,{tone:\"gradient\",children:(0,Dt.jsxs)(\"div\",{className:\"grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]\",children:[(0,Dt.jsxs)(\"div\",{children:[(0,Dt.jsx)(\"p\",{className:\"eyebrow\",children:\"Case studies\"}),(0,Dt.jsx)(\"h1\",{className:\"mt-3 text-4xl font-extrabold tracking-tight text-brand-deep sm:text-5xl\",children:\"Real manufacturers. Real conversations.\"}),(0,Dt.jsx)(\"p\",{className:\"mt-4 text-lg text-slate-600\",children:kr}),(0,Dt.jsx)(\"div\",{className:\"mt-6\",children:(0,Dt.jsx)(ca,{})})]}),(0,Dt.jsx)(Vr,{src:On,eager:!0,alt:\"Business partners shaking hands in a bright factory office\",className:\"aspect-[4/3] w-full rounded-3xl object-cover\"})]})})",
      "(0,Dt.jsx)(Wr,{tone:\"gradient\",children:(0,Dt.jsxs)(\"div\",{className:\"vpv-cs-hero\",\"data-testid\":\"case-studies-hero\",children:[(0,Dt.jsxs)(\"div\",{className:\"vpv-cs-hero-text\",children:[(0,Dt.jsx)(\"p\",{className:\"eyebrow\",children:\"Case studies\"}),(0,Dt.jsx)(\"h1\",{className:\"mt-3 text-4xl font-extrabold tracking-tight text-brand-deep sm:text-5xl\",children:\"Real manufacturers. Real Success Stories.\"}),(0,Dt.jsx)(\"p\",{className:\"mt-4 text-lg text-slate-600\",children:kr})]}),(0,Dt.jsx)(\"img\",{src:\"/img/trusted-manufacturers.webp\",width:1774,height:887,loading:\"eager\",decoding:\"async\",alt:\"Trusted by manufacturers across industries and markets: Kilitch Drugs (pharma), GRKC (FMCG), Yum-Way (frozen foods), Binayak Hi Tech Engineering (foundry and engineering), Kesaria Rubber Industries, Nandan GSE (engineering), ViR (auto), Saa Vishnu Group (FMCG), Param (dairy), Miicron (speciality chemicals), JFL (fasteners), Ecoste (WPC door frames), de'Smat (labels), Garima Global and Grace Auto (auto components) and EASA Elevators\",className:\"vpv-cs-logos\",\"data-testid\":\"case-studies-logos\"})]})})",
    ],
    // PLANS: a line above the "Find the Right VPV" button for anyone who
    // has read the four cards and still isn't sure (carries the bundle from
    // the bare button to the button with its nudge).
    [
      '(0,Dt.jsx)("div",{className:"mt-10 flex flex-col gap-3 sm:flex-row","data-testid":"plans-cta-top",children:(0,Dt.jsx)(At,{to:"/assessment",className:"btn-primary","data-testid":"plans-find-vpv-btn",children:"Find the Right VPV for Your Factory"})}),',
      PLANS_CTA,
    ],
    // The "Find the Right VPV for Your Factory" buttons on the closing call to
    // action, How it works and Case studies go to the plans page; the plans
    // page's own button ("Not sure which plan is right...") stays on /assessment.
    [
      '{to:"/assessment",className:"btn-primary mt-8 !min-h-[56px] !px-8 text-lg","data-testid":"final-cta-btn"',
      '{to:"/plans",className:"btn-primary mt-8 !min-h-[56px] !px-8 text-lg","data-testid":"final-cta-btn"',
    ],
    [
      '{to:"/assessment",className:"btn-primary mt-8","data-testid":"hiw-cta"',
      '{to:"/plans",className:"btn-primary mt-8","data-testid":"hiw-cta"',
    ],
    [
      '{to:"/assessment",className:"btn-primary mt-8","data-testid":"case-studies-cta"',
      '{to:"/plans",className:"btn-primary mt-8","data-testid":"case-studies-cta"',
    ],
    // PLAN CARDS (17 Nov 2026). Rows a plan lacks ("!" in inclusions())
    // are drawn grey with a red cross instead of a tick.
    [
      't.inclusions.map(e=>(0,Dt.jsxs)("li",{className:"flex gap-2"+("~"===e[0]?" vpv-ph":""),"aria-hidden":"~"===e[0]||void 0,children:[(0,Dt.jsx)(Zr,{className:"mt-0.5 h-4 w-4 shrink-0 text-brand",strokeWidth:3}),(0,Dt.jsx)("span",{className:e.includes("Gupta")?"vpv-gold-line":void 0,children:"~"===e[0]?e.slice(1):e})]},e))',
      't.inclusions.map(e=>{const x="!"===e[0],l=x?e.slice(1):e;return(0,Dt.jsxs)("li",{className:"flex gap-2"+(x?" vpv-no":""),children:[x?(0,Dt.jsx)("svg",{viewBox:"0 0 24 24",width:16,height:16,className:"vpv-no-ic",fill:"none",stroke:"currentColor",strokeWidth:3,strokeLinecap:"round","aria-hidden":"true",children:(0,Dt.jsx)("path",{d:"M6 6l12 12M18 6 6 18"})}):(0,Dt.jsx)(Zr,{className:"mt-0.5 h-4 w-4 shrink-0 text-brand",strokeWidth:3}),(0,Dt.jsxs)("span",{className:!x&&l.includes("Gupta")?"vpv-gold-line":void 0,children:[l,x&&(0,Dt.jsx)("span",{className:"sr-only",children:" (not included)"})]})]},e)})',
    ],
    // PLAN PRICES (17 Nov 2026). On the cards the regular price is the big
    // figure, struck through in red with black digits; the offer price sits
    // under it, smaller, with its "Special offer" tag. Elsewhere (the small
    // comparison-table size) only the strike turns red.
    [
      'const ya=e=>{let{plan:t,testPrefix:n,size:r="lg"}=e;return(0,Dt.jsxs)("div",{"data-testid":`${n}-price`,children:[ln.active&&(0,Dt.jsxs)("p",{className:"flex flex-wrap items-center gap-2 text-sm text-slate-500",children:[(0,Dt.jsx)("s",{"data-testid":`${n}-standard-price`,children:mn(t.price)}),(0,Dt.jsx)("span",{className:"rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700",children:ln.label})]}),(0,Dt.jsxs)("p",{className:("lg"===r?"text-3xl":"text-lg")+" mt-1 font-extrabold text-brand-deep","data-testid":`${n}-launch-price`,children:[mn(ga(t))," ",(0,Dt.jsx)("span",{className:"text-sm font-medium text-slate-500",children:"+ GST"})]})]})}',
      'const ya=e=>{let{plan:t,testPrefix:n,size:r="lg"}=e;const L="lg"===r&&ln.active,b=(0,Dt.jsx)("span",{className:"rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700",children:ln.label}),p=(0,Dt.jsxs)("p",{className:L?"vpv-now":("lg"===r?"text-3xl":"text-lg")+" mt-1 font-extrabold text-brand-deep","data-testid":`${n}-launch-price`,children:[mn(ga(t))," ",(0,Dt.jsx)("span",{className:"text-sm font-medium text-slate-500",children:"+ GST"})]});return(0,Dt.jsxs)("div",{"data-testid":`${n}-price`,children:[ln.active&&(0,Dt.jsxs)("p",{className:L?"vpv-was":"flex flex-wrap items-center gap-2 text-sm text-slate-500",children:[(0,Dt.jsx)("s",{className:"vpv-strike","data-testid":`${n}-standard-price`,children:mn(t.price)}),!L&&b]}),L?(0,Dt.jsxs)("div",{className:"vpv-now-row",children:[p,b]}):p]})}',
    ],
    // The lower Kuula demo opens on the first real scene (Entrance), not the
    // collection's index image, and no longer auto-advances back to it.
    ["https://kuula.co/share/collection/7cprp?logo=-1&info=0&fs=1&vr=1&sd=1&autorotate=1.5&autop=10&thumbs=1", "https://kuula.co/share/5dmM7/collection/7cprp?logo=-1&info=0&fs=1&vr=1&sd=1&autorotate=1.5&thumbs=1"],
    // "PDF reports" are now "lab reports & certifications" everywhere.
    ['"PDF report"', '"lab report"'],
    ["PDF reports", "lab reports & certifications"],
    ['q:"How many videos and PDFs are included?"', 'q:"How many videos and lab reports are included?"'],
    // HOW IT WORKS, steps 3 and 5.
    ['Our team confirms availability within 1 working day and you get a preparation checklist."', 'Our team confirms availability within 1 working day."'],
    ['we turn the captured factory into your interactive VPV. Delivery depends', 'we turn the captured factory into your interactive VPV with your team, without affecting your production. Delivery depends'],
    // HOW IT WORKS, step 3 (15 November 2026): who schedules, and the rescheduling fee.
    ['text:"Request a preferred shoot date. Our team confirms availability within 1 working day."', 'text:"Our team will contact you once your payment is confirmed to schedule your shoot date. One rescheduling request is allowed free of charge. Any additional rescheduling will incur a fee of ₹500 per revision."'],
  ];

  // ── 26 October 2026: free cab travel for the first 50, yearly ₹199 Sales
  // Team logins. The bundle already carries the previous wording of these
  // sentences; each pair below carries it to the current one.
  for (const [before, at] of OCT26_MIGRATIONS) list.push([before, list[at][1]]);

  // ── 20 November 2026: seven plans, sold by factory size. Wording the
  // pairs above already put in the bundle is rewritten in place, and a
  // migration pair carries the bundle from the old wording to the new.
  const out: [string, string][] = [];
  const migrations: [string, string][] = [];
  for (const [from, to] of list) {
    let next = to;
    for (const [a, b] of NOV20_REWORDING) next = next.split(a).join(b);
    out.push([from, next]);
    if (next !== to && !migrations.some(([m]) => m === to)) migrations.push([to, next]);
  }
  // The same pairs, at the plan figures the bundle was last synced with.
  for (const [before, after] of NOV20_FIGURES()) migrations.push([before, after]);

  // ── 21 November 2026: four yearly plans. The card's area line (the
  // second pair of NOV20_CARD_ROUND_TWO) is gone with the area itself.
  const nov20 = [...out, ...migrations, ...NOV20_CARD, NOV20_CARD_ROUND_TWO[0]];
  const reword = NOV21_REWORDING(nov20);
  const final: [string, string][] = [];
  const nov21: [string, string][] = [];
  for (const [from, to] of nov20) {
    let next = to;
    for (const [a, b] of reword) next = next.split(a).join(b);
    final.push([from, next]);
    if (next !== to && !nov21.some(([m]) => m === to)) nov21.push([to, next]);
  }
  // Figures the bundle carries from the seven plans, to the four.
  const ultraBands = discountBands("ultra");
  nov21.push(
    [
      "Every plan lets you add extra areas, and each one costs less than the last. On VPV Ultra, extra areas start at ₹4,500 and fall to ₹4,000. You see the price of every extra area, and the total, before you pay.",
      `Every plan lets you add extra areas, and each one costs less than the last. On ${SITE_PLANS.ultra.name}, extra areas start at ${inr(ultraBands[0].each)} and fall to ${inr(ultraBands[ultraBands.length - 1].each)}. You see the price of every extra area, and the total, before you pay.`,
    ],
    ['(for example, "You selected 8 areas; ${Ir.name} includes 2")', `(for example, "You selected 8 areas; \${Ir.name} includes ${conf.scenes}")`],
    [OFFER_SENTENCE_NOV20, offerSentence()]
  );
  // A pair whose old and new text are now the same (a figure that happens
  // to be back where it started) has nothing to do.
  return [...final, ...nov21, ...NOV21_SUPPORT].filter(([from, to]) => from !== to);
}

/**
 * Every [old, new] text pair the sync applies to the bundle.
 *
 * 21 Nov 2026 (second round): the offer went from "our first 50 customers"
 * to the first 30 (50% off) and the first 20 (the founding offer). The
 * bundle on main carries the sentences as they were written with 50, so the
 * pairs are worked out a second time at 50 and every sentence that changed
 * gets a migration pair from its 50 wording to its current one.
 */
export function bundleTextPatches(): [string, string][] {
  const now = buildPatches();
  const saved = { limit: LAUNCH_OFFER.limit, foundingLimit: LAUNCH_OFFER.foundingLimit };
  let before: [string, string][] = [];
  try {
    LAUNCH_OFFER.limit = 50;
    LAUNCH_OFFER.foundingLimit = 50;
    before = buildPatches();
  } finally {
    LAUNCH_OFFER.limit = saved.limit;
    LAUNCH_OFFER.foundingLimit = saved.foundingLimit;
  }
  const migrations: [string, string][] = [];
  const nowTo = new Set(now.map(([, to]) => to));
  for (const [, oldTo] of before) {
    if (nowTo.has(oldTo)) continue;
    // The pair at the same place in the current list.
    const i = before.findIndex(([, t]) => t === oldTo);
    const newTo = now[i]?.[1];
    if (newTo && newTo !== oldTo && !migrations.some(([m]) => m === oldTo)) migrations.push([oldTo, newTo]);
  }
  return [...now, ...migrations].filter(([from, to]) => from !== to);
}
