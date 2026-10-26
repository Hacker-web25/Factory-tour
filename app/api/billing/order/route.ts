/**
 * POST /api/billing/order
 *
 * Opens a payment. Returns everything Razorpay's checkout needs, and
 * nothing it does not.
 *
 * ── Why the amount is safe ────────────────────────────────────────────
 * The request says WHAT the customer wants ("a Basic licence with 7
 * scenes"). It never says what that costs. This route prices it with
 * `priceFor()` from lib/pricing.ts, writes that amount to our own
 * billing_orders row, and sends the same amount to Razorpay.
 *
 * ── Why a double click cannot charge twice ────────────────────────────
 * A unique index allows ONE open order per buyer + item. A second
 * identical request (double click, second tab, impatient retry) finds
 * that order and gets the SAME Razorpay order back. Razorpay accepts one
 * successful payment per order, so there is physically only one charge
 * to take. If the buyer CHANGED a detail, the old open order is cancelled
 * and a fresh one opened — nobody can edit an order someone else opened.
 *
 * ── Who may call it ───────────────────────────────────────────────────
 *   basic_licence    anyone WITHOUT an existing account (this is how a new
 *                    customer buys; existing customers sign in instead)
 *   site_plan        the same thing, bought as one of the marketing
 *                    site's named packs. Priced as a plan, STORED as a
 *                    basic_licence, because that is what it is.
 *   support_renewal  the organisation's own admin, signed in
 *   scene_topup      the organisation's own admin, signed in
 * For the signed-in purposes the invoice identity is the ORGANISATION'S,
 * never whatever the browser typed.
 *
 * ── Abuse limits (card-testing bots, scripted spam) ───────────────────
 *   per IP, per e-mail, per signed-in user, and one global ceiling; a
 *   limiter that errors does NOT switch itself off (see billingGuard).
 *
 * Request  { purpose, scenes?, sitePlanId?, travel?, buyer{ name,email,phone,company,gstin,address,state } }
 * Response { ok, orderId, razorpayOrderId, amountPaise, keyId, testMode, description }
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientIp } from "@/lib/getClientIp";
import { logSecurityEvent } from "@/lib/audit";
import { authenticateRequest, isOrgAdmin } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  razorpayConfigured,
  razorpayIsLive,
  razorpayIsTestMode,
  razorpayKeyId,
  billingPreflight,
} from "@/lib/server/razorpay";
import { syncOrderFromRazorpay } from "@/lib/server/payments";
import { launchOfferState } from "@/lib/server/launchOffer";
import { checkCoupon } from "@/lib/server/coupons";
import { orgSalesSeats } from "@/lib/server/salesSeats";
import { comingSoonTitle, logisticsFor } from "@/lib/logistics";
import type { Coupon } from "@/lib/pricing";
import { canonicalIndianState } from "@/lib/indianStates";
import { stateFromGstin } from "@/lib/gstin";
import {
  billingRateLimit,
  clean,
  fail,
  isDisposableEmail,
  json,
  limiterEmail,
  readJson,
  validEmail,
  validGstin,
} from "@/lib/server/billingGuard";
import {
  GST_RATE,
  SCENE_MAX,
  SUPPORT_RENEW_WINDOW_DAYS,
  isRequestPurpose,
  isSitePlanId,
  isTravelZone,
  isValidSceneCount,
  clampExtraAreas,
  clampExtraVideos,
  clampSalesSeats,
  PLACEHOLDER_PRICES,
  priceFor,
  storedPurpose,
  withGst,
  toPaise,
  type PurchasePurpose,
  type RequestPurpose,
} from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 8 * 1024;
/** How long an unpaid order stays reusable before a fresh one is opened. */
const OPEN_ORDER_TTL_MS = 30 * 60_000;

type Buyer = {
  name: string;
  email: string;
  phone: string;
  company: string;
  gstin: string;
  address: string;
  state: string;
};

type OrderRowLite = {
  id: string;
  razorpay_order_id: string | null;
  amount_paise: number;
  created_at: string;
  buyer_name: string;
  buyer_company: string;
  buyer_phone: string | null;
  buyer_gstin: string | null;
  buyer_address: string | null;
  buyer_state: string | null;
};

const ORDER_COLS =
  "id, razorpay_order_id, amount_paise, created_at, buyer_name, buyer_company, buyer_phone, buyer_gstin, buyer_address, buyer_state";

