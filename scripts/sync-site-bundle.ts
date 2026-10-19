/**
 * scripts/sync-site-bundle.ts — write lib/pricing.ts into the marketing
 * site's pre-built bundle.
 *
 *     npm run sync:site
 *
 * Run it after ANY change to a plan price, AOA count, inclusion, the
 * special offer or the travel tiers. It:
 *
 *   1. replaces the bundle's offer + plan objects and its travel object
 *      with what lib/site/bundleData.ts generates;
 *   2. applies the handful of exact-text sentence patches;
 *   3. writes the result under a NEW content-hashed file name and points
 *      lib/site/home.ts at it, so no browser can keep serving the old
 *      prices from its cache.
 *
 * Safe to run repeatedly: an already-synced bundle comes out identical and
 * keeps its name.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { bundleCareData, bundlePlanData, bundleTextPatches, bundleTravelData } from "@/lib/site/bundleData";

const ROOT = process.cwd();
const HOME_TS = path.join(ROOT, "lib/site/home.ts");

function replaceRegion(src: string, startMarker: string, endMarker: string, replacement: string): string {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error(`sync-site-bundle: start marker not found: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error(`sync-site-bundle: end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(0, a) + replacement + src.slice(b);
}

const home = fs.readFileSync(HOME_TS, "utf8");
const m = home.match(/const JS_SRC = "\/static\/js\/(main\.[0-9a-f]+\.js)";/);
if (!m) throw new Error("sync-site-bundle: JS_SRC not found in lib/site/home.ts");
const oldName = m[1];
const oldPath = path.join(ROOT, "public/static/js", oldName);
let src = fs.readFileSync(oldPath, "utf8");

src = replaceRegion(src, "ln={active:", ",cn={name:", bundlePlanData());
src = replaceRegion(src, "cn={name:", ",un={question:", bundleCareData());
src = replaceRegion(src, "un={question:", ",dn=function(", bundleTravelData());

// Apply every pair whose old text is present, then check every new text
// landed. Checking only afterwards lets a later "migration" pair carry the
// bundle from an older wording to the current one in the same run.
let applied = 0;
const patches = bundleTextPatches();
for (const [from, to] of patches) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
    applied++;
  }
}
for (const [from, to] of patches) {
  if (!src.includes(to)) {
    throw new Error(`sync-site-bundle: neither the old nor the new text is in the bundle:\n  ${from.slice(0, 90)}`);
  }
}

const hash = createHash("sha256").update(src).digest("hex").slice(0, 8);
const newName = `main.${hash}.js`;
const newPath = path.join(ROOT, "public/static/js", newName);

if (newName === oldName) {
  console.log(`Bundle already in sync (${oldName}). Nothing to do.`);
} else {
  fs.writeFileSync(newPath, src);
  fs.unlinkSync(oldPath);
  fs.writeFileSync(HOME_TS, home.replace(`/static/js/${oldName}`, `/static/js/${newName}`));
  console.log(`Synced: ${oldName} → ${newName} (${applied} sentence patch${applied === 1 ? "" : "es"}).`);
}
