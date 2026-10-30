/**
 * lib/site/header.ts — THE site header, one copy for every public page.
 *
 * myvpv.com is served by two kinds of page:
 *   • the pre-built marketing single-page app (/, /how-it-works, /plans,
 *     /case-studies, /faq …), shelled by lib/site/home.ts;
 *   • real Next.js pages (/why-vpv, /about, /assessment/*, the policies …),
 *     wrapped by components/legal/LegalPage.tsx.
 * They used to carry two different headers with two different menus. Both now
 * render the markup, styles and behaviour below, so the menu is identical
 * everywhere:
 *
 *   Home · Why VPV · How it works · Plans · Case studies · FAQ · About us · Sign in
 *
 * Behaviour (plain JS, no framework, so the static shell can run it):
 *   • sticky at the top of the page;
 *   • solid white at the top, turning gradually translucent (with a blur
 *     behind it) as the visitor scrolls down;
 *   • a menu button on phones and tablets;
 *   • on the single-page app, links to its own pages switch page in place
 *     (no reload); every other link is an ordinary navigation.
 */

import { SITE_PATHS } from "@/lib/site/paths";

export const SITE_NAV: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/why-vpv", label: "Why VPV" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/plans", label: "Plans" },
  { href: "/case-studies", label: "Case studies" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About us" },
];

const SIGN_IN_HREF = "/login";
const BRAND = "#0b5cff";
const INK = "#0b2a5b";

