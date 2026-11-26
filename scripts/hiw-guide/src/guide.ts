/**
 * How it works — the whole of VPV on one page, in plain words.
 *
 * Replaces the 3D factory walkthrough. One scroll answers, in order:
 *
 *   1  The 5 steps: who does what, and how long each takes.
 *   2  What you get: every deliverable, and which plans include it.
 *   3  Your part: what we need from you, and what you never have to do.
 *   4  After you go live: sharing, presenting, updating, renewing.
 *   5  What it costs: every charge, in one line each.
 *
 * It deliberately does not repeat the other pages: the benefits live on
 * Why VPV, the plan-by-plan table on Plans, the questions on FAQ. Every
 * price is read from lib/pricing.ts, so this page can never disagree with
 * the bill.
 *
 * Mounted by the loader in lib/site/home.ts into <div id="hiw-tour">, which
 * the site bundle renders on /how-it-works. If this script fails, the old
 * five-step cards in #hiw-classic show instead.
 */
import {
  EXTRA_HOUR_INR,
  LAUNCH_OFFER,
  SALES_TEAM,
  SUPPORT_ANNUAL_INR,
  SUPPORT_MONTHLY_INR,
  SITE_PLANS,
  SITE_PLAN_DISPLAY_ORDER,
  VIDEO_SELF_INR,
  VIDEO_SHOT_INR,
  inr,
} from "@/lib/pricing";
import { CAB_TRAVEL, SERVICE_CITY_LIST } from "@/lib/logistics";
import CSS from "./guide.css";

/** The one charge set by the team, not by the plans: a second reschedule. */
const RESCHEDULE_INR = 500;
const WHATSAPP = { label: "+91 98183 72742", href: "https://wa.me/919818372742" };

