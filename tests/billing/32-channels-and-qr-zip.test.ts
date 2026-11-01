/**
 * The Channels dashboard, the QR-zip reader, and the weighed lead score.
 *
 * All pure: the arithmetic the sales team will act on ("call these five
 * people today") is checked without a database or a browser.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  campaignNameFromZip,
  codeFromQrText,
  planFromDecoded,
  zipEntries,
  MAX_ZIP_PEOPLE,
  type DecodedLetter,
} from "@/lib/qrZip";
import {
  CHANNELS,
  channelById,
  channelOfFolder,
  foldersOfChannel,
  sumTotals,
  totalsByChannel,
} from "@/lib/channels";
import { FOLDER_CHANNELS, type FolderStat } from "@/lib/campaignFolders";
import {
  CURIOUS_POINTS,
  WARM_POINTS,
  engagementPoints,
  interestOf,
  temperatureOf,
  type InterestInput,
} from "@/lib/interest";

/* ── the QR zip ─────────────────────────────────────────────────────────── */

describe("reading a QR zip", () => {
  it("takes the person from the folder and skips the letters PDF and Mac litter", () => {
    const e = zipEntries([
      "All Letters.pdf",
      "Aryan/L_1.png",
      "__MACOSX/Aryan/._L_1.png",
      "Meera Shah/L_1.png",
      "Meera Shah/L_2.png",
      "Meera Shah/.DS_Store",
      "Meera Shah/",
    ]);
    assert.deepEqual(
      e.map((x) => [x.name, x.letter]),
      [
        ["Aryan", 1],
        ["Meera Shah", 1],
        ["Meera Shah", 2],
      ]
    );
  });

  it("copes with a wrapper folder and backslashes", () => {
    const e = zipEntries(["Product_Testing-qr-codes\\Aryan\\L_1.png"]);
    assert.equal(e[0]?.name, "Aryan");
  });

  it("falls back to the file name for an image at the top level", () => {
    assert.equal(zipEntries(["Rahul.png"])[0]?.name, "Rahul");
  });

  it("reads the code out of the link a QR holds", () => {
    assert.equal(codeFromQrText("https://qr-generation-ag74.onrender.com/r/NVEMJ2XF"), "NVEMJ2XF");
    assert.equal(codeFromQrText("https://myvpv.com/q/GGN-7K3QX9"), "GGN-7K3QX9");
    assert.equal(codeFromQrText("https://example.com/r/ABC123/"), "ABC123");
    assert.equal(codeFromQrText("ABC123"), "ABC123");
  });

  it("does not treat other QR content as a code", () => {
    assert.equal(codeFromQrText("https://example.com/menu"), null);
    assert.equal(codeFromQrText("WIFI:S:home;P:secret;;"), null);
    assert.equal(codeFromQrText(""), null);
    assert.equal(codeFromQrText(42), null);
  });

  it("names the campaign from the zip file", () => {
    assert.equal(campaignNameFromZip("Product_Testing-qr-codes.zip"), "Product Testing");
    assert.equal(campaignNameFromZip("C:\\x\\Pharma Delhi qr codes.zip"), "Pharma Delhi");
    assert.equal(campaignNameFromZip("letters.zip"), "letters");
  });

  const L = (order: number, name: string, code: string | null, problem?: string): DecodedLetter => ({
    path: `${name}/L_1.png`,
    name,
    letter: 1,
    order,
    code,
    problem,
  });

  it("keeps archive order, numbers people from 1, and reports what it dropped", () => {
    const plan = planFromDecoded([
      L(2, "Meera", "BBBB22"),
      L(0, "Aryan", "AAAA11"),
      L(1, "Blurred", null, "No QR code found in this image."),
      L(3, "Copy", "aaaa11"),
    ]);
    assert.deepEqual(
      plan.people.map((p) => [p.seq, p.name, p.code]),
      [
        [1, "Aryan", "AAAA11"],
        [2, "Meera", "BBBB22"],
      ]
    );
    assert.equal(plan.unreadable.length, 1);
    assert.equal(plan.duplicates.length, 1, "a code repeated in another case is the same code");
  });

  it("stops at the per-upload limit and says how many were left", () => {
    const many = Array.from({ length: MAX_ZIP_PEOPLE + 3 }, (_, i) => L(i, `P${i}`, `C${String(i).padStart(5, "0")}`));
    const plan = planFromDecoded(many);
    assert.equal(plan.people.length, MAX_ZIP_PEOPLE);
    assert.equal(plan.overflow, 3);
  });
});

/* ── channels ───────────────────────────────────────────────────────────── */

const folder = (over: Partial<FolderStat>): FolderStat =>
  ({
    id: "f",
    slug: "f",
    name: "F",
    city: null,
    channel: "pamphlet",
    distributedAt: null,
    active: true,
    printed: null,
    codes: 0,
    delivered: 0,
    scannedCodes: 0,
    scans: 0,
    repeatScans: 0,
    botScans: 0,
    visited: 0,
    contacts: 0,
    people: 0,
    enquiries: 0,
    reachedBilling: 0,
    paid: 0,
    revenueInr: 0,
    neverOpened: 0,
    scanRatePct: null,
    ...over,
  }) as FolderStat;

