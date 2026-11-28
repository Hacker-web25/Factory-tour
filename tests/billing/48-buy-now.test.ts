import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import {
  SECURITY_ADDON,
  SITE_PLANS,
  SUPPORT_ANNUAL_INR,
  priceFor,
  planYearlyFromNotes,
  securityAddonApplies,
  securityAddonFromNotes,
  siteQuote,
  toPaise,
  withGst,
} from "@/lib/pricing";
import { accessTo } from "@/lib/entitlements";
import { gstinCheckChar, gstinEntityLabel, stateCodeFor, stateWithCode, validGstin } from "@/lib/gstin";
import {
  cleanPhone,
  composeAddress,
  deliveryAddressFor,
  parseBuyDetails,
  placeOfSupplyState,
  taxSplit,
} from "@/lib/buyNow";
import { COMPANY } from "@/lib/company";
import { PLAN_BILLING_SCRIPT, PLAN_BILLING_CSS } from "@/lib/site/planBilling";
import { invoiceBodyHtml } from "@/lib/billingDocs";

/** A GSTIN with a correct check character, for a state code and a PAN. */
function gstinFor(stateCode: string, pan: string): string {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
}
const HARYANA_GSTIN = gstinFor("06", "AABCA1234F");
const MAHARASHTRA_GSTIN = gstinFor("27", "AABCB5678G");

const DETAILS = {
  siteContactName: "Ravi Kumar",
  siteContactPhone: "9811111111",
  shoot: { line: "Plot 44, Sector 7, IMT Manesar", city: "Manesar", state: "Haryana", pincode: "122052", landmark: "" },
  window: "asap",
};

describe("the Security features add-on", () => {
  it("is ₹5,000 a month, billed yearly, and only for a yearly Light plan", () => {
    assert.equal(SECURITY_ADDON.monthlyInr, 5_000);
    assert.equal(SECURITY_ADDON.yearlyInr, 60_000);
    assert.equal(securityAddonApplies("light"), true);
    assert.equal(securityAddonApplies("light", "lifetime"), false, "a lifetime plan has no yearly amount to carry it");
    assert.equal(securityAddonApplies("premium"), false, "Premium already has every link control");
    assert.equal(securityAddonApplies("white_glove"), false);
    assert.equal(securityAddonApplies("control"), false, "a plan no longer sold");
  });

  it("adds one line of ₹60,000, and renews with the plan", () => {
    const base = siteQuote("light", { city: "Manesar", offerOpen: true, founding: true });
    const withAddon = siteQuote("light", { city: "Manesar", offerOpen: true, founding: true, securityAddon: true });
    assert.equal(withAddon.securityAddon, true);
    assert.equal(withAddon.taxableInr - base.taxableInr, 60_000);
    assert.equal(withAddon.yearlyInr - base.yearlyInr, 60_000);
    const line = withAddon.lines.find((l) => /Security features/.test(l.label));
    assert.ok(line);
    assert.equal(line!.amountInr, 60_000);
    assert.match(line!.note ?? "", /₹5,000\/month, billed yearly/);
  });

  it("is ignored, never charged, where it does not apply", () => {
    const base = siteQuote("premium", { city: "Manesar" });
    const asked = siteQuote("premium", { city: "Manesar", securityAddon: true });
    assert.equal(asked.securityAddon, false);
    assert.equal(asked.taxableInr, base.taxableInr);
    const life = siteQuote("light", { city: "Manesar", billing: "lifetime", securityAddon: true });
    assert.equal(life.securityAddon, false);
  });

  it("is written on the order notes, and the renewal amount includes it", () => {
    const d = priceFor("site_plan", { sitePlanId: "light", city: "Manesar", offerOpen: true, founding: true, securityAddon: true }).description;
    assert.equal(securityAddonFromNotes(d), true);
    assert.equal(planYearlyFromNotes(d), 35_616 + 60_000);
    const plain = priceFor("site_plan", { sitePlanId: "light", city: "Manesar", offerOpen: true, founding: true }).description;
    assert.equal(securityAddonFromNotes(plain), false);
    assert.equal(planYearlyFromNotes(plain), 35_616);
  });

  it("shows on its own row of a renewal invoice, and the rows add up", () => {
    const yearly = 35_616 + 60_000;
    const r = priceFor("support_renewal", { planYearlyInr: yearly, securityInr: 60_000, planId: "light", salesSeats: 0 });
    assert.equal(r.amountInr, yearly + SUPPORT_ANNUAL_INR);
    assert.equal(r.lines.reduce((s, l) => s + (l.amountInr ?? 0), 0), r.amountInr);
    assert.ok(r.lines.some((l) => /Security features/.test(l.title) && l.amountInr === 60_000));
  });

  it("opens the link controls on a Light workspace, and only then", () => {
    const light = { plan: "basic", site_plan: "light", plan_billing: "annual" };
    assert.equal(accessTo(light, "link_one_time").state, "locked");
    assert.equal(accessTo({ ...light, security_addon: true }, "link_password").state, "open");
    assert.equal(accessTo({ ...light, security_addon: true }, "link_devices").state, "open");
    assert.equal(accessTo({ ...light, security_addon: true }, "process_videos").state, "locked", "it adds the link controls, not the videos");
  });

  it("costs more than Premium, which already includes it (the page says so)", () => {
    const lightPlus = SITE_PLANS.light.priceInr + SECURITY_ADDON.yearlyInr;
    assert.ok(lightPlus > SITE_PLANS.premium.priceInr);
  });
});

