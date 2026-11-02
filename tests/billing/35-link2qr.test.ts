/**
 * Letters printed by LINK-2-QR: their scans reach our dashboard.
 *
 * Real case (2 Nov 2026): the letter's QR opens LINK-2-QR, which counts the scan
 * and sends everyone to https://myvpv.com, so our dashboard showed 0 opened while
 * LINK-2-QR showed 1. The letters are printed, so the fix lives on our side:
 * import LINK-2-QR's scans, and a bridge link that ties each visit to its scan.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRIDGE_LOOKBACK_MS,
  LINK2QR_BASE,
  bridgeCandidates,
  parseCampaign,
  parseCampaignList,
  scanRowId,
} from "@/lib/link2qr";
import { makeWorld, freshIp, type World } from "./harness/world";
import { VISITOR_HEADER } from "@/lib/analytics/attribution";

/** The shape LINK-2-QR's API really returns (campaign 37, trimmed). */
function campaignBody(scans: Record<string, string[]>, id = 37, dest = "https://myvpv.com") {
  return {
    campaign: { id, name: "Product final test", createdAt: "2026-11-02T11:22:17.205Z" },
    links: [{ id: 43, label: "L-1", destinationUrl: dest, position: 0 }],
    people: Object.entries(scans).map(([code, s], i) => ({
      id: 3345 + i,
      name: `Person ${i}`,
      links: [{ linkId: 43, label: "L-1", code, scans: s, scanCount: s.length, viewed: s.length > 0 }],
    })),
    summary: {},
  };
}

/* ── pure ─────────────────────────────────────────────────────────── */

