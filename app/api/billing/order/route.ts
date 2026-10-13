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
 * billing_orders row, and sends the same amount to Razorpay. If someone
 * edits the request to ask for 7 scenes at ₹1, they get an order for 7
 * scenes at the real price.
 *
 * ── Who may call it ───────────────────────────────────────────────────
 *   basic_licence    anyone (this is how a new customer buys)
 *   support_renewal  the organisation's own admin, signed in
 *   scene_topup      the organisation's own admin, signed in
 *
 * Request  { purpose, scenes?, buyer{ name,email,phone,company,gstin,address,state } }
 * Response { ok, orderId, razorpayOrderId, amountPaise, keyId, testMode, description }
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { logSecurityEvent } from "@/lib/audit";
import { authenticateRequest, isOrgAdmin } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  createRazorpayOrder,
  razorpayConfigured,
  razorpayIsTestMode,
  razorpayKeyId,
} from "@/lib/server/razorpay";
import {
  GST_RATE,
  clampScenes,
  isPurchasePurpose,
  priceFor,
  splitGst,
  toPaise,
  type PurchasePurpose,
} from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

/** Trim, cap and reject control characters from anything a human typed. */
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

/** 15 characters: 2 state digits, 10-char PAN, entity digit, Z, checksum. */
function validGstin(v: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
}

function fail(status: number, error: string, message?: string) {
  return NextResponse.json(
    { ok: false, error, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);

  // A payment attempt is cheap for us and expensive to abuse, so the
  // limit is tight: 10 orders per IP per hour.
  const rl = await enforceRateLimit(`billing-order:ip:${ip}`, 10, 3600);
  if (!rl.allowed) {
    logSecurityEvent({ event: "ratelimit.hit", subject: "billing-order", ip });
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  if (Number(req.headers.get("content-length") || "0") > MAX_BODY_BYTES) {
    return fail(413, "payload_too_large");
  }

  if (!razorpayConfigured()) {
    return fail(503, "payments_unavailable", "Online payment is not switched on yet.");
  }
  const sb = supabaseAdmin();
  if (!sb) return fail(503, "payments_unavailable", "Online payment is not switched on yet.");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_payload");
  }

  const purpose = body.purpose;
  if (!isPurchasePurpose(purpose)) return fail(400, "unknown_purpose");

  /* ── Who is asking, and are they allowed to ask for this? ────────── */

  let orgId: string | null = null;
  let createdBy: string | null = null;
  let existingScenes = 0;

  if (purpose !== "basic_licence") {
    const auth = await authenticateRequest(req);
    if (!auth) return fail(401, "unauthorized", "Please sign in again.");
    if (!isOrgAdmin(auth.profile) || !auth.profile.org_id) {
      return fail(403, "forbidden", "Only an organisation admin can buy this.");
    }
    orgId = auth.profile.org_id;
    createdBy = auth.profile.id;

    const { data: org } = await sb
      .from("organizations")
      .select("scene_quota, plan")
      .eq("id", orgId)
      .maybeSingle();
    existingScenes = (org?.scene_quota as number) ?? 0;

    // Pro and Ultra already have unlimited scenes and support included.
    if (org?.plan !== "basic") {
      return fail(400, "not_applicable", "Your plan already includes this.");
    }
  }

  /* ── Price it. The ONLY place an amount is decided. ──────────────── */

  const requestedScenes =
    typeof body.scenes === "number" ? body.scenes : Number(body.scenes ?? NaN);

  const quote = priceFor(purpose as PurchasePurpose, {
    scenes: Number.isFinite(requestedScenes) ? clampScenes(requestedScenes) : undefined,
    existingScenes,
  });

  if (quote.amountInr <= 0) {
    return fail(400, "nothing_to_pay", "There is nothing to pay for that.");
  }

  /* ── Buyer details ───────────────────────────────────────────────── */

  const buyerSrc = (body.buyer ?? {}) as Record<string, unknown>;
  const buyer = {
    name: clean(buyerSrc.name, 120),
    email: clean(buyerSrc.email, 254).toLowerCase(),
    phone: clean(buyerSrc.phone, 20),
    company: clean(buyerSrc.company, 160),
    gstin: clean(buyerSrc.gstin, 15).toUpperCase(),
    address: clean(buyerSrc.address, 400),
    state: clean(buyerSrc.state, 60),
  };

  if (!buyer.name || !buyer.company) return fail(400, "missing_fields", "Name and company are required.");
  if (!validEmail(buyer.email)) return fail(400, "bad_email", "That e-mail address does not look right.");
  if (buyer.gstin && !validGstin(buyer.gstin)) {
    return fail(400, "bad_gstin", "That GSTIN does not look right. Leave it blank if you do not have one.");
  }

  /* ── Record the intent, then ask Razorpay for an order ───────────── */

  const amountPaise = toPaise(quote.amountInr);
  const split = splitGst(quote.amountInr);

  const { data: orderRow, error: insertErr } = await sb
    .from("billing_orders")
    .insert({
      purpose,
      scenes: quote.scenes,
      amount_paise: amountPaise,
      taxable_paise: toPaise(split.taxable),
      gst_paise: toPaise(split.gst),
      gst_rate: GST_RATE,
      status: "created",
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone || null,
      buyer_company: buyer.company,
      buyer_gstin: buyer.gstin || null,
      buyer_address: buyer.address || null,
      buyer_state: buyer.state || null,
      org_id: orgId,
      created_by: createdBy,
      client_ip: ip,
      notes: quote.description,
    })
    .select("id")
    .single();

  if (insertErr || !orderRow) return fail(500, "order_failed", "We could not start the payment.");

  try {
    const rzp = await createRazorpayOrder({
      amountPaise,
      receipt: String(orderRow.id).replace(/-/g, "").slice(0, 40),
      notes: {
        vpv_order_id: String(orderRow.id),
        purpose,
        company: buyer.company.slice(0, 60),
        scenes: quote.scenes ? String(quote.scenes) : "",
      },
    });

    await sb
      .from("billing_orders")
      .update({ razorpay_order_id: rzp.id, updated_at: new Date().toISOString() })
      .eq("id", orderRow.id);

    return NextResponse.json(
      {
        ok: true,
        orderId: orderRow.id,
        razorpayOrderId: rzp.id,
        amountPaise,
        currency: "INR",
        keyId: razorpayKeyId(),
        testMode: razorpayIsTestMode(),
        description: quote.description,
        scenes: quote.scenes,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    await sb
      .from("billing_orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", orderRow.id);
    return fail(502, "gateway_error", "The payment gateway did not respond. Please try again.");
  }
}