function sameBuyer(row: OrderRowLite, b: Buyer): boolean {
  const n = (v: string | null | undefined) => (v ?? "").trim();
  return (
    n(row.buyer_name) === b.name &&
    n(row.buyer_company) === b.company &&
    n(row.buyer_phone) === b.phone &&
    n(row.buyer_gstin) === b.gstin &&
    n(row.buyer_address) === b.address &&
    n(row.buyer_state) === b.state
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);

  if (!razorpayConfigured()) {
    return fail(503, "payments_unavailable", "Online payment is not switched on yet.");
  }
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "payments_unavailable", "Online payment is not switched on yet.");

  // With REAL money, refuse to open a checkout that could take a payment we then
  // cannot deliver on (no e-mail provider, no webhook secret, no daily safety
  // check). In test mode this only warns (see /admin/payments) so you can test.
  const pre = billingPreflight();
  if (pre.mode === "live" && pre.problems.length > 0) {
    console.error("[billing] checkout closed — set-up incomplete:", pre.problems.join(" | "));
    return fail(503, "payments_unavailable", "Online payment is being set up. Please try again shortly.");
  }

  /* ── Abuse limits ─────────────────────────────────────────────────── */

  const rlIp = await billingRateLimit(sb, `billing-order:ip:${ip}`, 10, 3600);
  if (!rlIp.allowed) {
    void logSecurityEvent({ event: "ratelimit.hit", subject: "billing-order", ip });
    return fail(429, "rate_limited", "Too many attempts. Please wait a little and try again.", {
      "Retry-After": String(rlIp.retryAfter),
    });
  }

  const parsed = await readJson(req, MAX_BODY_BYTES);
  if (!parsed.ok) return fail(parsed.status, parsed.error);
  const body = parsed.body;

  const purpose = body.purpose;
  if (!isRequestPurpose(purpose)) return fail(400, "unknown_purpose");
  // What goes in billing_orders. A site plan is a Basic licence sold as a
  // named pack, so everything downstream sees the purpose it already knows.
  const stored: PurchasePurpose = storedPurpose(purpose as RequestPurpose);

  // A placeholder price must never reach a real card. The site's plan
  // prices are still the ones it was built with, so while that is true
  // this purpose is refused outright on live keys. Test mode is left
  // open, so the whole flow can be rehearsed before the numbers are set.
  // Clear it by setting the real prices in lib/pricing.ts and flipping
  // PLACEHOLDER_PRICES to false.
  if (purpose === "site_plan" && PLACEHOLDER_PRICES && razorpayIsLive()) {
    return fail(
      503,
      "prices_not_final",
      "Online payment for these plans is not open yet. Please contact support@myvpv.com and we will take your order directly."
    );
  }

  /* ── Who is asking, and are they allowed to ask for this? ────────── */

  let orgId: string | null = null;
  let createdBy: string | null = null;
  let org: Record<string, unknown> | null = null;
  let authName = "";
  let authEmail = "";

  if (stored !== "basic_licence") {
    const auth = await authenticateRequest(req);
    if (!auth) return fail(401, "unauthorized", "Please sign in again.");
    if (!isOrgAdmin(auth.profile) || !auth.profile.org_id) {
      return fail(403, "forbidden", "Only an organisation admin can buy this.");
    }
    const rlUser = await billingRateLimit(sb, `billing-order:user:${auth.profile.id}`, 20, 3600);
    if (!rlUser.allowed) return fail(429, "rate_limited", undefined, { "Retry-After": String(rlUser.retryAfter) });

    orgId = auth.profile.org_id;
    createdBy = auth.profile.id;
    authName = auth.profile.full_name ?? "";
    authEmail = auth.profile.email ?? "";

    const { data } = await sb
      .from("organizations")
      .select(
        "id, name, plan, plan_status, scene_quota, support_until, billing_name, billing_email, billing_phone, billing_gstin, billing_address, billing_state"
      )
      .eq("id", orgId)
      .maybeSingle();
    org = data as Record<string, unknown> | null;
    if (!org) return fail(404, "org_not_found");

    // Pro and Ultra already have unlimited scenes and support included.
    if (org.plan !== "basic") return fail(400, "not_applicable", "Your plan already includes this.");
    if (org.plan_status === "cancelled" || org.plan_status === "suspended") {
      return fail(403, "workspace_unavailable", "This workspace is closed. Please contact support@myvpv.com.");
    }
  }

  /* ── Buyer details ───────────────────────────────────────────────── */

  const src = (body.buyer && typeof body.buyer === "object" ? body.buyer : {}) as Record<string, unknown>;
  const typed = {
    name: clean(src.name, 120),
    email: clean(src.email, 254).toLowerCase(),
    phone: clean(src.phone, 20),
    company: clean(src.company, 160),
    // Not cut to 15: an over-long entry must be REFUSED, never silently trimmed into a different number.
    gstin: clean(src.gstin, 40).toUpperCase(),
    address: clean(src.address, 400),
    state: clean(src.state, 60),
  };
  const placeholder = (v: string) => v === "" || v === "—" || v === "-";

  const buyer: Buyer = org
    ? {
        name: placeholder(typed.name) ? authName || String(org.billing_name ?? org.name) : typed.name,
        // Invoices and receipts go to the ORGANISATION's address on file.
        email: String(org.billing_email || authEmail).toLowerCase(),
        company: String(org.billing_name || org.name),
        phone: typed.phone || String(org.billing_phone ?? ""),
        gstin: typed.gstin || String(org.billing_gstin ?? ""),
        address: typed.address || String(org.billing_address ?? ""),
        state: typed.state || String(org.billing_state ?? ""),
      }
    : typed;

  if (!buyer.name || !buyer.company) return fail(400, "missing_fields", "Name and company are required.");
  if (!validEmail(buyer.email)) return fail(400, "bad_email", "That e-mail address does not look right.");
  // A GSTIN already on file from before strict checking must never block a renewal.
  if (org && !typed.gstin && buyer.gstin && !validGstin(buyer.gstin)) buyer.gstin = "";
  if (buyer.gstin && !validGstin(buyer.gstin)) {
    return fail(400, "bad_gstin", "That GSTIN does not look right. Please check it, or leave it blank if you do not have one.");
  }
  // For a GST-registered customer the place of supply is the state inside the
  // GSTIN itself; otherwise it is the state they chose. A blank or unknown state
  // is refused rather than quietly producing the wrong CGST+SGST / IGST split.
  const canonicalState = (buyer.gstin ? stateFromGstin(buyer.gstin) : null) ?? canonicalIndianState(buyer.state);
  if (!canonicalState) {
    return fail(400, "state_required", "Please choose your state - it decides the GST split on your invoice.");
  }
  buyer.state = canonicalState;

  if (!org) {
    if (isDisposableEmail(buyer.email)) {
      return fail(400, "bad_email", "Please use a permanent work e-mail address.");
    }
    const rlEmail = await billingRateLimit(sb, `billing-order:email:${limiterEmail(buyer.email)}`, 12, 3600);
    if (!rlEmail.allowed) {
      return fail(429, "rate_limited", "Too many attempts for this e-mail. Please wait a little.", {
        "Retry-After": String(rlEmail.retryAfter),
      });
    }

    // One e-mail, one account. An existing customer signs in to buy more —
    // otherwise a purchase could capture (or collide with) their account.
    const { data: existingUser } = await sb.rpc("billing_find_auth_user", { p_email: buyer.email });
    if (existingUser) {
      return fail(
        409,
        "account_exists",
        "An account with this e-mail already exists. Please sign in to add scenes or renew support."
      );
    }
    // Paid already, workspace still being built: do not take a second payment.
    const { data: paidPending } = await sb
      .from("billing_orders")
      .select("id")
      .eq("buyer_email", buyer.email)
      .eq("purpose", "basic_licence")
      .eq("status", "paid")
      .is("provisioned_at", null)
      .limit(1);
    if (paidPending && paidPending.length > 0) {
      return fail(
        409,
        "payment_in_progress",
        "We have received your payment and are setting up your workspace. Your sign-in e-mail will arrive shortly."
      );
    }
  }

  /* ── Scenes, eligibility, price. The ONLY place an amount is decided ─ */

  const existingScenes = org ? Number(org.scene_quota ?? 0) : 0;
  let scenesWanted: number | undefined;

  let sitePlanId: unknown;
  let travel: unknown;
  let siteCity = "";
  let extraAreas = 0;
  let extraVideos = 0;
  let salesSeats = 0;

  if (purpose === "site_plan") {
    // The browser names a plan, a city and how many extras it wants. Not one
    // of those is a price: priceFor() looks them all up in lib/pricing.ts.
    sitePlanId = body.sitePlanId;
    travel = body.travel;
    if (!isSitePlanId(sitePlanId)) return fail(400, "invalid_plan", "Please choose one of our plans.");

    // The funnel sends the factory's city, which prices travel by its tier.
    // The older /checkout page and the marketing site's pay bridge still send
    // the two-zone answer, so either is accepted — but one of them must be
    // there, or we would be guessing at the travel charge.
    siteCity = clean(body.city, 80);
    if (!siteCity && !isTravelZone(travel)) {
      return fail(400, "invalid_travel", "Please tell us which city your factory is in.");
    }
    // Travel is by cab, so we can only take an order for a city we shoot in.
    if (siteCity ? !logisticsFor(siteCity).inServiceArea : travel !== "ncr") {
      const where = siteCity ? logisticsFor(siteCity).city : "";
      return fail(
        400,
        "city_not_served",
        `${comingSoonTitle(where)}. We do not shoot there just yet, so we cannot take your order today; we will contact you as soon as we do.`
      );
    }

    // Add-ons. Out-of-range values are clamped rather than refused: the
    // slider cannot produce them, and clamping charges the buyer for what we
    // can actually deliver instead of failing a legitimate purchase.
    extraAreas = clampExtraAreas(body.extraAreas);
    extraVideos = clampExtraVideos(body.extraVideos);
    salesSeats = clampSalesSeats(body.salesSeats);
  } else if (purpose === "basic_licence") {
    if (!isValidSceneCount(body.scenes)) return fail(400, "invalid_scenes", "Please choose between 2 and 20 scenes.");
    scenesWanted = body.scenes;
  } else if (purpose === "scene_topup") {
    const target = body.scenes;
    if (
      typeof target !== "number" ||
      !Number.isInteger(target) ||
      target <= existingScenes ||
      target > SCENE_MAX ||
      existingScenes < 1
    ) {
      return fail(400, "invalid_scenes", "Choose a total higher than the scenes you have now (up to 20).");
    }
    scenesWanted = target;
  } else if (purpose === "support_renewal") {
    const until = org?.support_until ? new Date(String(org.support_until)).getTime() : null;
    if (until && until > Date.now() + SUPPORT_RENEW_WINDOW_DAYS * 86_400_000) {
      return fail(
        409,
        "too_early",
        `You are already covered until ${new Date(until).toDateString()}. Renewal opens ${SUPPORT_RENEW_WINDOW_DAYS} days before it ends.`
      );
    }
  }

  // The special offer is "for our first 50 customers", so whether it still
  // applies is decided HERE, from the real count of paid site-plan orders —
  // never from anything the browser says.
  const offer = purpose === "site_plan" ? await launchOfferState(sb) : null;

  // A coupon, if the buyer entered one. Checked here against the database —
  // the browser's own preview of the discount is never used.
  let coupon: Coupon | null = null;
  if (purpose === "site_plan" && typeof body.coupon === "string" && body.coupon.trim()) {
    const check = await checkCoupon(sb, body.coupon);
    if (!check.ok) return fail(400, "coupon_invalid", check.message);
    coupon = check.coupon;
  }

  // A renewal also renews the Sales Team logins, at the price they were bought at.
  const renewalSeats = purpose === "support_renewal" ? await orgSalesSeats(sb, orgId) : { seats: 0, seatInr: 0 };

  const quote = priceFor(purpose as RequestPurpose, {
    scenes: scenesWanted,
    existingScenes,
    sitePlanId: isSitePlanId(sitePlanId) ? sitePlanId : undefined,
    travel: isTravelZone(travel) ? travel : undefined,
    city: siteCity || undefined,
    extraAreas,
    extraVideos,
    offerOpen: offer ? offer.open : undefined,
    salesSeats: purpose === "support_renewal" ? renewalSeats.seats : salesSeats,
    seatInr: renewalSeats.seatInr,
    coupon,
  });
  if (!(quote.amountInr > 0)) return fail(400, "nothing_to_pay", "There is nothing to pay for that.");

  const split = withGst(quote.amountInr);
  // Razorpay charges the TOTAL (base + 18% GST), which is what the final
  // checkout screen shows the customer right before they tap Pay.
  const amountPaise = toPaise(split.total);

  // One shop-wide ceiling. It is charged only for a request that passed every
  // check above, so a flood of malformed junk cannot use up the allowance that
  // real customers need.
  const globalCap = Number(process.env.BILLING_GLOBAL_ORDERS_PER_HOUR) || 200;
  const rlAll = await billingRateLimit(sb, "billing-order:all", globalCap, 3600);
  if (!rlAll.allowed) {
    return fail(429, "busy", "We are receiving unusually many requests. Please try again shortly.", {
      "Retry-After": String(rlAll.retryAfter),
    });
  }

  /* ── Find the open order, or open one ────────────────────────────── */

  let order: OrderRowLite;
  let reused = false;
  try {
    const got = await getOrCreateOrder(sb, {
      purpose: stored,
      scenes: quote.scenes,
      amountPaise,
      split,
      buyer,
      orgId,
      createdBy,
      ip,
      description: quote.description,
      quotaBefore: stored === "scene_topup" ? existingScenes : null,
    });
    order = got.order;
    reused = got.reused;
  } catch (e) {
    const code = (e as Error).message;
    if (code === "order_in_flight") {
      return fail(409, "order_in_flight", "Your payment is already being opened. Please wait a moment and try again.");
    }
    return fail(500, "order_failed", "We could not start the payment.");
  }

  // An organisation set up by hand (admin "create customer") may have no billing
  // state yet. The first time they pay and tell us, remember it so the next
  // purchase does not have to ask. Best effort: the invoice already carries the
  // state from this order, so a failure here changes nothing about the sale.
  if (org && orgId && !String(org.billing_state ?? "").trim()) {
    await sb
      .from("organizations")
      .update({ billing_state: buyer.state })
      .eq("id", orgId)
      .or("billing_state.is.null,billing_state.eq.")
      .then(
        () => undefined,
        () => undefined
      );
  }

  /* ── Make sure Razorpay has the order ────────────────────────────── */

  let razorpayOrderId: string;
  try {
    razorpayOrderId = await ensureRazorpayOrder(sb, order, {
      purpose: stored,
      company: buyer.company,
      scenes: quote.scenes,
    });
  } catch {
    return fail(502, "gateway_error", "The payment gateway did not respond. Please try again.");
  }

  // A reused order may have been paid in another tab a moment ago. Say so
  // instead of opening a checkout that cannot succeed.
  if (reused) {
    const live = await fetchRazorpayOrder(razorpayOrderId);
    if (live?.status === "paid") {
      await syncOrderFromRazorpay(razorpayOrderId, "status_poll").catch(() => undefined);
      return json(
        {
          ok: false,
          error: "already_paid",
          orderId: order.id,
          message: "This order has already been paid. Your confirmation e-mail is on its way.",
        },
        409
      );
    }
  }

  return json({
    ok: true,
    orderId: order.id,
    razorpayOrderId,
    amountPaise: Number(order.amount_paise),
    currency: "INR",
    keyId: razorpayKeyId(),
    testMode: razorpayIsTestMode(),
    description: quote.description,
    scenes: quote.scenes,
    reused,
  });
}