describe("GST: which tax, on what", () => {
  it("charges CGST and SGST inside the seller's state, in halves that add up", () => {
    const t = taxSplit(95_616, "Haryana", COMPANY.state);
    assert.equal(t.kind, "intra");
    assert.equal(t.igst, 0);
    assert.equal(t.cgst, t.sgst);
    assert.equal(t.cgst + t.sgst, t.gst);
    assert.equal(t.gst, 17_210.88);
    assert.equal(t.total, withGst(95_616).total);
  });

  it("charges IGST everywhere else, to the paisa", () => {
    const t = taxSplit(95_616, "Maharashtra", COMPANY.state);
    assert.equal(t.kind, "inter");
    assert.equal(t.cgst + t.sgst, 0);
    assert.equal(t.igst, 17_210.88);
  });

  it("splits an odd amount without losing a paisa", () => {
    // Taxable value is a whole rupee, so the tax is an even number of paise and the halves are equal.
    for (const rupees of [1, 7, 999, 35_617, 123_457]) {
      const t = taxSplit(rupees, "Haryana", "Haryana");
      assert.equal(Math.round((t.cgst + t.sgst) * 100), Math.round(t.gst * 100), String(rupees));
      assert.equal(t.cgst, t.sgst, String(rupees));
    }
  });

  it("takes the place of supply from a valid GSTIN, not from what the page said", () => {
    assert.equal(validGstin(MAHARASHTRA_GSTIN), true);
    assert.equal(placeOfSupplyState(MAHARASHTRA_GSTIN, "Haryana"), "Maharashtra");
    assert.equal(placeOfSupplyState("", "haryana"), "Haryana");
    assert.equal(placeOfSupplyState("", "Nowhereland"), null);
  });

  it("prints the state with its GST code", () => {
    assert.equal(stateWithCode("Haryana"), "Haryana (06)");
    assert.equal(stateWithCode("Maharashtra"), "Maharashtra (27)");
    assert.equal(stateWithCode("Dadra and Nagar Haveli and Daman and Diu"), "Dadra and Nagar Haveli and Daman and Diu (26)");
    assert.equal(stateWithCode(""), "");
    assert.equal(stateCodeFor("Atlantis"), null);
  });

  it("tells a buyer what kind of taxpayer the GSTIN is", () => {
    assert.equal(gstinEntityLabel(HARYANA_GSTIN), "Company");
    assert.equal(gstinEntityLabel(gstinFor("27", "ABCPD1234E")), "Proprietor or individual");
    assert.equal(gstinEntityLabel("nonsense"), null);
  });
});

