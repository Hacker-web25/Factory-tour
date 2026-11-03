/**
 * E-mail: the Zoho CRM mass-email round trip.
 *
 * Zoho CRM differs from Zoho Campaigns in two concrete ways, and this file
 * pins both so a future Zoho export can be dropped into the UI and we know
 * ahead of time what it will do:
 *
 *   1. The import file is a Leads-import template with CRM's field names
 *      (First Name, Last Name, Email, Company, Phone, Mobile, Lead Source,
 *      plus custom fields for VPV Link / VPV Code).
 *
 *   2. The "report" is one file with every outcome in it — a Status column,
 *      or several Yes/No columns — not one file per outcome.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

import {
  kindOfCrmStatus,
  parseDelimited,
  planZohoCrmReport,
} from "@/lib/emailImport";
import { splitName, zohoCrmLeadsCsv } from "@/lib/emailCampaign";
import { makeWorld, type World } from "./harness/world";

/* ─────────────────────── the Leads import file ─────────────────────── */

describe("the file that goes into Zoho CRM Leads", () => {
  const people = [
    { email: "a@x.com", name: "Rahul Kumar Mehta", company: "Acme, Ltd", phone: "9876543210", code: "EM-AAAAAA" },
    { email: "b@x.com", name: "Sita",             company: null,        phone: null,         code: "EM-BBBBBB" },
    { email: "c@x.com", name: "Rama Rao",         company: null,        phone: "9123456789", code: "EM-CCCCCC" },
  ];

  it("has the Zoho CRM Lead field names, in that order", () => {
    const csv = zohoCrmLeadsCsv(people, null);
    const header = csv.replace(/^﻿/, "").split("\r\n")[0]!;
    assert.equal(
      header,
      "First Name,Last Name,Email,Company,Phone,Mobile,Lead Source,VPV Link,VPV Code"
    );
  });

  it("fills a Company value for every row — Zoho CRM Leads reject rows without one", () => {
    const csv = zohoCrmLeadsCsv(people, null);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n").slice(1);
    for (const l of lines) {
      // row shape: First,Last,Email,Company,…
      const cells = l.split(",");
      const company = cells[3]!;
      assert.ok(company && company !== "", `row has empty company: ${l}`);
    }
    // Sita and Rama had no company — Unknown filled in.
    assert.ok(lines[1]!.split(",")[3] === "Unknown");
    assert.ok(lines[2]!.split(",")[3] === "Unknown");
    // Rahul's "Acme, Ltd" survives (quoted because of the comma).
    assert.ok(csv.includes('"Acme, Ltd"'));
  });

  it("copies Phone into Mobile — Zoho CRM mass-email can read from either", () => {
    const csv = zohoCrmLeadsCsv(people, null);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n").slice(1);
    // Rahul: Phone and Mobile both 9876543210
    assert.ok(lines[0]!.includes(",9876543210,9876543210,"));
    // Sita: both empty
    assert.ok(/,,,VPV Email Campaign,/.test(lines[1]!));
  });

  it("has VPV Link and VPV Code as the last two columns before the coupon", () => {
    const csv = zohoCrmLeadsCsv(people, null);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.ok(lines[1]!.endsWith(",https://myvpv.com/q/EM-AAAAAA,EM-AAAAAA"));
  });

  it("adds the Lead Source so the owner can filter the import later", () => {
    const csv = zohoCrmLeadsCsv(people, null);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n").slice(1);
    for (const l of lines) assert.ok(l.includes("VPV Email Campaign"));
  });

  it("adds Coupon Code and Coupon Valid Until columns when a coupon is given", () => {
    const csv = zohoCrmLeadsCsv(people, {
      code: "FACTORY20",
      validUntil: new Date("2026-11-08T04:30:00Z"),
    });
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.ok(lines[0]!.endsWith(",Coupon Code,Coupon Valid Until"));
    for (const l of lines.slice(1)) assert.ok(l.includes("FACTORY20"));
    assert.ok(lines[1]!.includes("8 Nov 2026"));
  });

  it("starts with a BOM so Excel reads UTF-8 names correctly", () => {
    assert.ok(zohoCrmLeadsCsv(people, null).startsWith("﻿"));
  });

  it("stops a formula in a company name from running in Excel", () => {
    const booby = [{ email: "d@x.com", name: "Z", company: "=HYPERLINK(\"http://evil\")", phone: null, code: "EM-ZZZZZZ" }];
    const csv = zohoCrmLeadsCsv(booby, null);
    assert.ok(!/,=HYPERLINK/.test(csv));
    assert.ok(csv.includes("'=HYPERLINK"));
  });

  it("splits one-word names correctly — Zoho's First Name is required, Last Name is not", () => {
    assert.deepEqual(splitName("Sita"), { first: "Sita", last: "" });
    assert.deepEqual(splitName(""), { first: "", last: "" });
  });
});

