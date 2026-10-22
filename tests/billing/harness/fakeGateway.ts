/**
 * Fake Razorpay + fake Resend, installed by replacing globalThis.fetch.
 *
 * It models the behaviours the payment code must survive: a payment can be
 * captured, merely authorized, or failed; an order accepts only one
 * successful payment (unless a test forces the double-capture race); refunds
 * are idempotent on X-Refund-Idempotency; calls can be made to fail or hang;
 * e-mails can bounce. Anything else fetched is an error — the code under test
 * must not be talking to the network behind our back.
 */

import crypto from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FakePayment = {
  id: string;
  entity: "payment";
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "failed" | "refunded";
  captured: boolean;
  method: string;
  vpa?: string;
  bank?: string | null;
  wallet?: string | null;
  card?: { last4: string } | null;
  fee: number;
  tax: number;
  error_code?: string | null;
  error_description?: string | null;
  amount_refunded: number;
  created_at: number;
};

export type FakeOrder = {
  id: string;
  entity: "order";
  amount: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string>;
  payments: string[];
};

export type FakeRefund = {
  id: string;
  entity: "refund";
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  notes: Record<string, unknown>;
  created_at: number;
};

export type SentEmail = { to: string[]; bcc?: string[]; subject: string; html: string; text?: string };

export const TEST_KEY_ID = "rzp_test_AbCdEf123456";
export const LIVE_STYLE_KEY_ID = "rzp_live_AbCdEf123456";
export const TEST_KEY_SECRET = "test_key_secret_value_1234567890";
export const TEST_WEBHOOK_SECRET = "whsec_test_0123456789abcdef0123456789abcdef";

export class FakeGateway {
  orders = new Map<string, FakeOrder>();
  payments = new Map<string, FakePayment>();
  refunds = new Map<string, FakeRefund>();
  private refundKeys = new Map<string, FakeRefund>();
  emails: SentEmail[] = [];
  requests: { method: string; url: string }[] = [];

  /** Fail the next N calls to a path prefix, e.g. "POST /v1/orders". */
  private failures: { match: string; remaining: number; status: number }[] = [];
  emailsDown = false;
  emailFailuresRemaining = 0;
  /** Calls to the order-create endpoint that should be slow (ms) — to test timeouts / races. */
  private seq = 1000;
  private realFetch: typeof fetch | null = null;

  /* ─────────────── install / reset ─────────────── */

  install() {
    this.realFetch = globalThis.fetch;
    globalThis.fetch = this.fetch as unknown as typeof fetch;
  }
  uninstall() {
    if (this.realFetch) globalThis.fetch = this.realFetch;
  }
  reset() {
    this.orders.clear();
    this.payments.clear();
    this.refunds.clear();
    this.refundKeys.clear();
    this.emails = [];
    this.requests = [];
    this.failures = [];
    this.hangs = [];
    this.emailsDown = false;
    this.emailFailuresRemaining = 0;
  }

  failNext(match: string, times = 1, status = 500) {
    this.failures.push({ match, remaining: times, status });
  }

