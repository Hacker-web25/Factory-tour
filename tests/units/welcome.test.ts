/**
 * The personal welcome: guards for the three ways it can quietly break.
 *   1. public/welcome/welcome.js goes stale because someone edited the source
 *      and forgot to build (the browser then runs the OLD animation).
 *   2. The gate misfires, showing the welcome to people who did not scan a QR,
 *      or failing to cover the page and letting the homepage flash.
 *   3. A page loses the gate and the welcome silently stops appearing there.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { WELCOME_GATE_JS, WELCOME_SCRIPT, WELCOME_VERSION } from "@/lib/welcome/gate";
import { HI_COOKIE } from "@/lib/hiLinks";
import { renderSiteHtml } from "@/lib/site/home";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("public/welcome/welcome.js", () => {
  const built = read("public/welcome/welcome.js");

  it("is exactly what the build makes from welcome.src.js and satisfy.json", () => {
    const src = read("scripts/welcome/welcome.src.js");
    const glyphs = read("scripts/welcome/satisfy.json").trim();
    assert.ok(
      built.endsWith(src.replace("/*GLYPHS*/ null", glyphs)),
      "stale: run `node scripts/welcome/build.mjs` (and bump WELCOME_VERSION in lib/welcome/gate.ts)"
    );
  });

  it("is valid JavaScript", () => {
    assert.doesNotThrow(() => new vm.Script(built));
  });

  it("carries the licence notice for the handwriting", () => {
    assert.match(built.slice(0, 400), /Satisfy/);
    assert.match(built.slice(0, 400), /Vara/);
  });

  it("can write every letter of the alphabet, both cases", () => {
    const f = JSON.parse(read("scripts/welcome/satisfy.json"));
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'-.") {
      assert.ok(f.g[c], `no pen path for ${c}`);
      assert.ok(f.g[c].p.length >= 1 && f.g[c].w > 0);
    }
  });

  it("stays small: it is fetched on a phone, on a scan", () => {
    assert.ok(built.length < 40_000, `${built.length} bytes`);
  });
});

describe("the gate", () => {
  it("contains nothing that would break the template it is pasted into", () => {
    assert.ok(!WELCOME_GATE_JS.includes("`"));
    assert.ok(!WELCOME_GATE_JS.includes("${"));
    assert.ok(!WELCOME_GATE_JS.includes("</script"));
    assert.doesNotThrow(() => new vm.Script(WELCOME_GATE_JS));
  });

  /** Run the gate against a pretend browser and report what it did. */
  function run(o: { search: string; cookie: string; seen?: boolean }) {
    const added: { tag: string; id?: string; src?: string; textContent?: string }[] = [];
    const timers: number[] = [];
    const sandbox: any = {
      location: { search: o.search },
      document: {
        cookie: o.cookie,
        head: { appendChild: (el: any) => added.push(el) },
        createElement: (tag: string) => ({ tag }),
        getElementById: () => null,
      },
      sessionStorage: { getItem: () => (o.seen ? "1" : null) },
      setTimeout: (_f: unknown, ms: number) => timers.push(ms),
    };
    vm.runInNewContext(WELCOME_GATE_JS, sandbox);
    return { added, timers };
  }

  it("does nothing for an ordinary visitor", () => {
    assert.equal(run({ search: "", cookie: "a=b" }).added.length, 0);
  });
  it("does nothing for someone who has a code but no greeting cookie (a shared link)", () => {
    assert.equal(run({ search: "?vpv=K7M2XQ", cookie: "a=b" }).added.length, 0);
  });
  it("does nothing for someone who has the cookie but no code in the address", () => {
    assert.equal(run({ search: "", cookie: `${HI_COOKIE}=Aryan` }).added.length, 0);
  });
  it("does nothing a second time in the same tab", () => {
    assert.equal(run({ search: "?vpv=K7M2XQ", cookie: `${HI_COOKIE}=Aryan`, seen: true }).added.length, 0);
  });
  it("covers the page and fetches the script for a person who scanned their own QR", () => {
    const { added, timers } = run({ search: "?utm_source=letter&vpv=K7M2XQ", cookie: `x=1; ${HI_COOKIE}=Aryan; y=2` });
    const cover = added.find((e) => e.id === "vpv-hi-cover");
    const script = added.find((e) => e.tag === "script");
    assert.ok(cover && /html::before/.test(cover.textContent ?? ""), "a CSS-only cover, so nothing is inserted into React's tree");
    assert.equal(script?.src, `${WELCOME_SCRIPT}?v=${WELCOME_VERSION}`);
    assert.ok(timers.includes(4000), "a failsafe removes the cover if the script never arrives");
  });
});

describe("the pages carry the gate", () => {
  it("the marketing pages (home, plans, FAQ…) have it in <head>", () => {
    for (const p of ["/", "/plans", "/faq"]) {
      const html = renderSiteHtml(p);
      assert.ok(html.includes('id="vpv-hi-gate"'), p);
      assert.ok(html.indexOf('id="vpv-hi-gate"') < html.indexOf("</head>"), `${p}: gate must be in the head`);
    }
  });
  it("the app's own pages have it through the root layout", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /<WelcomeGate \/>/);
    assert.ok(layout.indexOf("<WelcomeGate />") < layout.indexOf("<body"), "in <head>, before the body");
  });
  it("is explained on the cookie page", () => {
    const page = read("app/cookies/page.tsx");
    assert.ok(page.includes(HI_COOKIE));
    assert.ok(page.includes("vpv_hi_seen"));
  });
});
