/**
 * The marketing analytics: the printed QR code, first-touch attribution,
 * and the report that says whether a print run paid for itself.
 *
 * The QR route gets the most attention here, because a pamphlet cannot be
 * recalled: whatever this code does on a bad day, it has to still land the
 * visitor somewhere sensible.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { campaignReport, sourceReport } from "@/lib/campaignReport";
import {
  classifyReferrer,
  isSafePath,
  normaliseCode,
  parseAttribution,
} from "@/lib/analytics/attribution";
import { makeWorld, freshIp, type World } from "./harness/world";
import { VISITOR_HEADER } from "@/lib/analytics/attribution";

/* ── pure helpers ─────────────────────────────────────────────────── */

describe("campaign codes: what is a valid code", () => {
  it("accepts the kind of code you would print", () => {
    for (const c of ["GGN-OCT26", "pamphlet_1", "A1", "EXPO2026"]) {
      assert.equal(normaliseCode(c), c, c);
    }
  });

  it("refuses anything that could break a URL or a query", () => {
    for (const c of ["", "A", "a".repeat(41), "has space", "semi;colon", "../etc", "ü", null, 42]) {
      assert.equal(normaliseCode(c as unknown), null, String(c));
    }
  });
});

describe("a code can never become an open redirect", () => {
  it("accepts only paths on our own site", () => {
    for (const p of ["/", "/plans", "/assessment?x=1"]) assert.ok(isSafePath(p), p);
  });

  it("refuses anything that would leave myvpv.com", () => {
    for (const p of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil",
      "/" + "a".repeat(400),
    ]) {
      assert.ok(!isSafePath(p), p);
    }
  });
});

describe("where a visitor came from", () => {
  it("files a search engine as organic, not as a referral", () => {
    assert.deepEqual(classifyReferrer("https://www.google.co.in/search?q=x"), {
      source: "google",
      medium: "organic",
    });
  });

  it("gives the AI assistants their own medium, so 'did ChatGPT send anyone' is answerable", () => {
    for (const ref of ["https://chatgpt.com/", "https://www.perplexity.ai/x", "https://claude.ai/chat"]) {
      assert.equal(classifyReferrer(ref).medium, "ai_assistant", ref);
    }
  });

  it("treats no referrer as direct, and our own pages as not a new source", () => {
    assert.deepEqual(classifyReferrer(null), { source: "direct", medium: "none" });
    assert.deepEqual(classifyReferrer("https://myvpv.com/plans"), { source: null, medium: null });
  });

  it("lets utm_* win over the referrer, because that is what the link said", () => {
    const a = parseAttribution(
      new URL("https://myvpv.com/plans?utm_source=pamphlet&utm_medium=qr&vpv=GGN-OCT26"),
      "https://www.google.com/"
    );
    assert.equal(a.source, "pamphlet");
    assert.equal(a.medium, "qr");
    assert.equal(a.code, "GGN-OCT26");
  });
});

/* ── the report ───────────────────────────────────────────────────── */

