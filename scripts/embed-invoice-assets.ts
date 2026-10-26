/**
 * scripts/embed-invoice-assets.ts — bake the invoice's fonts and logos
 * into lib/server/invoiceAssets.json.
 *
 *     npm run build:invoice-assets
 *
 * WHY a generated JSON file rather than reading assets/ at runtime:
 * the invoice PDF is built inside a serverless function. Files that sit
 * beside the code are only shipped to that function if Next's file
 * tracing happens to notice them, and a miss shows up as a 500 in
 * production while everything works locally. A JSON file is an ordinary
 * import, so the bundler always carries it. Billing is the wrong place
 * for "works on my machine".
 *
 * Sources live in assets/invoice/. Re-run this after changing either
 * logo or a font; tests/billing/26-invoice.test.ts fails if the JSON and
 * the sources disagree.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "assets/invoice");
const OUT = path.join(ROOT, "lib/server/invoiceAssets.json");

/** Everything the PDF needs, by the name the renderer asks for. */
export const INVOICE_ASSET_FILES: Record<string, string> = {
  regular: "Inter-400.ttf",
  semibold: "Inter-600.ttf",
  bold: "Inter-700.ttf",
  vpvLogo: "vpv-logo.jpg",
  nextDesignLogo: "next-design-logo.png",
};

export function buildAssets(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, file] of Object.entries(INVOICE_ASSET_FILES)) {
    const buf = fs.readFileSync(path.join(SRC, file));
    out[key] = buf.toString("base64");
  }
  return out;
}

function main(): void {
  const assets = buildAssets();
  const json = JSON.stringify(assets);
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (before === json) {
    console.log("Invoice assets already in sync. Nothing to do.");
    return;
  }
  fs.writeFileSync(OUT, json);
  const kb = Math.round(json.length / 1024);
  const sum = createHash("sha256").update(json).digest("hex").slice(0, 8);
  console.log(`Wrote lib/server/invoiceAssets.json (${kb} KB, ${sum}).`);
}

if (process.argv[1] && process.argv[1].endsWith("embed-invoice-assets.ts")) main();