describe("the Buy now details", () => {
  const ok = () => parseBuyDetails(DETAILS, new Date("2026-11-28T10:00:00Z"));

  it("accepts a complete set, and builds the one-line shoot address", () => {
    const r = ok();
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.shootCity, "Manesar");
    assert.equal(r.shootLine, "Plot 44, Sector 7, IMT Manesar, Manesar, Haryana 122052");
    assert.equal(r.details.window, "asap");
  });

  it("refuses what is missing, in words a buyer can act on", () => {
    const bad = (patch: Record<string, unknown>, shoot: Record<string, unknown> = {}) =>
      parseBuyDetails({ ...DETAILS, ...patch, shoot: { ...DETAILS.shoot, ...shoot } }, new Date("2026-11-28T10:00:00Z"));
    assert.equal((bad({}, { line: "x" }) as { error: string }).error, "bad_shoot_address");
    assert.equal((bad({}, { city: "" }) as { error: string }).error, "bad_shoot_city");
    assert.equal((bad({}, { pincode: "12345" }) as { error: string }).error, "bad_pincode");
    assert.equal((bad({}, { pincode: "022052" }) as { error: string }).error, "bad_pincode");
    assert.equal((bad({}, { state: "Atlantis" }) as { error: string }).error, "bad_shoot_state");
    assert.equal((bad({ siteContactName: "" }) as { error: string }).error, "bad_site_contact");
    assert.equal((bad({ siteContactPhone: "123" }) as { error: string }).error, "bad_site_phone");
    assert.equal((bad({ window: "whenever" }) as { error: string }).error, "bad_window");
    assert.equal(parseBuyDetails(null).ok, false);
  });

  it("checks a chosen start date: today in India or later, within a year", () => {
    const at = new Date("2026-11-28T20:30:00Z"); // 02:00 on 29 Nov in India
    const day = (fromDate: string) => parseBuyDetails({ ...DETAILS, window: "from_date", fromDate }, at);
    assert.equal(day("2026-11-29").ok, true, "today, in India");
    assert.equal((day("2026-11-28") as { error: string }).error, "bad_from_date", "yesterday, in India");
    assert.equal((day("2027-12-05") as { error: string }).error, "bad_from_date", "more than a year away");
    assert.equal((day("tomorrow") as { error: string }).error, "bad_from_date");
    assert.equal(day("2026-12-15").ok, true);
  });

  it("cleans phone numbers and control characters", () => {
    assert.equal(cleanPhone("+91 98111 11111"), "+919811111111");
    assert.equal(cleanPhone("98111-11111"), "9811111111");
    assert.equal(cleanPhone("12345"), "");
    const r = parseBuyDetails({ ...DETAILS, siteContactName: "Ravi\u0000 Kumar\n\n", notes: "an old browser may still send this" });
    assert.equal(r.ok && r.details.siteContactName, "Ravi Kumar");
    assert.equal(r.ok && "notes" in r.details, false, "the crew-notes box is gone, so nothing is kept");
    assert.equal(composeAddress({ line: "A", city: "B", pincode: "110001" }), "A, B, 110001");
  });

  it("prints a delivery address on the invoice only when the site is not the billing address", () => {
    const billing = "Plot 44, Sector 7, IMT Manesar, Manesar, Haryana 122052";
    assert.equal(deliveryAddressFor(billing, "plot 44 sector 7 imt manesar, manesar, haryana 122052"), null, "spacing and case do not matter");
    assert.equal(deliveryAddressFor("Plot 44, Sector 7, IMT Manesar", "Plot 44, Sector 7, IMT Manesar, Manesar, Haryana 122052 (near Gate 2)"), null);
    assert.equal(deliveryAddressFor("12 Industrial Area, Gurugram", "Plot 44, Sector 7, IMT Manesar, Haryana 122052"), "Plot 44, Sector 7, IMT Manesar, Haryana 122052");
    assert.equal(deliveryAddressFor("12 Industrial Area, Gurugram", ""), null);
    assert.equal(deliveryAddressFor("", "Plot 44, Manesar"), "Plot 44, Manesar");
  });
});