describe("the campaign report", () => {
  const codes = [
    { code: "GGN", label: "Gurugram pamphlet", destination: "/", source: "pamphlet", medium: "qr", campaign: null, active: true, created_at: "2026-10-01T00:00:00Z" },
    { code: "EXPO", label: "Expo flyer", destination: "/plans", source: "pamphlet", medium: "qr", campaign: null, active: true, created_at: "2026-10-02T00:00:00Z" },
  ];

  it("counts scans and PEOPLE separately — one person often scans twice", () => {
    const rows = campaignReport({
      codes,
      scans: [
        { code: "GGN", visitor_id: "v1" },
        { code: "GGN", visitor_id: "v1" },
        { code: "GGN", visitor_id: "v2" },
      ],
      leads: [],
      orders: [],
    });
    const ggn = rows.find((r) => r.code === "GGN")!;
    assert.equal(ggn.scans, 3);
    assert.equal(ggn.people, 2);
  });

  it("follows a scan through to the money, and counts only orders that were PAID", () => {
    const rows = campaignReport({
      codes,
      scans: [{ code: "GGN", visitor_id: "v1" }],
      leads: [
        { campaign_code: "GGN", utm_source: "pamphlet", utm_medium: "qr", stage: "paid", order_id: "o1" },
        { campaign_code: "GGN", utm_source: "pamphlet", utm_medium: "qr", stage: "billing", order_id: null },
        { campaign_code: "GGN", utm_source: "pamphlet", utm_medium: "qr", stage: "info", order_id: null },
        // Opened an order and never paid: an enquiry, not revenue.
        { campaign_code: "EXPO", utm_source: "pamphlet", utm_medium: "qr", stage: "billing", order_id: "o2" },
      ],
      orders: [
        { id: "o1", amount_paise: 11_49_600, status: "paid" },
        { id: "o2", amount_paise: 50_00_000, status: "created" },
      ],
    });
    const ggn = rows.find((r) => r.code === "GGN")!;
    assert.equal(ggn.enquiries, 3);
    assert.equal(ggn.reachedBilling, 2, "'paid' is past the bill too");
    assert.equal(ggn.paid, 1);
    assert.equal(ggn.revenueInr, 11_496);

    const expo = rows.find((r) => r.code === "EXPO")!;
    assert.equal(expo.enquiries, 1);
    assert.equal(expo.paid, 0);
    assert.equal(expo.revenueInr, 0, "an unpaid order is not revenue");
  });

  it("puts the code that made money first", () => {
    const rows = campaignReport({
      codes,
      scans: [{ code: "EXPO", visitor_id: "v9" }, { code: "EXPO", visitor_id: "v8" }],
      leads: [{ campaign_code: "GGN", utm_source: null, utm_medium: null, stage: "paid", order_id: "o1" }],
      orders: [{ id: "o1", amount_paise: 100_000, status: "paid" }],
    });
    assert.equal(rows[0]!.code, "GGN", "revenue beats reach");
  });

  it("groups everyone by source, so 'is any of this working' has an answer", () => {
    const rows = sourceReport({
      visitors: [
        { first_source: "pamphlet", first_medium: "qr" },
        { first_source: "pamphlet", first_medium: "qr" },
        { first_source: "google", first_medium: "organic" },
        { first_source: null, first_medium: null },
      ],
      leads: [{ campaign_code: "GGN", utm_source: "pamphlet", utm_medium: "qr", stage: "paid", order_id: "o1" }],
      orders: [{ id: "o1", amount_paise: 100_000, status: "paid" }],
    });
    const pamphlet = rows.find((r) => r.source === "pamphlet")!;
    assert.equal(pamphlet.people, 2);
    assert.equal(pamphlet.paid, 1);
    assert.ok(rows.some((r) => r.source === "direct"), "unknown origin is shown as direct");
  });
});

/* ── the printed QR code ──────────────────────────────────────────── */

