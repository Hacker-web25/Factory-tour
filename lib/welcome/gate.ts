/**
 * lib/welcome/gate.ts — decides, in the first few hundred bytes of a page,
 * whether this visitor gets the personal welcome.
 *
 * Almost nobody does: it is for a person who scanned THEIR OWN printed QR, and
 * every other visitor (Google, a shared link, a returning customer) pays for
 * this file with one failed regular expression and nothing else. The 28 KB
 * script that draws the welcome is not even downloaded for them.
 *
 * The test is two things at once:
 *   • the address carries our campaign code (?vpv=…), which only the scan
 *     redirect puts there, AND
 *   • the first-party greeting cookie from that redirect is present (it holds
 *     the first name, lives an hour, and exists only for a code that has a
 *     name against it). See lib/hiLinks.ts.
 * and it is skipped when this tab has already shown the welcome once.
 *
 * What it does when both are true is deliberately tiny: paint a plain blue
 * rectangle over the page from CSS alone (so there is never a flash of the
 * homepage before the welcome), and fetch the script. It inserts no element
 * into the page, because React hydrates these pages and a stranger in the
 * middle of its tree is a hydration mismatch. The script replaces the
 * rectangle with the real overlay, or, if it never arrives, the rectangle is
 * removed after four seconds: a slow network must never hold a page hostage.
 *
 * The text is shared by the marketing pages (lib/site/home.ts) and the app's
 * own pages (app/layout.tsx), so there is one gate and it cannot drift.
 *
 * The source is plain ES5 in a String.raw template: keep it free of backticks
 * and of the dollar-brace sequence.
 */

import { HI_COOKIE } from "@/lib/hiLinks";

/** Where the overlay script is served from (public/welcome/welcome.js). */
export const WELCOME_SCRIPT = "/welcome/welcome.js";
/** Bump when welcome.js changes, so a browser that cached the old one fetches the new. */
export const WELCOME_VERSION = "1";
/** Marks the sessionStorage entry that stops the welcome repeating in one tab. */
export const WELCOME_SEEN_KEY = "vpv_hi_seen";

export const WELCOME_GATE_JS = String.raw`(function(){try{
if(location.search.indexOf("vpv=")<0)return;
if(!/(?:^|;\s*)${HI_COOKIE}=[^;]/.test(document.cookie))return;
try{if(sessionStorage.getItem("${WELCOME_SEEN_KEY}"))return}catch(e){}
var c=document.createElement("style");c.id="vpv-hi-cover";
c.textContent="html::before{content:'';position:fixed;inset:0;z-index:2147483000;background:#0a1f4d}";
document.head.appendChild(c);
var s=document.createElement("script");s.src="${WELCOME_SCRIPT}?v=${WELCOME_VERSION}";s.async=true;
s.onerror=function(){var e=document.getElementById("vpv-hi-cover");if(e&&e.parentNode)e.parentNode.removeChild(e)};
document.head.appendChild(s);
setTimeout(function(){if(!document.getElementById("vpv-hi")){var e=document.getElementById("vpv-hi-cover");if(e&&e.parentNode)e.parentNode.removeChild(e)}},4000);
}catch(e){}})();`;

/** The tag for the marketing shell's <head>. */
export function welcomeGateTag(): string {
  return `<script id="vpv-hi-gate">${WELCOME_GATE_JS}</script>`;
}
