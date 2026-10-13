#!/usr/bin/env node
/**
 * export-legal-static.mjs — turn the live policy pages into plain,
 * self-contained HTML files that any website can host.
 *
 * Why: myvpv.com (the marketing site) is a separate project from this
 * app. Payment gateways review the policy pages on the marketing
 * domain, so this exports each page as   <out>/<page>/index.html
 * (CSS inlined, no JavaScript) — drop the folders into the marketing
 * site's public/static root and  myvpv.com/terms,  /privacy,  …  work.
 *
 * Usage (the app must be running, e.g. `npm run build && npm start`):
 *
 *     node scripts/export-legal-static.mjs [baseUrl] [outDir]
 *     node scripts/export-legal-static.mjs http://localhost:3000 legal-static
 *
 * Re-run it after ANY change to lib/company.ts or a policy page, then
 * re-upload the output. Keep PAGES in sync with components/legal/nav.ts.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.argv[3] ?? "legal-static";

const PAGES = [
  "pricing",
  "terms",
  "privacy",
  "refund-policy",
  "shipping-policy",
  "cookies",
  "disclaimer",
  "security",
  "about",
  "contact",
  "legal",
];

// The app loads Inter through next/font, which a static copy cannot
// use, so static pages pull it from Google Fonts and fall back to the
// system UI font if that is blocked.
/** The host that serves the live, interactive app. */
const APP = "https://app.myvpv.com";

const FONT_HEAD = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
<style>
  html, body { background:#fff; color-scheme: light; }
  /* These copies carry no JavaScript, so the scene slider cannot move.
     Hide it and let the price ladder beside it carry every number —
     a reviewer still sees the complete price list. */
  .vpv-calc-card { display: none !important; }
  #calculator-grid { grid-template-columns: 1fr !important; }
  body, .font-sans { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
</style>`;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function inlineCss(html) {
  const re = /<link[^>]+rel="stylesheet"[^>]*>/g;
  const tags = html.match(re) ?? [];
  for (const tag of tags) {
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (!href || !href.includes("/_next/")) continue;
    const css = await get(new URL(href, BASE + "/").toString());
    html = html.replace(tag, () => `<style>${css}</style>`);
  }
  return html;
}

/**
 * These pages are served from myvpv.com, but anything that needs the
 * application — buying, signing in, the dashboard — lives on the app
 * host. Rewrite those links so a button never leads to a dead URL.
 */
function pointActionsAtApp(html) {
  for (const path of ["/get-started", "/billing", "/login", "/apply"]) {
    html = html.split(`href="${path}"`).join(`href="${APP}${path}"`);
  }
  return html;
}

function stripRuntime(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<link[^>]+rel="preload"[^>]*>/g, "")
    .replace(/<link[^>]+rel="modulepreload"[^>]*>/g, "")
    .replace(/<meta[^>]+name="next-size-adjust"[^>]*>/g, "");
}

let failed = 0;
for (const page of PAGES) {
  try {
    let html = await get(`${BASE}/${page}`);
    html = await inlineCss(html);
    html = stripRuntime(html);
    html = pointActionsAtApp(html);
    html = html.replace("</head>", `${FONT_HEAD}</head>`);
    const dir = path.join(OUT, page);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), html, "utf8");
    console.log(`✓ ${page}  (${Math.round(html.length / 1024)} KB)`);
  } catch (err) {
    failed++;
    console.error(`✗ ${page}: ${err.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} page(s) failed — is the app running at ${BASE}?`);
  process.exit(1);
}
console.log(`\nDone. Upload the folders inside "${OUT}" to the root of myvpv.com.`);
