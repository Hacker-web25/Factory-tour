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
 *  • Payments are believed only after THREE independent checks:
 *      1. a signature — HMAC-SHA256 only Razorpay and we can produce
 *         (checkout callback: order|payment; webhook: the raw body);
 *      2. for the browser callback, a server-to-server fetch of the
 *         payment from Razorpay itself, so the amount, currency, order
 *         and CAPTURED status come from Razorpay, never from the browser;
 *      3. an exact amount + currency match against the order we created
 *         (inside the database, under a row lock — see
 *         supabase/billing_hardening.sql).
 *    All signature comparisons are constant-time.
 *
 *  • Every call to Razorpay has a timeout, so a slow gateway can never
 *    hang a request until the platform kills it mid-write.
 *
 *  • Nothing here ever logs a key, a signature or a full payload.
 *
 * ── Environment ───────────────────────────────────────────────────────
 *    RAZORPAY_KEY_ID               the key id (rzp_test_… / rzp_live_…).
 *                                  Public by design, but you may store it
 *                                  as a Secret — the browser is handed it
 *                                  by /api/billing/order, so it does NOT
 *                                  need a NEXT_PUBLIC_ prefix. (Vercel
 *                                  refuses a Secret named NEXT_PUBLIC_*.)
 *    NEXT_PUBLIC_RAZORPAY_KEY_ID   older name, still honoured as a fallback.
 *    RAZORPAY_KEY_SECRET           SECRET — signs orders and callbacks
 *    RAZORPAY_WEBHOOK_SECRET       SECRET — signs webhooks (use 30+ chars)
 *
 *  Use the rzp_test_* pair until you have tested end to end, then swap
 *  in rzp_live_* and redeploy. Nothing else changes.
 */

import crypto from "node:crypto";

const API = "https://api.razorpay.com/v1";
const DEFAULT_TIMEOUT_MS = 12_000;

/* ───────────────────────── Configuration ─────────────────────────── */

export function razorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null;
}

function razorpaySecret(): string | null {
  return process.env.RAZORPAY_KEY_SECRET || null;
}

/** Razorpay issues 24-character key secrets; anything much shorter is a typo or a placeholder. */
const MIN_KEY_SECRET_LENGTH = 16;
/** A webhook secret is something WE choose in the Razorpay dashboard. Short ones can be guessed. */
export const MIN_WEBHOOK_SECRET_LENGTH = 20;

/** True when a strong-enough webhook secret is configured. Without one, webhooks cannot be trusted. */
export function webhookSecretConfigured(): boolean {
  return (process.env.RAZORPAY_WEBHOOK_SECRET ?? "").length >= MIN_WEBHOOK_SECRET_LENGTH;
}

/** True when the configured key is a LIVE (real-money) key. */
export function razorpayIsLive(): boolean {
  return (razorpayKeyId() ?? "").startsWith("rzp_live_");
}

/** True while the test keys are in use — the UI shows a test banner. */
export function razorpayIsTestMode(): boolean {
  return (razorpayKeyId() ?? "").startsWith("rzp_test_");
}

/**
 * Live keys are refused anywhere except the real production deployment
 * (or a deliberate opt-in), so a preview deploy or a laptop that picked
 * up the live keys by accident can never take real money.
 */
export function razorpayLiveBlocked(): boolean {
  if (!razorpayIsLive()) return false;
  if (process.env.RAZORPAY_ALLOW_LIVE_OUTSIDE_PRODUCTION === "1") return false;
  return process.env.VERCEL_ENV !== "production";
}

export function razorpayConfigured(): boolean {
  const id = razorpayKeyId();
  const secret = razorpaySecret();
  if (!id || !secret || secret.length < MIN_KEY_SECRET_LENGTH) return false;
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(id)) return false;
  return !razorpayLiveBlocked();
}

/* ─────────────────────────── HTTP layer ──────────────────────────── */

function authHeader(): string {
  return "Basic " + Buffer.from(`${razorpayKeyId()}:${razorpaySecret()}`).toString("base64");
}

async function rzp(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<Response> {
  if (!razorpayConfigured()) throw new Error("razorpay_not_configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: authHeader(),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    // Never surface the underlying message: it can echo request details.
    throw new Error("razorpay_unreachable");
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── Entities ────────────────────────────── */

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string; // created | attempted | paid
  receipt?: string;
};

/** The subset of Razorpay's payment entity we read. */
export type RzpPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string; // created | authorized | captured | refunded | failed
  captured?: boolean;
  method?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  card?: { last4?: string | null } | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  /** Total refunded so far (partial or full), in paise. */
  amount_refunded?: number | null;
  created_at?: number;
};

/** The subset of Razorpay's refund entity we read. */
export type RzpRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: string; // pending | processed | failed
  notes?: Record<string, unknown> | null;
  created_at?: number;
};

/* ─────────────────────────── Orders ──────────────────────────────── */

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
  if (!Number.isInteger(args.amountPaise) || args.amountPaise <= 0) {
    throw new Error("invalid_amount");
  }
  const res = await rzp("/orders", {
    method: "POST",
    body: {
      amount: args.amountPaise,
      currency: "INR",
      receipt: args.receipt.slice(0, 40),
      notes: args.notes,
      // Capture automatically — we are selling access, not shipping a
      // box, so there is nothing to inspect before taking the money.
      payment_capture: 1,
    },
  });
  if (!res.ok) {
    // Razorpay's error body can echo request values; keep it out of logs.
    throw new Error(`razorpay_order_failed_${res.status}`);
  }
  return (await res.json()) as RazorpayOrder;
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder | null> {
  if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return null;
  try {
    const res = await rzp(`/orders/${orderId}`, { timeoutMs: 8_000 });
    if (!res.ok) return null;
    return (await res.json()) as RazorpayOrder;
  } catch {
    return null;
  }
}

