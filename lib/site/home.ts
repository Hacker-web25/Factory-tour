/**
 * The front page of myvpv.com — the ORIGINAL VPV marketing site.
 *
 * It is a pre-built single-page site (JS and CSS in /public/static, images
 * in /public). This file holds its HTML shell and adds one thing to it: a
 * footer with every policy and company link, generated from the same link
 * list and company details the rest of the app uses, so they cannot drift.
 *
 * Changes from the page as it was on the old host:
 *   • the "Sign in" button points to /login on this domain;
 *   • the Emergent platform script and the PostHog session-recording
 *     snippet are removed (third-party code on a customer-facing page).
 *
 * Served by app/route.ts. To change the site itself, replace the files in
 * /public/static and update the two file names in the template below.
 */

import { COMPANY, companyIdentity } from "@/lib/company";
import { COMPANY_LINKS, POLICY_LINKS } from "@/components/legal/nav";

const HOME_TEMPLATE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#1468d8"/><title>VPV | Virtual Plant Visit - Real Factories. Real Confidence.</title><meta name="description" content="VPV (Virtual Plant Visit) lets your buyers explore your real factory online, before a physical visit. Build buyer confidence faster and move the sales conversation to the next stage. Real Factories. Real Confidence."/><meta name="keywords" content="VPV, Virtual Plant Visit, virtual factory tour, digital factory tour, interactive factory visit, myvpv, remote plant visit, manufacturer sales tool, factory walkthrough, buyer confidence, 360 factory tour"/><meta name="author" content="VPV - Virtual Plant Visit"/><meta name="robots" content="index, follow"/><link rel="canonical" href="https://myvpv.com/"/><link rel="icon" type="image/png" href="./favicon.png"/><link rel="shortcut icon" href="./favicon.ico"/><link rel="apple-touch-icon" href="./vpv-icon-512.png"/><meta property="og:type" content="website"/><meta property="og:site_name" content="VPV - Virtual Plant Visit"/><meta property="og:title" content="VPV | Virtual Plant Visit - Real Factories. Real Confidence."/><meta property="og:description" content="Let buyers explore your real factory online, before a physical visit. Build confidence faster and move the conversation to the next stage."/><meta property="og:url" content="https://myvpv.com/"/><meta property="og:image" content="https://myvpv.com/vpv-icon-512.png"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="VPV | Virtual Plant Visit - Real Factories. Real Confidence."/><meta name="twitter:description" content="Let buyers explore your real factory online, before a physical visit. Build confidence faster."/><meta name="twitter:image" content="https://myvpv.com/vpv-icon-512.png"/><script type="application/ld+json">{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "VPV - Virtual Plant Visit",
          "alternateName": "VPV",
          "url": "https://myvpv.com/",
          "logo": "https://myvpv.com/vpv-icon-512.png",
          "slogan": "Real Factories. Real Confidence.",
          "description": "VPV (Virtual Plant Visit) lets buyers explore your real factory online, before a physical visit, so the sales conversation does not have to wait for the visit.",
          "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+91-98183-72742",
            "contactType": "sales",
            "areaServed": "IN",
            "availableLanguage": ["en"]
          }
        }</script><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap" rel="stylesheet"/><script>window.addEventListener("error",function(e){e.error instanceof DOMException&&"DataCloneError"===e.error.name&&e.message&&e.message.includes("PerformanceServerTiming")&&(e.stopImmediatePropagation(),e.preventDefault())},!0)</script><script defer="defer" src="./static/js/main.917b4db7.js"></script><link href="./static/css/main.bec36b46.css" rel="stylesheet"><style id="vpv-signin-btn-style">#vpv-signin-btn{display:inline-flex;align-items:center;justify-content:center;padding:.7rem 1.4rem;margin-right:.6rem;border-radius:9999px;border:1.5px solid #1468d8;color:#1468d8;background:#fff;font-weight:600;font-size:.95rem;font-family:inherit;line-height:1;letter-spacing:.01em;text-decoration:none;cursor:pointer;transition:background-color .15s ease,color .15s ease,transform .15s ease;white-space:nowrap}#vpv-signin-btn:hover{background:#1468d8;color:#fff;transform:translateY(-1px)}#vpv-signin-btn:active{transform:translateY(0)}@media (max-width:640px){#vpv-signin-btn{padding:.55rem 1rem;font-size:.85rem;margin-right:.4rem}}</style></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><script id="vpv-signin-btn-script">(function(){var s="/login",g="Get Your VPV";function n(x){return(x||"").replace(/\s+/g," ").trim().toLowerCase()}function add(){if(document.getElementById("vpv-signin-btn"))return true;var t=null,els=document.querySelectorAll("a,button");for(var i=0;i<els.length;i++){if(n(els[i].textContent)===g.toLowerCase()){t=els[i];break}}if(!t||!t.parentNode)return false;var a=document.createElement("a");a.id="vpv-signin-btn";a.href=s;a.textContent="Sign in";t.parentNode.insertBefore(a,t);return true}if(document.readyState!=="loading"){if(add())return}else{document.addEventListener("DOMContentLoaded",add)}var o=new MutationObserver(function(){if(add())o.disconnect()});o.observe(document.body,{childList:true,subtree:true});setTimeout(function(){o.disconnect()},15000)})();</script><!--VPV_FOOTER--></body></html>
