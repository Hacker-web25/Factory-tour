/**
 * lib/site/planBilling.ts — two things above the plan cards (21 Nov 2026):
 *
 *  1. THE BILLING TOGGLE. "Annually" (the default) on the left, "Lifetime"
 *     on the right. Every plan card carries both prices (lib/site/bundleData
 *     NOV21_PRICE: .vpv-pa per month, billed yearly; .vpv-pl once, for life);
 *     the toggle sets html.vpv-life and the cards cross-fade between them, one
 *     after another. The choice is kept for the visit (sessionStorage
 *     "vpv.billing"), so the funnel opens on the same one.
 *
 *  2. THE FOUNDING OFFER (plans page only). The first 20 customers get four
 *     things — 3 months free, 50% off, free cab, their first 15 months of
 *     support free, and the ₹199 sales logins (22 Nov 2026: one tier, the
 *     first 20 only; there is no 21-to-30 tier any more). A live meter
 *     shows how many of the 20 places are left, from the same count the
 *     checkout prices with (GET /api/funnel/offer). Nothing on it is
 *     invented: no countdown, no made-up "people viewing". India's CCPA
 *     dark-pattern guidelines treat scarcity that is not backed by current,
 *     verifiable facts as false urgency; this one is the real count, and the
 *     meter is that count. Until the count loads the meter
 *     shows no number; if it cannot load, the block says "limited to the
 *     first 20 paid customers" without one. When the 20 places are gone the
 *     block disappears.
 *
 * Built outside the React bundle (like the plan chips in home.ts) and re-run
 * when the page redraws. All motion is off for visitors who ask for less.
 */

import {
  LAUNCH_OFFER,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  SUPPORT_MONTHLY_INR,
  inr,
} from "@/lib/pricing";
import { CAB_TRAVEL } from "@/lib/logistics";

const GOLD = "#E9C46A";

/**
 * The founding block (the navy-and-gold box above the cards) is HIDDEN since
 * 23 Nov 2026: its "worth ₹X to ₹Y" ranges confused buyers about what they
 * get free, so each card now lists its own free things under the price
 * (FREE_BLOCK in lib/site/bundleData.ts). The owner likes the box's style and
 * may bring it back: everything below (copy, CSS, meter, live count) is kept
 * as it was. Set this to true to show it again.
 */
export const SHOW_FOUNDING_BLOCK = false;

/* ─────────────── the figures the founding block quotes ─────────────── */

const monthly = SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].monthlyInr);
const freeMonths = LAUNCH_OFFER.freeMonths;
const firstMonths = 12 + freeMonths;
/** The 3 free months on a yearly plan, smallest plan to largest. */
const monthsWorth = `${inr(Math.min(...monthly) * freeMonths)} to ${inr(Math.max(...monthly) * freeMonths)}`;
/** The 50% off: a year of the smallest plan, up to the largest plan for life. */
const halfLow = Math.min(...SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].regularInr - SITE_PLANS[id].priceInr));
const halfHigh = Math.max(...SITE_PLAN_ORDER.map((id) => SITE_PLANS[id].regularLifetimeInr - SITE_PLANS[id].lifetimeInr));

/**
 * The most a founding customer can get free: on each plan, the 50% off, the
 * cab and the first 15 months of support (on a yearly plan also the 3 free
 * months of the plan itself); the biggest of those, which is White Glove for
 * life. It depends on the plan bought, so the block says "up to" and stars it.
 */
const freebies = SITE_PLAN_ORDER.flatMap((id) => {
  const p = SITE_PLANS[id];
  const shared = CAB_TRAVEL.amountInr + SUPPORT_MONTHLY_INR * firstMonths;
  return [
    p.regularInr - p.priceInr + p.monthlyInr * freeMonths + shared,
    p.regularLifetimeInr - p.lifetimeInr + shared,
  ];
});
const maxFree = Math.max(...freebies);