/** Every payment attempt Razorpay holds against one order. */
export async function fetchRazorpayOrderPayments(orderId: string): Promise<RzpPayment[] | null> {
  if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return null;
  try {
    const res = await rzp(`/orders/${orderId}/payments`, { timeoutMs: 10_000 });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: RzpPayment[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return null;
  }
}

/**
 * Page through a list endpoint (payments or refunds) for a time window.
 * `complete` is false if any page failed, so the caller knows the sweep was partial.
 */
async function listWindow<T>(
  path: "payments" | "refunds",
  fromUnix: number,
  toUnix: number,
  maxItems: number
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  const PAGE = 100;
  for (let skip = 0; skip < maxItems; skip += PAGE) {
    try {
      const res = await rzp(`/${path}?from=${fromUnix}&to=${toUnix}&count=${PAGE}&skip=${skip}`, { timeoutMs: 15_000 });
      if (!res.ok) return { items, complete: false };
      const json = (await res.json()) as { items?: T[] };
      const page = Array.isArray(json.items) ? json.items : [];
      items.push(...page);
      if (page.length < PAGE) return { items, complete: true };
    } catch {
      return { items, complete: false };
    }
  }
  // More than maxItems in the window: report honestly that this was not everything.
  return { items, complete: false };
}

/** Every payment Razorpay took in a window — the authoritative list the books are checked against. */
export function listRazorpayPayments(fromUnix: number, toUnix: number, maxItems = 1000) {
  return listWindow<RzpPayment>("payments", fromUnix, toUnix, maxItems);
}

/** Every refund Razorpay made in a window (dashboard refunds included). */
export function listRazorpayRefunds(fromUnix: number, toUnix: number, maxItems = 1000) {
  return listWindow<RzpRefund>("refunds", fromUnix, toUnix, maxItems);
}

/** Fetch one payment — the server-side proof behind the browser callback. */
export async function fetchRazorpayPayment(paymentId: string): Promise<RzpPayment | null> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return null;
  try {
    const res = await rzp(`/payments/${paymentId}`, { timeoutMs: 10_000 });
    if (!res.ok) return null;
    return (await res.json()) as RzpPayment;
  } catch {
    return null;
  }
}

/**
 * Refund a payment. `idempotencyKey` makes the call safe to repeat:
 * Razorpay returns the first refund instead of creating a second one, so
 * a retry after a timeout can never refund twice.
 */
export async function refundRazorpayPayment(args: {
  paymentId: string;
  amountPaise?: number;
  idempotencyKey: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; status: string }> {
  if (!/^pay_[A-Za-z0-9]+$/.test(args.paymentId)) throw new Error("bad_payment_id");
  const res = await rzp(`/payments/${args.paymentId}/refund`, {
    method: "POST",
    headers: { "X-Refund-Idempotency": args.idempotencyKey.slice(0, 60) },
    body: {
      ...(args.amountPaise ? { amount: args.amountPaise } : {}),
      speed: "normal",
      notes: args.notes ?? {},
    },
    timeoutMs: 15_000,
  });
  if (!res.ok) throw new Error(`razorpay_refund_failed_${res.status}`);
  return (await res.json()) as { id: string; status: string };
}

/* ───────────────────────── Signatures ────────────────────────────── */

/** Compare two strings without leaking their difference through timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const HEX64 = /^[a-f0-9]{64}$/i;

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
  if (!args.razorpayOrderId || !args.razorpayPaymentId || !HEX64.test(args.signature || "")) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest("hex");
  return safeEqual(expected, args.signature.toLowerCase());
}

/**
 * Verify a webhook. The signature covers the RAW request body, so the
 * caller must pass the exact bytes received — parsing the JSON first
 * and re-serialising it would change the signature and reject a valid
 * event.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || secret.length < MIN_WEBHOOK_SECRET_LENGTH || !signature || !HEX64.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature.toLowerCase());
}


/* ─────────────────────────── Set-up check ────────────────────────── */

export type Preflight = {
  mode: "test" | "live" | "unconfigured";
  problems: string[];
  warnings: string[];
};

/**
 * Is everything a safe sale depends on in place?
 *
 *   problems  — real money would be taken but something the customer needs
 *               (their password e-mail, the safety nets) is missing. In LIVE
 *               mode checkout refuses to open until these are fixed.
 *   warnings  — worth knowing in TEST mode (checkout still works so you can test).
 */
export function billingPreflight(): Preflight {
  const mode: Preflight["mode"] = !razorpayConfigured()
    ? "unconfigured"
    : razorpayIsLive()
      ? "live"
      : "test";
  const problems: string[] = [];
  const warnings: string[] = [];

  if (mode === "unconfigured") {
    problems.push("Razorpay keys are missing, too short, or a live key is being used outside Production.");
  }
  if (!process.env.RESEND_API_KEY) {
    problems.push("RESEND_API_KEY is missing: customers would pay and never receive their password or invoice.");
  }
  if (!webhookSecretConfigured()) {
    problems.push(`RAZORPAY_WEBHOOK_SECRET is missing or shorter than ${MIN_WEBHOOK_SECRET_LENGTH} characters: webhooks are refused, so only the daily check completes orders.`);
  }
  const cron = process.env.CRON_SECRET ?? "";
  if (cron.length < 16) {
    problems.push("CRON_SECRET is missing or shorter than 16 characters: the daily safety check cannot run.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }
  if (mode === "test" && process.env.VERCEL_ENV === "production") {
    warnings.push(
      "TEST keys are active on the production site. Anyone can complete a purchase with a test card and receive a real workspace for free. Switch to live keys before announcing the site."
    );
  }
  return { mode, problems, warnings };
}
