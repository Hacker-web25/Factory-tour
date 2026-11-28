/**
 * The myvpv.com marketing site.
 *
 * It is a pre-built single-page app: JS and CSS in /public/static, images
 * in /public/img and /public/assets. This file holds its HTML shell and
 * adds two things the build itself does not carry:
 *
 *   1. The search-engine and social head — title, description, canonical,
 *      Open Graph, Twitter card, favicons, and the Organization record on
 *      the front page. The build ships a bare four-tag head, so without
 *      this every page would share one title and no canonical.
 *   2. The shared site header (lib/site/header.ts). The build's own header
 *      is hidden; the one every page of myvpv.com uses (marketing and app
 *      pages alike) is written into the shell above the app instead.
 *   3. The payment bridge. The site ships its own pay button that takes
 *      no money ("TEST MODE … coming soon"), because the build has no
 *      back end. The button — and all of its field + terms validation —
 *      is kept; only its click is intercepted, so the real Razorpay
 *      checkout opens right there against the server that prices the
 *      order. See lib/site/payBridge.ts.
 *
 * The app's own footer carries the company identity and all seven policy
 * links, so nothing is injected there.
 *
 * Asset and favicon paths are ABSOLUTE ("/static/…", not "./static/…").
 * The site serves deep paths such as /assessment/price, where a relative
 * path would resolve against /assessment/ and 404.
 *
 * Served by app/route.ts (for "/") and app/<path>/route.ts for the rest,
 * all through lib/site/route.ts. The page list lives in lib/site/pages.ts.
 *
 * To ship a new build of the site: replace the files in /public/static,
 * /public/img and /public/assets, then update JS_SRC and CSS_HREF below
 * to the new hashed file names.
 */

import { sitePage } from "@/lib/site/pages";
import { AOA_HINT, LAUNCH_OFFER, SITE_PLANS, SITE_PLAN_DISPLAY_ORDER } from "@/lib/pricing";
import { SERVICE_CITY_LIST } from "@/lib/logistics";
import { PAY_BRIDGE_SCRIPT } from "@/lib/site/payBridge";
import { measureScriptTag } from "@/lib/site/measure";
import { welcomeGateTag } from "@/lib/welcome/gate";
import { SITE_HEADER_CSS, SITE_HEADER_FONT_HREF, SITE_HEADER_SCRIPT, siteHeaderHtml } from "@/lib/site/header";
import { SITE_PATHS } from "@/lib/site/paths";
import { PLAN_ROWS } from "@/lib/site/bundleData";
import { PLAN_BILLING_CSS, PLAN_BILLING_SCRIPT } from "@/lib/site/planBilling";

const SITE = "https://myvpv.com";
const JS_SRC = "/static/js/main.b1cbd1b3.js";
const CSS_HREF = "/static/css/main.cceb61ff.css";
/** Brand blue, taken from .btn-primary in the build's stylesheet. */
const BRAND = "#0b5cff";

/** The two faces used only on the plan cards: Fraunces for the plan names,
 *  and the brush script Ms Madi for White Glove, the gold plan. */
const PLAN_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Ms+Madi&display=swap";

/** How many grid rows sit above a card's feature list: name, price, AOAs. */
const PLAN_CARD_HEAD_ROWS = 3;

/**
 * The plan card (21 Nov 2026), top to bottom: the plan's name (a serif, or
 * a script on White Glove); the PRICE PER MONTH — the struck regular price
 * per month with the 50% offer tag, then the offer price per month, the
 * largest figure on the card so the eye goes straight to it, then what one
 * year is billed at; then the AOAs, smaller than the price; then the
 * features. No factory area and no cost per AOA.
 *
 * All the cards sit in ONE row on a laptop; tablets and phones swipe through
 * them, with plan chips on phones.
 *
 * White Glove: an ivory card in a fine double gold frame, the name in a
 * deep, solid antique gold script. Nothing moves or shines.
 */