/* ──────────── the status cell: which outcome does it mean ──────────── */

describe("what one Zoho CRM status cell counts as", () => {
  it("accepts the words Zoho CRM uses in reports", () => {
    assert.equal(kindOfCrmStatus("Delivered"), "sent");
    assert.equal(kindOfCrmStatus("Sent"), "sent");
    assert.equal(kindOfCrmStatus("Opened"), "opened");
    assert.equal(kindOfCrmStatus("Email Opened"), "opened");
    assert.equal(kindOfCrmStatus("Clicked"), "clicked");
    assert.equal(kindOfCrmStatus("Link Clicked"), "clicked");
    assert.equal(kindOfCrmStatus("Bounced"), "bounced");
    assert.equal(kindOfCrmStatus("Hard Bounce"), "bounced");
    assert.equal(kindOfCrmStatus("Soft Bounce"), "bounced");
    assert.equal(kindOfCrmStatus("Opt-out"), "unsubscribed");
    assert.equal(kindOfCrmStatus("Unsubscribed"), "unsubscribed");
    assert.equal(kindOfCrmStatus("Marked as Spam"), "complained");
    assert.equal(kindOfCrmStatus("Reported Spam"), "complained");
  });

  it("is case- and spacing-insensitive", () => {
    assert.equal(kindOfCrmStatus("  opened "), "opened");
    assert.equal(kindOfCrmStatus("OPT OUT"), "unsubscribed");
    assert.equal(kindOfCrmStatus("hard bounce"), "bounced");
  });

  it("returns null for 'Not opened' — not an event, but a fact worth keeping", () => {
    assert.equal(kindOfCrmStatus("Not opened"), null);
    assert.equal(kindOfCrmStatus("Email not opened"), null);
    assert.equal(kindOfCrmStatus("Unopened"), null);
  });

  it("returns undefined for words it does not know", () => {
    assert.equal(kindOfCrmStatus("Pending"), undefined);
    assert.equal(kindOfCrmStatus("In progress"), undefined);
    assert.equal(kindOfCrmStatus(""), undefined);
    assert.equal(kindOfCrmStatus("Rahul"), undefined);
  });

  it("does not read 'Opt-out' as an open — the regex order matters", () => {
    // "Opt-out" contains "op", a tempting prefix for "Open".
    assert.equal(kindOfCrmStatus("Opt-out"), "unsubscribed");
    assert.equal(kindOfCrmStatus("Not opened"), null);
  });
});

/* ───────── planning a whole CRM report file into outcome groups ───────── */

