/**
 * Razorpay integration. SERVER ONLY.
 *
 * Talks to Razorpay over its REST API with fetch — no SDK, so there is
 * no third-party package in the path that money travels along.
 *
 * ── The security model, in one place ──────────────────────────────────
 *
 *  • Card, UPI and net-banking details are entered on Razorpay's own
 *    hosted checkout. They never touch our servers, so we are never
 *    holding anything worth stealing.
 *
 *  • The AMOUNT is computed by our server from lib/pricing.ts and sent
 *    to Razorpay when the order is created. The browser only ever says
 *    "I want N scenes" — it cannot say what N costs.
 *
 *  • Two independent proofs that a payment is real:
 *      1. the checkout callback signature  — HMAC-SHA256(order|payment)
 *         keyed with our secret, verified before we show a success page;
 *      2. the webhook signature            — HMAC-SHA256(raw body)
 *         keyed with the webhook secret. The webhook is the source of
 *         truth, because it reaches us even if the customer closes the
 *         tab, and it cannot be replayed (see billing_webhook_events).
 *    Both comparisons are constant-time, so an attacker cannot discover
 *    a valid signature by timing our rejections.
 *
 *  • Nothing here ever logs a key, a signature or a full payload.
 *
 * ── Environment ───────────────────────────────────────────────────────
 *    NEXT_PUBLIC_RAZORPAY_KEY_ID   public by design — the checkout needs it
 *    RAZORPAY_KEY_SECRET           SECRET — signs orders and callbacks
 *    RAZORPAY_WEBHOOK_SECRET       SECRET — signs webhooks
 *
 *  Use the rzp_test_* pair until you have tested end to end, then swap
 *  in rzp_live_* and redeploy. Nothing else changes.
 */

import crypto from "node:crypto";

const API = "https://api.razorpay.com/v1";

export function razorpayKeyId(): string | null {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null;
}

function razorpaySecret(): string | null {
  return process.env.RAZORPAY_KEY_SECRET || null;
}

export function razorpayConfigured(): boolean {
  return Boolean(razorpayKeyId() && razorpaySecret());
}

/** True while the test keys are in use — the UI shows a test banner. */
export function razorpayIsTestMode(): boolean {
  return (razorpayKeyId() ?? "").startsWith("rzp_test");
}

/* ─────────────────────────── Orders ──────────────────────────────── */

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
};

/**
 * Create an order at Razorpay. `amountPaise` must come from
 * lib/pricing.ts via the server — never from a request body.
 *
 * `notes` are returned to us on the webhook, so we stamp our own order
 * id there: that is how a webhook finds its way back to our row even if
 * every other lookup fails.
 */
export async function createRazorpayOrder(args: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const keyId = razorpayKeyId();
  const secret = razorpaySecret();
  if (!keyId || !secret) throw new Error("razorpay_not_configured");

  if (!Number.isInteger(args.amountPaise) || args.amountPaise <= 0) {
    throw new Error("invalid_amount");
  }

  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${keyId}:${secret}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: args.amountPaise,
      currency: "INR",
      receipt: args.receipt.slice(0, 40),
      notes: args.notes,
      // Capture automatically — we are selling access, not shipping a
      // box, so there is nothing to inspect before taking the money.
      payment_capture: 1,
    }),
  });

  if (!res.ok) {
    // Razorpay's error body can echo request values; keep it out of logs.
    throw new Error(`razorpay_order_failed_${res.status}`);
  }
  return (await res.json()) as RazorpayOrder;
}

/** Fetch a payment, used to reconcile a callback we did not expect. */
export async function fetchRazorpayPayment(paymentId: string): Promise<Record<string, unknown> | null> {
  const keyId = razorpayKeyId();
  const secret = razorpaySecret();
  if (!keyId || !secret) return null;
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return null;

  const res = await fetch(`${API}/payments/${paymentId}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${keyId}:${secret}`).toString("base64"),
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

/* ───────────────────────── Signatures ────────────────────────────── */

/** Compare two strings without leaking their difference through timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Verify the signature Razorpay's checkout hands back in the browser.
 * Signed payload is `order_id|payment_id`, keyed with the API secret.
 */
export function verifyCheckoutSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const secret = razorpaySecret();
  if (!secret) return false;
  if (!args.razorpayOrderId || !args.razorpayPaymentId || !args.signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest("hex");

  return safeEqual(expected, args.signature);
}

/**
 * Verify a webhook. The signature covers the RAW request body, so the
 * caller must pass the exact bytes received — parsing the JSON first
 * and re-serialising it would change the signature and reject a valid
 * event.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