/** What the founding block says, worked out from lib/pricing.ts. */
export const FOUNDING_COPY = {
  maxFree,
  limit: LAUNCH_OFFER.limit,
  benefits: [
    {
      icon: "gift",
      tag: `First ${LAUNCH_OFFER.limit}`,
      title: `${freeMonths} months free`,
      body: `Your first year runs ${firstMonths} months for the price of 12.`,
      worth: `Worth ${monthsWorth}`,
    },
    {
      icon: "percent",
      tag: `First ${LAUNCH_OFFER.limit}`,
      title: `${LAUNCH_OFFER.percent}% off your plan`,
      body: "Every year you renew, or once, for life.",
      worth: `Saves ${inr(halfLow)} to ${inr(halfHigh)}`,
    },
    {
      icon: "car",
      tag: `First ${LAUNCH_OFFER.limit}`,
      title: "Complimentary factory visit",
      body: "Our team visits your factory at no additional travel cost.",
      worth: `Worth ${inr(CAB_TRAVEL.amountInr)}`,
    },
    {
      icon: "shield",
      tag: `First ${LAUNCH_OFFER.limit}`,
      title: `${firstMonths} months of support free`,
      body: "Hosting, security, backups and a real person to help.",
      worth: `Worth ${inr(SUPPORT_MONTHLY_INR * firstMonths)}`,
    },
  ],
};

/* ─────────────────────────────── styles ─────────────────────────────── */

