/**
 * Copies onnxruntime-web runtime files from node_modules into public/onnx/
 * so the Beautify worker can load them from our own origin.
 *
 * Why: CDNs like jsdelivr/unpkg get blocked by common ad blockers
 * (uBlock Origin, AdBlock Plus filter lists occasionally include them
 * because they've historically hosted tracking scripts). Serving from
 * our own domain sidesteps every extension and network filter.
 *
 * Runs automatically via package.json `postinstall`. The `|| true` in
 * the script keeps `npm install` from failing on machines that haven't
 * yet installed onnxruntime-web (first-run bootstrap).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "onnxruntime-web", "dist");
const dst = path.join(root, "public", "onnx");

if (!fs.existsSync(src)) {
  console.log("[copy-onnx] onnxruntime-web not installed yet — skipping.");
  process.exit(0);
}

fs.mkdirSync(dst, { recursive: true });

// Copy every runtime file (the main JS + all its WASM binaries).
// Small enough that copying the full dir is cheaper than pattern-matching.
let count = 0;
for (const entry of fs.readdirSync(src)) {
  const s = path.join(src, entry);
  const d = path.join(dst, entry);
  const stat = fs.statSync(s);
  if (stat.isFile()) {
    fs.copyFileSync(s, d);
    count++;
  }
}

console.log(`[copy-onnx] copied ${count} onnxruntime-web files → public/onnx/`);