describe("Buy now through the real order route", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  const verify = (email: string, minutesAgo = 1) =>
    w.q(
      `insert into public.funnel_otp (email, code_hash, expires_at, consumed_at)
       values ($1, 'x', now() + interval '10 minutes', now() - ($2 || ' minutes')::interval)`,
      [email.toLowerCase(), String(minutesAgo)]
    );

  const buy = async (body: Record<string, unknown> = {}, buyer: Record<string, unknown> = {}) => {
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", {
        ip: freshIp(),
        body: {
          purpose: "site_plan",
          buy: true,
          termsAccepted: true,
          sitePlanId: "light",
          buyer: { ...BUYER, ...buyer },
          details: DETAILS,
          ...body,
        },
      })
    );
    return { status: res.status, body: await w.readJson(res) };
  };

  it("needs a confirmed e-mail address, checked on the server", async () => {
    const none = await buy();
    assert.equal(none.status, 403, JSON.stringify(none.body));
    assert.equal(none.body.error, "email_not_verified");
    await verify(BUYER.email, 90); // confirmed, but not within the hour
    assert.equal((await buy()).body.error, "email_not_verified");
    await verify("someone-else@example.com");
    assert.equal((await buy()).body.error, "email_not_verified", "another address's code does not count");
    await verify(BUYER.email);
    assert.equal((await buy()).status, 200);
  });

  it("needs the terms accepted, and a billing address and phone", async () => {
    await verify(BUYER.email);
    assert.equal((await buy({ termsAccepted: false })).body.error, "terms_required");
    assert.equal((await buy({}, { address: "" })).body.error, "bad_address");
    assert.equal((await buy({}, { phone: "" })).body.error, "bad_phone");
    assert.equal((await buy({ details: { ...DETAILS, shoot: { ...DETAILS.shoot, pincode: "1" } } })).body.error, "bad_pincode");
  });

  it("refuses a shoot city we do not serve, instead of guessing a travel charge", async () => {
    await verify(BUYER.email);
    const r = await buy({ details: { ...DETAILS, shoot: { ...DETAILS.shoot, city: "Reykjavik" } } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "city_not_served");
  });

  it("stores the shoot site and the details with the order, before any payment", async () => {
    await verify(BUYER.email);
    const r = await buy({ marketingConsent: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [row] = await w.q(`select buy_details, shoot_address, buyer_address, buyer_city, buyer_address_line, buyer_pincode from public.billing_orders`);
    assert.equal(row.shoot_address, "Plot 44, Sector 7, IMT Manesar, Manesar, Haryana 122052");
    assert.equal(row.buyer_address, BUYER.address, "the invoice keeps the billing address the buyer typed");
    assert.equal(row.buyer_city, "Manesar", "the crew's city, not the billing city");
    assert.equal(row.buyer_pincode, "122052");
    assert.equal(row.buy_details.siteContactName, "Ravi Kumar");
    assert.equal(row.buy_details.consent.marketing, true);
    assert.ok(row.buy_details.consent.termsAt);
  });

  it("prices Light with Security features from the server's own rules, never the page's", async () => {
    await verify(BUYER.email);
    const without = await buy();
    const withAddon = await buy({ securityAddon: true, amountPaise: 1, total: 1 });
    assert.equal(withAddon.status, 200, JSON.stringify(withAddon.body));
    assert.equal(withAddon.body.amountPaise - without.body.amountPaise, toPaise(withGst(60_000).total));
    const [row] = await w.q(`select notes from public.billing_orders where status = 'created'`);
    assert.equal(securityAddonFromNotes(row.notes), true);
  });

  it("refuses the add-on on Premium and on a plan paid for life", async () => {
    await verify(BUYER.email);
    const p = await buy({ sitePlanId: "premium", securityAddon: true });
    assert.equal(p.status, 400);
    assert.equal(p.body.error, "addon_not_available");
    const life = await buy({ billing: "lifetime", securityAddon: true });
    assert.equal(life.body.error, "addon_not_available");
  });

  it("builds a Light workspace with the link controls on, renewing at plan plus add-on", async () => {
    await verify(BUYER.email);
    const o = await buy({ securityAddon: true });
    await w.payInBrowser(o.body);
    assert.equal((await w.poll(o.body.orderId)).body.status, "ready");
    const [org] = await w.q(`select id, site_plan, security_addon, plan_yearly_inr from public.organizations`);
    assert.equal(org.site_plan, "light");
    assert.equal(org.security_addon, true);
    assert.equal(Number(org.plan_yearly_inr), 35_616 + 60_000);
    const [{ c }] = await w.q(`select public.org_link_controls($1) as c`, [org.id]);
    assert.deepEqual(c, { oneTime: true, password: true, expiry: true, devices: true });
  });

  it("builds a plain Light workspace with no link controls", async () => {
    await verify(BUYER.email);
    const o = await buy();
    await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    const [org] = await w.q(`select id, security_addon from public.organizations`);
    assert.equal(org.security_addon, false);
    const [{ c }] = await w.q(`select public.org_link_controls($1) as c`, [org.id]);
    assert.deepEqual(c, { oneTime: false, password: false, expiry: false, devices: false });
  });

  it("a signed-in workspace cannot switch the add-on on itself", async () => {
    await verify(BUYER.email);
    const o = await buy();
    await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    const [org] = await w.q(`select id from public.organizations`);
    const [admin] = await w.q(`select id from public.profiles where org_id = $1`, [org.id]);
    const { error } = await w.sb.as("authenticated", admin.id).from("organizations").update({ security_addon: true }).eq("id", org.id);
    assert.ok(error, "the plan columns are the billing system's alone");
    const [after] = await w.q(`select security_addon from public.organizations where id = $1`, [org.id]);
    assert.equal(after.security_addon, false);
  });

  it("a Light workspace with the add-on is moved to Premium by a person, not by a button", async () => {
    await verify(BUYER.email);
    const o = await buy({ securityAddon: true });
    await w.payInBrowser(o.body);
    await w.poll(o.body.orderId);
    const [org] = await w.q(`select id from public.organizations`);
    const [admin] = await w.q(`select id from public.profiles where org_id = $1`, [org.id]);
    const res = await w.routes.order.POST(
      w.request("/api/billing/order", { as: admin.id, body: { purpose: "plan_upgrade", upgradeTo: "premium", buyer: {} } })
    );
    assert.equal(res.status, 400);
    assert.equal((await w.readJson(res)).error, "invalid_upgrade");
  });

  describe("the invoice", () => {
    const invoiceFor = async (buyer: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      await verify(String(buyer.email ?? BUYER.email));
      const o = await buy(extra, buyer);
      assert.equal(o.status, 200, JSON.stringify(o.body));
      await w.payInBrowser(o.body);
      await w.poll(o.body.orderId);
      const [inv] = await w.q(`select * from public.billing_invoices`);
      return { inv, orderId: o.body.orderId as string };
    };

    it("charges CGST and SGST to a Haryana business", async () => {
      const { inv } = await invoiceFor({ gstin: HARYANA_GSTIN, state: "Haryana" });
      assert.equal(inv.bill_to_gstin, HARYANA_GSTIN);
      assert.equal(inv.place_of_supply, "Haryana");
      assert.equal(Number(inv.igst_paise), 0);
      assert.ok(Number(inv.cgst_paise) > 0);
      assert.equal(Number(inv.cgst_paise), Number(inv.sgst_paise));
    });

    it("charges IGST to a Maharashtra business, even when the page said Haryana", async () => {
      const { inv } = await invoiceFor({ email: "accounts@bhiwandi-co.in", gstin: MAHARASHTRA_GSTIN, state: "Haryana" });
      assert.equal(inv.place_of_supply, "Maharashtra", "the GSTIN decides, not the form");
      assert.equal(Number(inv.cgst_paise), 0);
      assert.equal(Number(inv.sgst_paise), 0);
      assert.ok(Number(inv.igst_paise) > 0);
      assert.equal(Number(inv.taxable_paise) + Number(inv.igst_paise), Number(inv.total_paise));
    });

    it("charges IGST to an unregistered buyer in another state, on the state they chose", async () => {
      const { inv } = await invoiceFor({ email: "owner@kolkata-works.in", gstin: "", state: "West Bengal" });
      assert.equal(inv.place_of_supply, "West Bengal");
      assert.ok(Number(inv.igst_paise) > 0);
      assert.equal(inv.bill_to_gstin, null);
    });

    it("rejects a GSTIN with a wrong check character before any money moves", async () => {
      await verify(BUYER.email);
      const wrong = MAHARASHTRA_GSTIN.slice(0, 14) + (MAHARASHTRA_GSTIN[14] === "A" ? "B" : "A");
      const r = await buy({}, { gstin: wrong });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, "bad_gstin");
    });

    it("carries the rule 46 particulars in the e-mail body and loads the shoot site when it differs", async () => {
      const { orderId } = await invoiceFor(
        { email: "plant@manesar-co.in", gstin: MAHARASHTRA_GSTIN, address: "Unit 3, Bhiwandi, Thane", state: "Maharashtra" }
      );
      const { loadInvoiceDoc } = await import("@/lib/server/billingEmails");
      const doc = await loadInvoiceDoc(w.sb as never, orderId);
      assert.ok(doc);
      assert.equal(doc!.deliveryAddress, "Plot 44, Sector 7, IMT Manesar, Manesar, Haryana 122052");
      const html = invoiceBodyHtml(doc!, "Asha", COMPANY.emails.support, true);
      assert.match(html, /Place of supply/);
      assert.match(html, /Maharashtra \(27\)/);
      assert.match(html, /Tax payable on reverse charge/);
      assert.match(html, /Shoot site \(address of delivery\)/);
      assert.match(html, /IGST/);
      const { renderInvoicePdf } = await import("@/lib/server/invoicePdf");
      const pdf = await renderInvoicePdf(doc!);
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    });

    it("prints no delivery address when the shoot site is the billing address", async () => {
      const { orderId } = await invoiceFor(
        { email: "same@manesar-co.in", address: "Plot 44, Sector 7, IMT Manesar, Manesar, Haryana 122052" }
      );
      const { loadInvoiceDoc } = await import("@/lib/server/billingEmails");
      const doc = await loadInvoiceDoc(w.sb as never, orderId);
      assert.equal(doc!.deliveryAddress, null);
    });
  });
});