/* ─────────── icons (lucide shapes, drawn inline) ─────────── */
const I = {
  list: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  orbit: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  brand: '<path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7z"/><path d="M9 12l2 2 4-4"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m22 8-5 4 5 4V8z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  move: '<path d="m5 9-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};
const svg = (d: string, s = 20, w = 2) =>
  `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/* ─────────── the numbers, all from lib/pricing ─────────── */
const plans = SITE_PLAN_DISPLAY_ORDER.map((id) => SITE_PLANS[id]);
const shortName = (n: string) => n.replace(/^VPV /, "");
const hoursList = (() => {
  const h = plans.map((p) => p.shootHours);
  return `${h.slice(0, -1).join(", ")} or ${h[h.length - 1]}`;
})();
const extraAreaRange = (() => {
  const all = plans.flatMap((p) => p.extraAreaLadder.map((b) => b.each));
  return `${inr(Math.min(...all))} to ${inr(Math.max(...all))}`;
})();

/* ─────────── content ─────────── */
type Step = { icon: string; title: string; who: "you" | "us"; when: string; text: string; ticks: string[] };
const STEPS: Step[] = [
  {
    icon: I.list,
    title: "Find your VPV",
    who: "you",
    when: "A few minutes, online",
    text: "Tell us what you make, where your factory is and which areas you would like buyers to see. We recommend the plan that fits and show you the full price straight away.",
    ticks: ["No call or site visit needed to get a price", "We suggest the areas buyers in your industry ask to see", "Prefer another plan? You can pick it"],
  },
  {
    icon: I.card,
    title: "Confirm & pay online",
    who: "you",
    when: "A few minutes, online",
    text: "Every charge sits on one screen before you pay: your plan (yearly or lifetime), support, hosting & security, cab travel and GST. Pay online and your order is confirmed.",
    ticks: ["Your GST invoice arrives by e-mail", "Your VPV dashboard and login are ready within 24 hours"],
  },
  {
    icon: I.calendar,
    title: "Book your shoot",
    who: "us",
    when: "Within 2 working days of payment",
    text: `Our team calls you to agree a shoot date. One rescheduling request is free; any change after that costs ${inr(RESCHEDULE_INR)}.`,
    ticks: [
      "A short meeting with your MD and sales team first, to learn how you sell and what buyers ask",
      "We plan the day with your plant head, so you don't have to",
    ],
  },
  {
    icon: I.camera,
    title: "We shoot your plant",
    who: "us",
    when: "1–5 hours on site",
    text: "Our crew comes to your plant by cab from our Gurugram office and captures every area you chose in 360°, running exactly as it does on a normal day. If your plan includes process videos, we film those too.",
    ticks: ["Production keeps running", "Your MD doesn't need to be there", `We shoot in ${SERVICE_CITY_LIST} today; more cities are coming`],
  },
  {
    icon: I.rocket,
    title: "Your VPV goes live",
    who: "us",
    when: "Typically 1–3 weeks after the shoot",
    text: "We turn the shoot into your interactive VPV: we join your areas so buyers can walk from one to the next, add information icons, attach your videos and reports, and put your brand on it.",
    ticks: ["It opens at yourcompany.myvpv.com", "It appears in your dashboard, ready to share", "Bigger plants take a little longer"],
  },
];

type Deliverable = { icon: string; title: string; tag: string; tagKind: "all" | "up" | "add" | "ent"; text: string };
const GET: Deliverable[] = [
  { icon: I.orbit, tag: "Every plan", tagKind: "all", title: "A 360° walk through your plant", text: "Each area you choose becomes a 360° view. Buyers stand in it, look around and move on to the next area, at their own pace. We call each area an AOA (Active Operational Area)." },
  { icon: I.link, tag: "Every plan", tagKind: "all", title: "Your own web address", text: "yourcompany.myvpv.com: one link that opens your whole factory." },
  { icon: I.info, tag: "Every plan", tagKind: "all", title: "Information icons", text: "Small icons placed inside the tour. Tap one to read about a machine, a line or a capacity. 20 on Light, unlimited on every other plan." },
  { icon: I.brand, tag: "Every plan", tagKind: "all", title: "Your brand on it", text: "Your logo and company name, so every buyer knows whose factory they are walking through." },
  { icon: I.dash, tag: "Every plan", tagKind: "all", title: "Your VPV dashboard", text: "A password-protected login for your company. Pick the areas to show and send links from one place." },
  { icon: I.server, tag: "Every plan", tagKind: "all", title: "Support, hosting & security", text: `Fast hosting, backups, security updates, and a real person to help by e-mail and phone, with a reply within 48 hours. ${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly, on every plan.` },
  { icon: I.video, tag: "Premium and up", tagKind: "up", title: "Process videos", text: "Short videos of a process, like moulding or testing, that play inside the tour at the spot where it happens. They sit on your own YouTube channel." },
  { icon: I.file, tag: "Premium and up", tagKind: "up", title: "Lab reports & certificates", text: "Attach ISO, CE, GMP and test reports. Buyers open them inside the tour, right where they belong." },
  { icon: I.lock, tag: "Premium and up", tagKind: "up", title: "Link controls", text: "One-time view links from Premium; password-protected links, link expiry time and limits on devices from Ultra." },
  { icon: I.users, tag: "Optional, any plan", tagKind: "add", title: "Sales Team logins", text: "Each salesperson gets their own login to present the same VPV. You see their clients, deal stages and meetings in one place. Ultra and White Glove include one free." },
  { icon: I.star, tag: "White Glove", tagKind: "ent", title: "Mr. Nitin Gupta, personally", text: "A one-to-one planning session, then your plant filmed by Mr. Nitin Gupta himself." },
  { icon: I.video, tag: "Ultra and White Glove", tagKind: "ent", title: "A free update shoot every year", text: "If parts of your factory change, we come back once a year and reshoot those areas, and update your VPV. Cab travel included." },
];

const BUYER = [
  { icon: I.phone, title: "Opens with one tap", text: "On a phone, tablet or laptop. No app, no download." },
  { icon: I.move, title: "Feels like being there", text: "Look anywhere, walk between areas, tap icons, play videos and open certificates." },
  { icon: I.globe, title: "Works wherever they are", text: "In India or abroad, on WhatsApp, e-mail or a video call." },
];

const NEED = [
  "A few minutes online to answer our questions and pay",
  "One short meeting with your MD and sales team",
  "One person at the plant on shoot day, usually your plant head",
  "Your plant as it is on a normal working day",
  "Your logo, plus any reports or videos you want in the tour",
];
const DONT = [
  "Stop or slow down production",
  "Bring your MD to the factory",
  "Decorate or stage anything for the camera",
  "Show any area you'd rather keep private",
  "Learn anything technical",
];

const AFTER = [
  { icon: I.share, title: "Share it", text: "Send your link on WhatsApp or e-mail, and add it to your website, proposals and e-mail signature. From Premium up, protect each link the way you want." },
  { icon: I.monitor, title: "Present it", text: "Share your screen on a Zoom call and walk a buyer through your plant, open it on an iPad in meetings, or play it on a TV at your exhibition stand." },
  { icon: I.refresh, title: "Keep it fresh", text: "Add videos and reports from your dashboard whenever you like. New machine or a new line? We can capture it and add it, quoted separately." },
];

type CostRow = { what: string; price: string; was?: string; note: string };
const COSTS: CostRow[] = [
  {
    what: "Your plan, billed yearly",
    price: plans.map((p) => `${shortName(p.name)} ${inr(LAUNCH_OFFER.active ? p.monthlyInr : p.regularMonthlyInr)}/month`).join(" · "),
    note: LAUNCH_OFFER.active
      ? `${LAUNCH_OFFER.percent}% off the regular price for our first ${LAUNCH_OFFER.limit} customers, every year they renew. They also get ${LAUNCH_OFFER.freeMonths} months free.`
      : "Renews every year at the price you bought at.",
  },
  {
    what: "Or your plan for life, paid once",
    price: plans.map((p) => `${shortName(p.name)} ${inr(LAUNCH_OFFER.active ? p.lifetimeInr : p.regularLifetimeInr)}`).join(" · "),
    note: LAUNCH_OFFER.active
      ? `${LAUNCH_OFFER.percent}% off for our first ${LAUNCH_OFFER.limit} customers. No plan renewal, ever.`
      : "No plan renewal, ever.",
  },
  {
    what: "Support, hosting & security",
    price: LAUNCH_OFFER.active ? `Free for ${12 + LAUNCH_OFFER.freeMonths} months` : `${inr(SUPPORT_MONTHLY_INR)}/month`,
    was: LAUNCH_OFFER.active ? inr(SUPPORT_ANNUAL_INR) : undefined,
    note: LAUNCH_OFFER.active
      ? `On every plan, yearly or lifetime: ${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly. Free for the first ${12 + LAUNCH_OFFER.freeMonths} months for our first ${LAUNCH_OFFER.limit} customers.`
      : `On every plan, yearly or lifetime, billed yearly as ${inr(SUPPORT_ANNUAL_INR)}.`,
  },
  { what: "Cab travel for our crew", price: "Free", was: inr(CAB_TRAVEL.amountInr), note: `Free for our first ${LAUNCH_OFFER.limit} customers.` },
  { what: "Sales Team logins (optional)", price: `${inr(SALES_TEAM.offerInr)} per login, a year`, was: inr(SALES_TEAM.regularInr), note: "Only if your salespeople will present it." },
  { what: "Extra process videos (optional)", price: `${inr(VIDEO_SELF_INR)} or ${inr(VIDEO_SHOT_INR)} each`, note: `${inr(VIDEO_SELF_INR)} if you send us the video, ${inr(VIDEO_SHOT_INR)} if we film it.` },
  { what: "Extra areas (optional)", price: `${extraAreaRange} each, a year`, note: "They renew with a yearly plan (on a lifetime plan, paid once). The price is the same on every plan, and it falls the more areas you add." },
  { what: "Extra shoot time (only if needed)", price: `${inr(EXTRA_HOUR_INR)} an hour`, note: `Plans include ${hoursList} hours. Extra areas or videos can add time, and it shows on your bill before you pay.` },
  { what: "Rescheduling your shoot", price: "First change free", note: `${inr(RESCHEDULE_INR)} for each change after that.` },
];

/* ─────────── markup ─────────── */
const section = (id: string, eyebrow: string, title: string, intro: string, body: string, tone = "") =>
  `<section class="hg-sec ${tone}" id="${id}" aria-labelledby="${id}-t"><div class="hg-wrap">
    <p class="hg-eyebrow hg-rv">${eyebrow}</p>
    <h2 class="hg-h2 hg-rv" id="${id}-t">${title}</h2>
    ${intro ? `<p class="hg-intro hg-rv">${intro}</p>` : ""}
    ${body}
  </div></section>`;

const stepsHtml = `<ol class="hg-steps">${STEPS.map(
  (s, i) => `<li class="hg-step hg-rv" style="--k:${i}">
    <span class="hg-step-n" aria-hidden="true">${i + 1}</span>
    <div class="hg-step-card">
      <div class="hg-step-head">
        <span class="hg-step-ic">${svg(s.icon, 22)}</span>
        <div><h3 class="hg-h3"><span class="hg-sr">Step ${i + 1}: </span>${s.title}</h3>
        <p class="hg-step-meta"><span class="hg-who hg-who--${s.who}">${s.who === "you" ? "You" : "Our team"}</span><span>${s.when}</span></p></div>
      </div>
      <p class="hg-p">${s.text}</p>
      <ul class="hg-ticks">${s.ticks.map((t) => `<li>${svg(I.check, 16, 2.4)}<span>${t}</span></li>`).join("")}</ul>
    </div>
  </li>`
).join("")}</ol>`;

const getHtml = `<div class="hg-get">${GET.map(
  (g, i) => `<article class="hg-card hg-rv${g.tagKind === "ent" ? " hg-card--wide" : ""}" style="--k:${i % 3}">
    <div class="hg-card-top"><span class="hg-ic">${svg(g.icon, 20)}</span><span class="hg-tag hg-tag--${g.tagKind}">${g.tag}</span></div>
    <h3 class="hg-h3">${g.title}</h3>
    <p class="hg-p">${g.text}</p>
  </article>`
).join("")}</div>
<a class="hg-more hg-rv" href="/plans">Compare how many areas, videos and reports each plan includes ${svg(I.arrow, 16)}</a>
<div class="hg-buyer hg-rv">
  <div class="hg-buyer-media"><img src="/img/vpv-preview.webp" alt="A VPV open on a laptop: a 360° view inside a factory" loading="lazy" decoding="async" width="1200" height="800"></div>
  <div class="hg-buyer-body">
    <p class="hg-eyebrow">What your buyer sees</p>
    <h3 class="hg-h3 hg-h3--lg">Your factory, open in their hand</h3>
    <ul class="hg-buyer-list">${BUYER.map((b) => `<li><span class="hg-ic hg-ic--sm">${svg(b.icon, 18)}</span><span><b>${b.title}</b>${b.text}</span></li>`).join("")}</ul>
  </div>
</div>`;

const partHtml = `<div class="hg-part">
  <div class="hg-list hg-list--need hg-rv">
    <h3 class="hg-h3">What we need from you</h3>
    <ul>${NEED.map((t) => `<li>${svg(I.check, 16, 2.6)}<span>${t}</span></li>`).join("")}</ul>
  </div>
  <div class="hg-list hg-list--dont hg-rv" style="--k:1">
    <h3 class="hg-h3">What you never have to do</h3>
    <ul>${DONT.map((t) => `<li>${svg(I.x, 16, 2.6)}<span>${t}</span></li>`).join("")}</ul>
  </div>
</div>
<div class="hg-tip hg-rv"><span class="hg-ic hg-ic--gold">${svg(I.bulb, 20)}</span><p><b>The only preparation:</b> ask yourself, “If a buyer were coming to our factory tomorrow, what would we make sure was ready?” Do that, follow your normal dress code and safety rules, and you're set.</p></div>`;

const afterHtml = `<div class="hg-after">${AFTER.map(
  (a, i) => `<article class="hg-card hg-rv" style="--k:${i}">
    <div class="hg-card-top"><span class="hg-ic">${svg(a.icon, 20)}</span><span class="hg-num">0${i + 1}</span></div>
    <h3 class="hg-h3">${a.title}</h3><p class="hg-p">${a.text}</p>
  </article>`
).join("")}</div>
<div class="hg-renew hg-rv">
  <span class="hg-ic">${svg(I.bell, 20)}</span>
  <div><h3 class="hg-h3">Renewing is just as simple</h3>
  <p class="hg-p">A yearly plan renews once a year at the price you bought at, together with support, hosting & security, and so do Sales Team logins. On a lifetime plan only support, hosting & security renews. We e-mail you 30 days, 1 week and 1 day before it's due. If it isn't renewed, you still get 7 more days; after that your VPV pauses until you renew. Your tours and data are kept, and renewing switches everything back on straight away.</p></div>
</div>`;

const costHtml = `<div class="hg-cost hg-rv">${COSTS.map(
  (c) => `<div class="hg-cost-row"><p class="hg-cost-what">${c.what}</p><p class="hg-cost-price">${c.was ? `<s>${c.was}</s> ` : ""}${c.price}</p><p class="hg-cost-note">${c.note}</p></div>`
).join("")}</div>
<p class="hg-foot hg-rv">All prices are + 18% GST. You see your complete bill, line by line, before you pay. <a href="/plans">See the plans ${svg(I.arrow, 15)}</a></p>`;

const JUMP = [
  ["hg-steps", "The 5 steps"],
  ["hg-get", "What you get"],
  ["hg-part", "Your part"],
  ["hg-after", "After you go live"],
  ["hg-cost", "What it costs"],
];

const HTML = `
<header class="hg-hero">
  <div class="hg-wrap hg-hero-grid">
    <div class="hg-hero-text">
      <p class="hg-eyebrow hg-rv">How it works</p>
      <h1 class="hg-h1 hg-rv" style="--k:1">Turning your factory into a virtual experience <span>has never been simpler.</span></h1>
      <p class="hg-lede hg-lede--q hg-rv" style="--k:2">Want potential global buyers to explore your factory without visiting in person?</p>
      <p class="hg-lede hg-rv" style="--k:2">It's simple. Choose your plan, our team contacts you to book a shoot, and our VPV expert captures your factory in 360° and turns it into an interactive virtual tour. Once ready, you can share it with buyers and let them explore your facility from anywhere.</p>
      <div class="hg-ctas hg-rv" style="--k:3">
        <a class="hg-btn" href="/plans" data-testid="hiw-cta">Find the Right VPV for Your Factory ${svg(I.arrow, 18, 2.2)}</a>
        <a class="hg-ghost" href="#hg-get">See what you get ${svg(I.down, 16, 2.2)}</a>
      </div>
    </div>
    <aside class="hg-facts hg-rv" style="--k:2" aria-label="The journey at a glance">
      <p class="hg-facts-t">The whole journey at a glance</p>
      <ul>
        <li><b>A few minutes</b><span>to get your plan and full price, online</span></li>
        <li><b>1 short meeting</b><span>with your MD and sales team</span></li>
        <li><b>1–5 hours</b><span>of shoot time while your factory keeps running</span></li>
        <li><b>1–3 weeks</b><span>after the shoot, your VPV is live</span></li>
      </ul>
    </aside>
  </div>
</header>
<nav class="hg-jump" aria-label="On this page"><div class="hg-wrap"><div class="hg-jump-row">${JUMP.map(([id, t]) => `<a href="#${id}">${t}</a>`).join("")}</div></div></nav>
${section("hg-steps", "The 5 steps", "You do the first two, online. We do the rest.", "Here is exactly what happens, who does it, and how long it takes.", stepsHtml)}
${section("hg-get", "What you get", "Everything that comes with your VPV", "Each card says which plans include it. Your plan decides how many areas, videos and reports you get.", getHtml, "hg-sec--mist")}
${section("hg-part", "Your part", "Your part is small. Really.", "", partHtml)}
${section("hg-after", "After you go live", "Using your VPV is as easy as sending a link", "", afterHtml, "hg-sec--mist")}
${section("hg-cost", "What it costs", "Every rupee, in plain words", `Nothing is hidden. Prices below are our special offer for the first ${LAUNCH_OFFER.limit} customers.`, costHtml)}
<section class="hg-end" aria-labelledby="hg-end-t"><div class="hg-wrap hg-end-in hg-rv">
  <h2 class="hg-h2" id="hg-end-t">That's all there is to it.</h2>
  <p class="hg-intro">Find your plan and see your price in a few minutes. No call needed.</p>
  <div class="hg-ctas"><a class="hg-btn hg-btn--light" href="/plans" data-testid="hiw-cta-end">Find the Right VPV for Your Factory ${svg(I.arrow, 18, 2.2)}</a>
  <a class="hg-ghost hg-ghost--light" href="${WHATSAPP.href}" target="_blank" rel="noopener">${svg(I.chat, 17)} Prefer to talk? ${WHATSAPP.label}</a></div>
</div></section>`;

let styled = false;

export function mount(host: HTMLElement): () => void {
  if (!styled) {
    const s = document.createElement("style");
    s.id = "hg-style";
    s.textContent = CSS;
    document.head.appendChild(s);
    styled = true;
  }
  const root = document.createElement("div");
  root.className = "hg";
  root.setAttribute("data-testid", "hiw-guide");
  root.innerHTML = HTML;
  host.appendChild(root);

  // Reveal each block as it scrolls into view. Without IntersectionObserver
  // (or with reduced motion, handled in CSS) everything simply shows.
  const items = Array.from(root.querySelectorAll<HTMLElement>(".hg-rv"));
  let io: IntersectionObserver | null = null;
  if ("IntersectionObserver" in window) {
    root.classList.add("hg-js");
    io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io?.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach((el) => io!.observe(el));
    const line = root.querySelector(".hg-steps");
    if (line) {
      const lo = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { line.classList.add("is-drawn"); lo.disconnect(); } }), { threshold: 0.05 });
      lo.observe(line);
    }
  }

  // The "on this page" bar sticks just under the site header.
  const header = () => document.getElementById("vpv-site-header");
  const setTop = () => root.style.setProperty("--hg-top", `${header()?.getBoundingClientRect().height ?? 0}px`);
  setTop();
  addEventListener("resize", setTop);

  // In-page links scroll smoothly and stay inside this page (the site is a
  // single-page app, so a plain #hash must not trigger its router).
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest?.("a[href^='#']") as HTMLAnchorElement | null;
    if (!a || !root.contains(a)) return;
    const target = root.querySelector<HTMLElement>(a.getAttribute("href")!);
    if (!target) return;
    e.preventDefault();
    const h = header();
    const jump = root.querySelector<HTMLElement>(".hg-jump");
    const off = (h ? h.getBoundingClientRect().height : 0) + (jump ? jump.offsetHeight : 0) + 12;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollTo({ top: target.getBoundingClientRect().top + scrollY - off, behavior: reduced ? "auto" : "smooth" });
  };
  root.addEventListener("click", onClick);

  const gone = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  gone.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    gone.disconnect();
    io?.disconnect();
    root.removeEventListener("click", onClick);
    removeEventListener("resize", setTop);
  }
  return dispose;
}