  /** The next `times` calls matching `match` never answer (until the caller's timeout aborts them). */
  private hangs: { match: string; remaining: number }[] = [];
  hangNext(match: string, times = 1) {
    this.hangs.push({ match, remaining: times });
  }

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}Test${crypto.randomBytes(3).toString("hex")}`;
  }

  /* ─────────────── HTTP surface ─────────────── */

  fetch = async (input: any, init: any = {}): Promise<Response> => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || "GET").toUpperCase();
    this.requests.push({ method, url });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    /* Resend */
    if (url.startsWith("https://api.resend.com/emails")) {
      if (this.emailsDown) return json({ message: "down" }, 503);
      if (this.emailFailuresRemaining > 0) {
        this.emailFailuresRemaining -= 1;
        return json({ message: "bounced" }, 422);
      }
      const b = JSON.parse(init.body);
      this.emails.push({ to: b.to, bcc: b.bcc, subject: b.subject, html: b.html, text: b.text });
      return json({ id: this.nextId("email") });
    }

    /* Razorpay */
    if (url.startsWith("https://api.razorpay.com/v1")) {
      const p = url.replace("https://api.razorpay.com", "");
      const auth = (init.headers?.Authorization ?? init.headers?.authorization) as string | undefined;
      const basic = (id: string) => "Basic " + Buffer.from(`${id}:${TEST_KEY_SECRET}`).toString("base64");
      // The one live-style key some tests set, to prove live keys are not
      // blocked by anything but the guards under test. Any other id fails.
      const ok = auth === basic(TEST_KEY_ID) || auth === basic(LIVE_STYLE_KEY_ID);
      if (!ok) return json({ error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } }, 401);

      const h = this.hangs.find((x) => x.remaining > 0 && `${method} ${p}`.startsWith(x.match));
      if (h) {
        h.remaining -= 1;
        return new Promise<Response>((_, reject) => {
          const sig = init.signal as AbortSignal | undefined;
          const abort = () => reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
          if (sig?.aborted) abort();
          else sig?.addEventListener("abort", abort, { once: true });
        });
      }

      const f = this.failures.find((x) => x.remaining > 0 && `${method} ${p}`.startsWith(x.match));
      if (f) {
        f.remaining -= 1;
        return json({ error: { description: "injected failure" } }, f.status);
      }

      // List endpoints, as the daily reconciler uses them.
      const listed = p.match(/^\/v1\/(payments|refunds)\?(.*)$/);
      if (listed && method === "GET") {
        const q = new URLSearchParams(listed[2]);
        const from = Number(q.get("from") ?? 0);
        const to = Number(q.get("to") ?? 9e12);
        const count = Number(q.get("count") ?? 10);
        const skip = Number(q.get("skip") ?? 0);
        const all = (listed[1] === "payments" ? [...this.payments.values()] : [...this.refunds.values()])
          .filter((x) => x.created_at >= from && x.created_at <= to)
          .sort((a, b) => a.created_at - b.created_at);
        const items = all.slice(skip, skip + count);
        return json({ entity: "collection", count: items.length, items });
      }

      if (method === "POST" && p === "/v1/orders") {
        const b = JSON.parse(init.body);
        if (!Number.isInteger(b.amount) || b.amount < 100) return json({ error: { description: "amount invalid" } }, 400);
        const o: FakeOrder = {
          id: this.nextId("order"),
          entity: "order",
          amount: b.amount,
          currency: b.currency,
          receipt: b.receipt,
          status: "created",
          notes: b.notes ?? {},
          payments: [],
        };
        this.orders.set(o.id, o);
        return json(o);
      }
      let m = p.match(/^\/v1\/orders\/(order_[A-Za-z0-9]+)$/);
      if (m && method === "GET") {
        const o = this.orders.get(m[1]);
        return o ? json(o) : json({ error: { description: "not found" } }, 404);
      }
      m = p.match(/^\/v1\/orders\/(order_[A-Za-z0-9]+)\/payments$/);
      if (m && method === "GET") {
        const o = this.orders.get(m[1]);
        if (!o) return json({ error: { description: "not found" } }, 404);
        const items = o.payments.map((id) => this.payments.get(id)!);
        return json({ entity: "collection", count: items.length, items });
      }
      m = p.match(/^\/v1\/payments\/(pay_[A-Za-z0-9]+)$/);
      if (m && method === "GET") {
        const pay = this.payments.get(m[1]);
        return pay ? json(pay) : json({ error: { description: "not found" } }, 404);
      }
      m = p.match(/^\/v1\/payments\/(pay_[A-Za-z0-9]+)\/refund$/);
      if (m && method === "POST") {
        const pay = this.payments.get(m[1]);
        if (!pay) return json({ error: { description: "not found" } }, 404);
        const key = (init.headers?.["X-Refund-Idempotency"] as string) || "";
        if (key && this.refundKeys.has(key)) return json(this.refundKeys.get(key));
        const b = JSON.parse(init.body || "{}");
        const r = this.makeRefund(pay.id, b.amount ?? pay.amount, b.notes ?? {});
        if (key) this.refundKeys.set(key, r);
        return json(r);
      }
      return json({ error: { description: `unhandled ${method} ${p}` } }, 404);
    }

    throw new Error(`UNEXPECTED NETWORK CALL: ${method} ${url}`);
  };

  /* ─────────────── customer / dashboard actions ─────────────── */

  /**
   * The customer pays. Models Razorpay's rule that an order takes ONE
   * successful payment — pass force:true to model the rare double-capture race.
   */
  pay(
    orderId: string,
    opts: {
      amount?: number;
      currency?: string;
      status?: "captured" | "authorized" | "failed";
      force?: boolean;
      method?: string;
    } = {}
  ): FakePayment {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake gateway: no such order ${orderId}`);
    const status = opts.status ?? "captured";
    if (status !== "failed" && o.status === "paid" && !opts.force) {
      throw new Error("fake gateway: order already paid");
    }
    const amount = opts.amount ?? o.amount;
    const pay: FakePayment = {
      id: this.nextId("pay"),
      entity: "payment",
      order_id: orderId,
      amount,
      currency: opts.currency ?? o.currency,
      status,
      captured: status === "captured",
      method: opts.method ?? "upi",
      vpa: "buyer@upi",
      bank: null,
      wallet: null,
      card: null,
      fee: Math.round(amount * 0.02),
      tax: Math.round(amount * 0.0036),
      error_code: status === "failed" ? "BAD_REQUEST_ERROR" : null,
      error_description: status === "failed" ? "Payment failed" : null,
      amount_refunded: 0,
      created_at: Math.floor(Date.now() / 1000) + this.payments.size,
    };
    this.payments.set(pay.id, pay);
    o.payments.push(pay.id);
    if (status === "captured") o.status = "paid";
    else if (o.status === "created") o.status = "attempted";
    return pay;
  }

  /** A payment for some OTHER product on the same Razorpay account: it exists at Razorpay but not in our books. */
  foreignPayment(amount = 99_900): FakePayment {
    const pay: FakePayment = {
      id: this.nextId("pay"),
      entity: "payment",
      order_id: "order_ForeignProduct" + this.nextId("o").slice(-6),
      amount,
      currency: "INR",
      status: "captured",
      captured: true,
      method: "card",
      fee: 0,
      tax: 0,
      amount_refunded: 0,
      created_at: Math.floor(Date.now() / 1000),
    };
    this.payments.set(pay.id, pay);
    return pay;
  }

  /** The authorized payment gets captured later (e.g. manual capture, or a slow bank). */
  capture(paymentId: string) {
    const p = this.payments.get(paymentId)!;
    p.status = "captured";
    p.captured = true;
    const o = this.orders.get(p.order_id!)!;
    o.status = "paid";
    return p;
  }

  /** A refund made in the Razorpay dashboard (or by us through the API). */
  makeRefund(paymentId: string, amount: number, notes: Record<string, unknown> = {}): FakeRefund {
    const r: FakeRefund = {
      id: this.nextId("rfnd"),
      entity: "refund",
      payment_id: paymentId,
      amount,
      status: "processed",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    };
    this.refunds.set(r.id, r);
    const pay = this.payments.get(paymentId);
    if (pay) {
      pay.amount_refunded += amount;
      if (pay.amount_refunded >= pay.amount) pay.status = "refunded";
    }
    return r;
  }

  /** Make a payment/refund look like it happened `seconds` ago (the sweeps ignore the last two minutes). */
  age(id: string, seconds: number) {
    const x = this.payments.get(id) ?? this.refunds.get(id);
    if (x) x.created_at -= seconds;
  }
  ageAll(seconds: number) {
    for (const x of this.payments.values()) x.created_at -= seconds;
    for (const x of this.refunds.values()) x.created_at -= seconds;
  }

  /* ─────────────── webhook construction ─────────────── */

  signedWebhook(
    event: string,
    payload: Record<string, unknown>,
    opts: { eventId?: string; secret?: string; tamper?: boolean } = {}
  ) {
    const body = JSON.stringify({
      entity: "event",
      account_id: "acc_TestAccount",
      event,
      contains: Object.keys(payload),
      payload,
      created_at: Math.floor(Date.now() / 1000),
    });
    const sig = crypto.createHmac("sha256", opts.secret ?? TEST_WEBHOOK_SECRET).update(body).digest("hex");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-razorpay-signature": sig,
      "x-razorpay-event-id": opts.eventId ?? `evt_${this.nextId("e")}`,
    };
    return { body: opts.tamper ? body.replace(/"amount":\d+/, '"amount":100') : body, headers };
  }

  paymentEvent(event: "payment.captured" | "payment.authorized" | "payment.failed" | "order.paid", pay: FakePayment, eventId?: string) {
    const payload: Record<string, unknown> = { payment: { entity: pay } };
    if (event === "order.paid" && pay.order_id) payload.order = { entity: this.orders.get(pay.order_id) };
    return this.signedWebhook(event, payload, { eventId });
  }

  refundEvent(event: "refund.created" | "refund.processed" | "refund.failed", r: FakeRefund, eventId?: string) {
    return this.signedWebhook(event, { refund: { entity: r } }, { eventId });
  }

  disputeEvent(event: string, paymentId: string, amount: number, id = "disp_TestDispute1", eventId?: string) {
    return this.signedWebhook(
      event,
      { dispute: { entity: { id, payment_id: paymentId, amount, status: event.split(".").pop(), respond_by: Math.floor(Date.now() / 1000) + 864000 } } },
      { eventId }
    );
  }

  /** The browser-callback signature Razorpay's checkout hands the page. */
  checkoutSignature(razorpayOrderId: string, paymentId: string, secret = TEST_KEY_SECRET) {
    return crypto.createHmac("sha256", secret).update(`${razorpayOrderId}|${paymentId}`).digest("hex");
  }

  emailsTo(addr: string) {
    return this.emails.filter((e) => e.to.includes(addr));
  }
}