describe("the Get MyVPV button on each plan card", () => {
  it("is added under each card's feature list, not as a separate section", () => {
    const js = String(PLAN_BILLING_SCRIPT);
    assert.ok(js.includes("vpv-pc-buy"), "the script adds the button");
    assert.ok(js.includes("Get MyVPV"), "the button says Get MyVPV");
    assert.ok(js.includes("plans-page-card-"), "it reads the plan id from each card");
    assert.ok(js.includes("/buy?plan="), "it links to the Buy now page");
    assert.ok(!js.includes("buy-now-strip") && !js.includes("vpv-bn"), "the old separate strip is gone");
    assert.ok(!String(PLAN_BILLING_CSS).includes(".vpv-bn"), "and so are its styles");
  });

  it("follows the Annually / Lifetime switch", () => {
    const js = String(PLAN_BILLING_SCRIPT);
    assert.ok(/querySelectorAll\("\.vpv-pc-buy"\)/.test(js), "paint() updates every button's link");
    assert.ok(js.includes('"&billing="'), "the billing mode is part of the link");
  });

  it("is still, and shows a focus ring, when motion is reduced", () => {
    const css = String(PLAN_BILLING_CSS);
    assert.ok(css.includes(".vpv-pc-buy:focus-visible"));
    assert.ok(/prefers-reduced-motion[^}]*\.vpv-pc-buy/.test(css.replace(/\n/g, "")), "no transition under reduced motion");
  });
});

