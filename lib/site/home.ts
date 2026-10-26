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
 *   2. A "Sign in" link in the site header, pointing at /login on this
 *      domain. The site has no sign-in entry of its own, and a customer
 *      who has already bought needs one.
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
import { LAUNCH_OFFER, SITE_PLANS, SITE_PLAN_ORDER } from "@/lib/pricing";
import { SERVICE_CITY_LIST } from "@/lib/logistics";
import { PAY_BRIDGE_SCRIPT } from "@/lib/site/payBridge";
import { measureScriptTag } from "@/lib/site/measure";

const SITE = "https://myvpv.com";
const JS_SRC = "/static/js/main.36e97f56.js";
const CSS_HREF = "/static/css/main.cceb61ff.css";
/** Brand blue, taken from .btn-primary in the build's stylesheet. */
const BRAND = "#0b5cff";
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
  const offers = SITE_PLAN_ORDER.map((id) => {
    const p = SITE_PLANS[id];
    const price = LAUNCH_OFFER.active
      ? Math.round((p.regularInr * (100 - LAUNCH_OFFER.percent)) / 100)
      : p.regularInr;
    return {
      "@type": "Offer",
      name: p.name,
      description: p.tagline,
      price: String(price),
      priceCurrency: "INR",
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

const SIGNIN_CSS = `#vpv-signin-btn{display:inline-flex;align-items:center;justify-content:center;padding:.65rem 1.3rem;margin-right:.6rem;border-radius:9999px;border:1.5px solid ${BRAND};color:${BRAND};background:#fff;font-weight:600;font-size:.9rem;font-family:inherit;line-height:1;letter-spacing:.01em;text-decoration:none;cursor:pointer;transition:background-color .15s ease,color .15s ease,transform .15s ease;white-space:nowrap}#vpv-signin-btn:hover{background:${BRAND};color:#fff;transform:translateY(-1px)}#vpv-signin-btn:active{transform:translateY(0)}@media (max-width:640px){#vpv-signin-btn{padding:.5rem 1rem;font-size:.8rem;margin-right:.4rem}}`;

/**
 * Inserts the Sign in link into the site header once React has mounted
 * it. Preferred position is just before the header's "Start the
 * assessment" call to action; if the markup ever changes, it falls back
 * to the end of the header's top row, so the link never disappears
 * altogether. The observer gives up after 15s so it cannot sit watching
 * the DOM for the life of the tab.
 */
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
 * Deliberately narrow: it only acts on same-origin links whose path is
 * /assessment or below, and it leaves modified clicks (new tab, new window,
 * download) to the browser. If the site is ever rebuilt without those links,
 * this does nothing at all rather than breaking anything.
 */
const FUNNEL_BRIDGE_SCRIPT = String.raw`(function(){function isFunnel(u){return u.pathname==="/assessment"||u.pathname.indexOf("/assessment/")===0||u.pathname==="/why-vpv"}document.addEventListener("click",function(e){if(e.defaultPrevented)return;if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;if(a.target&&a.target!=="_self")return;if(a.hasAttribute("download"))return;var u;try{u=new URL(a.getAttribute("href"),window.location.origin)}catch(_){return}if(u.origin!==window.location.origin)return;if(!isFunnel(u))return;e.preventDefault();e.stopPropagation();window.location.assign(u.href)},true)})();`

const SIGNIN_SCRIPT = String.raw`(function(){function add(){if(document.getElementById("vpv-signin-btn"))return true;var h=document.querySelector('header[data-testid="site-header"]')||document.querySelector("header");if(!h)return false;var a=document.createElement("a");a.id="vpv-signin-btn";a.href="/login";a.textContent="Sign in";var cta=h.querySelector('a[href="/assessment"]');if(cta&&cta.parentNode){cta.parentNode.insertBefore(a,cta)}else{(h.firstElementChild||h).appendChild(a)}return true}if(document.readyState!=="loading"&&add())return;document.addEventListener("DOMContentLoaded",add);var o=new MutationObserver(function(){if(add())o.disconnect()});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){o.disconnect()},15000)})();`;

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
.vpv-gold-tag,.vpv-gold-line{font-weight:800;background:linear-gradient(100deg,#9A6A00 0%,#D9A21B 28%,#FFD95A 50%,#D9A21B 72%,#9A6A00 100%);background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:vpvGold 4.5s linear infinite;filter:drop-shadow(0 0 5px rgba(240,190,60,.35))}\
.vpv-gold-tag{font-size:1.15rem;line-height:1.3;letter-spacing:.003em}\
.vpv-gold-line{font-size:1rem;line-height:1.35}\
li:has(>.vpv-gold-line)>svg{color:#D9A21B;width:1.15rem;height:1.15rem;margin-top:.2rem}\
div:has(>.vpv-gold-tag){border:1.5px solid #E3B93C!important;background:linear-gradient(180deg,#FFFBEA 0%,#fff 38%)!important;box-shadow:0 18px 44px -18px rgba(217,162,27,.55)!important}\
.vpv-ph{visibility:hidden}\
@media (max-width:1023px){.vpv-ph{display:none}}\
@media (min-width:1024px){.vpv-plans-grid>*{display:grid!important;grid-template-rows:subgrid;grid-row:span 16;row-gap:0}.vpv-plans-grid{row-gap:0!important}.vpv-plans-grid>*{margin-bottom:1rem}.vpv-plans-grid>*>ul{display:grid;grid-template-rows:subgrid;grid-row:span 13;margin-top:1.25rem}}\
@media (min-width:1024px){.vpv-plans-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:0 1rem!important;margin-left:50%;transform:translateX(-50%);width:min(1240px,calc(100vw - 32px))}.vpv-plans-grid>*{padding:1.25rem}}\
@keyframes vpvGold{0%{background-position:0% center}100%{background-position:220% center}}\
@media (prefers-reduced-motion:reduce){.vpv-gold-tag,.vpv-gold-line{animation:none}}\
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
@media (prefers-reduced-motion:reduce){#vpv-focus{animation:none}}`;

/**
 * /case-studies opens on Anuj Anand's story, full screen and already
 * playing. Browsers only autoplay a video that starts muted, so it starts
 * muted with a large "Turn on sound" button (which also counts as the
 * visitor's tap, so the sound then plays). Closed with ✕, Esc, "Browse all
 * stories" or a tap outside. Shown once each time the visitor arrives on the
 * page, including arrivals through the site's own menu.
 */
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
<script defer="defer" src="${JS_SRC}"></script>\
<link href="${CSS_HREF}" rel="stylesheet"/>\
<style id="vpv-signin-btn-style">${SIGNIN_CSS}</style>\
<style id="vpv-home-style">${HOME_CSS}</style>\
</head><body>\
<noscript>You need to enable JavaScript to run this app.</noscript>\
<div id="root"></div>\
<script id="vpv-signin-btn-script">${SIGNIN_SCRIPT}</script>\
<script id="vpv-pay-bridge-script">${PAY_BRIDGE_SCRIPT}</script>\
<script id="vpv-funnel-bridge-script">${FUNNEL_BRIDGE_SCRIPT}</script>\
<script id="vpv-one-email-script">${ONE_EMAIL_SCRIPT}</script>\
<script id="vpv-case-study-focus">${CASE_STUDY_FOCUS_SCRIPT}</script>\
${measureScriptTag()}\
</body></html>`;
}