`;

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function links(items: { href: string; label: string }[]): string {
  return items
    .map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`)
    .join("");
}

const FOOTER_CSS = `
.vpv-ft{border-top:1px solid #e2e8f0;background:#f4f8fd;color:#526071;font:13px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.vpv-ft *{box-sizing:border-box}
.vpv-ft a{color:inherit;text-decoration:none}
.vpv-ft a:hover{color:#1468d8}
.vpv-ft-in{max-width:1152px;margin:0 auto;padding:44px 20px 36px;display:grid;gap:32px;grid-template-columns:1fr}
@media(min-width:640px){.vpv-ft-in{grid-template-columns:1fr 1fr}}
@media(min-width:1024px){.vpv-ft-in{grid-template-columns:1.4fr 1fr 1.2fr 1.2fr}}
.vpv-ft h4{margin:0 0 12px;font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#0c1017}
.vpv-ft ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.vpv-ft p{margin:0 0 8px;font-size:12.5px;color:#64748b}
.vpv-ft-brand{font-size:15px;font-weight:600;color:#0c1017;margin-bottom:8px}
.vpv-ft-bot{border-top:1px solid #e2e8f0}
.vpv-ft-bot div{max-width:1152px;margin:0 auto;padding:16px 20px;display:flex;flex-wrap:wrap;gap:6px 24px;justify-content:space-between;font-size:12px;color:#64748b}
`;

function footerHtml(): string {
  const year = new Date().getFullYear();
  const address = COMPANY.addressLines.map((l) => esc(l)).join("<br>");
  const contact = [
    `<li><a href="mailto:${esc(COMPANY.emails.support)}">${esc(COMPANY.emails.support)}</a></li>`,
    `<li><a href="mailto:${esc(COMPANY.emails.billing)}">${esc(COMPANY.emails.billing)}</a></li>`,
    COMPANY.phone
      ? `<li><a href="tel:${esc(COMPANY.phone.replace(/\s+/g, ""))}">${esc(COMPANY.phone)}</a></li>`
      : "",
  ].join("");

  return `<style>${FOOTER_CSS}</style>
<footer class="vpv-ft" aria-label="Site footer">
<div class="vpv-ft-in">
<div>
<div class="vpv-ft-brand">${esc(COMPANY.productName)}</div>
<p>VPV is operated by ${esc(companyIdentity())}.${COMPANY.gstin ? ` GSTIN: ${esc(COMPANY.gstin)}.` : ""}</p>
${address ? `<p>${address}</p>` : ""}
</div>
<div><h4>Company</h4><ul>${links(COMPANY_LINKS)}<li><a href="/legal">All policies</a></li><li><a href="/login">Sign in</a></li></ul></div>
<div><h4>Policies</h4><ul>${links(POLICY_LINKS)}</ul></div>
<div><h4>Contact</h4><ul>${contact}</ul></div>
</div>
<div class="vpv-ft-bot"><div><span>&copy; ${year} ${esc(COMPANY.legalName)}. All rights reserved.</span><span>Prices are in INR and include GST unless stated. Online payments are processed by Razorpay.</span></div></div>
</footer>`;
}

export function renderHomeHtml(): string {
  return HOME_TEMPLATE.replace("<!--VPV_FOOTER-->", footerHtml());
}
