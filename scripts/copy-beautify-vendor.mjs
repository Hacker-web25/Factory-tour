// Copies the libraries the Beautify tool runs in the browser into
// public/vendor/beautify-v1/, so they are served from myvpv.com itself.
//
// Why not a CDN: the site's Content-Security-Policy only allows scripts from
// our own origin (and a short list of services), and a script from a public
// CDN would run with full access to a logged-in editor. Self-hosting keeps
// both true. The copies are build output (git-ignored); this runs after
// `npm install` and before `next build`.
//
// If you upgrade either package, change VERSION_DIR too so browsers do not
// keep serving the old files from their cache (they are cached for a year).

import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_DIR = "beautify-v1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor", VERSION_DIR);

const files = [
  // OpenCV.js (TELEA inpainting for the quick "Heal" button), wasm embedded.
  ["node_modules/@techstark/opencv-js/dist/opencv.js", "opencv.js"],
  // ONNX Runtime Web, WebAssembly-only build, and its SIMD binary.
  ["node_modules/onnxruntime-web/dist/ort.wasm.min.js", "ort.wasm.min.js"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm", "ort-wasm-simd.wasm"],
];

mkdirSync(out, { recursive: true });
let missing = 0;
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.error(`[beautify-vendor] missing ${from} - run npm install`);
    missing++;
    continue;
  }
  copyFileSync(src, join(out, to));
  console.log(`[beautify-vendor] ${to} (${(statSync(src).size / 1e6).toFixed(1)} MB)`);
}
if (missing) process.exit(1);