describe("planning a Zoho CRM mass-email report", () => {
  it("handles a single Status column", () => {
    const csv =
      "Email,Status,Opened On\n" +
      "a@x.com,Opened,2026-11-02 08:30\n" +
      "b@x.com,Clicked,2026-11-02 09:10\n" +
      "c@x.com,Delivered,\n" +
      "d@x.com,Not opened,\n" +
      "e@x.com,Opt-out,\n" +
      "f@x.com,Hard Bounce,\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.shape, "status-column");
    assert.equal(plan.totalLeads, 6);
    assert.equal(plan.byKind.opened.length, 1, "one Opened");
    assert.equal(plan.byKind.clicked.length, 1, "one Clicked");
    // Opened + Clicked imply Sent; Delivered is Sent; Not opened is Sent.
    assert.equal(plan.byKind.sent.length, 4);
    assert.equal(plan.byKind.unsubscribed.length, 1);
    assert.equal(plan.byKind.bounced.length, 1);
    assert.equal(plan.unknown, 0);
  });

  it("handles the Yes/No shape with one column per outcome", () => {
    const csv =
      "Email,Delivered,Opened,Clicked,Bounced,Opt-out\n" +
      "a@x.com,Yes,Yes,Yes,No,No\n" +
      "b@x.com,Yes,Yes,No,No,No\n" +
      "c@x.com,No,No,No,Yes,No\n" +
      "d@x.com,No,No,No,No,Yes\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.shape, "yes-no-columns");
    assert.equal(plan.totalLeads, 4);
    assert.equal(plan.byKind.sent.length, 2, "a + b are Delivered");
    assert.equal(plan.byKind.opened.length, 2, "a + b opened");
    assert.equal(plan.byKind.clicked.length, 1, "a clicked");
    assert.equal(plan.byKind.bounced.length, 1, "c bounced");
    assert.equal(plan.byKind.unsubscribed.length, 1, "d opted out");
  });

  it("flags the report when it has no outcome column at all", () => {
    const csv = "Email,First Name\na@x.com,Rahul\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.noEmailColumn, false);
    assert.equal(plan.noStatusColumn, true);
    assert.equal(plan.totalLeads, 0);
  });

  it("flags the report when it has no e-mail column", () => {
    const csv = "First Name,Status\nRahul,Opened\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.noEmailColumn, true);
  });

  it("ignores duplicate addresses — only the first row for each counts", () => {
    const csv =
      "Email,Status\n" +
      "a@x.com,Opened\n" +
      "a@x.com,Clicked\n" +
      "b@x.com,Delivered\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.totalLeads, 2);
    assert.equal(plan.duplicates, 1);
    // Only the first row for a@x.com (Opened) was counted. The upload route
    // dispatches each lead's outcomes in one shot, so for a lead who both
    // Opened and Clicked, the owner should upload the Combined CRM report
    // once, where every row is one Status.
    assert.equal(plan.byKind.opened.length, 1);
    assert.equal(plan.byKind.clicked.length, 0);
  });

  it("counts unknown status words so the owner is told", () => {
    const csv =
      "Email,Status\n" +
      "a@x.com,Opened\n" +
      "b@x.com,In progress\n" +
      "c@x.com,Pending\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.unknown, 2);
    assert.equal(plan.byKind.opened.length, 1);
  });

  it("skips rows with an empty or malformed e-mail cell", () => {
    const csv =
      "Email,Status\n" +
      "a@x.com,Opened\n" +
      ",Opened\n" +
      "not-an-email,Opened\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    assert.equal(plan.skipped, 2);
    assert.equal(plan.totalLeads, 1);
  });

  it("reads Zoho's dd/mm/yyyy dates in IST into UTC ISO strings", () => {
    const csv =
      "Email,Status,Opened At\n" +
      "a@x.com,Opened,02/11/2026 14:00\n";
    const plan = planZohoCrmReport(parseDelimited(csv));
    // 2 Nov 2026, 14:00 IST = 08:30 UTC
    assert.equal(plan.byKind.opened[0]!.at, "2026-11-02T08:30:00.000Z");
  });
});

/* ────── the POST route writes the right rows to email_recipient_stats ────── */