const PLAN_CARD_CSS = [
  ".vpv-pc-tag{display:none}",
  // VPV Premium, the most popular plan: a brand-blue frame, a soft blue wash, a halo that breathes, and a tag on the top edge.
  ".vpv-pc-pop{border-color:#0b5cff!important;background:linear-gradient(180deg,#EAF2FF 0%,#F6FAFF 22%,#fff 55%)!important;box-shadow:inset 0 0 0 1px #0b5cff,0 0 0 4px rgba(11,92,255,.10),0 26px 54px -28px rgba(11,92,255,.6)!important}",
  ".vpv-pc-pop::before{content:'';position:absolute;inset:-7px;border-radius:calc(1rem + 7px);border:2px solid rgba(11,92,255,.35);pointer-events:none;opacity:.55}",
  ".vpv-pc-poptag{position:absolute;top:0;left:50%;transform:translate(-50%,-50%);z-index:2;display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;padding:.34rem .9rem;border-radius:999px;background:linear-gradient(135deg,#0b2a5b 0%,#0b5cff 100%);color:#fff;font-size:.72rem;line-height:1;font-weight:800;letter-spacing:.09em;text-transform:uppercase;box-shadow:0 6px 16px -6px rgba(11,92,255,.7),0 0 0 3px #fff}",
  ".vpv-pc-poptag::before{content:'\\2605';font-size:.8rem;letter-spacing:0;color:#FFD66B}",
  "@media (prefers-reduced-motion:no-preference){.vpv-pc-pop::before{animation:vpv-pop-glow 2.8s ease-in-out infinite}@keyframes vpv-pop-glow{0%,100%{opacity:.25}50%{opacity:.95}}}",
  ".vpv-pc-name{margin:0;font-family:Fraunces,Georgia,'Times New Roman',serif;font-optical-sizing:auto;font-size:clamp(1.25rem,1.6vw,1.6rem);line-height:1.15;font-weight:700;letter-spacing:-.012em;color:#0b2a5b}",
  // the price: struck per month + offer tag, the big offer price per month, the yearly bill
  ".vpv-pc-price{margin-top:.9rem}",
  // 23 Nov 2026: what the buyer gets free, under the price. One line each:
  // the label, what it is worth struck through, a green FREE. Then one total.
  ".vpv-free{margin:.85rem 0 0;padding:.7rem .8rem .75rem;border-radius:14px;background:linear-gradient(180deg,#F0FDF4,#F7FEF9);box-shadow:inset 0 0 0 1px #CDEFD9}",
  ".vpv-free-h{margin:0 0 .4rem;font-size:.6875rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#15803d}",
  ".vpv-free ul{list-style:none;margin:0;padding:0;display:grid;gap:.3rem}",
  ".vpv-fr{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:baseline;gap:.5rem;font-size:.875rem;line-height:1.3}",
  ".vpv-fr-l{font-weight:700;color:#0b2a5b}",
  ".vpv-fr-w{font-weight:700;color:#64748b;text-decoration:line-through;text-decoration-color:#e11d2e;text-decoration-thickness:2px;font-variant-numeric:tabular-nums}",
  ".vpv-fr-f{font-size:.75rem;font-weight:900;letter-spacing:.06em;color:#16a34a}",
  ".vpv-save{margin:.55rem 0 0;padding-top:.5rem;border-top:1px dashed #BBE5C9;font-size:.875rem;font-weight:600;color:#166534}",
  ".vpv-save b{font-size:1.125rem;font-weight:800;letter-spacing:-.01em;color:#15803d;font-variant-numeric:tabular-nums}",
  ".vpv-save-life{display:none}html.vpv-life .vpv-save-life{display:block}html.vpv-life .vpv-save-yr,html.vpv-life .vpv-fr-yr{display:none}",
  ".vpv-pc-gold .vpv-free{background:linear-gradient(180deg,#FFFBEB,#FFFDF5);box-shadow:inset 0 0 0 1px #F1DFA8}",
  ".vpv-pc-gold .vpv-save{border-top-color:#EAD28F}",
  "@media (max-width:480px){.vpv-free{padding:.6rem .65rem .65rem}.vpv-fr{font-size:.78rem;gap:.35rem}.vpv-fr-f{font-size:.6875rem}}",
  ".vpv-pc .vpv-was{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .5rem;margin:0}",
  // 22 Nov 2026: the struck regular price is the bigger figure and the offer price
  // the smaller, so the eye reads what the buyer is saving first.
  ".vpv-pc .vpv-was .vpv-strike{font-size:clamp(1.9rem,2.5vw,2.5rem);line-height:1.05;font-weight:800;letter-spacing:-.03em;color:#475569;text-decoration:none;position:relative;display:inline-block;font-variant-numeric:tabular-nums}",
  // one red line through the whole struck price, "/month" included
  ".vpv-pc .vpv-was .vpv-strike::after{content:\"\";position:absolute;left:-1px;right:-1px;top:54%;height:3px;border-radius:2px;background:#e11d2e;transform:rotate(-1deg)}",
  ".vpv-pc .vpv-was{flex-direction:column;align-items:flex-start}.vpv-pc .vpv-off{order:-1;white-space:nowrap}",
  ".vpv-pc .vpv-now{margin:.35rem 0 0;font-size:clamp(1.5rem,1.9vw,1.9rem);line-height:1;font-weight:600;letter-spacing:-.025em;color:#0b2a5b;font-variant-numeric:tabular-nums}",
  ".vpv-pm{margin-left:.2rem;font-size:.8125rem;font-weight:600;letter-spacing:0;color:#475569}",
  ".vpv-pc .vpv-strike .vpv-pm{font-size:.9375rem;font-weight:700;letter-spacing:0}",
  ".vpv-billed{margin:.45rem 0 0;font-size:.8125rem;line-height:1.35;font-weight:600;color:#64748b}",
  // the AOAs, with the support block (a shield, its price and the free months) to the right of them
  ".vpv-pc-aoa{margin-top:.9rem;padding-top:.85rem;border-top:1px solid #e8eef6}.vpv-pc-aoa>p:first-child{margin:0;display:flex;align-items:center;font-size:1.25rem;line-height:1.2;font-weight:800;letter-spacing:-.01em;color:" + BRAND + "}",
  // the gold plan
  ".vpv-pc-gold{border:1px solid #CDAA5C!important;background:linear-gradient(180deg,#FFFCF3 0%,#FFFDF8 45%,#fff 100%)!important;box-shadow:inset 0 0 0 4px #fff,inset 0 0 0 5px rgba(196,160,80,.45),0 24px 50px -30px rgba(110,80,20,.5)!important}",
  ".vpv-pc-gold .vpv-pc-name{font-family:'Ms Madi','Segoe Script','Apple Chancery',cursive;font-weight:400;font-size:clamp(1.7rem,2.1vw,2.2rem);line-height:1;letter-spacing:.01em;white-space:nowrap;color:#6F4E10;-webkit-text-stroke:.4px #6F4E10;text-shadow:0 1px 0 rgba(255,255,255,.8);padding:.06em 0 .04em}",
  ".vpv-pc-aoa{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:.8rem}",
  ".vpv-pc-care{display:flex;gap:.55rem;align-items:flex-start;padding-left:.8rem;border-left:1px solid #e3eaf4}",
  ".vpv-care-ic{flex:none;margin-top:.1rem;color:" + BRAND + "}",
  ".vpv-pc-aoa .vpv-care-t{margin:0;font-size:.78rem;line-height:1.25;font-weight:800;color:#0b2a5b}",
  ".vpv-pc-aoa .vpv-care-n{margin:.2rem 0 0;font-size:.72rem;line-height:1.3;font-weight:500;color:#475569}",
  ".vpv-care-free{font-weight:800;color:#16a34a}",
  ".vpv-pc-gold .vpv-pc-aoa{border-top-color:#EFE3C4}.vpv-pc-gold .vpv-pc-care{border-left-color:#EFE3C4}.vpv-pc-gold .vpv-care-ic{color:#8A6612}",
  // the Sales Team note under the plans
  ".vpv-sales-note{color:" + BRAND + ";font-weight:600}",
  ".vpv-pc-gold .vpv-billed{color:#7a6a4f}",
  // one row on a laptop: a column per plan on sale (three since 27 Nov 2026) in a slightly narrower strip than four used
  "@media (min-width:1024px){.vpv-plans-grid{grid-template-columns:repeat(" + SITE_PLAN_DISPLAY_ORDER.length + ",minmax(0,1fr))!important;gap:0 1rem!important;margin-left:50%;transform:translateX(-50%);width:min(" + (SITE_PLAN_DISPLAY_ORDER.length >= 4 ? 1320 : 1180) + "px,calc(100vw - 32px))}.vpv-plans-grid>*{grid-column:auto!important;grid-template-columns:minmax(0,1fr);padding:1.4rem 1.3rem!important}.vpv-plans-grid>*>ul{font-size:.875rem;line-height:1.4}.vpv-plans-grid .vpv-gold-line{font-size:.9375rem}}",
  // tablets and phones swipe
  ".vpv-pj{display:none}",
  "@media (max-width:1023px){.vpv-pj{display:flex;gap:.5rem;overflow-x:auto;margin:1.5rem -1rem -1.25rem;padding:.25rem 1rem .5rem;scrollbar-width:none}.vpv-pj::-webkit-scrollbar{display:none}" +
    ".vpv-pj button{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:.45rem .8rem;border-radius:12px;border:1px solid #dbe4f0;background:#fff;font:inherit;color:#0b2a5b;cursor:pointer}" +
    ".vpv-pj button b{font-size:.8125rem;font-weight:800}.vpv-pj button span{font-size:.6875rem;font-weight:600;color:#64748b;white-space:nowrap}" +
    ".vpv-pj button[aria-current=true]{border-color:" + BRAND + ";background:#eef4ff;box-shadow:0 0 0 2px rgba(11,92,255,.15)}" +
    ".vpv-pj button.gold{border-color:#CDAA5C;background:#FFFCF3}.vpv-pj button.gold b{color:#7E5A16}.vpv-pj button.gold[aria-current=true]{box-shadow:0 0 0 2px rgba(196,160,80,.35)}}",
  "@media (max-width:1023px){.vpv-plans-grid{display:flex!important;overflow-x:auto;scroll-snap-type:x mandatory;gap:.75rem!important;margin-left:-1rem;margin-right:-1rem;padding:1rem 1rem 1rem;scroll-padding:0 1rem;scrollbar-width:none}.vpv-plans-grid::-webkit-scrollbar{display:none}.vpv-plans-grid>*{flex:0 0 86%;scroll-snap-align:start;padding:1.25rem!important}.vpv-pc-name{font-size:1.6rem}.vpv-pc-gold .vpv-pc-name{font-size:2.3rem}.vpv-pc .vpv-now{font-size:2.75rem}}",
  "@media (min-width:640px) and (max-width:1023px){.vpv-plans-grid>*{flex-basis:46%}}",
].join("");