describe("LINK-2-QR: reading its answers", () => {
  it("reads every scan of every code, with the exact time", () => {
    const c = parseCampaign(campaignBody({ JLJH3SAG: ["2026-11-02T11:31:21.067Z", "2026-11-02T11:39:14.555Z"], AAAA1111: [] }))!;
    assert.equal(c.id, 37);
    assert.deepEqual(c.codes, ["JLJH3SAG", "AAAA1111"]);
    assert.deepEqual(c.scans.map((s) => [s.code, new Date(s.at).toISOString()]), [
      ["JLJH3SAG", "2026-11-02T11:31:21.067Z"],
      ["JLJH3SAG", "2026-11-02T11:39:14.555Z"],
    ]);
    assert.equal(c.links[0]!.destinationUrl, "https://myvpv.com");
  });

  it("ignores junk instead of throwing", () => {
    assert.equal(parseCampaign(null), null);
    assert.equal(parseCampaign({ campaign: {} }), null);
    const c = parseCampaign({ campaign: { id: 1 }, people: [{ links: [{ code: "bad code!", scans: ["x"] }, { code: "OK12", scans: ["nope", 5] }] }] })!;
    assert.deepEqual(c.codes, ["OK12"]);
    assert.deepEqual(c.scans, []);
    assert.deepEqual(parseCampaignList([{ id: 37 }, { id: 29 }, { id: "x" }, { id: 37 }]), [37, 29]);
    assert.deepEqual(parseCampaignList({ campaigns: [{ id: 5 }] }), [5]);
    assert.deepEqual(parseCampaignList("nope"), []);
  });

  it("gives one scan one row id, always the same, shaped as a uuid", () => {
    const at = Date.parse("2026-11-02T11:31:21.067Z");
    const a = scanRowId("JLJH3SAG", at);
    assert.equal(a, scanRowId("JLJH3SAG", at));
    assert.notEqual(a, scanRowId("JLJH3SAG", at + 1));
    assert.notEqual(a, scanRowId("JLJH3SAH", at));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("a bridge visit looks only at scans of the last few minutes, nearest before it first", () => {
    const now = Date.parse("2026-11-02T12:00:00.000Z");
    const s = (code: string, ms: number) => ({ code, at: now + ms });
    const got = bridgeCandidates(
      [s("OLD", -BRIDGE_LOOKBACK_MS - 1), s("A", -60_000), s("B", -1_500), s("C", +3_000), s("FUTURE", +60_000)],
      now
    );
    assert.deepEqual(got.map((x) => x.code), ["B", "A", "C"]);
  });
});

/* ── against the database ─────────────────────────────────────────── */

describe("LINK-2-QR: scans reach the dashboard, and visits are tied to the person", () => {
  let w: World;
  let l2q: Record<number, unknown>;
  let l2qDown = false;
  const realFetch = globalThis.fetch;
  let bridge: (campaign: string, vid: string, query?: string) => Promise<Response>;
  let sync: typeof import("@/lib/server/link2qrSync");

  before(async () => {
    w = await makeWorld();
    // Production has the device / is_repeat columns from this migration; the test base does not.
    await (w.raw as unknown as { exec(sql: string): Promise<unknown> }).exec(
      readFileSync(join(process.cwd(), "supabase/campaign_folders.sql"), "utf8")
    );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(LINK2QR_BASE)) {
        if (l2qDown) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        const path = url.slice(LINK2QR_BASE.length);
        if (path === "/api/campaigns") return Response.json(Object.keys(l2q).map((id) => ({ id: Number(id) })));
        const m = /^\/api\/campaigns\/(\d+)$/.exec(path);
        if (m && l2q[Number(m[1])]) return Response.json(l2q[Number(m[1])]);
        return new Response("not found", { status: 404 });
      }
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch;

    sync = await import("@/lib/server/link2qrSync");
    const route = await import("@/app/q/l2q/[campaign]/route");
    bridge = (campaign, vid, query = "") =>
      route.GET(
        w.request(`/q/l2q/${campaign}${query}`, {
          method: "GET",
          ip: freshIp(),
          headers: { [VISITOR_HEADER]: vid, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1", "x-vercel-ip-city": "Delhi" },
        }),
        { params: { campaign } }
      );
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await w.reset?.();
  });

  beforeEach(async () => {
    l2qDown = false;
    await w.q("delete from public.campaign_scans");
    await w.q("delete from public.site_visitors");
    await w.q("delete from public.campaign_codes");
    for (const code of ["JLJH3SAG", "PEOPLE02", "PEOPLE03"]) {
      await w.q(
        `insert into public.campaign_codes (code, label, destination, source, medium, campaign, active)
         values ($1, $1, '/', 'pamphlet', 'qr', 'Product final test', true)`,
        [code]
      );
    }
  });

  const scansOf = async (code: string) =>
    (await w.q(`select id, created_at, visitor_id, is_repeat, referrer, device, city from public.campaign_scans where code = $1 order by created_at`, [code])) as {
      id: string;
      created_at: Date | string;
      visitor_id: string | null;
      is_repeat: boolean;
      referrer: string | null;
      device: string | null;
      city: string | null;
    }[];

  it("imports LINK-2-QR's scans for our codes, once, however often it runs", async () => {
    l2q = {
      37: campaignBody({ JLJH3SAG: ["2026-11-02T11:31:21.067Z", "2026-11-02T11:39:14.555Z"], PEOPLE02: [] }),
      29: campaignBody({ NOTOURS1: ["2026-10-26T11:29:24.941Z"] }, 29),
    };
    const first = await sync.syncLink2Qr(w.sb, { budgetMs: 5_000, force: true });
    assert.equal(first.ok, true);
    assert.equal(first.imported, 2);
    assert.equal(first.campaigns, 2);
    const again = await sync.syncLink2Qr(w.sb, { budgetMs: 5_000, force: true });
    assert.equal(again.imported, 0, "nothing is counted twice");

    const rows = await scansOf("JLJH3SAG");
    assert.equal(rows.length, 2);
    assert.equal(new Date(rows[0]!.created_at).toISOString(), "2026-11-02T11:31:21.067Z", "the real scan time, not the import time");
    assert.deepEqual(rows.map((r) => r.is_repeat), [false, true]);
    assert.equal(rows[0]!.referrer, `${LINK2QR_BASE}/r/JLJH3SAG`);
    const strangers = await w.q(`select count(*)::int n from public.campaign_scans where code = 'NOTOURS1'`);
    assert.equal((strangers[0] as { n: number }).n, 0, "codes we never uploaded are ignored");
  });

  it("a LINK-2-QR server that does not answer leaves the dashboard as it was", async () => {
    l2q = { 37: campaignBody({ JLJH3SAG: ["2026-11-02T11:31:21.067Z"] }) };
    l2qDown = true;
    const r = await sync.syncLink2Qr(w.sb, { budgetMs: 1_000, force: true });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /did not answer/);
    assert.equal((await scansOf("JLJH3SAG")).length, 0);
  });

  it("the bridge ties the visit to the scan made a moment ago and lands like /q/<code>", async () => {
    const justNow = new Date(Date.now() - 1_200).toISOString();
    l2q = { 37: campaignBody({ JLJH3SAG: ["2026-11-02T11:31:21.067Z", justNow], PEOPLE02: [] }) };
    const vid = "22222222-2222-4222-8222-222222222222";
    const res = await bridge("37", vid);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/");
    assert.equal(to.searchParams.get("vpv"), "JLJH3SAG");
    assert.equal(to.searchParams.get("utm_source"), "pamphlet");
    assert.equal(to.searchParams.get("utm_campaign"), "Product final test");

    const rows = await scansOf("JLJH3SAG");
    assert.equal(rows.length, 2, "the bridge does not add a scan: it is the scan LINK-2-QR counted");
    const claimed = rows.find((r) => new Date(r.created_at).toISOString() === justNow)!;
    assert.equal(claimed.visitor_id, vid);
    assert.equal(claimed.device, "phone");
    assert.equal(claimed.city, "Delhi");
    assert.equal(rows.find((r) => r !== claimed)!.visitor_id, null, "the old scan is not touched");

    const v = await w.q(`select first_code from public.site_visitors where visitor_id = $1`, [vid]);
    assert.equal((v[0] as { first_code: string }).first_code, "JLJH3SAG", "the visitor is attributed to the person");

    // A later import does not undo the bridge's details.
    await sync.syncLink2Qr(w.sb, { budgetMs: 5_000, force: true });
    const after = await scansOf("JLJH3SAG");
    assert.equal(after.length, 2);
    assert.equal(after.find((r) => r.id === claimed.id)!.visitor_id, vid);
  });

  it("two people scanning the same campaign at once each get their own scan", async () => {
    const a = new Date(Date.now() - 2_000).toISOString();
    const b = new Date(Date.now() - 1_000).toISOString();
    l2q = { 37: campaignBody({ JLJH3SAG: [a], PEOPLE02: [b] }) };
    const first = new URL((await bridge("37", "33333333-3333-4333-8333-333333333333")).headers.get("location")!);
    const second = new URL((await bridge("37", "44444444-4444-4444-8444-444444444444")).headers.get("location")!);
    assert.deepEqual([first.searchParams.get("vpv"), second.searchParams.get("vpv")].sort(), ["JLJH3SAG", "PEOPLE02"]);
  });

  it("never claims an old scan, and still lands the visitor when nothing matches", async () => {
    l2q = { 37: campaignBody({ JLJH3SAG: [new Date(Date.now() - 10 * 60_000).toISOString()] }) };
    const res = await bridge("37", "55555555-5555-4555-8555-555555555555", "?to=/why-vpv");
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/why-vpv", "the letter's page, as promised");
    assert.equal(to.searchParams.get("vpv"), null);
    const rows = await scansOf("JLJH3SAG");
    assert.equal(rows[0]!.visitor_id, null);
  });

  it("keeps the letter's page from ?to=, and refuses anything that is not our path", async () => {
    l2q = { 37: campaignBody({ JLJH3SAG: [new Date(Date.now() - 800).toISOString()] }) };
    const ok = new URL((await bridge("37", "66666666-6666-4666-8666-666666666666", "?to=/why-vpv")).headers.get("location")!);
    assert.equal(ok.pathname, "/why-vpv");
    assert.equal(ok.searchParams.get("vpv"), "JLJH3SAG");
    for (const bad of ["?to=https://evil.example", "?to=//evil.example", "?to=/q/l2q/37"]) {
      const to = new URL((await bridge("37", "77777777-7777-4777-8777-777777777777", bad)).headers.get("location")!);
      assert.equal(to.origin, new URL(w.request("/").url).origin, bad);
      assert.equal(to.pathname, "/", bad);
    }
  });

  it("always redirects: LINK-2-QR down, unknown campaign, nonsense id", async () => {
    l2qDown = true;
    for (const c of ["37", "999", "abc", "-1"]) {
      const res = await bridge(c, "88888888-8888-4888-8888-888888888888", "?to=/plans");
      assert.equal(res.status, 302, c);
      assert.equal(new URL(res.headers.get("location")!).pathname, "/plans", c);
    }
  });
});