describe("POST /api/admin/email-campaigns/<slug>/zoho — Zoho CRM combined status", () => {
  let w: World;
  let ownerId: string;
  let slug: string;
  let codes: string[];
  let route: typeof import("@/app/api/admin/email-campaigns/[slug]/zoho/route");

  before(async () => {
    w = await makeWorld();
    // The e-mail channel adds two tables and campaign_folders' extra columns.
    // Production has these; the test base does not.
    const exec = (f: string) =>
      (w.raw as unknown as { exec(sql: string): Promise<unknown> }).exec(
        readFileSync(join(process.cwd(), f), "utf8")
      );
    await exec("supabase/campaign_folders.sql");
    await exec("supabase/email_campaigns.sql");

    ownerId = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
    route = await import("@/app/api/admin/email-campaigns/[slug]/zoho/route");
  });

  after(async () => {
    // Nothing to tear down beyond the shared world; test shares the owner profile.
  });

  async function seedEmailCampaign(people: { email: string; code: string }[]) {
    const campaignSlug = `cam-${crypto.randomBytes(3).toString("hex")}`;
    const folder = (await (w.raw as unknown as { query(sql: string, params: unknown[]): Promise<{ rows: { id: string }[] }> }).query(
      `insert into public.campaign_folders (name, slug, destination, channel, active)
       values ($1, $2, '/', 'email', true) returning id`,
      ["Zoho CRM test", campaignSlug]
    )).rows[0]!;
    await (w.raw as unknown as { query(sql: string, params: unknown[]): Promise<unknown> }).query(
      `insert into public.email_campaigns (folder_id, zoho_campaign_name, sent_at)
       values ($1, $2, $3)`,
      [folder.id, "Zoho CRM test", new Date("2026-11-01T06:00:00Z").toISOString()]
    );
    for (const p of people) {
      await (w.raw as unknown as { query(sql: string, params: unknown[]): Promise<unknown> }).query(
        `insert into public.campaign_codes (code, folder_id, destination, label, recipient_email, active)
         values ($1, $2, '/', 'row', $3, true)`,
        [p.code, folder.id, p.email]
      );
    }
    return campaignSlug;
  }

  beforeEach(async () => {
    await (w.raw as unknown as { exec(sql: string): Promise<unknown> }).exec(
      "truncate public.email_recipient_stats, public.campaign_codes, public.email_campaigns, public.campaign_folders restart identity cascade"
    );
    slug = await seedEmailCampaign([
      { email: "a@acme.in", code: "EM-AAA111" },
      { email: "b@acme.in", code: "EM-BBB222" },
      { email: "c@acme.in", code: "EM-CCC333" },
      { email: "d@acme.in", code: "EM-DDD444" },
    ]);
    codes = ["EM-AAA111", "EM-BBB222", "EM-CCC333", "EM-DDD444"];
  });

  async function post(body: unknown) {
    const res = await route.POST(
      w.request(`/api/admin/email-campaigns/${slug}/zoho`, { body, as: ownerId }),
      { params: { slug } }
    );
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    return { res, status: res.status, body: json as { ok?: boolean; matched?: number; notFoundCount?: number; unknownStatus?: number; error?: string; message?: string } };
  }

  async function statsFor(code: string) {
    return (await w.raw.query<{
      sent_at: string | null;
      delivered: boolean;
      opened_at: string | null;
      open_count: number;
      clicked_at: string | null;
      click_count: number;
      bounced: boolean;
      unsubscribed: boolean;
      complained: boolean;
    }>("select sent_at, delivered, opened_at, open_count, clicked_at, click_count, bounced, unsubscribed, complained from public.email_recipient_stats where code = $1", [code])).rows[0] ?? null;
  }

  it("rejects an unknown kind", async () => {
    const { status, body } = await post({ kind: "nonsense", rows: [] });
    assert.equal(status, 400);
    assert.equal(body.error, "bad_kind");
  });

  it("rejects an empty rows array", async () => {
    const { status, body } = await post({ kind: "crm_status", rows: [] });
    assert.equal(status, 400);
    assert.equal(body.error, "no_rows");
  });

  it("writes one row per lead with the right columns for each status", async () => {
    const rows = [
      { email: "a@acme.in", status: "Opened", at: "2026-11-02T08:30:00Z" },
      { email: "b@acme.in", status: "Clicked", at: "2026-11-02T09:00:00Z" },
      { email: "c@acme.in", status: "Hard Bounce", at: "2026-11-02T06:00:01Z" },
      { email: "d@acme.in", status: "Opt-out", at: "2026-11-02T10:00:00Z" },
    ];
    const { status, body } = await post({ kind: "crm_status", rows });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    // Four distinct leads, each with one merged row.
    assert.equal(body.matched, 4);

    const a = await statsFor("EM-AAA111");
    assert.ok(a, "a has stats");
    assert.equal(a.delivered, true, "Opened implies delivered");
    assert.ok(a.opened_at, "opened_at set");
    assert.ok(a.sent_at, "sent_at set via implied-sent");

    const b = await statsFor("EM-BBB222");
    assert.ok(b.clicked_at, "clicked_at set");
    assert.equal(b.delivered, true);
    assert.ok(b.sent_at, "clicked implies sent");

    const c = await statsFor("EM-CCC333");
    assert.equal(c.bounced, true);
    assert.equal(c.delivered, false, "bounced is not delivered");

    const d = await statsFor("EM-DDD444");
    assert.equal(d.unsubscribed, true);
  });

  it("is idempotent: the same report twice gives the same final rows", async () => {
    const rows = [
      { email: "a@acme.in", status: "Opened", at: "2026-11-02T08:30:00Z" },
      { email: "b@acme.in", status: "Clicked", at: "2026-11-02T09:00:00Z" },
    ];
    await post({ kind: "crm_status", rows });
    const before = await statsFor("EM-AAA111");
    await post({ kind: "crm_status", rows });
    const after = await statsFor("EM-AAA111");
    assert.equal(before.opened_at, after.opened_at, "opened_at unchanged on re-upload");
    assert.equal(before.open_count, after.open_count);

    const n = (await w.raw.query<{ n: number }>("select count(*)::int as n from public.email_recipient_stats")).rows[0]!.n;
    assert.equal(n, 2, "still just two rows after re-upload");
  });

  it("counts leads whose e-mail is not on this campaign", async () => {
    const rows = [
      { email: "a@acme.in", status: "Opened" },
      { email: "ghost@elsewhere.in", status: "Opened" },
      { email: "another-ghost@elsewhere.in", status: "Clicked" },
    ];
    const { body } = await post({ kind: "crm_status", rows });
    assert.equal(body.ok, true);
    assert.equal(body.notFoundCount, 2);
    assert.equal(body.matched, 1);
  });

  it("counts unknown status words without failing the whole upload", async () => {
    const rows = [
      { email: "a@acme.in", status: "Opened" },
      { email: "b@acme.in", status: "In progress" },
      { email: "c@acme.in", status: "Pending" },
    ];
    const { body } = await post({ kind: "crm_status", rows });
    assert.equal(body.ok, true);
    assert.equal(body.unknownStatus, 2);
    assert.equal(body.matched, 1);
  });

  it("treats 'Not opened' as a sent-but-unopened fact, not an unknown status", async () => {
    const rows = [{ email: "a@acme.in", status: "Not opened" }];
    const { body } = await post({ kind: "crm_status", rows });
    assert.equal(body.ok, true);
    assert.equal(body.unknownStatus, 0);
    const a = await statsFor("EM-AAA111");
    assert.ok(a.sent_at, "we know Zoho CRM delivered it");
    assert.equal(a.opened_at, null, "we know it wasn't opened");
  });

  it("does not clobber an earlier Opened when a later Sent arrives in the same batch", async () => {
    // Rows out of order: Sent, then Opened. The merger must preserve opened_at.
    const rows = [
      { email: "a@acme.in", status: "Delivered", at: "2026-11-02T06:00:00Z" },
      { email: "a@acme.in", status: "Opened",    at: "2026-11-02T08:30:00Z" },
    ];
    // Note: planZohoCrmReport in the UI dedupes before upload, but the API must
    // not assume that. Hand-crafted / API-called uploads can repeat.
    const { body } = await post({ kind: "crm_status", rows });
    assert.equal(body.ok, true);
    const a = await statsFor("EM-AAA111");
    assert.ok(a.opened_at, "opened_at survives the merge");
    assert.equal(a.delivered, true);
  });

  it("rejects a non-owner", async () => {
    const stranger = await w.seedUser({ email: "sales@acme.in", role: "org_admin" });
    const res = await route.POST(
      w.request(`/api/admin/email-campaigns/${slug}/zoho`, {
        body: { kind: "crm_status", rows: [{ email: "a@acme.in", status: "Opened" }] },
        as: stranger,
      }),
      { params: { slug } }
    );
    assert.equal(res.status, 403);
  });
});