/* ═══════════════════════ order bookkeeping ═══════════════════════════ */

async function getOrCreateOrder(
  sb: SupabaseClient,
  a: {
    purpose: PurchasePurpose;
    scenes: number | null;
    amountPaise: number;
    split: { taxable: number; gst: number };
    buyer: Buyer;
    orgId: string | null;
    createdBy: string | null;
    ip: string;
    description: string;
    quotaBefore: number | null;
  }
): Promise<{ order: OrderRowLite; reused: boolean }> {
  const email = a.buyer.email;

  // Old unpaid orders for this buyer + item are retired first, so an
  // abandoned checkout from yesterday never blocks today's.
  const cutoff = new Date(Date.now() - OPEN_ORDER_TTL_MS).toISOString();
  await sb
    .from("billing_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("buyer_email", email)
    .eq("purpose", a.purpose)
    .eq("status", "created")
    .lt("created_at", cutoff);

  // A top-up or renewal replaces any other open one for the same workspace
  // (a changed slider position is a new order, not a second live one).
  if (a.orgId && a.purpose !== "basic_licence") {
    await sb
      .from("billing_orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("org_id", a.orgId)
      .eq("purpose", a.purpose)
      .eq("status", "created")
      .neq("scenes", a.scenes ?? -1);
  }

  // A new customer who moves the slider gets a fresh order for the new size;
  // the one for the old size is retired so there is only ever ONE live
  // checkout per buyer (the unpaid old one can no longer be double-bought).
  if (!a.orgId && a.purpose === "basic_licence") {
    await sb
      .from("billing_orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("buyer_email", email)
      .eq("purpose", "basic_licence")
      .eq("status", "created")
      .neq("scenes", a.scenes ?? -1);
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    // 1. Is there already an open order for exactly this?
    let q = sb
      .from("billing_orders")
      .select(ORDER_COLS)
      .eq("buyer_email", email)
      .eq("purpose", a.purpose)
      .eq("status", "created");
    q = a.scenes === null ? q.is("scenes", null) : q.eq("scenes", a.scenes);
    q = a.orgId ? q.eq("org_id", a.orgId) : q.is("org_id", null);
    const { data: openRow } = await q.maybeSingle();

    if (openRow) {
      const row = openRow as OrderRowLite;
      const same = sameBuyer(row, a.buyer) && Number(row.amount_paise) === a.amountPaise;
      if (same) {
        if (row.razorpay_order_id) return { order: row, reused: true };
        // Another request is mid-way through opening it. Give it a moment.
        for (let i = 0; i < 20; i++) {
          await sleep(250);
          const { data: again } = await sb
            .from("billing_orders")
            .select(ORDER_COLS)
            .eq("id", row.id)
            .maybeSingle();
          if ((again as OrderRowLite | null)?.razorpay_order_id) {
            return { order: again as OrderRowLite, reused: true };
          }
        }
        // Still not linked after 5 s: the other request died. Finish it ourselves.
        return { order: row, reused: true };
      }
      // Something differs (a corrected GSTIN, a new price…): retire the old
      // open order and open a fresh one. We never edit an order in place.
      await sb
        .from("billing_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "created");
    }

    // 2. Open one. The unique index lets exactly one concurrent request win.
    const { data: inserted, error } = await sb
      .from("billing_orders")
      .insert({
        purpose: a.purpose,
        scenes: a.scenes,
        amount_paise: a.amountPaise,
        taxable_paise: toPaise(a.split.taxable),
        gst_paise: toPaise(a.split.gst),
        gst_rate: GST_RATE,
        status: "created",
        livemode: razorpayIsLive(),
        buyer_name: a.buyer.name,
        buyer_email: email,
        buyer_phone: a.buyer.phone || null,
        buyer_company: a.buyer.company,
        buyer_gstin: a.buyer.gstin || null,
        buyer_address: a.buyer.address || null,
        buyer_state: a.buyer.state || null,
        org_id: a.orgId,
        created_by: a.createdBy,
        quota_before: a.quotaBefore,
        client_ip: a.ip,
        notes: a.description,
      })
      .select(ORDER_COLS)
      .single();

    if (!error && inserted) return { order: inserted as OrderRowLite, reused: false };
    if (error?.code === "23505") continue; // lost the race — loop back and reuse the winner
    throw new Error("insert_failed");
  }
  throw new Error("order_in_flight");
}

async function ensureRazorpayOrder(
  sb: SupabaseClient,
  order: OrderRowLite,
  ctx: { purpose: string; company: string; scenes: number | null }
): Promise<string> {
  if (order.razorpay_order_id) return order.razorpay_order_id;

  let rzp;
  try {
    rzp = await createRazorpayOrder({
      amountPaise: Number(order.amount_paise),
      receipt: String(order.id).replace(/-/g, "").slice(0, 40),
      notes: {
        vpv_order_id: String(order.id),
        purpose: ctx.purpose,
        company: ctx.company.slice(0, 60),
        scenes: ctx.scenes ? String(ctx.scenes) : "",
      },
    });
  } catch (e) {
    // Gateway refused or timed out: this order never reached Razorpay, so
    // close it. (A retry opens a fresh one.)
    await sb
      .from("billing_orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "created")
      .is("razorpay_order_id", null);
    throw e;
  }

  const { data: updated, error } = await sb
    .from("billing_orders")
    .update({ razorpay_order_id: rzp.id, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("razorpay_order_id", null)
    .select("razorpay_order_id");
  if (error) throw new Error("order_link_failed");
  if (updated && updated.length > 0) return rzp.id;

  // Another request linked its own Razorpay order first; ours stays unused.
  const { data: cur } = await sb
    .from("billing_orders")
    .select("razorpay_order_id")
    .eq("id", order.id)
    .maybeSingle();
  if (cur?.razorpay_order_id) return cur.razorpay_order_id as string;
  throw new Error("order_link_failed");
}