describe("/q/<code> — the link on the pamphlet", () => {
  let w: World;
  let qr: (code: string, vid?: string | null) => Promise<Response>;

  before(async () => {
    w = await makeWorld();
    const route = await import("@/app/q/[code]/route");
    qr = (code, vid = "11111111-1111-4111-8111-111111111111") => {
      const headers: Record<string, string> = { "x-vercel-ip-country": "IN" };
      if (vid) headers[VISITOR_HEADER] = vid;
      return route.GET(
        w.request(`/q/${code}`, { method: "GET", ip: freshIp(), headers }),
        { params: { code } }
      );
    };
  });
  after(async () => w.reset?.());

  beforeEach(async () => {
    await w.q("delete from public.campaign_scans");
    await w.q("delete from public.campaign_codes");
    await w.q("delete from public.site_visitors");
    await w.q(
      `insert into public.campaign_codes (code, label, destination, source, medium, campaign, active)
       values ('GGN','Gurugram pamphlet','/plans','pamphlet','qr','oct26', true)`
    );
  });

  it("redirects to the page, stamped so Google groups it the same way we do", async () => {
    const res = await qr("GGN");
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/plans");
    assert.equal(to.searchParams.get("utm_source"), "pamphlet");
    assert.equal(to.searchParams.get("utm_medium"), "qr");
    assert.equal(to.searchParams.get("utm_campaign"), "oct26");
    assert.equal(to.searchParams.get("vpv"), "GGN");
  });

  it("is never cached, or the second scan would never reach us", async () => {
    const res = await qr("GGN");
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.notEqual(res.status, 301, "a permanent redirect would be cached forever");
  });

  it("records the scan server-side, so it counts even with every script blocked", async () => {
    await qr("GGN");
    const rows = await w.q("select code, visitor_id, country from public.campaign_scans");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.code, "GGN");
    assert.equal(rows[0]!.country, "IN");
  });

  it("remembers the pamphlet as the FIRST touch, and does not count the scan as a visit", async () => {
    await qr("GGN");
    const v = await w.q("select first_code, first_source, page_views from public.site_visitors");
    assert.equal(v.length, 1);
    assert.equal(v[0]!.first_code, "GGN");
    assert.equal(v[0]!.first_source, "pamphlet");
    assert.equal(
      Number(v[0]!.page_views),
      0,
      "the page view after the redirect is the visit; counting it here would double every scan"
    );
  });

  it("keeps the pamphlet's credit when the same person returns from Google", async () => {
    await qr("GGN");
    // Same browser, later, with no campaign at all.
    await w.q(
      `select public.vpv_touch_visitor('11111111-1111-4111-8111-111111111111'::uuid,
        'google','organic',null,null,'https://google.com/','/','IN','Gurugram',true)`
    );
    const v = await w.q("select first_code, first_source, page_views from public.site_visitors");
    assert.equal(v[0]!.first_code, "GGN", "first touch is never overwritten");
    assert.equal(v[0]!.first_source, "pamphlet");
    assert.equal(Number(v[0]!.page_views), 1);
  });

  it("still lands the visitor somewhere for a code that was never created", async () => {
    const res = await qr("NEVERPRINTED");
    assert.equal(res.status, 302);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/");
    assert.equal((await w.q("select 1 from public.campaign_scans")).length, 0);
  });

  it("still lands the visitor somewhere for a code that was switched off", async () => {
    await w.q("update public.campaign_codes set active = false where code = 'GGN'");
    const res = await qr("GGN");
    assert.equal(res.status, 302);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/");
  });

  it("refuses to send anyone off myvpv.com, even if the row says to", async () => {
    // The CHECK constraint is the real guard; this proves the code agrees.
    await assert.rejects(
      () => w.q("update public.campaign_codes set destination = 'https://evil.example' where code='GGN'"),
      "the database refuses an off-site destination outright"
    );
  });

  it("works for a visitor with no cookie yet — the scan is still counted", async () => {
    const res = await qr("GGN", null);
    assert.equal(res.status, 302);
    const rows = await w.q("select visitor_id from public.campaign_scans");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.visitor_id, null);
  });

  it("matches a code typed in by hand in the wrong case", async () => {
    const res = await qr("ggn");
    assert.equal(new URL(res.headers.get("location")!).pathname, "/plans");
  });
});