const OG_IMAGE = `${SITE}/vpv-icon-512.png`;

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * schema.org Organization, front page only. Repeating it on every page
 * would assert the same entity a dozen times over.
 */
const ORGANIZATION_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "VPV - Virtual Plant Visit",
  alternateName: "VPV",
  url: `${SITE}/`,
  logo: OG_IMAGE,
  slogan: "Real Factories. Real Confidence.",
  description:
    "VPV (Virtual Plant Visit) lets buyers explore your real factory online, before a physical visit, so the sales conversation does not have to wait for the visit.",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+91-98183-72742",
    contactType: "sales",
    areaServed: "IN",
    availableLanguage: ["en"],
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "702, Tower 3, Vipul Greens, Sector 48, Sohna Road",
    addressLocality: "Gurugram",
    addressRegion: "Haryana",
    postalCode: "122018",
    addressCountry: "IN",
  },
  parentOrganization: {
    "@type": "Organization",
    name: "The Next Design",
    url: "https://www.thenextdesign.com",
  },
});

/**
 * What we sell, with the real prices, as structured data.
 *
 * This is the block an AI assistant reads when a manufacturer asks it
 * "who does virtual factory tours in India and what does it cost". A
 * recommendation it cannot price is a recommendation it rarely makes, so
 * the offers are generated from lib/pricing.ts — the same constants the
 * checkout charges from, which means they cannot quietly go stale.
 */
