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
import { PAY_BRIDGE_SCRIPT } from "@/lib/site/payBridge";

const SITE = "https://myvpv.com";
const JS_SRC = "/static/js/main.41f16be7.js";
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

const SIGNIN_SCRIPT = String.raw`(function(){function add(){if(document.getElementById("vpv-signin-btn"))return true;var h=document.querySelector('header[data-testid="site-header"]')||document.querySelector("header");if(!h)return false;var a=document.createElement("a");a.id="vpv-signin-btn";a.href="/login";a.textContent="Sign in";var cta=h.querySelector('a[href="/assessment"]');if(cta&&cta.parentNode){cta.parentNode.insertBefore(a,cta)}else{(h.firstElementChild||h).appendChild(a)}return true}if(document.readyState!=="loading"&&add())return;document.addEventListener("DOMContentLoaded",add);var o=new MutationObserver(function(){if(add())o.disconnect()});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){o.disconnect()},15000)})();`;

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
${isHome ? `<script type="application/ld+json">${ORGANIZATION_LD}</script>` : ""}\
<link rel="preconnect" href="https://fonts.googleapis.com"/>\
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>\
<script>${ERROR_GUARD}</script>\
<script defer="defer" src="${JS_SRC}"></script>\
<link href="${CSS_HREF}" rel="stylesheet"/>\
<style id="vpv-signin-btn-style">${SIGNIN_CSS}</style>\
</head><body>\
<noscript>You need to enable JavaScript to run this app.</noscript>\
<div id="root"></div>\
<script id="vpv-signin-btn-script">${SIGNIN_SCRIPT}</script>\
<script id="vpv-pay-bridge-script">${PAY_BRIDGE_SCRIPT}</script>\
<script id="vpv-one-email-script">${ONE_EMAIL_SCRIPT}</script>\
</body></html>`;
}
