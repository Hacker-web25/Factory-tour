/**
 * E-mail campaigns: reading the owner's list, reading Zoho's reports, the
 * shared coupon's clock, the segments a follow-up goes to, and the files that
 * go into Zoho.
 *
 * All pure. The rules that decide who receives a second e-mail (never someone
 * who unsubscribed or bounced) and what a spreadsheet cell can do when opened
 * in Excel are checked here, not discovered by a customer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";

import {
  MAX_EMAIL_PEOPLE,
  ZOHO_REPORT_KINDS,
  detectDelimiter,
  guessColumns,
  nameFromEmail,
  normaliseEmail,
  parseDelimited,
  parseReportDate,
  parseSpreadsheet,
  planRecipients,
  planZohoReport,
  splitDelimited,
} from "@/lib/emailImport";
import {
  DAY_MS,
  NO_STATS,
  SEGMENTS,
  couponExpiry,
  discountLabel,
  emailTemplate,
  followUpList,
  inSegment,
  mergeEmailPeople,
  personalLink,
  segmentCounts,
  segmentCsv,
  splitName,
  timeLeft,
  zohoExportCsv,
  type EmailPerson,
  type ZohoStats,
} from "@/lib/emailCampaign";
import type { FolderPerson } from "@/lib/campaignFolders";
import { EMAIL_CODE_PREFIX, isEmailCode, makeCodes } from "@/lib/personCodes";

/* ── reading the file ───────────────────────────────────────────────────── */

describe("reading delimited text", () => {
  it("keeps commas, quotes and line breaks that sit inside quotes", () => {
    const rows = splitDelimited('Email,Company\r\na@x.com,"Shah, Mehta & Co"\r\nb@x.com,"Say ""hi"""\r\n', ",");
    assert.deepEqual(rows, [
      ["Email", "Company"],
      ["a@x.com", "Shah, Mehta & Co"],
      ["b@x.com", 'Say "hi"'],
    ]);
  });

  it("ignores a byte-order mark that Excel puts at the start of a CSV", () => {
    const t = parseDelimited("﻿Email,Name\nrahul@acme.com,Rahul");
    assert.equal(t.headers[0], "Email");
    assert.equal(t.rows.length, 1);
  });

  it("detects semicolons and tabs", () => {
    assert.equal(detectDelimiter("Email;Name\na@x.com;A"), ";");
    assert.equal(detectDelimiter("Email\tName\na@x.com\tA"), "\t");
    assert.equal(detectDelimiter("just one column"), ",");
  });

  it("treats a first row that already has an address as data, not headings", () => {
    const t = parseDelimited("rahul@acme.com,Rahul\nsita@acme.com,Sita");
    assert.equal(t.headerless, true);
    assert.equal(t.rows.length, 2);
    assert.deepEqual(t.headers, ["Column A", "Column B"]);
  });
});