function serviceLd(): string {
  const offers = SITE_PLAN_DISPLAY_ORDER.map((id) => {
    const p = SITE_PLANS[id];
    const price = LAUNCH_OFFER.active
      ? Math.round((p.regularInr * (100 - LAUNCH_OFFER.percent)) / 100)
      : p.regularInr;
    // Billed yearly: one year's price, with the unit stated, so nobody
    // reads the yearly charge as a one-time fee.
    return {
      "@type": "Offer",
      name: p.name,
      description: p.tagline,
      price: String(price),
      priceCurrency: "INR",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(price),
        priceCurrency: "INR",
        unitCode: "ANN",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "ANN" },
      },
      url: `${SITE}/plans`,
      availability: "https://schema.org/InStock",
      ...(LAUNCH_OFFER.active
        ? { priceValidUntil: "2027-03-31", description: `${p.tagline} ${LAUNCH_OFFER.label}.` }
        : {}),
    };
  });

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Service",
    name: "VPV - Virtual Plant Visit",
    serviceType: "360 virtual factory tour production and hosting",
    provider: { "@type": "Organization", name: "VPV - Virtual Plant Visit", url: `${SITE}/` },
    areaServed: { "@type": "Country", name: "India" },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: `${SITE}/assessment`,
      servicePhone: "+91-98183-72742",
    },
    description:
      `A filmed 360 walkthrough of your factory that buyers anywhere can explore before they visit, ` +
      `with process videos, information hotspots and controlled sharing. Shot on site in ${SERVICE_CITY_LIST}.`,
    offers,
  });
}

/** schema.org for the site itself, so search engines name it correctly. */
const WEBSITE_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "VPV - Virtual Plant Visit",
  url: `${SITE}/`,
  publisher: { "@type": "Organization", name: "VPV - Virtual Plant Visit" },
  inLanguage: "en-IN",
});

/**
 * Chrome occasionally throws a DataCloneError from structuredClone on a
 * PerformanceServerTiming entry. It is harmless and nothing in the app
 * can act on it, but it reaches window.onerror and shows up as a page
 * error. Swallow only that one.
 */
const ERROR_GUARD = String.raw`window.addEventListener("error",function(e){e.error instanceof DOMException&&"DataCloneError"===e.error.name&&e.message&&e.message.includes("PerformanceServerTiming")&&(e.stopImmediatePropagation(),e.preventDefault())},!0)`;


/**
 * The payment bridge (lib/site/payBridge.ts) keeps the site's own
 * validated Pay button and intercepts its click to run the real Razorpay
 * flow inline — so the gateway opens on the site's price page itself, not
 * on a second screen. See that file for the full rationale.
 */

/**
 * VPV is reached on ONE address (COMPANY.emails.support). The compiled
 * marketing site still has an older billing@ address baked into its
 * bundle, which we cannot edit from here, so any other @myvpv.com
 * address it prints is rewritten to the single one — in the link and in
 * the visible text. Purely cosmetic: if it ever fails, the page simply
 * shows the address the bundle shipped with.
 */
const ONE_EMAIL_SCRIPT = String.raw`(function(){
  var ONE="support@myvpv.com";
  var RE=/[A-Za-z0-9._%+-]+@myvpv\.com/g;
  function norm(t){return t.replace(RE,function(m){return m.toLowerCase()===ONE?m:ONE});}
  function fix(){try{
    var as=document.querySelectorAll('a[href^="mailto:"]');
    for(var i=0;i<as.length;i++){var h=as[i].getAttribute("href")||"";var nh=norm(h);if(nh!==h)as[i].setAttribute("href",nh);}
    var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n;
    while(n=w.nextNode()){var v=n.nodeValue;if(!v||v.indexOf("@myvpv.com")<0)continue;var nv=norm(v);if(nv!==v)n.nodeValue=nv;}
  }catch(e){}}
  if(document.readyState!=="loading")fix();else document.addEventListener("DOMContentLoaded",fix);
  try{var mo=new MutationObserver(function(){fix()});mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
})();`;

/**
 * The funnel hand-off.
 *
 * /assessment and its steps used to be screens of this single-page app. They
 * are now real app pages (app/assessment/), because every step of the funnel
 * talks to the server — the lead row, the city logistics table, the e-mail
 * code, the priced order — and a static bundle can do none of that.
 *
 * The site's own router still believes it owns those paths, so a click on one
 * of its "Find my plan" links would push history and render nothing. This
 * listener runs in the CAPTURE phase, so it pre-empts the site's router, and
 * turns any such click into a real navigation.
 *
 * It acts on every same-origin link whose path the site does NOT own (the
 * funnel, /why-vpv, /about, /login, the policies …), so none of them can
 * render as an empty page inside the site; it leaves modified clicks (new
 * tab, new window, download) and in-page #anchors to the browser. If the site is ever rebuilt without those links,
 * this does nothing at all rather than breaking anything.
 */
const FUNNEL_BRIDGE_SCRIPT = String.raw`(function(){var SPA=${JSON.stringify(SITE_PATHS)};function own(u){var p=u.pathname.replace(/\/+$/,"")||"/";return SPA.indexOf(p)>=0}document.addEventListener("click",function(e){if(e.defaultPrevented)return;if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;if(a.target&&a.target!=="_self")return;if(a.hasAttribute("download"))return;var href=a.getAttribute("href")||"";if(href.charAt(0)==="#")return;var u;try{u=new URL(href,window.location.origin)}catch(_){return}if(u.origin!==window.location.origin)return;if(own(u))return;e.preventDefault();e.stopPropagation();window.location.assign(u.href)},true)})();`


/**
 * The homepage hero (see the "Homepage, October 2026" patches in
 * lib/site/bundleData.ts). The bundle's own stylesheet has no grid
 * placement classes, so the layout lives here, keyed on data-testid:
 *
 *   phone    heading → the live tour → the two buttons
 *   desktop  heading and buttons on the left, the live tour on the right
 *            across both rows, a little wider than before
 */
