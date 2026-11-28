// Builds public/welcome/welcome.js from welcome.src.js + satisfy.json.
//   node scripts/welcome/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "welcome.src.js"), "utf8");
const glyphs = fs.readFileSync(path.join(here, "satisfy.json"), "utf8").trim();
JSON.parse(glyphs); // fail loudly on a corrupt data file

if (!src.includes("/*GLYPHS*/ null")) throw new Error("welcome.src.js lost its /*GLYPHS*/ marker");

const banner =
  "/* VPV welcome — built from scripts/welcome/welcome.src.js. Do not edit by hand.\n" +
  " * Pen paths: Satisfy (SIL Open Font License 1.1) as hand-traced for Vara (MIT).\n" +
  " * See scripts/welcome/README.md. */\n";

const out = banner + src.replace("/*GLYPHS*/ null", glyphs);
const dest = path.join(here, "../../public/welcome/welcome.js");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${path.relative(process.cwd(), dest)} (${out.length} bytes)`);
