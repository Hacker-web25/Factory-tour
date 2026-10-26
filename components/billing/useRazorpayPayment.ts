"use client";

/**
 * useRazorpayPayment — the ONE browser-side driver for taking a payment.
 *
 * Used by the new-customer checkout, support renewal and scene top-ups, so
 * the careful parts exist exactly once:
 *
 *   • DOUBLE-CLICK SAFE. A synchronous ref lock (React state is async, so
 *     two fast clicks would both slip past a `busy` flag) means the order
 *     route is called once and a second checkout window can never open.
 *   • NEVER TRUSTS ITSELF. After Razorpay reports success we ask OUR server
 *     to verify it, then poll /api/billing/status until the workspace is
 *     really built. A "success" from the browser alone changes nothing.
 *   • SURVIVES A CRASH. The open order is remembered for this tab; if the
 *     page reloads or the tab dies mid-payment, the next load resumes the
 *     wait instead of leaving the customer guessing (or paying again).
 *   • HONEST ABOUT UNCERTAINTY. If setup takes longer than expected we say
 *     "your payment is safe — do not pay again" rather than an error.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What the browser asks to buy. "site_plan" is the marketing site's
 * named pack — a Basic licence at a flat price — so the server prices it
 * as a plan and records it as a basic_licence. See lib/pricing.ts.
 */
export type Purpose = "basic_licence" | "support_renewal" | "scene_topup" | "site_plan";

export type SitePlanId = "confidence" | "authority" | "control" | "enterprise";
export type TravelZone = "ncr" | "outside";
export type PayPhase = "idle" | "creating" | "checkout" | "verifying" | "done";

export type PayOutcome = "ready" | "processing" | "review" | "refunded" | "failed";

export type PayResult = {
  outcome: PayOutcome;
  slug: string | null;
  invoiceNo: string | null;
  purpose: Purpose | null;
};

export type Buyer = {
  name: string;
  email: string;
  phone: string;
  company: string;
  gstin: string;
  address: string;
  state: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (payload: unknown) => void) => void;
    };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const STORE_KEY = "vpv:pending-payment";
const RESUME_WINDOW_MS = 3 * 60 * 60 * 1000;
const POLL_MAX_ATTEMPTS = 50;

/* ───────────────────────── small helpers ─────────────────────────── */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ status: number; ok: boolean; data: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data: (data ?? {}) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } finally {
    clearTimeout(timer);
  }
}

function remember(orderId: string, purpose: Purpose) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ orderId, purpose, at: Date.now() }));
  } catch {
    /* storage unavailable (private mode) — resume simply will not work */
  }
}
function forget() {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}
function recall(): { orderId: string; purpose: Purpose } | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { orderId?: string; purpose?: Purpose; at?: number };
    if (!v.orderId || !v.purpose || !v.at || Date.now() - v.at > RESUME_WINDOW_MS) {
      forget();
      return null;
    }
    return { orderId: v.orderId, purpose: v.purpose };
  } catch {
    return null;
  }
}

function friendly(status: number, data: Record<string, any>): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof data.message === "string" && data.message) return data.message;
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status === 401) return "Your session has expired. Please sign in again and retry.";
  if (status === 403) return "You do not have permission to buy this.";
  if (status >= 500) return "We could not start the payment just now. No money has been taken — please try again in a moment.";
  return "We could not start the payment. Please check your details and try again.";
}

/** Load Razorpay's checkout script once; resolves true when window.Razorpay exists. */
function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(Boolean(window.Razorpay));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", done, { once: true });
      // It may already have loaded before we attached the listener.
      setTimeout(done, 4000);
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = done;
    s.onerror = done;
    document.body.appendChild(s);
  });
}

/* ───────────────────────────── the hook ──────────────────────────── */