export const PLAN_BILLING_CSS = [
  // ── the two prices on every card share one grid cell; one shows at a time
  ".vpv-pr{display:grid}.vpv-pa,.vpv-pl{grid-area:1/1;transition:opacity .42s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1),filter .42s;transition-delay:calc(var(--vpv-i,0)*55ms)}",
  ".vpv-pl{opacity:0;visibility:hidden;transform:translateY(12px);filter:blur(6px)}",
  "html.vpv-life .vpv-pa{opacity:0;visibility:hidden;transform:translateY(-12px);filter:blur(6px)}",
  "html.vpv-life .vpv-pl{opacity:1;visibility:visible;transform:none;filter:none}",
  ".vpv-pa,.vpv-pl{transition-property:opacity,transform,filter,visibility}",
  "html.vpv-life .vpv-pl .vpv-now{background:linear-gradient(100deg,#0b2a5b 0%,#0b2a5b 40%,#8A5A0E 52%,#0b2a5b 64%,#0b2a5b 100%);background-size:250% 100%;background-position:100% 0;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}",
  "html.vpv-life.vpv-life-in .vpv-pl .vpv-now{animation:vpvGleam 1.1s cubic-bezier(.22,1,.36,1) calc(var(--vpv-i,0)*55ms + .15s) 1 both}",
  "@keyframes vpvGleam{from{background-position:100% 0}to{background-position:0 0}}",
  ".vpv-pl .vpv-pm{-webkit-text-fill-color:#475569}",

  // ── the toggle
  ".vpv-bt-wrap{display:flex;flex-direction:column;align-items:center;margin:2rem auto 0;gap:.55rem}",
  ".vpv-bt{display:flex;align-items:center;justify-content:center;gap:14px;user-select:none;-webkit-user-select:none}",
  ".vpv-bt-opt{font:inherit;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:6px 4px;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:#7b8aa0;transition:color .35s}",
  ".vpv-bt-opt[aria-pressed=true]{color:#0b2a5b}",
  ".vpv-bt-opt:focus-visible{outline:2px solid #0b5cff;outline-offset:3px;border-radius:8px}",
  ".vpv-bt-chip{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;color:#5A3D00;background:linear-gradient(135deg,#FFF6DA,#F2D27E);box-shadow:inset 0 0 0 1px rgba(184,137,43,.4);transition:transform .45s cubic-bezier(.34,1.56,.64,1),box-shadow .45s}",
  ".vpv-bt.on .vpv-bt-chip{transform:scale(1.06);box-shadow:inset 0 0 0 1px rgba(184,137,43,.55),0 6px 14px -6px rgba(156,106,18,.6)}",
  ".vpv-bt-sw{position:relative;flex:none;width:66px;height:36px;padding:0;border:0;border-radius:999px;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}",
  ".vpv-bt-sw:focus-visible{outline:none;box-shadow:0 0 0 4px rgba(11,92,255,.22);border-radius:999px}",
  ".vpv-bt-track{position:absolute;inset:0;border-radius:999px;overflow:hidden;background:linear-gradient(135deg,#19B8F2 0%,#1468D8 52%,#0B3D91 100%);box-shadow:inset 0 2px 5px rgba(6,24,58,.35),0 10px 22px -10px rgba(20,104,216,.75);transition:box-shadow .5s}",
  ".vpv-bt-track::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,#FBE7A6 0%,#E0B14C 45%,#A8721A 100%);opacity:0;transition:opacity .5s cubic-bezier(.22,1,.36,1)}",
  ".vpv-bt.on .vpv-bt-track{box-shadow:inset 0 2px 5px rgba(90,61,0,.35),0 10px 22px -10px rgba(168,114,26,.8)}",
  ".vpv-bt.on .vpv-bt-track::before{opacity:1}",
  ".vpv-bt-track::after{content:'';position:absolute;top:-30%;bottom:-30%;left:-70%;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-18deg);opacity:0}",
  ".vpv-bt.flash .vpv-bt-track::after{animation:vpvSheen .8s cubic-bezier(.22,1,.36,1)}",
  "@keyframes vpvSheen{0%{left:-70%;opacity:1}100%{left:135%;opacity:1}}",
  ".vpv-bt-knob{position:absolute;top:3px;left:3px;width:30px;height:30px;transition:transform .62s cubic-bezier(.34,1.56,.64,1)}",
  ".vpv-bt.on .vpv-bt-knob{transform:translateX(30px)}",
  ".vpv-bt-knob>span{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#fff 0,#fff 55%,#edf1f7 100%);box-shadow:0 7px 14px -3px rgba(6,24,58,.5),0 1px 2px rgba(6,24,58,.25)}",
  ".vpv-bt.moving .vpv-bt-knob>span{animation:vpvSquish .62s cubic-bezier(.22,1,.36,1)}",
  "@keyframes vpvSquish{0%{transform:scale(1)}30%{transform:scale(1.3,.84)}62%{transform:scale(.93,1.07)}100%{transform:scale(1)}}",
  ".vpv-bt-knob svg{width:16px;height:16px;opacity:0;transform:scale(.4) rotate(-90deg);transition:opacity .35s .15s,transform .55s .1s cubic-bezier(.34,1.56,.64,1)}",
  ".vpv-bt.on .vpv-bt-knob svg{opacity:1;transform:none}",
  ".vpv-bt-spark{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:" + GOLD + ";box-shadow:0 0 6px rgba(233,196,106,.9);pointer-events:none;animation:vpvSpark .7s cubic-bezier(.22,1,.36,1) forwards}",
  "@keyframes vpvSpark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--x),var(--y)) scale(0);opacity:0}}",
  ".vpv-bt-cap{margin:0;min-height:1.2em;font-size:12.5px;font-weight:600;color:#64748b;transition:opacity .3s}",
  ".vpv-bt-cap.swap{opacity:0}",

  // ── the founding offer
  ".vpv-fo{position:relative;isolation:isolate;max-width:1240px;margin:1.75rem auto 0;border-radius:26px;padding:22px 24px;color:#fff;overflow:hidden;" +
    "background:radial-gradient(120% 160% at 0% 0%,#1A4FA6 0%,#0B2A5B 52%,#071A3B 100%);" +
    "box-shadow:0 34px 70px -34px rgba(7,26,59,.75),inset 0 0 0 1px rgba(233,196,106,.32)}",
  ".vpv-fo::before{content:'';position:absolute;inset:7px;border-radius:20px;border:1px solid rgba(233,196,106,.16);pointer-events:none}",
  ".vpv-fo::after{content:'';position:absolute;top:-40%;bottom:-40%;left:-40%;width:28%;background:linear-gradient(100deg,transparent,rgba(255,231,160,.16),transparent);transform:skewX(-18deg);pointer-events:none;opacity:0}",
  ".vpv-fo.seen::after{animation:vpvFoShine 1.6s cubic-bezier(.22,1,.36,1) .2s}",
  "@keyframes vpvFoShine{0%{left:-40%;opacity:1}100%{left:120%;opacity:1}}",
  ".vpv-fo-in{display:grid;gap:26px}",
  "@media (min-width:1100px){.vpv-fo-in{grid-template-columns:minmax(0,.95fr) minmax(0,2fr);align-items:center;gap:26px}.vpv-fo-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}",
  ".vpv-fo-eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:" + GOLD + "}",
  ".vpv-fo-eyebrow svg{width:16px;height:16px}",
  ".vpv-fo-h{margin:.45rem 0 0;font-size:clamp(1.3rem,1.8vw,1.6rem);line-height:1.18;font-weight:800;letter-spacing:-.02em;color:#fff}",
  ".vpv-fo-h em{font-style:normal;background:linear-gradient(100deg,#FBE7A6,#E9C46A 45%,#C99532);-webkit-background-clip:text;background-clip:text;color:transparent}",
  ".vpv-fo-big{margin:.3rem 0 0;font-size:clamp(2rem,3.4vw,2.7rem);line-height:1.05;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;background:linear-gradient(100deg,#FBE7A6,#E9C46A 45%,#C99532);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}",
  ".vpv-fo-big span{display:block;margin-bottom:.15rem;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;-webkit-text-fill-color:rgba(255,255,255,.78);color:rgba(255,255,255,.78)}",
  ".vpv-fo-big sup{font-size:.45em;vertical-align:.9em;margin-left:2px}",
  ".vpv-fo-p{margin:.5rem 0 0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.72);max-width:34rem}",
  ".vpv-fo-meter{margin-top:.9rem}",
  ".vpv-fo-seats{display:grid;grid-template-columns:repeat(20,12px);gap:4px}",
  ".vpv-fo-seat{width:12px;height:12px;border-radius:3.5px;box-shadow:inset 0 0 0 1.5px rgba(233,196,106,.55);background:rgba(233,196,106,.06)}",
  ".vpv-fo-seat.taken{background:linear-gradient(135deg,#FBE7A6,#D9A93C);box-shadow:0 0 0 1px rgba(255,231,160,.35),0 3px 8px -3px rgba(217,169,60,.8)}",
  ".vpv-fo.loading .vpv-fo-seat{animation:vpvSeatWait 1.4s ease-in-out infinite;animation-delay:calc(var(--k)*40ms)}",
  "@keyframes vpvSeatWait{50%{background:rgba(233,196,106,.2)}}",
  ".vpv-fo.seen .vpv-fo-seat.taken{animation:vpvSeatPop .5s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(var(--k)*45ms + .25s)}",
  "@keyframes vpvSeatPop{0%{transform:scale(.3);opacity:0}100%{transform:none;opacity:1}}",
  ".vpv-fo-count{margin:.5rem 0 0;font-size:13.5px;color:rgba(255,255,255,.82);min-height:1.3em}",
  ".vpv-fo-count b{font-size:20px;font-weight:800;color:" + GOLD + ";font-variant-numeric:tabular-nums}",
  ".vpv-fo-cta{display:inline-flex;align-items:center;gap:8px;margin-top:.9rem;padding:11px 19px;border-radius:999px;font-size:14.5px;font-weight:800;color:#3B2700;text-decoration:none;" +
    "background:linear-gradient(135deg,#FCEBB2 0%,#E9C46A 45%,#C9932E 100%);box-shadow:0 12px 26px -12px rgba(201,147,46,.9),inset 0 1px 0 rgba(255,255,255,.6);transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s}",
  ".vpv-fo-cta:hover{transform:translateY(-2px);box-shadow:0 18px 32px -14px rgba(201,147,46,.95),inset 0 1px 0 rgba(255,255,255,.6)}",
  ".vpv-fo-cta:focus-visible{outline:2px solid #fff;outline-offset:3px}",
  ".vpv-fo-terms{display:inline-block;margin:.9rem 0 0 14px;font-size:12.5px;color:rgba(255,255,255,.65);text-decoration:underline;text-underline-offset:3px}",
  ".vpv-fo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
  ".vpv-fo-b{position:relative;display:flex;flex-direction:column;padding:14px 14px 13px;border-radius:18px;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));box-shadow:inset 0 0 0 1px rgba(233,196,106,.22);transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s}",
  ".vpv-fo-b:hover{transform:translateY(-3px);box-shadow:inset 0 0 0 1px rgba(233,196,106,.45),0 18px 30px -20px rgba(0,0,0,.6)}",
  ".vpv-fo-b-top{display:flex;align-items:center;justify-content:space-between;gap:8px}",
  ".vpv-fo-ic{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,rgba(251,231,166,.22),rgba(201,147,46,.12));color:" + GOLD + ";box-shadow:inset 0 0 0 1px rgba(233,196,106,.35)}",
  ".vpv-fo-ic svg{width:19px;height:19px}",
  ".vpv-fo-tag{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;color:" + GOLD + ";box-shadow:inset 0 0 0 1px rgba(233,196,106,.4)}",
  ".vpv-fo-b h3{margin:.7rem 0 0;font-size:15px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:#fff}",
  ".vpv-fo-b p{margin:.3rem 0 0;font-size:12px;line-height:1.45;color:rgba(255,255,255,.66)}",
  ".vpv-fo-b .vpv-fo-worth{margin-top:auto;padding-top:.55rem;font-size:12.5px;font-weight:700;color:#F6DA92}",
  ".vpv-fo.seen .vpv-fo-b{animation:vpvFoIn .6s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--k)*90ms + .1s)}",
  "@keyframes vpvFoIn{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}",
  "@media (max-width:639px){.vpv-fo{padding:20px 16px;border-radius:22px}.vpv-fo-in{gap:18px}.vpv-fo-p{font-size:12.5px}.vpv-fo-grid{gap:8px}.vpv-fo-b{padding:11px 11px 10px;border-radius:15px}.vpv-fo-ic{width:30px;height:30px;border-radius:9px}.vpv-fo-ic svg{width:16px;height:16px}.vpv-fo-tag{font-size:9.5px;padding:2px 6px}.vpv-fo-b h3{margin-top:.5rem;font-size:14px}.vpv-fo-b p:not(.vpv-fo-worth){display:none}.vpv-fo-b .vpv-fo-worth{font-size:11.5px;padding-top:.35rem}.vpv-fo-seats{grid-template-columns:repeat(20,minmax(0,1fr));gap:3px}.vpv-fo-seat{width:auto;height:auto;aspect-ratio:1}.vpv-fo-cta{padding:10px 16px;font-size:14px}.vpv-bt-opt{font-size:14.5px}.vpv-bt{gap:10px}}",

  // ── the "Get MyVPV" button at the foot of each plan card (plans page only)
  ".vpv-pc-buy{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:1.25rem;padding:1rem 1.25rem;border-radius:999px;font-size:1.125rem;line-height:1.2;font-weight:800;letter-spacing:-.01em;color:#fff;text-decoration:none;text-align:center;" +
    "background:linear-gradient(135deg,#0B3D91 0%,#1468D8 55%,#19B8F2 100%);box-shadow:0 16px 30px -14px rgba(20,104,216,.85),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s,filter .25s}",
  ".vpv-pc-buy:hover{transform:translateY(-2px);filter:brightness(1.06);box-shadow:0 22px 36px -16px rgba(20,104,216,.95),inset 0 1px 0 rgba(255,255,255,.3)}",
  ".vpv-pc-buy:focus-visible{outline:3px solid #0B3D91;outline-offset:3px}",
  ".vpv-pc-buy svg{width:20px;height:20px;flex:none;transition:transform .25s cubic-bezier(.22,1,.36,1)}",
  ".vpv-pc-buy:hover svg{transform:translateX(3px)}",
  ".vpv-pc-gold .vpv-pc-buy{color:#3B2700;background:linear-gradient(135deg,#FCEBB2 0%,#E9C46A 45%,#C9932E 100%);box-shadow:0 16px 30px -14px rgba(201,147,46,.9),inset 0 1px 0 rgba(255,255,255,.6)}",
  ".vpv-pc-gold .vpv-pc-buy:hover{box-shadow:0 22px 36px -16px rgba(201,147,46,.95),inset 0 1px 0 rgba(255,255,255,.6)}",
  ".vpv-pc-gold .vpv-pc-buy:focus-visible{outline-color:#8A6612}",

  // ── less motion, if asked
  "@media (prefers-reduced-motion:reduce){.vpv-pa,.vpv-pl,.vpv-bt *,.vpv-fo,.vpv-fo *,.vpv-pc-buy,.vpv-pc-buy svg{transition:none!important;animation:none!important}.vpv-pc-buy:hover,.vpv-pc-buy:hover svg{transform:none}.vpv-pa,.vpv-pl{filter:none!important;transform:none!important}.vpv-fo::after{display:none}}",
].join("");

