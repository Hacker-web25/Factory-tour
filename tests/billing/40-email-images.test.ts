/**
 * The pictures in our e-mails must be showable anywhere.
 *
 * The site sends `Cross-Origin-Resource-Policy: same-site` on every response.
 * That is right for the app, but it makes a browser refuse to display
 * /email/* pictures on any other site: Zoho's editor preview and webmail that
 * loads images straight from us showed broken pictures.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);

type Rule = { source: string; headers: { key: string; value: string }[] };

/** What a browser would end up with: matching rules in order, later wins per header. */
function effective(rules: Rule[], matches: (source: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) if (matches(r.source)) for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  return out;
}

describe("e-mail pictures", () => {
  it("are served as embeddable by any site, while the rest of the site stays same-site", async () => {
    const cfg = require("../../next.config.js");
    const rules: Rule[] = await cfg.headers();
    const email = effective(rules, (s) => s === "/:path*" || s === "/email/:path*");
    const app = effective(rules, (s) => s === "/:path*");
    assert.equal(email["cross-origin-resource-policy"], "cross-origin");
    assert.equal(app["cross-origin-resource-policy"], "same-site");
  });

  it("every picture the intro e-mail uses lives under /email/", () => {
    const html = readFileSync(join(process.cwd(), "emails/vpv-intro.html"), "utf8");
    const srcs = [...html.matchAll(/src="(https:\/\/myvpv\.com\/[^"]+)"/g)].map((m) => m[1]!);
    assert.ok(srcs.length >= 3);
    for (const s of srcs) assert.ok(s.startsWith("https://myvpv.com/email/"), `${s} is outside /email/`);
  });
});