describe("the plain price struck out beside the total to pay", () => {
  it("is the same order with every offer taken away (Premium, yearly, first 20)", () => {
    const q = siteQuote("premium", { offerOpen: true, founding: true, billing: "annual" });
    // Pays: half the plan. Plain: the whole plan plus the first support year, which the first 20 get free.
    assert.equal(q.taxableInr, 77_640);
    assert.equal(q.totalInr, 91_615.2);
    assert.equal(q.regularTaxableInr, 155_280 + SUPPORT_ANNUAL_INR);
    assert.deepEqual(withGst(q.regularTaxableInr).total, q.regularTotalInr);
    assert.equal(q.regularTotalInr, 197_376.24);
    assert.ok(q.regularTotalInr > q.totalInr);
  });

  it("puts the free cab and the sales logins back at their full price, and ignores a coupon", () => {
    const base = siteQuote("premium", { offerOpen: true, founding: true, city: "Gurugram", salesSeats: 2 });
    const cab = base.lines.find((l) => l.kind === "travel")!;
    assert.equal(cab.amountInr, 0, "free for the first 20");
    assert.ok((cab.regularInr ?? 0) > 0);
    assert.equal(base.regularTaxableInr, 155_280 + SUPPORT_ANNUAL_INR + (cab.regularInr ?? 0) + 2 * 999);
    const coupon = { code: "TEST10", percentOff: 10, amountOffInr: null };
    const withCoupon = siteQuote("premium", { offerOpen: true, founding: true, city: "Gurugram", salesSeats: 2, coupon });
    assert.ok(withCoupon.totalInr < base.totalInr, "the coupon lowers what is paid");
    assert.equal(withCoupon.regularTotalInr, base.regularTotalInr, "but not the plain price");
  });

  it("works for a lifetime plan too", () => {
    const q = siteQuote("light", { offerOpen: true, founding: true, billing: "lifetime" });
    assert.ok(q.regularTotalInr > q.totalInr);
    assert.equal(q.regularTaxableInr, SITE_PLANS.light.regularLifetimeInr + SUPPORT_ANNUAL_INR);
  });

  it("equals the total once the offer has closed, so nothing is struck out", () => {
    for (const id of ["light", "premium", "white_glove"] as const) {
      for (const billing of ["annual", "lifetime"] as const) {
        const q = siteQuote(id, { offerOpen: false, founding: false, billing, city: "Gurugram" });
        assert.equal(q.regularTotalInr, q.totalInr, `${id} ${billing}`);
        assert.equal(q.regularTaxableInr, q.taxableInr, `${id} ${billing}`);
      }
    }
  });
});