describe("channels", () => {
  it("places every campaign channel in exactly one dashboard channel", () => {
    for (const fc of FOLDER_CHANNELS) {
      const owners = CHANNELS.filter((c) => c.folderChannels.includes(fc));
      assert.equal(owners.length, 1, `${fc} must belong to exactly one channel`);
    }
  });

  it("keeps the physical channel and gives QR the print channels", () => {
    assert.equal(channelById("qr")?.physical, true);
    for (const fc of ["pamphlet", "tradeshow", "courier", "visit"]) {
      assert.equal(channelOfFolder(fc), "qr");
    }
    assert.equal(channelOfFolder("email"), "email");
    assert.equal(channelOfFolder("whatsapp"), "whatsapp");
    assert.equal(channelOfFolder("something-new"), "more");
  });

  it("adds up per channel, leaves archived campaigns out, and totals across channels", () => {
    const folders = [
      folder({ id: "1", channel: "pamphlet", codes: 100, scannedCodes: 40, visited: 30, contacts: 5, reachedBilling: 2, paid: 1, revenueInr: 5000 }),
      folder({ id: "2", channel: "tradeshow", codes: 50, scannedCodes: 10, visited: 8, paid: 0 }),
      folder({ id: "3", channel: "email", codes: 2000, scannedCodes: 300, visited: 120, contacts: 12 }),
      folder({ id: "4", channel: "email", codes: 999, active: false }),
    ];
    const by = totalsByChannel(folders);
    assert.equal(by.qr.campaigns, 2);
    assert.equal(by.qr.people, 150);
    assert.equal(by.qr.opened, 50);
    assert.equal(by.qr.revenueInr, 5000);
    assert.equal(by.email.people, 2000, "the archived email campaign is not counted");
    assert.equal(by.meta.campaigns, 0);
    const all = sumTotals(by);
    assert.equal(all.people, 2150);
    assert.equal(all.visited, 158);
    assert.equal(foldersOfChannel(folders, "email").length, 2, "the channel page still lists archived ones");
  });
});

/* ── the weighed lead score ─────────────────────────────────────────────── */

const base: InterestInput = {
  opened: true,
  paid: false,
  stage: null,
  activeSeconds: 0,
  priceSeconds: 0,
  visits: 1,
  objections: 0,
  leftContact: false,
  clickedPay: false,
};

describe("the weighed lead score", () => {
  it("lifts many small signs to Warm when no single one would", () => {
    const small: InterestInput = {
      ...base,
      activeSeconds: 60, // under the 90 s reading line
      pagesViewed: 4,
      maxScroll: 80,
      clicks: 3,
      sawDemo: true,
    };
    assert.ok(engagementPoints(small) >= WARM_POINTS);
    const r = interestOf(small);
    assert.equal(r.level, "warm");
    assert.equal(r.temperature, "warm");
    assert.ok(r.why.some((w) => /Engaged across the site/.test(w)));
  });

  it("lifts a short but wandering visit from Glanced to Curious", () => {
    const wandering: InterestInput = { ...base, activeSeconds: 25, pagesViewed: 4, maxScroll: 60, clicks: 2 };
    assert.ok(engagementPoints(wandering) >= CURIOUS_POINTS);
    assert.ok(engagementPoints(wandering) < WARM_POINTS);
    const r = interestOf(wandering);
    assert.equal(r.level, "curious");
    assert.equal(r.temperature, "cold");
    // The same 25 s on one page with no clicks is still only a glance.
    assert.equal(interestOf({ ...base, activeSeconds: 25 }).level, "glanced");
  });

  it("never lifts anyone to Hot on points alone", () => {
    const loud: InterestInput = {
      ...base,
      activeSeconds: 3000,
      pagesViewed: 30,
      maxScroll: 100,
      clicks: 40,
      sawDemo: true,
      priceSeconds: 600,
      objections: 10,
      visits: 12,
    };
    assert.ok(engagementPoints(loud) <= 100);
    assert.equal(interestOf(loud).level, "warm");
  });

  it("caps each behaviour so one page cannot carry a person", () => {
    assert.ok(engagementPoints({ ...base, activeSeconds: 100_000 }) <= 25);
    assert.ok(engagementPoints({ ...base, clicks: 1000 }) <= 15);
    assert.ok(engagementPoints({ ...base, objections: 99 }) <= 9);
  });

  it("treats pressing call, WhatsApp or email as Hot", () => {
    const r = interestOf({ ...base, reachedOut: true, activeSeconds: 5 });
    assert.equal(r.level, "hot");
    assert.equal(r.temperature, "hot");
    assert.ok(r.why[0]!.includes("call, WhatsApp or email"));
  });

  it("leaves the existing ladder alone when the new signals are absent", () => {
    assert.equal(interestOf({ ...base, activeSeconds: 4 }).level, "glanced");
    assert.equal(interestOf({ ...base, activeSeconds: 30 }).level, "curious");
    assert.equal(interestOf({ ...base, visits: 2 }).level, "warm");
    assert.equal(interestOf({ ...base, leftContact: true }).level, "hot");
    assert.equal(interestOf({ ...base, paid: true }).level, "customer");
    assert.equal(interestOf({ ...base, opened: false }).level, "unopened");
  });

  it("maps the six levels onto hot, warm and cold", () => {
    assert.equal(temperatureOf("customer"), "hot");
    assert.equal(temperatureOf("hot"), "hot");
    assert.equal(temperatureOf("warm"), "warm");
    for (const l of ["curious", "glanced", "unopened"] as const) assert.equal(temperatureOf(l), "cold");
  });

  it("keeps a strong Warm below a weak Hot, whatever the points", () => {
    const strongWarm = interestOf({
      ...base,
      stage: "info",
      activeSeconds: 900,
      pagesViewed: 9,
      maxScroll: 100,
      clicks: 9,
      sawDemo: true,
      priceSeconds: 200,
      objections: 4,
      visits: 6,
    });
    const weakHot = interestOf({ ...base, leftContact: true });
    assert.equal(strongWarm.level, "warm");
    assert.ok(strongWarm.score < weakHot.score);
  });
});
