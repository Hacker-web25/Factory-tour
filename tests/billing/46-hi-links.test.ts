/**
 * tests/billing/46-hi-links.test.ts — the personal link: /hi/aryan-k7m2xq
 *
 * What these protect: a person scans a letter that cannot be reissued, and
 * whatever is wrong behind the scenes they must land on the site, greeted by
 * the name WE hold for them, with their name never put in the address that
 * Google Analytics and Clarity see.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeWorld, freshIp, type World } from "./harness/world";
import { VISITOR_HEADER } from "@/lib/analytics/attribution";
import { __resetScanCacheForTests } from "@/lib/server/scanRedirect";
import { HI_COOKIE, decodeGreeting } from "@/lib/hiLinks";

const VID = "22222222-2222-4222-8222-222222222222";

/** Count how many times `table` is read while `fn` runs. */
async function readsOf(w: World, table: string, fn: () => Promise<unknown>): Promise<number> {
  const sb = w.sb as any;
  const orig = sb.from.bind(sb);
  let n = 0;
  sb.from = (t: string) => {
    if (t === table) n += 1;
    return orig(t);
  };
  try {
    await fn();
  } finally {
    delete sb.from; // back to the prototype's own method
  }
  return n;
}

describe("/hi/<name>-<code> — the personal link", () => {
  let w: World;
  let hi: (slug: string, vid?: string | null) => Promise<Response>;
  let q: (code: string) => Promise<Response>;

  before(async () => {
    w = await makeWorld();
    // A database that has had supabase/hi_links.sql: the normal state once deployed.
    await w.raw.exec(fs.readFileSync(path.join(process.cwd(), "supabase/hi_links.sql"), "utf8"));
    const hiRoute = await import("@/app/hi/[slug]/route");
    const qRoute = await import("@/app/q/[code]/route");
    hi = (slug, vid = VID) => {
      const headers: Record<string, string> = { "x-vercel-ip-country": "IN" };
      if (vid) headers[VISITOR_HEADER] = vid;
      return hiRoute.GET(w.request(`/hi/${slug}`, { method: "GET", ip: freshIp(), headers }), {
        params: { slug },
      });
    };
    q = (code) =>
      qRoute.GET(
        w.request(`/q/${code}`, { method: "GET", ip: freshIp(), headers: { [VISITOR_HEADER]: VID } }),
        { params: { code } }
      );
  });
  after(async () => w.reset?.());

  beforeEach(async () => {
    __resetScanCacheForTests();
    await w.q("delete from public.campaign_scans");
    await w.q("delete from public.campaign_codes");
    await w.q("delete from public.site_visitors");
    await w.q(
      `insert into public.campaign_codes (code, label, destination, source, medium, campaign, active, person_name, person_company)
       values ('K7M2XQ','Aryan Kapoor','/','letter','qr','nov26', true, 'Dr. Aryan Kapoor', 'Kapoor Pumps'),
              ('GGN-ABC234','Rajesh','/plans','letter','qr','nov26', true, 'Rajesh Kumar Sharma', null)`
    );
  });

  it("redirects a name-plus-code link to the page, stamped like every other scan", async () => {
    const res = await hi("aryan-k7m2xq");
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/");
    assert.equal(to.searchParams.get("utm_source"), "letter");
    assert.equal(to.searchParams.get("utm_medium"), "qr");
    assert.equal(to.searchParams.get("utm_campaign"), "nov26");
    assert.equal(to.searchParams.get("vpv"), "K7M2XQ");
  });

  it("never puts the name in the address the page, Google or Clarity will see", async () => {
    const res = await hi("aryan-k7m2xq");
    const to = res.headers.get("location")!;
    assert.ok(!/aryan|kapoor/i.test(to), `the destination leaked a name: ${to}`);
  });

  it("hands the greeting over in a cookie, skipping the title: Dr. Aryan -> Aryan", async () => {
    const res = await hi("aryan-k7m2xq");
    const c = res.headers.get("set-cookie") ?? "";
    assert.ok(c.includes(`${HI_COOKIE}=`), "the greeting cookie is set");
    const val = c.match(new RegExp(`${HI_COOKIE}=([^;]+)`))![1];
    assert.equal(decodeGreeting(val), "Aryan");
    assert.match(c, /max-age=3600/i, "it lives an hour, long enough for the first page load and no longer");
  });

  it("ignores the name in the link: a wrong or mistyped name still finds the person", async () => {
    for (const slug of ["zzz-k7m2xq", "k7m2xq", "ARYAN-K7M2XQ", "aryan-kapor-k7m2xq"]) {
      const res = await hi(slug);
      assert.equal(new URL(res.headers.get("location")!).searchParams.get("vpv"), "K7M2XQ", slug);
      const c = res.headers.get("set-cookie") ?? "";
      assert.equal(decodeGreeting(c.match(new RegExp(`${HI_COOKIE}=([^;]+)`))![1]), "Aryan", slug);
    }
  });

  it("finds an older PREFIX-CODE code behind a name", async () => {
    const res = await hi("rajesh-ggn-abc234");
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/plans");
    assert.equal(to.searchParams.get("vpv"), "GGN-ABC234");
  });

  it("greets people who scan the older /q/<code> letters too", async () => {
    const res = await q("K7M2XQ");
    assert.equal(res.status, 302);
    const c = res.headers.get("set-cookie") ?? "";
    assert.equal(decodeGreeting(c.match(new RegExp(`${HI_COOKIE}=([^;]+)`))![1]), "Aryan");
  });

  it("records the scan and the first touch, exactly as /q does", async () => {
    await hi("aryan-k7m2xq");
    const scans = await w.q("select code, visitor_id, country from public.campaign_scans");
    assert.equal(scans.length, 1);
    assert.equal(scans[0]!.code, "K7M2XQ");
    assert.equal(scans[0]!.country, "IN");
    const v = await w.q("select first_code, first_source, page_views from public.site_visitors");
    assert.equal(v[0]!.first_code, "K7M2XQ");
    assert.equal(Number(v[0]!.page_views), 0, "the page view after the redirect is the visit");
  });

  it("makes ONE database read to find the person, however many spellings it tries", async () => {
    // The scan bookkeeping writes through rpc(), not from("campaign_codes"), so
    // every from("campaign_codes") during a scan is a lookup.
    const reads = await readsOf(w, "campaign_codes", () => hi("aryan-ggn-abc234"));
    assert.equal(reads, 1, "one lookup between the scan and the redirect");
  });

  it("answers a second scan of the same code without asking the database again", async () => {
    await hi("aryan-k7m2xq");
    const reads = await readsOf(w, "campaign_codes", () => hi("aryan-k7m2xq"));
    assert.equal(reads, 0);
    // ...but the scan itself is still counted.
    assert.equal((await w.q("select 1 from public.campaign_scans")).length, 2);
  });

  it("lands on the homepage, with no greeting, for a code that was never printed", async () => {
    const res = await hi("someone-zzzzzz");
    assert.equal(res.status, 302);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/");
    assert.ok(!(res.headers.get("set-cookie") ?? "").includes(HI_COOKIE));
    assert.equal((await w.q("select 1 from public.campaign_scans")).length, 0);
  });

  it("lands on the homepage for junk in the link", async () => {
    for (const slug of ["", "%%%", "a".repeat(300), "..%2F..%2Fetc"]) {
      const res = await hi(slug);
      assert.equal(res.status, 302, JSON.stringify(slug));
      assert.equal(new URL(res.headers.get("location")!).pathname, "/");
    }
  });

  it("never caches the redirect", async () => {
    const res = await hi("aryan-k7m2xq");
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  });

  it("works for a visitor with no cookie yet", async () => {
    const res = await hi("aryan-k7m2xq", null);
    assert.equal(res.status, 302);
    assert.equal((await w.q("select visitor_id from public.campaign_scans"))[0]!.visitor_id, null);
  });

  it("uses the 'greeting name' override when the owner filled one in", async () => {
    await w.q("update public.campaign_codes set greeting_name = 'Rajesh ji' where code = 'GGN-ABC234'");
    __resetScanCacheForTests();
    const res = await hi("rajesh-ggn-abc234");
    const c = res.headers.get("set-cookie") ?? "";
    assert.equal(decodeGreeting(c.match(new RegExp(`${HI_COOKIE}=([^;]+)`))![1]), "Rajesh ji");
  });
});

describe("/hi before hi_links.sql has been run", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  after(async () => w.reset?.());

  it("still redirects, and still greets by first name, when the override column does not exist", async () => {
    __resetScanCacheForTests();
    await w.q("alter table public.campaign_codes drop column if exists greeting_name");
    await w.q(
      `insert into public.campaign_codes (code, label, destination, source, medium, campaign, active, person_name)
       values ('K7M2XQ','x','/','letter','qr','nov26', true, 'Aryan Kapoor')`
    );
    const route = await import("@/app/hi/[slug]/route");
    const res = await route.GET(
      w.request("/hi/aryan-k7m2xq", { method: "GET", ip: freshIp(), headers: { [VISITOR_HEADER]: VID } }),
      { params: { slug: "aryan-k7m2xq" } }
    );
    assert.equal(res.status, 302);
    assert.equal(new URL(res.headers.get("location")!).searchParams.get("vpv"), "K7M2XQ");
    const c = res.headers.get("set-cookie") ?? "";
    assert.equal(decodeGreeting(c.match(new RegExp(`${HI_COOKIE}=([^;]+)`))![1]), "Aryan");
  });
});