const HOME_CSS = `[data-testid="hero-experience"]{position:relative;width:100%;height:clamp(420px,64vh,560px);border-radius:24px;overflow:hidden;background:#0B1220;box-shadow:0 30px 65px rgba(20,104,216,.22);isolation:isolate}\
[data-testid="hero-experience"] iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}\
[data-testid="hero-case-study"]{text-align:left;gap:.75rem;line-height:1.25;justify-content:flex-start}\
.vpv-cs-text{display:flex;flex-direction:column}.vpv-cs-text b{font-size:15px;color:#0f172a}.vpv-cs-text small{font-size:12.5px;font-weight:600;color:${BRAND};margin-top:2px}\
.vpv-play{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:9999px;background:${BRAND};flex:none;box-shadow:0 0 0 4px rgba(20,104,216,.14)}\
.vpv-play::after{content:"";margin-left:3px;border-left:9px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent}\
@media (max-width:1023px){div:has(>[data-testid="hero-experience"]){gap:1.5rem;padding-top:2rem}}\
@media (min-width:1024px){div:has(>[data-testid="hero-experience"]){grid-template-columns:1fr 1.2fr;row-gap:2rem;align-items:stretch}\
[data-testid="hero-text"]{grid-column:1;grid-row:1;align-self:end}\
[data-testid="hero-ctas"]{grid-column:1;grid-row:2;align-self:start;flex-direction:row;flex-wrap:wrap;align-items:center}\
[data-testid="hero-experience"]{grid-column:2;grid-row:1/span 2;height:clamp(520px,76vh,680px)}}\
@media (max-width:639px){.vpv-tagline{font-size:8px;letter-spacing:.2em;white-space:nowrap}}\
.vpv-gold-line{font-weight:800;color:#7A5200;font-size:1rem;line-height:1.35}\
li:has(>.vpv-gold-line)>svg{color:#C8920F;width:1.15rem;height:1.15rem;margin-top:.2rem}\
\
\
@media (min-width:1024px){.vpv-plans-grid>*{display:grid!important;grid-template-rows:subgrid;grid-row:span ${PLAN_CARD_HEAD_ROWS + PLAN_ROWS};row-gap:0}.vpv-plans-grid{row-gap:0!important}.vpv-plans-grid>*{margin-bottom:1rem}.vpv-plans-grid>*>ul{display:grid;grid-template-rows:subgrid;grid-row:span ${PLAN_ROWS};margin-top:1.25rem}}\
.vpv-strike{color:#0f172a;text-decoration:line-through;text-decoration-color:#e11d2e;text-decoration-thickness:2px}\
.vpv-was{margin:0}.vpv-was .vpv-strike{font-size:1.5rem;line-height:1.15;font-weight:800;letter-spacing:-.02em;text-decoration-thickness:3px}\
.vpv-now-row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:.4rem}\
.vpv-now{margin:0;font-size:1.125rem;line-height:1.3;font-weight:800;color:#0b2a5b}\
.vpv-no{color:#94a3b8}.vpv-no-ic{flex:none;margin-top:.125rem;color:#e5484d}\
${PLAN_CARD_CSS}\
${PLAN_BILLING_CSS}\
.vpv-aoa-q{position:relative;display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;margin-left:6px;border:1px solid #94a3b8;border-radius:999px;font-size:11px;font-weight:700;line-height:1;color:#64748b;cursor:help;vertical-align:middle;-webkit-text-fill-color:currentColor}\
.vpv-aoa-q:hover,.vpv-aoa-q:focus{border-color:#1468D8;color:#1468D8;outline:none;z-index:30}\
.vpv-aoa-tip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);width:230px;padding:10px 12px;border:1px solid #dbe4f0;border-radius:12px;background:#fff;color:#0b1b33;-webkit-text-fill-color:#0b1b33;font-size:12.5px;font-weight:400;line-height:1.5;text-align:left;letter-spacing:0;text-transform:none;white-space:normal;box-shadow:0 18px 40px -16px rgba(7,22,48,.45);opacity:0;pointer-events:none;transition:opacity .15s}\
.vpv-aoa-q:hover>.vpv-aoa-tip,.vpv-aoa-q:focus>.vpv-aoa-tip{opacity:1}\
@keyframes vpvGold{0%{background-position:0% center}100%{background-position:220% center}}\
#vpv-focus{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,14,30,.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:vpvFocusIn .35s ease-out both}\
#vpv-focus .vf-card{position:relative;width:min(100%,calc((100vh - 170px) * 16 / 9),1100px)}\
#vpv-focus .vf-frame{position:relative;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 30px 90px rgba(0,0,0,.5)}\
#vpv-focus iframe{position:absolute;inset:0;width:100%;height:100%;border:0}\
#vpv-focus .vf-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px;color:#fff;font-family:inherit}\
#vpv-focus .vf-top b{display:block;font-size:17px}#vpv-focus .vf-top span{font-size:13px;opacity:.75}\
#vpv-focus button{font:inherit;cursor:pointer;border:0}\
#vpv-focus .vf-x{flex:none;width:40px;height:40px;border-radius:9999px;background:rgba(255,255,255,.14);color:#fff;font-size:20px;line-height:40px}\
#vpv-focus .vf-x:hover{background:rgba(255,255,255,.26)}\
#vpv-focus .vf-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:14px}\
#vpv-focus .vf-sound{padding:11px 20px;border-radius:9999px;background:#fff!important;color:#0B3D91;font-weight:700;font-size:14px}\
#vpv-focus .vf-skip{padding:11px 18px;border-radius:9999px;background:transparent!important;color:#fff;font-size:14px;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)}\
#vpv-focus:focus{outline:none}\
@keyframes vpvFocusIn{from{opacity:0}to{opacity:1}}\
.vpv-cs-hero{display:grid;gap:2.25rem}\
.vpv-cs-hero-text{max-width:46rem}\
.vpv-cs-logos{display:block;width:100%;height:auto;border-radius:28px;box-shadow:0 28px 60px -28px rgba(11,61,145,.28)}\
.vpv-plans-nudge{margin-top:3rem;padding:2rem;border-radius:24px;background:linear-gradient(135deg,#F4F8FF 0%,#E8F1FF 100%);border:1px solid rgba(11,92,255,.14)}\
.vpv-pn-title{font-size:1.5rem;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:#0b2a5b}\
.vpv-pn-text{margin-top:.5rem;max-width:40rem;font-size:1.0625rem;line-height:1.6;color:#475569}\
.vpv-pn-text b{color:#0b5cff;font-weight:700}\
@media (min-width:640px){.vpv-plans-nudge{padding:2.25rem 2.5rem}.vpv-pn-title{font-size:1.875rem}}\
@media (prefers-reduced-motion:reduce){#vpv-focus{animation:none}}`;

