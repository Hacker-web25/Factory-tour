/**
 * tests/billing/47-hi-letters.test.ts — from a pasted list to a printed letter.
 *
 * The whole chain, against a real schema: the owner pastes a list, every
 * person gets a bare random code and a /hi/<name>-<code> link, the owner
 * downloads the print pack, and scanning the link greets the person by the
 * name WE hold for them. A letter cannot be reissued, so each link in the
 * pack must work as printed.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { makeWorld, freshIp, type World } from "./harness/world";
import { VISITOR_HEADER } from "@/lib/analytics/attribution";
import { __resetScanCacheForTests } from "@/lib/server/scanRedirect";
import { HI_COOKIE, decodeGreeting } from "@/lib/hiLinks";

const VID = "22222222-2222-4222-8222-222222222222";
const LIST = [
  "Name\tCompany\tGreeting name\tMobile",
  "Dr. Rajesh Kumar Sharma\tSharma Forge\tRajesh\t098765 43210",
  "Aryan Kapoor\tKapoor Pumps\t\t",
  "Meera Shah\t\t\t",
].join("\n");

describe("personal letters: list → codes → scan → print pack", () => {
  let w: World;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let people: any, pack: any, hiRoute: any;
  let owner: string;

  before(async () => {
    w = await makeWorld();
    owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
    await w.raw.exec(fs.readFileSync(path.join(process.cwd(), "supabase/hi_links.sql"), "utf8"));
    // Print runs, the print number and the phone / e-mail columns: the world loads only analytics.sql.
    await w.raw.exec(fs.readFileSync(path.join(process.cwd(), "supabase/campaign_folders.sql"), "utf8"));
    people = await import("@/app/api/admin/marketing/people/route");
    pack = await import("@/app/api/admin/marketing/people/pack/route");
    hiRoute = await import("@/app/hi/[slug]/route");
  });
  after(async () => w.reset?.());
  beforeEach(async () => {
    __resetScanCacheForTests();
    await w.q("delete from public.campaign_scans");
    await w.q("delete from public.campaign_codes");
    await w.q("delete from public.campaign_folders");
    await w.q("delete from public.site_visitors");
  });

  const make = async (text = LIST, extra: Record<string, unknown> = {}, as = owner) => {
    const res = await people.POST(
      w.request("/api/admin/marketing/people", {
        as,
        body: { text, campaign: "Nov 26 letters", style: "hi", destination: "/", ...extra },
      })
    );
    return { res, body: await w.readJson(res) };
  };
  const getPack = (qs: string, as = owner) =>
    pack.GET(w.request(`/api/admin/marketing/people/pack${qs}`, { method: "GET", as }));
  const scan = (slug: string) =>
    hiRoute.GET(
      w.request(`/hi/${slug}`, { method: "GET", ip: freshIp(), headers: { [VISITOR_HEADER]: VID } }),
      { params: { slug } }
    );

  it("gives each person a bare six-character code and a /hi/ link with their name", async () => {
    const { res, body } = await make();
    assert.equal(res.status, 200);
    assert.equal(body.style, "hi");
    assert.equal(body.count, 3);
    for (const r of body.rows) {
      assert.match(r.code, /^[A-Z0-9]{6}$/, "no prefix, no hyphen");
      assert.match(r.url, /^https:\/\/myvpv\.com\/hi\/[a-z]+-[a-z0-9]{6}$/);
      assert.ok(r.url.endsWith(`-${r.code.toLowerCase()}`));
    }
    assert.deepEqual(
      body.rows.map((r: { url: string }) => r.url.split("/hi/")[1]!.split("-")[0]),
      ["rajesh", "aryan", "meera"],
      "the greeting wins over a title, the first name is used otherwise"
    );
    const rows = await w.q(`select person_name, person_company, greeting_name, recipient_phone, campaign, source from public.campaign_codes order by person_name`);
    assert.equal(rows.length, 3);
    const raj = rows.find((r: { person_name: string }) => r.person_name.startsWith("Dr."));
    assert.equal(raj.greeting_name, "Rajesh");
    assert.equal(raj.recipient_phone, "09876543210");
    assert.equal(raj.campaign, "Nov 26 letters");
    const aryan = rows.find((r: { person_name: string }) => r.person_name === "Aryan Kapoor");
    assert.equal(aryan.greeting_name, null, "no override typed: the first name is used");
  });

  it("every printed link works: it lands on the site and greets the person the way we chose", async () => {
    const { body } = await make();
    const expected: Record<string, string> = { "Dr. Rajesh Kumar Sharma": "Rajesh", "Aryan Kapoor": "Aryan", "Meera Shah": "Meera" };
    for (const r of body.rows) {
      __resetScanCacheForTests();
      const out = await scan(r.url.split("/hi/")[1]!);
      assert.equal(out.status, 302, r.url);
      const to = new URL(out.headers.get("location")!);
      assert.equal(to.pathname, "/");
      assert.equal(to.searchParams.get("vpv")?.toUpperCase(), r.code);
      assert.equal(/aryan|meera|rajesh|kapoor|shah|sharma/i.test(to.toString()), false, "no name in the address that Google and Clarity see");
      const cookie = (out.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${HI_COOKIE}=`));
      assert.ok(cookie, "the greeting cookie is set");
      assert.equal(decodeGreeting(cookie!.split(";")[0]!.slice(HI_COOKIE.length + 1)), expected[r.name]);
    }
  });

  it("a hand-edited name in the link changes nothing: the code decides who it is", async () => {
    const { body } = await make();
    const meera = body.rows.find((r: { name: string }) => r.name === "Meera Shah");
    const out = await scan(`someone-else-${meera.code.toLowerCase()}`);
    assert.equal(out.status, 302);
    const cookie = (out.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${HI_COOKIE}=`))!;
    assert.equal(decodeGreeting(cookie.split(";")[0]!.slice(HI_COOKIE.length + 1)), "Meera");
  });

  it("returns a spreadsheet with the link for each person", async () => {
    const { body } = await make();
    const lines = (body.csv as string).trim().split("\r\n");
    assert.ok(lines[0]!.includes("Link"));
    assert.equal(lines.length, 4);
    for (const r of body.rows) assert.ok(body.csv.includes(r.url));
  });

  it("is all or nothing: a list that cannot be saved leaves no codes behind", async () => {
    // Without the Greeting column in the database, a list that uses it is refused whole.
    await w.q(`alter table public.campaign_codes drop constraint if exists campaign_codes_greeting_name_len`);
    await w.q(`alter table public.campaign_codes drop column greeting_name`);
    try {
      const { res, body } = await make();
      assert.equal(res.status, 409);
      assert.match(body.message, /hi_links\.sql/);
      assert.equal((await w.q(`select count(*)::int n from public.campaign_codes`))[0].n, 0);
      // A list with no greetings does not need the column and still works.
      const plain = await make("Aryan Kapoor, Kapoor Pumps\nMeera Shah");
      assert.equal(plain.res.status, 200);
      assert.equal(plain.body.count, 2);
    } finally {
      await w.raw.exec(fs.readFileSync(path.join(process.cwd(), "supabase/hi_links.sql"), "utf8"));
    }
  });

  it("leaves the existing /q/ batch exactly as it was", async () => {
    const res = await people.POST(
      w.request("/api/admin/marketing/people", { as: owner, body: { text: "Aryan, Acme", campaign: "Old style", prefix: "ggn" } })
    );
    const body = await w.readJson(res);
    assert.match(body.rows[0].code, /^GGN-[A-Z0-9]{6}$/);
    assert.equal(body.rows[0].url, `https://myvpv.com/q/${body.rows[0].code}`);
    assert.equal(body.csv.split("\n")[0], "name,company,code,link");
  });

  it("is for the owner only", async () => {
    const customer = await w.seedUser({ email: "c@x.in", role: "org_admin" });
    assert.equal((await make(LIST, {}, customer)).res.status, 403);
    assert.equal((await getPack("?batch=Nov%2026%20letters", customer)).status, 403);
    assert.equal((await w.q(`select count(*)::int n from public.campaign_codes`))[0].n, 0);
  });

  describe("filed under a print run", () => {
    const run = async () =>
      (await w.q(
        `insert into public.campaign_folders (name, slug, destination, channel, active, printed_count)
         values ('Gurugram Nov 26', 'ggn-nov26', '/', 'courier', true, 240) returning id`
      ))[0];

    it("numbers the letters 1, 2, 3 and carries on from there in the next batch", async () => {
      await run();
      const a = await make(LIST, { folderSlug: "ggn-nov26", campaign: undefined });
      assert.equal(a.res.status, 200);
      assert.equal(a.body.folder.slug, "ggn-nov26");
      const b = await make("Imran Ali, Ali Tools", { folderSlug: "ggn-nov26", campaign: undefined });
      assert.equal(b.res.status, 200);
      const seqs = (await w.q(`select print_seq from public.campaign_codes order by print_seq`)).map((r: { print_seq: number }) => r.print_seq);
      assert.deepEqual(seqs, [1, 2, 3, 4]);
    });

    it("packs the whole run in print order, whichever batch each person came in", async () => {
      await run();
      await make(LIST, { folderSlug: "ggn-nov26", campaign: undefined });
      const b = await make("Imran Ali, Ali Tools", { folderSlug: "ggn-nov26", campaign: undefined });
      const res = await getPack("?folder=ggn-nov26");
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-disposition")!, /gurugram-nov-26-letters\.zip/);
      const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
      const rows = strFromU8(files["links.csv"]!).trim().split("\r\n").slice(1);
      assert.deepEqual(rows.map((l) => l.split(",")[0]), ["1", "2", "3", "4"]);
      assert.ok(rows[3]!.includes(b.body.rows[0].url));
      assert.equal(Object.keys(files).filter((n) => n.startsWith("png/")).length, 4);
    });
  });

  describe("the print pack", () => {
    it("holds the spreadsheet, one PDF page per person, and a PNG and an SVG for each", async () => {
      const { body } = await make();
      const res = await getPack("?batch=Nov%2026%20letters");
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "application/zip");
      assert.match(res.headers.get("content-disposition")!, /nov-26-letters-letters\.zip/);
      const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
      const names = Object.keys(files).sort();
      assert.deepEqual(names.filter((n) => !/^(png|svg)\//.test(n)), ["README.txt", "letters.pdf", "links.csv"]);
      assert.equal(names.filter((n) => n.startsWith("png/")).length, 3);
      assert.equal(names.filter((n) => n.startsWith("svg/")).length, 3);

      const csv = strFromU8(files["links.csv"]!);
      for (const r of body.rows) {
        assert.ok(csv.includes(r.url), `${r.url} is in the spreadsheet`);
        assert.ok(names.some((n) => n.includes(`-${r.code}.png`)), `${r.code} has a PNG`);
        assert.ok(names.some((n) => n.includes(`-${r.code}.svg`)), `${r.code} has an SVG`);
        const svg = strFromU8(files[names.find((n) => n.endsWith(`-${r.code}.svg`))!]!);
        assert.ok(svg.includes(`<title>${r.url}</title>`), "the SVG encodes the same link as the spreadsheet");
      }
      const pdf = Buffer.from(files["letters.pdf"]!).toString("latin1");
      assert.ok(pdf.startsWith("%PDF-"));
      assert.equal((pdf.match(/\/Type \/Page(?![s])/g) ?? []).length, 3, "one page per person");
      for (const f of names.filter((n) => n.startsWith("png/"))) {
        assert.deepEqual([...files[f]!.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
      }
    });

    it("shows the print number the people were made with, so a piece can be found on the stack", async () => {
      await make();
      const res = await getPack("?batch=Nov%2026%20letters");
      const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
      const csv = strFromU8(files["links.csv"]!).trim().split("\r\n");
      assert.deepEqual(csv.slice(1).map((l) => l.split(",")[0]), ["1", "2", "3"]);
    });

    it("can be downloaded again and matches the live codes", async () => {
      const { body } = await make();
      const a = unzipSync(new Uint8Array(await (await getPack("?batch=Nov%2026%20letters")).arrayBuffer()));
      const b = unzipSync(new Uint8Array(await (await getPack("?batch=Nov%2026%20letters")).arrayBuffer()));
      assert.equal(strFromU8(a["links.csv"]!), strFromU8(b["links.csv"]!));
      assert.ok(body.rows.every((r: { url: string }) => strFromU8(a["links.csv"]!).includes(r.url)));
    });

    it("asks which batch, and says so when there is nobody in it", async () => {
      assert.equal((await getPack("")).status, 400);
      assert.equal((await getPack("?batch=Nothing%20here")).status, 404);
      assert.equal((await getPack("?folder=no-such-run")).status, 404);
    });
  });
});