function norm(path: string): string {
  const p = (path || "/").split(/[?#]/)[0].replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** The inside of <header id="vpv-site-header" class="vh">, for `path`. */
export function siteHeaderInner(path: string): string {
  const here = norm(path);
  const link = (cls: string) => (l: { href: string; label: string }) =>
    `<a class="${cls}" href="${l.href}" data-vh-path="${l.href}"${norm(l.href) === here ? ' aria-current="page"' : ""}>${l.label}</a>`;
  return (
    `<div class="vh-in">` +
    `<a class="vh-logo" href="/" data-vh-path="/" aria-label="VPV, Virtual Plant Visit: home">` +
    `<img src="/assets/vpv-logo.webp" alt="VPV logo" width="480" height="134"/>` +
    `<span class="vh-tag">Virtual Plant Visit</span></a>` +
    `<nav class="vh-nav" aria-label="Main">${SITE_NAV.map(link("vh-link")).join("")}</nav>` +
    `<div class="vh-right">` +
    `<a class="vh-signin" href="${SIGN_IN_HREF}">Sign in</a>` +
    `<button type="button" class="vh-burger" data-vh-toggle aria-label="Open menu" aria-expanded="false" aria-controls="vh-mobile">` +
    `<svg class="vh-i-open" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>` +
    `<svg class="vh-i-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>` +
    `</button></div></div>` +
    `<nav class="vh-mobile" id="vh-mobile" aria-label="Mobile">${SITE_NAV.map(link("vh-mlink")).join("")}` +
    `<a class="vh-mlink vh-msignin" href="${SIGN_IN_HREF}">Sign in</a></nav>`
  );
}

/** Full <header> element, for the static shell. */
export function siteHeaderHtml(path: string): string {
  return `<header id="vpv-site-header" class="vh" data-testid="vpv-site-header">${siteHeaderInner(path)}</header>`;
}

export const SITE_HEADER_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&display=swap";

export const SITE_HEADER_CSS = `.vh{position:sticky;top:0;z-index:60;--vh-a:1;--vh-blur:0px;background:rgba(255,255,255,var(--vh-a));-webkit-backdrop-filter:saturate(180%) blur(var(--vh-blur));backdrop-filter:saturate(180%) blur(var(--vh-blur));border-bottom:1px solid rgba(15,23,42,.07);transition:box-shadow .25s ease,border-color .25s ease;font-family:"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}\
.vh.vh-scrolled{box-shadow:0 10px 30px -14px rgba(11,42,91,.22);border-bottom-color:rgba(15,23,42,.05)}\
.vh *{box-sizing:border-box}\
.vh-in{max-width:72rem;margin:0 auto;height:64px;display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:0 .75rem}\
.vh-logo{display:inline-flex;flex-direction:column;align-items:flex-start;justify-content:center;min-height:44px;text-decoration:none;flex:none}\
.vh-logo img{display:block;height:32px;width:auto;max-width:none}\
.vh-tag{display:block;margin-top:2px;font-size:9px;line-height:1;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#64748b}\
.vh-nav{display:none;align-items:center;gap:.125rem}\
.vh-link{display:inline-flex;align-items:center;min-height:44px;padding:0 .7rem;font-size:.875rem;font-weight:600;color:#475569;text-decoration:none;border-radius:9999px;transition:color .15s ease;white-space:nowrap}\
.vh-link:hover{color:${INK}}\
.vh-link[aria-current="page"]{color:${BRAND}}\
.vh-right{display:flex;align-items:center;gap:.4rem;flex:none}\
.vh-signin{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 1.15rem;border-radius:9999px;border:1.5px solid ${BRAND};color:${BRAND};background:#fff;font-weight:600;font-size:.875rem;line-height:1;text-decoration:none;white-space:nowrap;transition:background-color .15s ease,color .15s ease,transform .15s ease}\
.vh-signin:hover{background:${BRAND};color:#fff;transform:translateY(-1px)}\
.vh-burger{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;border-radius:9999px;background:transparent;color:${INK};cursor:pointer}\
.vh-burger:hover{background:#e8f1ff}\
.vh-burger .vh-i-close{display:none}\
.vh.vh-open .vh-burger .vh-i-open{display:none}\
.vh.vh-open .vh-burger .vh-i-close{display:block}\
.vh-mobile{display:none;border-top:1px solid #f1f5f9;background:#fff;padding:.5rem .75rem 1rem;box-shadow:0 14px 40px rgba(11,61,145,.08)}\
.vh.vh-open .vh-mobile{display:block}\
.vh-mlink{display:flex;align-items:center;min-height:52px;padding:0 1rem;border-radius:.75rem;font-size:1rem;font-weight:600;color:${INK};text-decoration:none}\
.vh-mlink:hover{background:#f4f8ff}\
.vh-mlink[aria-current="page"]{background:#e8f1ff;color:${BRAND}}\
.vh-msignin{margin-top:.5rem;justify-content:center;border:1.5px solid ${BRAND};color:${BRAND};border-radius:9999px}\
@media (min-width:640px){.vh-in{padding:0 1.5rem}.vh-logo img{height:36px}}\
@media (max-width:380px){.vh-signin{padding:0 .8rem;font-size:.8rem}}\
@media (min-width:1024px){.vh-nav{display:flex}.vh-burger,.vh-mobile,.vh.vh-open .vh-mobile{display:none}}\
@media print{.vh{display:none}}`;

/**
 * Scroll translucency, the phone menu, and — on the single-page app only
 * (window.__VPV_SPA) — switching between its own pages without a reload.
 * Safe to run more than once: it installs itself once per window, and every
 * handler looks the header up afresh, so a re-rendered header still works.
 */
export const SITE_HEADER_SCRIPT = String.raw`(function(){
if(window.__vpvHeader)return;window.__vpvHeader=1;
var SPA=${JSON.stringify(SITE_PATHS)};
function H(){return document.getElementById("vpv-site-header")}
function N(p){p=(p||"/").replace(/\/+$/,"");return p===""?"/":p}
var ticking=false;
function paint(){ticking=false;var h=H();if(!h)return;var y=window.pageYOffset||document.documentElement.scrollTop||0;var t=Math.min(1,Math.max(0,y/260));h.style.setProperty("--vh-a",(1-0.4*t).toFixed(3));h.style.setProperty("--vh-blur",(14*t).toFixed(1)+"px");if(y>4)h.classList.add("vh-scrolled");else h.classList.remove("vh-scrolled")}
function onScroll(){if(!ticking){ticking=true;window.requestAnimationFrame(paint)}}
function mark(){var h=H();if(!h)return;var here=N(location.pathname);var as=h.querySelectorAll("a[data-vh-path]");for(var i=0;i<as.length;i++){if(as[i].classList.contains("vh-logo"))continue;if(N(as[i].getAttribute("data-vh-path"))===here)as[i].setAttribute("aria-current","page");else as[i].removeAttribute("aria-current")}}
function setOpen(open){var h=H();if(!h)return;var b=h.querySelector("[data-vh-toggle]");if(open)h.classList.add("vh-open");else h.classList.remove("vh-open");if(b){b.setAttribute("aria-expanded",open?"true":"false");b.setAttribute("aria-label",open?"Close menu":"Open menu")}}
document.addEventListener("click",function(e){var h=H();if(!h||!e.target||!e.target.closest)return;if(!h.contains(e.target)){if(h.classList.contains("vh-open"))setOpen(false);return}
var t=e.target.closest("[data-vh-toggle]");if(t){e.preventDefault();setOpen(!h.classList.contains("vh-open"));return}
var a=e.target.closest("a[href]");if(!a)return;setOpen(false);
if(!window.__VPV_SPA)return;if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
var u;try{u=new URL(a.getAttribute("href"),location.origin)}catch(_){return}if(u.origin!==location.origin)return;
var p=N(u.pathname);if(SPA.indexOf(p)<0)return;
e.preventDefault();e.stopPropagation();
if(p!==N(location.pathname)){var st=history.state||{};var idx=typeof st.idx==="number"?st.idx+1:0;history.pushState({usr:null,key:Math.random().toString(36).slice(2,10),idx:idx},"",u.pathname+u.search+u.hash);window.dispatchEvent(new PopStateEvent("popstate",{state:history.state}))}
window.scrollTo(0,0);mark()},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape")setOpen(false)});
window.addEventListener("scroll",onScroll,{passive:true});
window.addEventListener("popstate",function(){mark();setOpen(false)});
window.addEventListener("resize",function(){if(window.innerWidth>=1024)setOpen(false)});
window.__vpvHeaderMark=mark;
if(document.readyState!=="loading"){paint();mark()}else document.addEventListener("DOMContentLoaded",function(){paint();mark()});
})();`;