/**
 * /case-studies opens on Anuj Anand's story, full screen and already
 * playing. Browsers only autoplay a video that starts muted, so it starts
 * muted with a large "Turn on sound" button (which also counts as the
 * visitor's tap, so the sound then plays). Closed with ✕, Esc, "Browse all
 * stories" or a tap outside. Shown once each time the visitor arrives on the
 * page, including arrivals through the site's own menu.
 */
/**
 * Home page: the scroll story.
 *
 * The bundle renders an empty <div id="home-story"> followed by
 * <div id="home-classic">. With the story on (html.hs-on, set here before
 * the bundle runs), the bundle leaves #home-classic empty, so the old hero
 * and its second copy of the live tour are never built. This mounts
 * /home-story/story.js into #home-story, including after in-app navigation.
 * If the script can't load, the page reloads once without the story and the
 * plain hero shows (remembered for the tab's session).
 * Source and rebuild steps: scripts/home-story/README.md.
 */
const HOME_STORY_CSS = `html.hs-on,html.hs-on body{overflow-x:clip}#home-story{display:none}html.hs-on #home-story{display:block;min-height:100vh}html.hs-on #home-classic{display:none}`;
const HOME_STORY_SCRIPT = String.raw`(function(){
  var d=document.documentElement,mod=null,K="vpv.hs.off";
  try{if(sessionStorage.getItem(K))return}catch(e){}
  d.classList.add("hs-on");
  function check(){
    var el=document.getElementById("home-story");
    if(!el||el.getAttribute("data-mounted"))return;
    el.setAttribute("data-mounted","1");
    (mod||(mod=import("/home-story/story.js"))).then(function(m){m.mount(el)}).catch(function(){try{sessionStorage.setItem(K,"1");location.reload()}catch(e){d.classList.remove("hs-on")}});
  }
  new MutationObserver(check).observe(document.getElementById("root")||document.body,{childList:true,subtree:true});
  check();
})();`;

/**
 * How it works: the full guide.
 *
 * The bundle renders an empty <div id="hiw-tour"> followed by
 * <div id="hiw-classic"> (the plain hero + five step cards) and the
 * "Before the shoot" section (#hiw-after). This hides both and mounts
 * /hiw-guide/guide.js into #hiw-tour, including after in-app navigation:
 * the five steps in detail, every deliverable, the customer's part, life
 * after go-live and every cost. If the script fails, the classic blocks
 * come back. Source and rebuild steps: scripts/hiw-guide/README.md.
 * (It replaced the 3D walkthrough in public/hiw-tour, which no longer loads.)
 */
const HIW_GUIDE_CSS = `html.hg-on #hiw-classic,html.hg-on #hiw-after{display:none}html.hg-on #hiw-tour{min-height:100vh}`;
const HIW_GUIDE_SCRIPT = String.raw`(function(){
  var d=document.documentElement,mod=null;
  function check(){
    var el=document.getElementById("hiw-tour");
    if(!el){d.classList.remove("hg-on");return;}
    if(el.getAttribute("data-mounted"))return;
    el.setAttribute("data-mounted","1");
    d.classList.add("hg-on");
    (mod||(mod=import("/hiw-guide/guide.js"))).then(function(m){m.mount(el)}).catch(function(){mod=null;d.classList.remove("hg-on")});
  }
  new MutationObserver(check).observe(document.getElementById("root")||document.body,{childList:true,subtree:true});
  check();
})();`;

/**
 * The "?" beside every "N AOAs" row.
 *
 * The plan cards are drawn by the prebuilt site bundle from plain strings, so
 * there is nowhere in the data to put a tooltip. This finds each "8 AOAs"
 * row after the bundle has drawn it and adds a "?" that explains the term on
 * hover, on keyboard focus and on tap. It re-runs when the page redraws.
 */
/** Behind the "?" beside "Custom domain" on the plan cards. */
const DOMAIN_HINT = "Your VPV on its own web address, for example example.myvpv.com";