describe("reading an Excel workbook", () => {
  function workbook(sheet: string, strings: string[]): Uint8Array {
    const sst = `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`;
    return zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/sharedStrings.xml": strToU8(sst),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`),
    });
  }

  it("reads shared strings and numbers, and keeps empty cells in their column", () => {
    const bytes = workbook(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
        // B2 is empty: the phone must stay in column C
        `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2"><v>9876543210</v></c></row>`,
      ["Email", "Name", "Phone", "rahul@acme.com"]
    );
    const t = parseSpreadsheet("list.xlsx", bytes);
    assert.deepEqual(t.headers, ["Email", "Name", "Phone"]);
    assert.deepEqual(t.rows[0], ["rahul@acme.com", "", "9876543210"]);
  });

  it("reads inline strings, joins rich-text runs and decodes entities", () => {
    const bytes = workbook(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Email</t></is></c><c r="B1" t="inlineStr"><is><t>Company</t></is></c></row>` +
        `<row r="2"><c r="A2" t="inlineStr"><is><t>a@x.com</t></is></c>` +
        `<c r="B2" t="inlineStr"><is><r><t>Shah </t></r><r><t>&amp; Sons</t></r></is></c></row>`,
      []
    );
    const t = parseSpreadsheet("list.xlsx", bytes);
    assert.deepEqual(t.rows[0], ["a@x.com", "Shah & Sons"]);
  });

  it("recognises a workbook by its zip header even when the name is odd", () => {
    const bytes = workbook(
      `<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row>`,
      ["Email", "a@x.com"]
    );
    assert.equal(parseSpreadsheet("export", bytes).rows[0]![0], "a@x.com");
  });

  it("explains how to fix an old .xls and a file that is not a workbook", () => {
    assert.throws(() => parseSpreadsheet("old.xls", new Uint8Array([1, 2, 3])), /Save As/);
    assert.throws(() => parseSpreadsheet("broken.xlsx", new Uint8Array([1, 2, 3])), /Excel/);
  });
});

/* ── which column is which, and the clean list ──────────────────────────── */

describe("finding the columns", () => {
  it("uses the headings", () => {
    const t = parseDelimited("Contact Person,Company Name,Mobile,E-mail ID\nRahul,Acme,98765 43210,rahul@acme.com");
    const m = guessColumns(t);
    assert.deepEqual(m, { email: 3, name: 0, company: 1, phone: 2 });
  });

  it("falls back to the column whose cells look like addresses", () => {
    const t = parseDelimited("Name,Contact\nRahul,rahul@acme.com\nSita,sita@acme.com");
    assert.equal(guessColumns(t).email, 1);
  });

  it("says there is no e-mail column when there is none", () => {
    const t = parseDelimited("Name,Company\nRahul,Acme");
    assert.equal(guessColumns(t).email, -1);
    assert.equal(planRecipients(t, guessColumns(t)).recipients.length, 0);
  });
});

describe("normalising an address", () => {
  it("lower-cases, trims, and unwraps mailto: and Name <address>", () => {
    assert.equal(normaliseEmail("  Rahul@ACME.com "), "rahul@acme.com");
    assert.equal(normaliseEmail("mailto:rahul@acme.com"), "rahul@acme.com");
    assert.equal(normaliseEmail("Rahul Mehta <Rahul@Acme.com>"), "rahul@acme.com");
  });

  it("rejects things that are not one address", () => {
    for (const bad of ["", "rahul", "rahul@", "@acme.com", "a b@acme.com", "a@b", "a..b@acme.com", "a@x.com, b@x.com", null, 42]) {
      assert.equal(normaliseEmail(bad), null, String(bad));
    }
  });
});

describe("planning the recipients", () => {
  const csv = [
    "Email,Name,Company,Phone",
    "Rahul@Acme.com,Rahul  Mehta,Acme,+91 98765 43210",
    "rahul@acme.com,Rahul again,Acme,",
    "not-an-email,Broken,,",
    ",Nobody,,",
    "info@steelco.in,,SteelCo,12345",
    "sita.rao_77@forge.in,,Forge,",
  ].join("\n");
  const t = parseDelimited(csv);
  const plan = planRecipients(t, guessColumns(t));

  it("keeps each address once, however it was typed", () => {
    assert.deepEqual(
      plan.recipients.map((r) => r.email),
      ["rahul@acme.com", "info@steelco.in", "sita.rao_77@forge.in"]
    );
    assert.equal(plan.duplicates, 1);
  });

  it("reports bad rows with the row number the owner sees in Excel", () => {
    assert.deepEqual(plan.invalid, [{ row: 4, value: "not-an-email" }]);
    assert.equal(plan.blank, 1);
  });

  it("cleans names, phones and shared inboxes", () => {
    const [rahul, info, sita] = plan.recipients;
    assert.equal(rahul!.name, "Rahul Mehta");
    assert.equal(rahul!.phone, "9876543210");
    assert.equal(info!.phone, null, "a short number is not a phone");
    assert.equal(plan.roleAddresses, 1);
    assert.equal(sita!.name, "Sita Rao");
    assert.equal(sita!.nameFromEmail, true);
  });

  it("stops at the cap and counts the rest instead of dropping them silently", () => {
    const many = parseDelimited(["Email", ...Array.from({ length: 5 }, (_, i) => `p${i}@x.com`)].join("\n"));
    const p = planRecipients(many, guessColumns(many), 3);
    assert.equal(p.recipients.length, 3);
    assert.equal(p.overflow, 2);
    assert.ok(MAX_EMAIL_PEOPLE >= 500, "a 500-person campaign fits");
  });

  it("numbers rows from line 1 when the file has no heading", () => {
    const h = parseDelimited("a@x.com\nbad\nb@x.com");
    const p = planRecipients(h, guessColumns(h));
    assert.deepEqual(p.invalid, [{ row: 2, value: "bad" }]);
  });

  it("makes a readable name from an address", () => {
    assert.equal(nameFromEmail("rahul.mehta_89@acme.com"), "Rahul Mehta");
    assert.equal(nameFromEmail("12345@acme.com"), "12345@acme.com");
  });
});

/* ── what Zoho sends back ───────────────────────────────────────────────── */

describe("Zoho's dates", () => {
  it("reads dd/mm/yyyy as Indian order and IST, not US order or UTC", () => {
    assert.equal(parseReportDate("01/11/2026 14:30"), "2026-11-01T09:00:00.000Z");
    assert.equal(parseReportDate("05-12-2026"), "2026-12-04T18:30:00.000Z");
  });

  it("reads ISO dates and Excel serial numbers", () => {
    assert.equal(parseReportDate("2026-11-01T09:00:00Z"), "2026-11-01T09:00:00.000Z");
    assert.equal(parseReportDate("25569"), "1970-01-01T00:00:00.000Z");
  });

  it("returns null for anything it cannot trust", () => {
    assert.equal(parseReportDate(""), null);
    assert.equal(parseReportDate("yesterday"), null);
  });
});

describe("reading a Zoho report", () => {
  it("takes the address, the date and the count, once per person", () => {
    const t = parseDelimited(
      ["Contact Email,Opened Time,Open Count", "A@x.com,01/11/2026 10:00,3", "a@x.com,02/11/2026 10:00,9", "b@x.com,,", "junk,,"].join("\n")
    );
    const r = planZohoReport(t);
    assert.equal(r.noEmailColumn, false);
    assert.equal(r.skipped, 1);
    assert.deepEqual(
      r.rows.map((x) => x.email),
      ["a@x.com", "b@x.com"]
    );
    assert.equal(r.rows[0]!.count, 3, "the first row for a person wins");
    assert.equal(r.rows[0]!.at, "2026-11-01T04:30:00.000Z");
    assert.equal(r.rows[1]!.at, null);
    assert.equal(r.rows[1]!.count, null);
  });

  it("works for a report that is only a column of addresses", () => {
    const r = planZohoReport(parseDelimited("a@x.com\nb@x.com"));
    assert.equal(r.rows.length, 2);
  });

  it("says so when there is no address column", () => {
    assert.equal(planZohoReport(parseDelimited("Name,City\nA,Pune")).noEmailColumn, true);
  });

  it("knows the report kinds the server accepts", () => {
    assert.deepEqual([...ZOHO_REPORT_KINDS], ["sent", "opened", "clicked", "bounced", "unsubscribed", "complained"]);
  });
});

/* ── the shared coupon's clock ──────────────────────────────────────────── */

describe("the coupon clock", () => {
  const sent = new Date("2026-11-01T04:30:00Z");

  it("ends exactly N days after the e-mail went out, for everyone", () => {
    assert.equal(couponExpiry(sent, 7).getTime(), sent.getTime() + 7 * DAY_MS);
    assert.equal(couponExpiry(sent, 0).getTime(), sent.getTime() + DAY_MS, "never less than a day");
  });

  it("counts down in days, hours and minutes, and then says Ended", () => {
    const end = couponExpiry(sent, 3);
    assert.equal(timeLeft(end, sent), "3 d 0 h left");
    assert.equal(timeLeft(end, new Date(end.getTime() - 5 * 3_600_000 - 10 * 60_000)), "5 h 10 min left");
    assert.equal(timeLeft(end, new Date(end.getTime() - 42 * 60_000)), "42 min left");
    assert.equal(timeLeft(end, new Date(end.getTime() + 1)), "Ended");
    assert.equal(timeLeft(null), "No expiry");
  });

  it("labels the discount", () => {
    assert.equal(discountLabel({ percentOff: 20, amountOffInr: null }), "20% off");
    assert.equal(discountLabel({ percentOff: null, amountOffInr: 5000 }), "₹5,000 off");
  });

  it("recognises e-mail codes, so only they look up a coupon", () => {
    const codes = makeCodes(20, EMAIL_CODE_PREFIX, new Set());
    for (const c of codes) assert.ok(isEmailCode(c), c);
    assert.ok(isEmailCode("em-ab12cd"), "a code typed in lower case still counts");
    assert.ok(!isEmailCode("GGN"), "a printed QR code does not");
    assert.ok(!isEmailCode("EMILY-1"), "only the EM- prefix counts");
  });

  it("builds the personal link from the code", () => {
    assert.equal(personalLink("EM-AB12CD"), "https://myvpv.com/q/EM-AB12CD");
  });
});

/* ── one row per person, and the segments ───────────────────────────────── */

const z = (o: Partial<ZohoStats> = {}): ZohoStats => ({ ...NO_STATS, sent: true, delivered: true, ...o });

function person(code: string, o: Partial<EmailPerson> = {}): EmailPerson {
  return {
    code,
    email: `${code.toLowerCase()}@x.com`,
    name: code,
    company: null,
    phone: null,
    link: personalLink(code),
    zoho: z(),
    emailOpened: false,
    clicked: false,
    visited: false,
    temperature: null,
    interest: "Not opened",
    why: [],
    activeSeconds: 0,
    pageViews: 0,
    pages: [],
    stageLabel: "",
    leftDetails: false,
    reachedBill: false,
    paid: false,
    suppressed: false,
    ...o,
  };
}

describe("joining Zoho and the website", () => {
  const recipients = [
    { code: "EM-1", email: "a@x.com", name: "A", company: null, phone: null },
    { code: "EM-2", email: "b@x.com", name: null, company: "Acme", phone: null },
  ];
  const roster = [
    {
      code: "EM-1",
      opened: true,
      visited: true,
      temperature: "hot",
      interest: "hot",
      interestWhy: ["Reached the bill"],
      activeSeconds: 61.6,
      pageViews: 5,
      pages: [{ label: "Home" }, { label: "Plans & pricing" }],
      stage: "billing",
      stageLabel: "Reached the bill",
      contact: { phone: "9876543210", email: null, source: "form" },
      paid: false,
    },
  ] as unknown as FolderPerson[];

  it("fills the website side from the roster and Zoho's side from the stats", () => {
    const stats = new Map([["EM-1", z({ openedAt: "2026-11-01T05:00:00Z", openCount: 2 })]]);
    const [a, b] = mergeEmailPeople(recipients, stats, roster);
    assert.equal(a!.emailOpened, true);
    assert.equal(a!.clicked, true);
    assert.equal(a!.visited, true);
    assert.equal(a!.temperature, "hot");
    assert.equal(a!.activeSeconds, 62);
    assert.deepEqual(a!.pages, ["Home", "Plans & pricing"]);
    assert.equal(a!.leftDetails, true);
    assert.equal(a!.reachedBill, true);
    assert.equal(a!.link, "https://myvpv.com/q/EM-1");

    assert.equal(b!.name, "b@x.com", "no name falls back to the address");
    assert.equal(b!.clicked, false);
    assert.equal(b!.temperature, null, "someone who never clicked is not graded");
    assert.deepEqual(b!.zoho, NO_STATS);
  });

  it("marks anyone who bounced, unsubscribed or complained as suppressed", () => {
    const stats = new Map([
      ["EM-1", z({ bounced: true })],
      ["EM-2", z({ unsubscribed: true })],
    ]);
    const [a, b] = mergeEmailPeople(recipients, stats, roster);
    assert.equal(a!.suppressed, true);
    assert.equal(b!.suppressed, true);
  });
});

describe("segments", () => {
  const people = [
    person("HOT", { clicked: true, visited: true, temperature: "hot", emailOpened: true, leftDetails: true, reachedBill: true }),
    person("WARM", { clicked: true, visited: true, temperature: "warm", emailOpened: true }),
    person("COLD", { clicked: true, visited: true, temperature: "cold", emailOpened: true }),
    person("GHOST", { clicked: true, visited: false, temperature: "cold", emailOpened: true }),
    person("READER", { emailOpened: true }),
    person("SILENT"),
    person("BOUNCE", { zoho: z({ bounced: true, delivered: false }), suppressed: true }),
    person("OPTOUT", { zoho: z({ unsubscribed: true }), suppressed: true }),
    person("PAID", { clicked: true, visited: true, temperature: "hot", paid: true, reachedBill: true }),
    person("UNSENT", { zoho: NO_STATS }),
  ];
  const ids = (s: Parameters<typeof inSegment>[1]) => people.filter((p) => inSegment(p, s)).map((p) => p.code);

  it("sorts people by what they did", () => {
    assert.deepEqual(ids("hot"), ["HOT"], "a customer is not a hot lead");
    assert.deepEqual(ids("warm"), ["WARM"]);
    assert.deepEqual(ids("cold"), ["COLD", "GHOST"]);
    assert.deepEqual(ids("clicked_not_visited"), ["GHOST"]);
    assert.deepEqual(ids("opened_no_click"), ["READER"]);
    assert.deepEqual(ids("reached_bill"), ["HOT"]);
    assert.deepEqual(ids("paid"), ["PAID"]);
    assert.deepEqual(ids("left_details"), ["HOT"]);
  });

  it("only calls someone unopened when they were sent it and it did not bounce", () => {
    assert.deepEqual(ids("not_opened"), ["SILENT", "OPTOUT", "PAID"]);
    assert.ok(!ids("not_opened").includes("BOUNCE"));
    assert.ok(!ids("not_opened").includes("UNSENT"), "not sent is not the same as not opened");
  });

  it("lists bounces and opt-outs separately", () => {
    assert.deepEqual(ids("bounced"), ["BOUNCE"]);
    assert.deepEqual(ids("unsubscribed"), ["OPTOUT"]);
  });

  it("counts every segment", () => {
    const c = segmentCounts(people);
    assert.equal(c.all, people.length);
    assert.equal(Object.keys(c).length, SEGMENTS.length);
  });

  it("never puts a bounced or unsubscribed person on a follow-up list", () => {
    for (const s of SEGMENTS) {
      if (s.id === "bounced" || s.id === "unsubscribed") continue;
      const list = followUpList(people, s.id).map((p) => p.code);
      assert.ok(!list.includes("BOUNCE"), `${s.id} includes a bounced address`);
      assert.ok(!list.includes("OPTOUT"), `${s.id} includes someone who unsubscribed`);
    }
    // ...but the suppression lists themselves are the people to remove
    assert.deepEqual(followUpList(people, "bounced").map((p) => p.code), ["BOUNCE"]);
    assert.deepEqual(followUpList(people, "unsubscribed").map((p) => p.code), ["OPTOUT"]);
  });
});

/* ── the files ──────────────────────────────────────────────────────────── */

describe("the file that goes into Zoho", () => {
  const people = [
    { email: "a@x.com", name: "Rahul Kumar Mehta", company: "Acme, Ltd", phone: "9876543210", code: "EM-AAAAAA" },
    { email: "b@x.com", name: "Sita", company: "=HYPERLINK(\"http://evil\")", phone: null, code: "EM-BBBBBB" },
  ];

  it("has one row and one personal link per person", () => {
    const csv = zohoExportCsv(people, null);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines[0], "Contact Email,First Name,Last Name,Company,Phone,VPV Code,VPV Link");
    assert.equal(lines.length, 3);
    assert.ok(lines[1]!.startsWith("a@x.com,Rahul,Kumar Mehta,\"Acme, Ltd\",9876543210,EM-AAAAAA,https://myvpv.com/q/EM-AAAAAA"));
    assert.ok(lines[2]!.includes("https://myvpv.com/q/EM-BBBBBB"));
  });

  it("starts with a byte-order mark so Excel reads it as UTF-8", () => {
    assert.ok(zohoExportCsv(people, null).startsWith("﻿"));
  });

  it("adds the shared coupon code and end time to every row", () => {
    const csv = zohoExportCsv(people, { code: "FACTORY20", validUntil: new Date("2026-11-08T04:30:00Z") });
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.ok(lines[0]!.endsWith(",Coupon Code,Coupon Valid Until"));
    for (const l of lines.slice(1)) assert.ok(l.includes("FACTORY20"));
    assert.ok(lines[1]!.includes("8 Nov 2026"));
  });

  it("stops a spreadsheet formula in a company name from running in Excel", () => {
    const csv = zohoExportCsv(people, null);
    assert.ok(!/,=HYPERLINK/.test(csv), "a cell must not start with =");
    assert.ok(csv.includes("'=HYPERLINK"));
  });

  it("splits names", () => {
    assert.deepEqual(splitName("Sita"), { first: "Sita", last: "" });
    assert.deepEqual(splitName("  Rahul  Kumar Mehta "), { first: "Rahul", last: "Kumar Mehta" });
    assert.deepEqual(splitName(""), { first: "", last: "" });
  });
});

describe("the follow-up list", () => {
  it("carries what each person did, in words a sales person can read", () => {
    const p = person("HOT", {
      name: "Rahul Mehta",
      clicked: true,
      visited: true,
      temperature: "hot",
      emailOpened: true,
      interest: "Hot",
      why: ["Reached the bill", "Opened the price page"],
      pages: ["Home", "Plans & pricing"],
      activeSeconds: 94,
      stageLabel: "Reached the bill",
    });
    const lines = segmentCsv([p]).replace(/^﻿/, "").trim().split("\r\n");
    assert.ok(lines[0]!.includes("Temperature"));
    assert.ok(lines[1]!.includes("Reached the bill; Opened the price page"));
    assert.ok(lines[1]!.includes("Home; Plans & pricing"));
    assert.ok(lines[1]!.includes("https://myvpv.com/q/HOT"));
  });
});

describe("the suggested e-mail", () => {
  const dollars = { couponCode: "FACTORY20", discount: "20% off", validUntil: new Date("2026-11-08T04:30:00Z"), limit: 500 };

  it("carries the merge words, the code, the limit and the end time", () => {
    const t = emailTemplate(dollars);
    assert.ok(t.subject.includes("[[FIRST NAME]]"));
    assert.ok(t.subject.includes("20% off"));
    assert.ok(t.body.includes("[[LINK]]"));
    assert.ok(t.body.includes("FACTORY20"));
    assert.ok(t.body.includes("first 500 factories"));
    assert.ok(t.body.includes("IST"));
  });

  it("does not invent a signature", () => {
    const t = emailTemplate(dollars);
    assert.ok(t.body.includes("[[YOUR NAME]]"));
    assert.ok(!/Founder|Nitin/i.test(t.body));
  });

  it("leaves the coupon lines out when there is no coupon", () => {
    const t = emailTemplate({ couponCode: null, discount: "", validUntil: null, limit: null });
    assert.ok(!t.body.includes("Use code"));
    assert.ok(t.body.includes("[[LINK]]"));
  });
});