/* ─────────────────────────────── behaviour ─────────────────────────────── */

const ICONS: Record<string, string> = {
  gift: '<path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  car: '<path d="M5 17h14M6 17v2M18 17v2"/><path d="M3 13l2-6a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 6v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  crown: '<path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11z"/><path d="M4 21h16"/>',
  infinity: '<path d="M12 12c-2-2.7-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.3 6-4zm0 0c2 2.7 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.3-6 4z"/>',
};
const svg = (name: string, stroke = "currentColor") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const FOUNDING_HTML =
  `<div class="vpv-fo-in"><div>` +
  `<p class="vpv-fo-eyebrow">${svg("crown")}Founding ${FOUNDING_COPY.limit}</p>` +
  `<h2 class="vpv-fo-h" data-h>Our first ${FOUNDING_COPY.limit} factories get <em>four things free</em></h2>` +
  `<p class="vpv-fo-big" data-w><span>Worth up to</span> ${inr(FOUNDING_COPY.maxFree)}<sup>*</sup></p>` +
  `<p class="vpv-fo-p" data-p>*Varies depending upon the plan purchased.</p>` +
  `<div class="vpv-fo-meter"><div class="vpv-fo-seats" aria-hidden="true">${Array.from({ length: FOUNDING_COPY.limit }, (_, k) => `<span class="vpv-fo-seat" style="--k:${k}"></span>`).join("")}</div>` +
  `<p class="vpv-fo-count" data-count aria-live="polite"></p></div>` +
  `<a class="vpv-fo-cta" href="/assessment" data-testid="founding-cta">Claim a founding place <span aria-hidden="true">→</span></a>` +
  `<a class="vpv-fo-terms" href="/terms#special-offer">Offer terms</a>` +
  `</div><div class="vpv-fo-grid">` +
  FOUNDING_COPY.benefits
    .map(
      (b, k) =>
        `<article class="vpv-fo-b" style="--k:${k}">` +
        `<div class="vpv-fo-b-top"><span class="vpv-fo-ic">${svg(b.icon)}</span><span class="vpv-fo-tag">${b.tag}</span></div>` +
        `<h3>${b.title}</h3><p>${b.body}</p><p class="vpv-fo-worth">${b.worth}</p></article>`
    )
    .join("") +
  `</div></div>`;