const AOA_HINT_SCRIPT = String.raw`(function(){
  // [text it follows, what the "?" says, how a screen reader asks]
  var TIPS=[
    [/^\s*\d+\s+AOAs\s*$/,${JSON.stringify(AOA_HINT)},"What is an AOA? "],
    [/^\s*Custom domain\s*$/,${JSON.stringify(DOMAIN_HINT)},"What is a custom domain? "]
  ];
  function tipFor(v){for(var k=0;k<TIPS.length;k++)if(TIPS[k][0].test(v||""))return TIPS[k];return null}
  function fix(){try{
    var w=document.createTreeWalker(document.getElementById("root")||document.body,NodeFilter.SHOW_TEXT,null),n,hits=[];
    while(n=w.nextNode()){var m=tipFor(n.nodeValue);if(m){var p=n.parentNode;if(p&&p.querySelector&&!p.querySelector(".vpv-aoa-q"))hits.push([n,m]);}}
    for(var i=0;i<hits.length;i++){
      var TIP=hits[i][1][1];
      var q=document.createElement("span");q.className="vpv-aoa-q";q.tabIndex=0;q.setAttribute("role","button");q.setAttribute("aria-label",hits[i][1][2]+TIP);
      q.appendChild(document.createTextNode("?"));
      var t=document.createElement("span");t.className="vpv-aoa-tip";t.setAttribute("role","tooltip");t.textContent=TIP;q.appendChild(t);
      q.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();try{this.focus()}catch(x){}});
      hits[i][0].parentNode.insertBefore(q,hits[i][0].nextSibling);
    }
  }catch(e){}}
  var due=false;function soon(){if(due)return;due=true;setTimeout(function(){due=false;fix()},60);}
  if(document.readyState!=="loading")fix();else document.addEventListener("DOMContentLoaded",fix);
  try{new MutationObserver(soon).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
})();`;

/**
 * Phones swipe through the plan cards. Above them, a row of chips
 * (each plan's name and price per month) jumps straight to the right card,
 * and follows the swipe. Built from the cards themselves, so it can never list a plan the
 * page does not show; re-runs when the page redraws.
 */
const PLAN_JUMP_SCRIPT = String.raw`(function(){
  // The price the card shows right now: per month, or once for life (the
  // billing toggle, lib/site/planBilling.ts).
  function priceOf(c){var a=c.querySelector(document.documentElement.classList.contains("vpv-life")?".vpv-pl .vpv-now":".vpv-pa .vpv-now")||c.querySelector(".vpv-now");return a?a.textContent:""}
  window.addEventListener("vpv:billing",function(){[].forEach.call(document.querySelectorAll(".vpv-plans-grid"),function(g){var row=g.previousElementSibling;if(!row||row.className!=="vpv-pj")return;[].forEach.call(g.children,function(c,i){var b=row.children[i];if(b&&b.lastChild){var t=priceOf(c);if(b.lastChild.textContent!==t)b.lastChild.textContent=t}})})});
  function build(g){
    var cards=[].slice.call(g.children);if(cards.length<2)return;
    var row=document.createElement("div");row.className="vpv-pj";row.setAttribute("aria-label","Jump to a plan");
    var chips=cards.map(function(c,i){
      var b=document.createElement("button");b.type="button";
      var n=c.querySelector(".vpv-pc-name");
      b.innerHTML="<b></b><span></span>";b.firstChild.textContent=(n?n.textContent:"Plan "+(i+1)).replace(/^VPV\s*/,"");b.lastChild.textContent=priceOf(c);
      if(c.classList.contains("vpv-pc-gold"))b.className="gold";
      b.addEventListener("click",function(){g.scrollTo({left:c.offsetLeft-g.offsetLeft-16,behavior:"smooth"})});
      row.appendChild(b);return b;
    });
    g.parentNode.insertBefore(row,g);
    var on=-1;function mark(){var x=g.scrollLeft+g.clientWidth*0.3,k=0;for(var i=0;i<cards.length;i++)if(cards[i].offsetLeft-g.offsetLeft<=x)k=i;if(k===on)return;on=k;chips.forEach(function(b,i){b.setAttribute("aria-current",i===k?"true":"false")});var cb=chips[k];row.scrollTo({left:cb.offsetLeft-row.offsetLeft-24,behavior:"smooth"})}
    g.addEventListener("scroll",function(){requestAnimationFrame(mark)},{passive:true});mark();
  }
  function fix(){try{[].forEach.call(document.querySelectorAll(".vpv-plans-grid"),function(g){var p=g.previousElementSibling;if(p&&p.className==="vpv-pj")return;build(g)})}catch(e){}}
  var due=false;function soon(){if(due)return;due=true;setTimeout(function(){due=false;fix()},80);}
  if(document.readyState!=="loading")fix();else document.addEventListener("DOMContentLoaded",fix);
  try{new MutationObserver(soon).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
})();`;

