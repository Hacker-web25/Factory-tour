/**
 * The page after payment: the one question "How do you plan to use it?",
 * and the owner's report of the answers.
 *
 * What matters: an answer is only accepted for a PAID order, at least one
 * option is required, "Something else" needs words, a tampered option is
 * refused rather than stored, and answering again replaces the first answer.
 */

import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, type World } from "./harness/world";
import { parseUsageAnswer, USAGE_OPTIONS } from "@/lib/purchaseUsage";

describe("usage answer: what counts as an answer", () => {
  it("needs at least one choice", () => {
    assert.equal(parseUsageAnswer([], "").ok, false);
    assert.equal(parseUsageAnswer(undefined, "").ok, false);
    assert.equal(parseUsageAnswer("exhibitions", "").ok, false);
  });

  it("refuses an option that is not on the list", () => {
    const r = parseUsageAnswer(["exhibitions", "drop table"], "");
    assert.equal(r.ok, false);
  });

  it("needs a few words when 'Something else' is picked, and ignores stray text otherwise", () => {
    assert.equal(parseUsageAnswer(["other"], "  ").ok, false);
    const ok = parseUsageAnswer(["other"], "  training new hires  ");
    assert.ok(ok.ok && ok.answer.other === "training new hires");
    const noOther = parseUsageAnswer(["qr"], "ignored");
    assert.ok(noOther.ok && noOther.answer.other === null);
  });

  it("removes duplicates and keeps the list's order", () => {
    const r = parseUsageAnswer(["oem", "exhibitions", "oem"], "");
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.answer.uses, ["exhibitions", "oem"]);
  });

  it("has the five uses the founders named, plus website and 'something else'", () => {
    assert.deepEqual(
      USAGE_OPTIONS.map((o) => o.id),
      ["exhibitions", "followup", "distributors", "qr", "oem", "website", "other"]
    );
  });
});

describe("usage answer: the API", () => {
  let w: World;
  let route: any;
  let admin: any;
  before(async () => {
    w = await makeWorld();
    route = await import("@/app/api/billing/usage/route");
    admin = await import("@/app/api/admin/usage/route");
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  const answer = async (body: unknown) => {
    const res = await route.POST(w.request("/api/billing/usage", { body }));
    return { status: res.status as number, body: await w.readJson(res) };
  };

  it("refuses an order that is not paid yet", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const r = await answer({ orderId: order.orderId, uses: ["exhibitions"] });
    assert.equal(r.status, 409);
    assert.equal(await w.count("order_usage"), 0);
  });

  it("refuses a made-up order id and a malformed one", async () => {
    assert.equal((await answer({ orderId: "not-a-uuid", uses: ["qr"] })).status, 400);
    assert.equal(
      (await answer({ orderId: "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", uses: ["qr"] })).status,
      404
    );
  });

  it("saves the answer for a paid order, and a second answer replaces the first", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    const paid = await w.payInBrowser(order);
    assert.equal(paid.body.status, "ready");

    const first = await answer({ orderId: order.orderId, uses: ["exhibitions", "followup"] });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    let rows = await w.q("select uses, other_text from public.order_usage");
    assert.deepEqual(rows[0].uses, ["exhibitions", "followup"]);
    assert.equal(rows[0].other_text, null);

    const second = await answer({ orderId: order.orderId, uses: ["other"], other: "Plant induction for new staff" });
    assert.equal(second.status, 200);
    rows = await w.q("select uses, other_text from public.order_usage");
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].uses, ["other"]);
    assert.equal(rows[0].other_text, "Plant induction for new staff");
  });

  it("refuses an empty or tampered answer even for a paid order", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    await w.payInBrowser(order);
    assert.equal((await answer({ orderId: order.orderId, uses: [] })).status, 400);
    assert.equal((await answer({ orderId: order.orderId, uses: ["exhibitions", "<script>"] })).status, 400);
    assert.equal((await answer({ orderId: order.orderId, uses: ["other"], other: "" })).status, 400);
    assert.equal(await w.count("order_usage"), 0);
  });

  it("the report is for the platform owner only, and counts the answers", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    await w.payInBrowser(order);
    await answer({ orderId: order.orderId, uses: ["qr", "oem"] });

    const owner = await w.seedUser({ email: "owner@myvpv.com", role: "owner" });
    const customer = await w.seedUser({ email: "someone@factory.in", role: "org_admin" });

    const get = async (as?: string) => {
      const res = await admin.GET(w.request("/api/admin/usage", { method: "GET", as }));
      return { status: res.status as number, body: await w.readJson(res) };
    };
    assert.equal((await get()).status, 401);
    assert.equal((await get(customer)).status, 403);

    const r = await get(owner);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.rows.length, 1);
    assert.deepEqual(r.body.rows[0].uses, ["qr", "oem"]);
    // Test-mode orders are listed but not counted in the bars.
    assert.equal(r.body.rows[0].test, true);
    assert.equal(r.body.answered, 0);
  });
});