describe("the security policy lets the analytics tags run", () => {
  // A Content-Security-Policy that omits Google or Microsoft makes the
  // browser silently drop the tag: the dashboards stay empty and nothing
  // errors on our side. This happened once; this keeps it from happening
  // again when someone tightens the policy.
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const config = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf8");
  const directive = (name: string) => {
    const m = config.match(new RegExp(`"(${name} [^"]*)"`));
    assert.ok(m, `no ${name} directive found in next.config.js`);
    return m![1];
  };

  it("allows the Google and Microsoft scripts to load", () => {
    const d = directive("script-src");
    assert.ok(d.includes("https://*.googletagmanager.com"));
    assert.ok(d.includes("https://*.clarity.ms"));
  });

  it("allows both to send what they collect", () => {
    const d = directive("connect-src");
    assert.ok(d.includes("https://*.google-analytics.com"));
    assert.ok(d.includes("https://*.analytics.google.com"));
    assert.ok(d.includes("https://*.clarity.ms"));
  });

  it("allows the tracking pixels", () => {
    const d = directive("img-src");
    assert.ok(d.includes("https://*.google-analytics.com"));
    assert.ok(d.includes("https://*.clarity.ms"));
  });
});

describe("the marketing pages measure visitors too", () => {
  // The marketing pages are a prebuilt shell outside the app layout, so the
  // React <Analytics /> and <CookieNotice /> never ran on them. For a while
  // the home page, where every pamphlet scan lands, recorded nothing and
  // showed no cookie notice. These tests keep that from coming back.
  const { renderSiteHtml } = require("@/lib/site/home") as typeof import("@/lib/site/home");
  const { measureScriptTag } = require("@/lib/site/measure") as typeof import("@/lib/site/measure");
  const { SITE_PAGES } = require("@/lib/site/pages") as typeof import("@/lib/site/pages");
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");

  const IDS = { ga: "G-ABCDEF1234", clarity: "abcd123456" };

  it("puts the measuring script on every page of the shell", () => {
    for (const p of SITE_PAGES) {
      assert.ok(renderSiteHtml(p.path).includes('id="vpv-measure"'), `${p.path} has no measuring script`);
    }
  });

  it("is valid JavaScript, so one typo cannot silently drop all measurement", () => {
    const tag = measureScriptTag(IDS);
    const body = tag.replace(/^<script id="vpv-measure">/, "").replace(/<\/script>$/, "");
    assert.doesNotThrow(() => new Function(body));
    assert.equal(body.includes("</script"), false, "would close its own tag early");
  });

  it("carries both ids, the first-party endpoint and both buttons", () => {
    const tag = measureScriptTag(IDS);
    for (const need of [
      "G-ABCDEF1234",
      "abcd123456",
      "/api/track",
      "Essential only",
      "Accept all",
      "vpv_no_analytics",
    ]) {
      assert.ok(tag.includes(need), `missing: ${need}`);
    }
  });

  it("agrees with the app pages on every storage key and the opt-out cookie", () => {
    const tag = measureScriptTag(IDS);
    const notice = fs.readFileSync(path.join(process.cwd(), "components/analytics/CookieNotice.tsx"), "utf8");
    const client = fs.readFileSync(path.join(process.cwd(), "lib/analytics/client.ts"), "utf8");
    const attribution = fs.readFileSync(path.join(process.cwd(), "lib/analytics/attribution.ts"), "utf8");
    assert.ok(notice.includes('"vpv.cookie.notice.v1"') && tag.includes("vpv.cookie.notice.v1"));
    assert.ok(client.includes('"vpv.attr.v1"') && tag.includes("vpv.attr.v1"));
    assert.ok(client.includes('"vpv.sid.v1"') && tag.includes("vpv.sid.v1"));
    assert.ok(attribution.includes('"vpv_no_analytics"') && tag.includes("vpv_no_analytics"));
  });

  it("writes no id into the page when none is configured", () => {
    const tag = measureScriptTag({ ga: "", clarity: "" });
    assert.ok(tag.includes('{"ga":"","cl":""}'));
  });

  it("cannot be turned into a script-injection hole by a bad id", () => {
    const tag = measureScriptTag({ ga: "</script><script>alert(1)</script>", clarity: "" });
    assert.equal(tag.split("</script>").length, 2, "a stray id closed the tag");
  });
});