const CASE_STUDY_FOCUS_SCRIPT = String.raw`(function(){var ID="62asCfqRRbw",was=false;function on(){return location.pathname.replace(/\/+$/,"")==="/case-studies"}function src(m){return"https://www.youtube-nocookie.com/embed/"+ID+"?autoplay=1&mute="+(m?1:0)+"&playsinline=1&rel=0&modestbranding=1"}function key(e){if(e.key==="Escape")close()}function close(){var o=document.getElementById("vpv-focus");if(!o)return;o.parentNode.removeChild(o);document.documentElement.style.overflow="";document.removeEventListener("keydown",key)}function open(){if(document.getElementById("vpv-focus")||!document.body)return;var o=document.createElement("div");o.id="vpv-focus";o.setAttribute("role","dialog");o.setAttribute("aria-modal","true");o.setAttribute("aria-label","Anuj Anand's story");o.innerHTML='<div class="vf-card"><div class="vf-top"><div><b>80%+ conversion with VPV</b><span>Mr. Anuj Anand, Export Head, Kesaria Rubber Industries</span></div><button type="button" class="vf-x" aria-label="Close">✕</button></div><div class="vf-frame"><iframe title="Anuj Anand on VPV" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen src="'+src(true)+'"></iframe></div><div class="vf-row"><button type="button" class="vf-sound">🔊 Turn on sound</button><button type="button" class="vf-skip">Browse all stories</button></div></div>';o.addEventListener("click",function(e){var t=e.target;if(t===o||t.closest(".vf-x")||t.closest(".vf-skip")){close();return}if(t.closest(".vf-sound")){o.querySelector("iframe").src=src(false);t.closest(".vf-sound").style.display="none"}});document.body.appendChild(o);document.documentElement.style.overflow="hidden";document.addEventListener("keydown",key);o.tabIndex=-1;o.focus()}function check(){var n=on();if(n&&!was)setTimeout(open,350);if(!n)close();was=n}["pushState","replaceState"].forEach(function(k){var f=history[k];history[k]=function(){var r=f.apply(this,arguments);setTimeout(check,0);return r}});window.addEventListener("popstate",check);if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",check);else check()})();`;

/**
 * The HTML shell for one page of the site. `path` must be a path listed
 * in lib/site/pages.ts.
 */
export function renderSiteHtml(path: string): string {
  const page = sitePage(path);
  const canonical = `${SITE}${page.path === "/" ? "/" : page.path}`;
  const title = esc(page.title);
  const description = esc(page.description);
  const robots = page.indexable ? "index, follow" : "noindex, follow";
  const isHome = page.path === "/";

  return `<!doctype html><html lang="en"><head>\
<meta charset="utf-8"/>\
<meta name="viewport" content="width=device-width,initial-scale=1"/>\
<meta name="theme-color" content="${BRAND}"/>\
<title>${title}</title>\
<meta name="description" content="${description}"/>\
<meta name="keywords" content="VPV, Virtual Plant Visit, virtual factory tour, digital factory tour, interactive factory visit, myvpv, remote plant visit, manufacturer sales tool, factory walkthrough, buyer confidence, 360 factory tour"/>\
<meta name="author" content="VPV - Virtual Plant Visit"/>\
<meta name="robots" content="${robots}"/>\
<link rel="canonical" href="${esc(canonical)}"/>\
<link rel="icon" type="image/png" href="/favicon.png"/>\
<link rel="shortcut icon" href="/favicon.ico"/>\
<link rel="apple-touch-icon" href="/vpv-icon-512.png"/>\
<meta property="og:type" content="website"/>\
<meta property="og:site_name" content="VPV - Virtual Plant Visit"/>\
<meta property="og:title" content="${title}"/>\
<meta property="og:description" content="${description}"/>\
<meta property="og:url" content="${esc(canonical)}"/>\
<meta property="og:image" content="${OG_IMAGE}"/>\
<meta name="twitter:card" content="summary_large_image"/>\
<meta name="twitter:title" content="${title}"/>\
<meta name="twitter:description" content="${description}"/>\
<meta name="twitter:image" content="${OG_IMAGE}"/>\
<script type="application/ld+json">${ORGANIZATION_LD}</script>\
${isHome ? `<script type="application/ld+json">${WEBSITE_LD}</script>` : ""}\
${isHome || page.path === "/plans" ? `<script type="application/ld+json">${serviceLd()}</script>` : ""}\
<link rel="preconnect" href="https://fonts.googleapis.com"/>\
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>\
<script>${ERROR_GUARD}</script>\
${welcomeGateTag()}\
<script defer="defer" src="${JS_SRC}"></script>\
<link href="${CSS_HREF}" rel="stylesheet"/>\
<link href="${SITE_HEADER_FONT_HREF}" rel="stylesheet"/>\
<link href="${PLAN_FONT_HREF}" rel="stylesheet"/>\
<style id="vpv-site-header-style">${SITE_HEADER_CSS}header[data-testid="site-header"]{display:none!important}html,body{overflow-x:clip}</style>\
<style id="vpv-home-style">${HOME_CSS}</style>\
<style id="vpv-hiw-guide-style">${HIW_GUIDE_CSS}</style>\
<style id="vpv-home-story-style">${HOME_STORY_CSS}</style>\
</head><body>\
<noscript>You need to enable JavaScript to run this app.</noscript>\
<script>window.__VPV_SPA=1</script>\
${siteHeaderHtml(page.path)}\
<div id="root"></div>\
<script id="vpv-site-header-script">${SITE_HEADER_SCRIPT}</script>\
<script id="vpv-pay-bridge-script">${PAY_BRIDGE_SCRIPT}</script>\
<script id="vpv-funnel-bridge-script">${FUNNEL_BRIDGE_SCRIPT}</script>\
<script id="vpv-one-email-script">${ONE_EMAIL_SCRIPT}</script>\
<script id="vpv-case-study-focus">${CASE_STUDY_FOCUS_SCRIPT}</script>\
<script id="vpv-aoa-hint-script">${AOA_HINT_SCRIPT}</script>\
<script id="vpv-plan-jump-script">${PLAN_JUMP_SCRIPT}</script>\
<script id="vpv-plan-billing-script">${PLAN_BILLING_SCRIPT}</script>\
<script id="vpv-hiw-guide-script">${HIW_GUIDE_SCRIPT}</script>\
<script id="vpv-home-story-script">${HOME_STORY_SCRIPT}</script>\
${measureScriptTag()}\
</body></html>`;
}