const TOGGLE_HTML =
  `<div class="vpv-bt" role="group" aria-label="How you pay">` +
  `<button type="button" class="vpv-bt-opt" data-v="annual" aria-pressed="true">Annually</button>` +
  `<button type="button" class="vpv-bt-sw" role="switch" aria-checked="false" aria-label="Pay once, for life" data-testid="billing-switch">` +
  `<span class="vpv-bt-track"></span><span class="vpv-bt-knob"><span>${svg("infinity", "#A8721A")}</span></span></button>` +
  `<button type="button" class="vpv-bt-opt" data-v="lifetime" aria-pressed="false">Lifetime <span class="vpv-bt-chip">Pay once</span></button>` +
  `</div><p class="vpv-bt-cap" data-cap></p>`;

const BUY_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

const CAPTION = {
  annual: "Shown per month, billed yearly. Support, hosting & security billed yearly on every plan.",
  lifetime: "One payment, your plan for life. Support, hosting & security billed yearly on every plan.",
};

export const PLAN_BILLING_SCRIPT = String.raw`(function(){
  var KEY="vpv.billing",CAP=${JSON.stringify(CAPTION)},FO=${JSON.stringify(FOUNDING_HTML)},TG=${JSON.stringify(TOGGLE_HTML)},BTN_ARROW=${JSON.stringify(BUY_ARROW)};
  var LIM=${FOUNDING_COPY.limit},ON=${LAUNCH_OFFER.active && SHOW_FOUNDING_BLOCK ? "true" : "false"};
  var quiet=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var painted=null;
  function mode(){try{return sessionStorage.getItem(KEY)==="lifetime"?"lifetime":"annual"}catch(e){return "annual"}}
  function paint(m){
    var life=m==="lifetime",h=document.documentElement;h.classList.toggle("vpv-life",life);
    [].forEach.call(document.querySelectorAll(".vpv-bt"),function(t){t.classList.toggle("on",life);
      var sw=t.querySelector(".vpv-bt-sw");if(sw)sw.setAttribute("aria-checked",life?"true":"false");
      [].forEach.call(t.querySelectorAll(".vpv-bt-opt"),function(o){o.setAttribute("aria-pressed",o.getAttribute("data-v")===m?"true":"false")});
      var c=t.parentNode&&t.parentNode.querySelector("[data-cap]");if(c&&c.textContent!==CAP[m]){c.classList.add("swap");setTimeout(function(){c.textContent=CAP[m];c.classList.remove("swap")},quiet?0:180)}});
    [].forEach.call(document.querySelectorAll(".vpv-pa"),function(e){e.setAttribute("aria-hidden",life?"true":"false")});
    [].forEach.call(document.querySelectorAll(".vpv-pl"),function(e){e.setAttribute("aria-hidden",life?"false":"true")});
    [].forEach.call(document.querySelectorAll(".vpv-pc-buy"),function(a){a.setAttribute("href","/buy?plan="+a.getAttribute("data-plan")+"&billing="+m)});
    if(painted!==m){painted=m;try{window.dispatchEvent(new CustomEvent("vpv:billing",{detail:m}))}catch(e){}}
  }
  function sparks(t){if(quiet)return;var k=t.querySelector(".vpv-bt-knob");if(!k)return;for(var i=0;i<9;i++){var s=document.createElement("span"),a=(Math.PI*2*i)/9+Math.random()*.4,d=22+Math.random()*16;s.className="vpv-bt-spark";s.style.setProperty("--x",(Math.cos(a)*d).toFixed(1)+"px");s.style.setProperty("--y",(Math.sin(a)*d).toFixed(1)+"px");k.appendChild(s);setTimeout(function(n){return function(){n.remove()}}(s),760)}}
  function set(m){
    if(m===mode())return;try{sessionStorage.setItem(KEY,m)}catch(e){}
    var h=document.documentElement;
    if(m==="lifetime"&&!quiet){h.classList.remove("vpv-life-in");void h.offsetWidth;h.classList.add("vpv-life-in")}
    [].forEach.call(document.querySelectorAll(".vpv-bt"),function(t){if(quiet)return;t.classList.remove("flash","moving");void t.offsetWidth;t.classList.add("flash","moving");setTimeout(function(){t.classList.remove("flash","moving")},820);if(m==="lifetime")sparks(t)});
    paint(m);
  }
  function wire(t){
    t.querySelector(".vpv-bt-sw").addEventListener("click",function(){set(mode()==="lifetime"?"annual":"lifetime")});
    [].forEach.call(t.querySelectorAll(".vpv-bt-opt"),function(o){o.addEventListener("click",function(){set(o.getAttribute("data-v"))})});
  }
  function onPlans(){return location.pathname.replace(/\/+$/,"")==="/plans"}
  var offer=null,asked=false;
  function fill(b){
    var c=b.querySelector("[data-count]"),seats=b.querySelectorAll(".vpv-fo-seat");
    if(!offer){b.classList.add("loading");return}
    b.classList.remove("loading");
    if(offer.failed){c.textContent="Limited to our first "+LIM+" paid customers.";b.querySelector(".vpv-fo-meter").firstChild.style.display="none";return}
    if(!offer.open||!offer.founding){b.style.display="none";return}
    var left=Math.max(0,offer.foundingRemaining|0),taken=LIM-left;
    for(var i=0;i<seats.length;i++)seats[i].classList.toggle("taken",i<taken);
    c.innerHTML="<b>"+left+"</b> of "+LIM+" founding places left"
  }
  function ask(){
    if(asked)return;asked=true;
    fetch("/api/funnel/offer",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
      offer=(d&&typeof d.open==="boolean"&&typeof d.foundingRemaining==="number")?d:{failed:true,open:true};
      [].forEach.call(document.querySelectorAll(".vpv-fo"),fill);
    }).catch(function(){offer={failed:true,open:true};[].forEach.call(document.querySelectorAll(".vpv-fo"),fill)});
  }
  function seen(b){
    if(!("IntersectionObserver" in window)){b.classList.add("seen");return}
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){b.classList.add("seen");io.disconnect()}})},{threshold:.25});io.observe(b);
  }
  function fix(){try{
    [].forEach.call(document.querySelectorAll(".vpv-plans-grid"),function(g){
      var par=g.parentNode;if(!par)return;
      [].forEach.call(g.children,function(c,i){c.style.setProperty("--vpv-i",i)});
      if(!par.querySelector(":scope > .vpv-bt-wrap")){
        var w=document.createElement("div");w.className="vpv-bt-wrap";w.innerHTML=TG;
        var before=g.previousElementSibling&&g.previousElementSibling.className==="vpv-pj"?g.previousElementSibling:g;
        par.insertBefore(w,before);wire(w.querySelector(".vpv-bt"));
      }
      if(onPlans())[].forEach.call(g.children,function(c){
        var id=(c.getAttribute("data-testid")||"").replace(/^plans-page-card-/,"");
        if(!id||id===c.getAttribute("data-testid")||c.querySelector(":scope > .vpv-pc-buy"))return;
        var a=document.createElement("a");a.className="vpv-pc-buy";a.setAttribute("data-plan",id);a.setAttribute("data-testid","plans-page-buy-"+id);a.setAttribute("href","/buy?plan="+id+"&billing="+mode());
        a.innerHTML="Get MyVPV "+BTN_ARROW;c.appendChild(a);c.classList.add("vpv-pc-hasbuy");
      });
      if(ON&&onPlans()&&!par.querySelector(":scope > .vpv-fo")){
        var b=document.createElement("section");b.className="vpv-fo loading";b.setAttribute("aria-label","Founding offer");b.setAttribute("data-testid","founding-offer");b.innerHTML=FO;
        par.insertBefore(b,par.querySelector(":scope > .vpv-bt-wrap"));fill(b);seen(b);ask();
      }
    });
    paint(mode());
  }catch(e){}}
  var due=false;function soon(){if(due)return;due=true;setTimeout(function(){due=false;fix()},70)}
  if(document.readyState!=="loading")fix();else document.addEventListener("DOMContentLoaded",fix);
  try{new MutationObserver(soon).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
})();`;
