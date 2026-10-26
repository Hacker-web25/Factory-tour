/**
 * The address a customer's VPV lives at, and the address our crew
 * drives to.
 *
 * Both used to be afterthoughts, and both went wrong in the same live
 * order: the company "LiveTest" was handed livetest-407.myvpv.com
 * because the plain name was taken and the code appended a random
 * number, and the invoice went out with no address on it at all because
 * the funnel never asked for one.
 *
 * So what is pinned here is: the name a customer chooses is the name
 * they get; a name that cannot work is refused BEFORE the money moves;
 * and the address they type reaches the invoice.
 */

import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  RESERVED_SLUGS,
  SLUG_MAX,
  SLUG_MAX_WORDS,
  slugProblem,
  workspaceHost,
  workspaceSlug,
} from "@/lib/slugs";
import { loadInvoiceDoc } from "@/lib/server/billingEmails";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";

describe("workspace address: turning a company name into one", () => {
  it("keeps it to one label, lower case, hyphens between words", () => {
    assert.equal(workspaceSlug("Acme Steel"), "acme-steel");
    assert.equal(workspaceSlug("  ACME   Steel  "), "acme-steel");
    assert.equal(workspaceSlug("Kesaria Rubber Industries Pvt. Ltd."), "kesaria-rubber-industries");
    assert.equal(workspaceSlug("textile example"), "textile-example");
  });

  it("never produces a second dot — one would break the padlock on the address", () => {
    for (const name of ["textile.example", "a.b.c.d", "shree.krishna  textiles"]) {
      const s = workspaceSlug(name);
      assert.ok(!s.includes("."), `${name} → ${s}`);
      assert.equal(slugProblem(s), null, `${name} → ${s}`);
    }
  });

  it("never appends a number of its own", () => {
    for (const name of ["LiveTest", "Acme", "Shree Krishna Textiles"]) {
      assert.ok(!/-\d+$/.test(workspaceSlug(name)), name);
    }
  });

  it("keeps it short enough to say on the phone", () => {
    const long = workspaceSlug("Shree Krishna Precision Engineering And Fabrication Works Private Limited");
    assert.ok(long.length <= SLUG_MAX, `${long} is ${long.length}`);
    assert.ok(long.split("-").length <= SLUG_MAX_WORDS, long);
    assert.equal(slugProblem(long), null, long);
  });

  it("gives something usable even for a name with no letters", () => {
    assert.equal(workspaceSlug("!!!"), "");
    assert.ok(slugProblem(""), "and says so rather than inventing one");
  });

  it("renders as the host a buyer actually types", () => {
    assert.equal(workspaceHost("acme-steel"), "acme-steel.myvpv.com");
  });
});

describe("workspace address: what is refused", () => {
  const bad: [string, RegExp][] = [
    ["", /choose an address/i],
    ["ab", /at least/i],
    ["ACME", /small letters/i],
    ["acme.steel", /dot/i],
    ["acme_steel", /letters, numbers/i],
    ["-acme", /hyphen/i],
    ["acme-", /hyphen/i],
    ["acme--steel", /one hyphen/i],
    ["12345", /letters/i],
    ["one-two-three-four", /words/i],
    ["a".repeat(SLUG_MAX + 1), /characters/i],
  ];
  for (const [value, why] of bad) {
    it(`refuses ${JSON.stringify(value)}`, () => {
      const problem = slugProblem(value);
      assert.ok(problem, `${value} should be refused`);
      assert.match(problem!, why);
    });
  }

  it("refuses every name that belongs to VPV itself", () => {
    for (const r of RESERVED_SLUGS) assert.ok(slugProblem(r), r);
  });

  it("accepts the ordinary ones", () => {
    for (const good of ["acme", "acme-steel", "kesaria-rubber-industries", "vpv2", "a1-b2"]) {
      assert.equal(slugProblem(good), null, good);
    }
  });
});

describe("workspace address: the checkout claims it", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  const open = async (body: Record<string, unknown>) =>
    w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: { purpose: "basic_licence", scenes: 4, buyer: { ...BUYER }, ...body },
      })
    );

  it("stores the chosen address on the order", async () => {
    const res = await open({ workspaceSlug: "acme-steel" });
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    const [row] = await w.q(`select requested_slug from public.billing_orders where id = $1`, [body.orderId]);
    assert.equal(row.requested_slug, "acme-steel");
  });

  it("refuses an address that cannot work, before any money moves", async () => {
    for (const slug of ["a", "acme.steel", "admin", "one-two-three-four"]) {
      const res = await open({ workspaceSlug: slug });
      assert.equal(res.status, 400, slug);
      assert.equal(await w.count("billing_orders", "requested_slug = $1", [slug]), 0, slug);
    }
  });

  it("refuses an address another checkout is already holding", async () => {
    const first = await open({ workspaceSlug: "acme-steel" });
    assert.equal(first.status, 200);
    const second = await open({ workspaceSlug: "acme-steel", buyer: { ...BUYER, email: "two@other-firm.in", company: "Other Firm" } });
    const body = await w.readJson(second);
    assert.equal(second.status, 409, JSON.stringify(body));
    assert.equal(body.error, "workspace_taken");
  });

  it("refuses an address an existing customer already lives at", async () => {
    await w.seedOrg({ slug: "taken-co" });
    const res = await open({ workspaceSlug: "taken-co" });
    assert.equal(res.status, 409);
  });

  it("builds the workspace at exactly the address that was chosen", async () => {
    const res = await open({ workspaceSlug: "acme-steel", buyer: { ...BUYER, company: "LiveTest" } });
    const order = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(order));
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    const [org] = await w.q(
      `select o.slug from public.organizations o
         join public.billing_orders b on b.org_id = o.id where b.id = $1`,
      [order.orderId]
    );
    assert.equal(org.slug, "acme-steel", "not livetest, and certainly not livetest-407");
  });
});

describe("plant address: it reaches the invoice", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
  });
  after(() => w.gw.uninstall());

  it("is composed into one line the invoice can print", async () => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: {
          purpose: "basic_licence",
          scenes: 4,
          buyer: {
            ...BUYER,
            address: "",
            addressLine: "Plot 14, Sector 7, Industrial Area",
            city: "Gurugram",
            state: "Haryana",
            pincode: "122018",
          },
        },
      })
    );
    const order = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(order));
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");

    const doc = await loadInvoiceDoc(w.sb as never, order.orderId);
    assert.ok(doc?.billTo.address, "the invoice has an address at all");
    assert.match(doc!.billTo.address!, /Plot 14, Sector 7, Industrial Area/);
    assert.match(doc!.billTo.address!, /Gurugram/);
    assert.match(doc!.billTo.address!, /122018/);

    const [row] = await w.q(
      `select buyer_address_line, buyer_city, buyer_pincode from public.billing_orders where id = $1`,
      [order.orderId]
    );
    assert.equal(row.buyer_city, "Gurugram", "and the crew can read the parts back");
    assert.equal(row.buyer_pincode, "122018");
  });

  it("refuses a PIN code that cannot be one", async () => {
    for (const pincode of ["12", "000000", "1234567"]) {
      const res = await w.routes.order.POST(
        w.request("/api/billing/order", {
          ip: freshIp(),
          body: { purpose: "basic_licence", scenes: 4, buyer: { ...BUYER, addressLine: "Plot 14", pincode } },
        })
      );
      assert.equal(res.status, 400, pincode);
    }
  });
});