export function useRazorpayPayment(
  opts: {
    accessToken?: string | null;
    /**
     * Called once, the moment we know money was taken for this order
     * (Razorpay's success callback, a slow method that finished after the
     * window closed, an order already paid, or a reload mid-wait). The
     * funnel uses it to move the buyer straight to the welcome page instead
     * of leaving them looking at the bill. Verification carries on in the
     * background; the welcome page polls the server for itself.
     */
    onPaid?: (orderId: string) => void;
  } = {}
) {
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [result, setResult] = useState<PayResult | null>(null);
  const [scriptReady, setScriptReady] = useState<"loading" | "ready" | "failed">("loading");

  const lock = useRef(false);
  const paid = useRef(false);
  const alive = useRef(true);
  const token = useRef<string | null | undefined>(opts.accessToken);
  token.current = opts.accessToken;
  const onPaidRef = useRef(opts.onPaid);
  onPaidRef.current = opts.onPaid;
  const announced = useRef<string | null>(null);
  const announcePaid = useCallback((orderId: string) => {
    if (announced.current === orderId) return;
    announced.current = orderId;
    try {
      onPaidRef.current?.(orderId);
    } catch {
      /* a navigation hiccup must never break verification */
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    loadCheckoutScript().then((ok) => alive.current && setScriptReady(ok ? "ready" : "failed"));
    return () => {
      alive.current = false;
    };
  }, []);

  const finish = useCallback((r: PayResult) => {
    forget();
    paid.current = true;
    lock.current = true; // a finished purchase cannot be started again from this screen
    setResult(r);
    setPhase("done");
    // Tell the access gate to re-read the workspace state, so a renewal lifts
    // the lock the moment it is confirmed instead of at the next 5-minute check.
    if (r.outcome === "ready" && typeof window !== "undefined") {
      try {
        window.dispatchEvent(new Event("vpv:billing-changed"));
      } catch {
        /* cosmetic */
      }
    }
  }, []);

  /** Wait for the server to say the purchase is real. */
  const waitForOrder = useCallback(
    async (orderId: string, purpose: Purpose) => {
      setPhase("verifying");
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        if (!alive.current) return;
        try {
          const { ok, data } = await fetchJson(
            `/api/billing/status?orderId=${encodeURIComponent(orderId)}`,
            { method: "GET" },
            20_000
          );
          if (ok && data.ok) {
            const s = data.status as string;
            if (s === "ready") {
              return finish({ outcome: "ready", slug: data.slug ?? null, invoiceNo: data.invoiceNo ?? null, purpose });
            }
            if (s === "review") {
              return finish({ outcome: "review", slug: null, invoiceNo: null, purpose });
            }
            if (s === "refunded") {
              return finish({ outcome: "refunded", slug: null, invoiceNo: null, purpose });
            }
            if (s === "failed" || s === "unknown") {
              return finish({ outcome: "failed", slug: null, invoiceNo: null, purpose });
            }
            // processing | awaiting_payment → keep waiting
          }
        } catch {
          /* a dropped request is not a failure — try again */
        }
        await sleep(Math.min(5000, 1800 + i * 250));
      }
      // Still not built. The payment is safe; the server keeps working on it.
      if (alive.current) {
        finish({ outcome: "processing", slug: null, invoiceNo: null, purpose });
      }
    },
    [finish]
  );

  /* Resume a purchase that was in flight when the page went away. */
  useEffect(() => {
    const pending = recall();
    if (!pending) return;
    lock.current = true;
    (async () => {
      try {
        const { ok, data } = await fetchJson(
          `/api/billing/status?orderId=${encodeURIComponent(pending.orderId)}`,
          { method: "GET" },
          15_000
        );
        if (!alive.current) return;
        const s = ok && data.ok ? (data.status as string) : "unknown";
        if (s === "processing" || s === "ready") {
          announcePaid(pending.orderId);
          await waitForOrder(pending.orderId, pending.purpose);
          return;
        }
        // awaiting_payment / failed / unknown: nothing was paid. Start clean.
        forget();
      } catch {
        forget();
      }
      lock.current = false;
    })();
  }, [waitForOrder, announcePaid]);

  const start = useCallback(
    async (args: {
      purpose: Purpose;
      scenes?: number;
      sitePlanId?: SitePlanId;
      travel?: TravelZone;
      /** The factory's city. Prices travel by its logistics tier, and is
       *  what the funnel sends instead of the older two-zone answer. */
      city?: string;
      extraAreas?: number;
      extraVideos?: number;
      /** Sales-team logins bought with a site plan. */
      salesSeats?: number;
      /** A coupon code the buyer entered. The server checks it. */
      coupon?: string;
      buyer?: Partial<Buyer>;
    }) => {
      if (lock.current) return; // double-click / second tab race: ignore
      lock.current = true;
      paid.current = false;
      setError(null);
      setNotice(null);
      setPhase("creating");

      const release = () => {
        lock.current = false;
        if (alive.current) setPhase("idle");
      };

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token.current) headers.Authorization = `Bearer ${token.current}`;

        const { status, ok, data } = await fetchJson(
          "/api/billing/order",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              purpose: args.purpose,
              scenes: args.scenes,
              sitePlanId: args.sitePlanId,
              travel: args.travel,
              city: args.city,
              extraAreas: args.extraAreas,
              extraVideos: args.extraVideos,
              salesSeats: args.salesSeats,
              coupon: args.coupon,
              buyer: args.buyer ?? {},
            }),
          },
          25_000
        );

        if (!ok || !data.ok) {
          if (data.error === "already_paid" && typeof data.orderId === "string") {
            // Paid a moment ago (other tab / earlier attempt). Don't charge again — wait for setup.
            remember(data.orderId, args.purpose);
            setNotice("This order was already paid. We are finishing the set-up now.");
            announcePaid(data.orderId);
            await waitForOrder(data.orderId, args.purpose);
            return;
          }
          setError(friendly(status, data));
          release();
          return;
        }

        setTestMode(Boolean(data.testMode));
        const ready = await loadCheckoutScript();
        if (!ready || !window.Razorpay) {
          setError("The payment window could not load. Disable any ad-blocker for this page and try again.");
          release();
          return;
        }

        const orderId = String(data.orderId);
        remember(orderId, args.purpose);

        const rzp = new window.Razorpay({
          key: data.keyId,
          order_id: data.razorpayOrderId,
          amount: data.amountPaise,
          currency: "INR",
          name: "VPV — Virtual Plant Visit",
          description: data.description,
          prefill: {
            name: args.buyer?.name && args.buyer.name !== "—" ? args.buyer.name : undefined,
            email: args.buyer?.email && !String(args.buyer.email).endsWith("@myvpv.com") ? args.buyer.email : undefined,
            contact: args.buyer?.phone || undefined,
          },
          theme: { color: "#1468D8" },
          timeout: 900,
          retry: { enabled: true, max_count: 3 },
          modal: {
            confirm_close: true,
            ondismiss: () => {
              // Closing the window is NOT a payment event. If the success
              // handler already ran, leave everything as it is.
              if (paid.current) return;
              // But a slow method (UPI approval on a phone, a bank page) can
              // complete AFTER the window closes. Ask the server once before
              // we let them start over, so we never invite a second payment.
              void (async () => {
                try {
                  const { ok: sOk, data: sData } = await fetchJson(
                    `/api/billing/status?orderId=${encodeURIComponent(orderId)}`,
                    { method: "GET" },
                    15_000
                  );
                  if (sOk && sData.ok && (sData.status === "processing" || sData.status === "ready")) {
                    paid.current = true;
                    announcePaid(orderId);
                    await waitForOrder(orderId, args.purpose);
                    return;
                  }
                } catch {
                  /* could not check — treat as not paid; the webhook still protects them */
                }
                forget();
                release();
              })();
            },
          },
          handler: async (response: Record<string, string>) => {
            paid.current = true;
            if (alive.current) setPhase("verifying");
            // Confirm first (it settles the payment on our side straight away),
            // but move the buyer on without waiting for it.
            const confirming = fetchJson(
              "/api/billing/confirm",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
                keepalive: true,
              },
              45_000
            );
            announcePaid(orderId);
            try {
              const confirmed = await confirming;
              if (confirmed.ok && confirmed.data.status === "ready") {
                return finish({
                  outcome: "ready",
                  slug: confirmed.data.slug ?? null,
                  invoiceNo: confirmed.data.invoiceNo ?? null,
                  purpose: args.purpose,
                });
              }
            } catch {
              /* fall through to polling — the webhook may already have it */
            }
            await waitForOrder(orderId, args.purpose);
          },
        });

        rzp.on("payment.failed", () => {
          // The window stays open so they can try another method; just say what happened.
          if (alive.current) setNotice("That attempt did not go through, and no money was taken. You can try another method in the same window.");
        });

        if (alive.current) setPhase("checkout");
        rzp.open();
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        setError(
          aborted
            ? "That took too long. No money has been taken — please try again."
            : "We could not reach our server. Check your connection; no money has been taken."
        );
        release();
      }
    },
    [finish, waitForOrder, announcePaid]
  );

  return {
    phase,
    busy: phase === "creating" || phase === "checkout" || phase === "verifying",
    error,
    notice,
    testMode,
    result,
    scriptReady,
    start,
  };
}
