"use client";

/**
 * CheckoutFlow — how a new customer buys VPV without talking to anyone.
 *
 *   1. Choose scenes on the calculator.
 *   2. Type the billing details that go on the GST invoice.
 *   3. Pay on Razorpay's own hosted checkout.
 *   4. See the workspace address, and get the login by e-mail.
 *
 * This component never decides a price. It asks the server for an order,
 * and the server prices it from lib/pricing.ts. The only thing sent up
 * is the scene count and the billing details.
 *
 * Also used, with `purpose="support_renewal"`, by the billing page
 * inside the dashboard — the same verified payment path, no second
 * implementation to keep secure.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react";
import SceneCalculator from "./SceneCalculator";
import { SCENE_DEFAULT, SUPPORT_ANNUAL_INR, inr, priceForScenes } from "@/lib/pricing";

type Purpose = "basic_licence" | "support_renewal" | "scene_topup";

type Step = "choose" | "details" | "paying" | "done" | "error";

type Buyer = {
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
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (x: unknown) => void) => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Load Razorpay's checkout once, and tell us when it is ready. */
function useRazorpayScript(): "idle" | "loading" | "ready" | "failed" {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Razorpay) {
      setState("ready");
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => setState("ready"));
      existing.addEventListener("error", () => setState("failed"));
      setState("loading");
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => setState("ready");
    s.onerror = () => setState("failed");
    document.body.appendChild(s);
    setState("loading");
  }, []);

  return state;
}

/** States that decide CGST+SGST vs IGST on the invoice. */
const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Other / outside India",
];

export default function CheckoutFlow({
  purpose = "basic_licence",
  /** Pre-filled for a signed-in customer renewing support. */
  prefill,
  /** Supabase access token, when an existing customer is buying. */
  accessToken,
  title,
  subtitle,
}: {
  purpose?: Purpose;
  prefill?: Partial<Buyer>;
  accessToken?: string | null;
  title?: string;
  subtitle?: string;
}) {
  const scriptState = useRazorpayScript();
  const [step, setStep] = useState<Step>(purpose === "basic_licence" ? "choose" : "details");
  const [scenes, setScenes] = useState(SCENE_DEFAULT);
  const [buyer, setBuyer] = useState<Buyer>({
    name: prefill?.name ?? "",
    email: prefill?.email ?? "",
    phone: prefill?.phone ?? "",
    company: prefill?.company ?? "",
    gstin: prefill?.gstin ?? "",
    address: prefill?.address ?? "",
    state: prefill?.state ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slug: string | null; invoiceNo: string | null } | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const amount = purpose === "support_renewal" ? SUPPORT_ANNUAL_INR : priceForScenes(scenes);

  const pay = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch("/api/billing/order", {
        method: "POST",
        headers,
        body: JSON.stringify({ purpose, scenes, buyer }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "We could not start the payment. Please try again.");
        setBusy(false);
        return;
      }
      setTestMode(Boolean(data.testMode));

      if (scriptState !== "ready" || !window.Razorpay) {
        setError("The payment window could not load. Check your connection and try again.");
        setBusy(false);
        return;
      }

      setStep("paying");

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.razorpayOrderId,
        amount: data.amountPaise,
        currency: "INR",
        name: "VPV — Virtual Plant Visit",
        description: data.description,
        prefill: {
          name: buyer.name,
          email: buyer.email,
          contact: buyer.phone,
        },
        notes: { company: buyer.company },
        theme: { color: "#1468D8" },
        retry: { enabled: true, max_count: 2 },
        handler: async (response: Record<string, string>) => {
          // Confirm with our server. It verifies the signature before
          // believing a word of this.
          try {
            const confirm = await fetch("/api/billing/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: data.orderId, ...response }),
            });
            const confirmed = await confirm.json();
            setResult({
              slug: confirmed.slug ?? null,
              invoiceNo: confirmed.invoiceNo ?? null,
            });
          } catch {
            setResult({ slug: null, invoiceNo: null });
          }
          setStep("done");
          setBusy(false);
        },
        modal: {
          ondismiss: () => {
            // They closed the window without paying — back to the form,
            // with the order still open on our side if they retry.
            setStep("details");
            setBusy(false);
          },
        },
      });

      rzp.on("payment.failed", () => {
        setError("That payment did not go through. No money has been taken — please try again.");
        setStep("details");
        setBusy(false);
      });

      rzp.open();
    } catch {
      setError("Something went wrong starting the payment. Please try again.");
      setBusy(false);
    }
  }, [accessToken, buyer, purpose, scenes, scriptState]);

  /* ─────────────────────────── Done ─────────────────────────────── */

  if (step === "done") {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
          <CheckCircle2 size={28} className="text-emerald-600" />
        </div>
        <h2 className="mt-5 text-[26px] font-semibold tracking-tight text-vpv-ink">
          {purpose === "support_renewal" ? "Support renewed" : "Your workspace is ready"}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-600">
          {purpose === "support_renewal"
            ? "Thank you. Your technical support is extended by one year, and the invoice is on its way to your inbox."
            : "Thank you. We have e-mailed your sign-in details and your GST invoice. Check your spam folder if it is not there in a few minutes."}
        </p>

        {result?.slug && (
          <a
            href={`https://${result.slug}.myvpv.com`}
            className="mt-6 inline-block rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white"
          >
            Open {result.slug}.myvpv.com
          </a>
        )}
        {result?.invoiceNo && (
          <p className="mt-4 text-[13px] text-slate-500">
            Invoice {result.invoiceNo}
          </p>
        )}
        {!result?.slug && purpose === "basic_licence" && (
          <p className="mt-5 text-[13px] text-slate-500">
            Your workspace is being set up. The e-mail with your address and
            password arrives within a few minutes.
          </p>
        )}
      </div>
    );
  }

  /* ───────────────────────── Choose scenes ──────────────────────── */

  if (step === "choose") {
    return (
      <div>
        {title && (
          <h1 className="mb-2 text-[30px] sm:text-[36px] font-semibold tracking-tight text-vpv-ink">
            {title}
          </h1>
        )}
        {subtitle && <p className="mb-7 max-w-xl text-[16px] text-slate-600">{subtitle}</p>}
        <SceneCalculator
          value={scenes}
          onChange={setScenes}
          onSubmit={() => setStep("details")}
          submitLabel="Continue"
        />
        <p className="mt-4 text-center text-[12.5px] text-slate-500">
          You can add more scenes later at the same falling rate.
        </p>
      </div>
    );
  }

  /* ──────────────────────── Billing details ─────────────────────── */

  const canPay =
    buyer.name.trim() &&
    buyer.company.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(buyer.email) &&
    agreed &&
    !busy;

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_330px] items-start">
      <div>
        {purpose === "basic_licence" && (
          <button
            type="button"
            onClick={() => setStep("choose")}
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-vpv-muted hover:text-vpv-blue"
          >
            <ArrowLeft size={14} /> Change the number of scenes
          </button>
        )}

        <h2 className="text-[24px] font-semibold tracking-tight text-vpv-ink">
          Billing details
        </h2>
        <p className="mt-1.5 text-[14px] text-slate-600">
          These go on your GST invoice. Please use the name exactly as it
          appears on your GST registration.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            <input
              className="vpv-input"
              value={buyer.name}
              autoComplete="name"
              onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
            />
          </Field>
          <Field label="Work e-mail" required hint="Your sign-in and invoice go here">
            <input
              className="vpv-input"
              type="email"
              value={buyer.email}
              autoComplete="email"
              onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
            />
          </Field>
          <Field label="Company name" required>
            <input
              className="vpv-input"
              value={buyer.company}
              autoComplete="organization"
              onChange={(e) => setBuyer({ ...buyer, company: e.target.value })}
            />
          </Field>
          <Field label="Mobile number">
            <input
              className="vpv-input"
              type="tel"
              value={buyer.phone}
              autoComplete="tel"
              placeholder="+91 …"
              onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
            />
          </Field>
          <Field label="GSTIN" hint="Leave blank if you do not have one">
            <input
              className="vpv-input uppercase"
              value={buyer.gstin}
              maxLength={15}
              onChange={(e) => setBuyer({ ...buyer, gstin: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="State" hint="Decides the GST split on your invoice">
            <select
              className="vpv-input"
              value={buyer.state}
              onChange={(e) => setBuyer({ ...buyer, state: e.target.value })}
            >
              <option value="">Select a state</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Billing address">
              <textarea
                className="vpv-input min-h-[80px] resize-y"
                value={buyer.address}
                autoComplete="street-address"
                onChange={(e) => setBuyer({ ...buyer, address: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <label className="mt-6 flex items-start gap-2.5 text-[13px] leading-relaxed text-slate-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-vpv-blue focus:ring-vpv-blue"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-vpv-blue underline underline-offset-2">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-vpv-blue underline underline-offset-2">
              Privacy Policy
            </Link>
            , including the{" "}
            <Link href="/refund-policy" target="_blank" className="text-vpv-blue underline underline-offset-2">
              Cancellation &amp; Refund Policy
            </Link>
            .
          </span>
        </label>

        {error && (
          <div className="mt-5 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          disabled={!canPay}
          onClick={pay}
          className="mt-6 w-full rounded-full bg-vpv-grad py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_36px_-14px_rgba(20,104,216,0.75)] transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-10"
        >
          {busy || step === "paying" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Opening secure payment…
            </span>
          ) : (
            <>Pay {inr(amount)} securely</>
          )}
        </button>

        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-slate-500">
          <Lock size={13} /> Payment is handled by Razorpay. Your card and bank
          details never reach our servers.
        </p>
        {testMode && (
          <p className="mt-2 text-[12px] font-medium text-amber-600">
            Test mode — no real money moves.
          </p>
        )}
        {scriptState === "failed" && (
          <p className="mt-2 text-[12.5px] text-red-600">
            The payment window could not load. Disable any ad-blocker for this
            page, or write to billing@myvpv.com and we will send a payment link.
          </p>
        )}
      </div>

      {/* ── Summary rail ─────────────────────────────────────────── */}
      <aside className="rounded-2xl border border-vpv-line bg-vpv-canvas/70 p-6 lg:sticky lg:top-24">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-vpv-muted">
          Your order
        </div>
        <div className="mt-4 space-y-3 text-[14px]">
          <Row
            label={purpose === "support_renewal" ? "Annual technical support" : `Basic licence · ${scenes} scenes`}
            value={inr(amount)}
          />
          {purpose === "basic_licence" && (
            <>
              <Row label="Price per scene" value={inr(Math.round(amount / scenes))} muted />
              <Row label="First year of support" value="Free" muted />
            </>
          )}
        </div>
        <div className="mt-4 border-t border-vpv-line pt-4 flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-vpv-ink">Total</span>
          <span className="text-[22px] font-semibold tabular-nums text-vpv-ink">{inr(amount)}</span>
        </div>
        <p className="mt-1.5 text-[12px] text-slate-500">Inclusive of 18% GST</p>

        <div className="mt-5 flex gap-2 rounded-xl bg-white p-3 text-[12.5px] text-slate-600 ring-1 ring-vpv-line">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-vpv-blue" />
          <span>
            Not right for you? Ask within 7 days and we refund in full — see our{" "}
            <a href="/refund-policy" className="text-vpv-blue underline underline-offset-2">
              refund policy
            </a>
            .
          </span>
        </div>
      </aside>

      <style jsx global>{`
        .vpv-input {
          width: 100%;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 13px;
          font-size: 14px;
          color: #0c1017;
          outline: none;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        .vpv-input:hover {
          border-color: #cbd5e1;
        }
        .vpv-input:focus {
          border-color: #1468d8;
          box-shadow: 0 0 0 4px rgba(20, 104, 216, 0.12);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-vpv-ink">
        {label}
        {required && <span className="ml-1 text-vpv-blue">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? "text-slate-500" : "text-slate-700"}>{label}</span>
      <span className={`tabular-nums ${muted ? "text-slate-500" : "font-medium text-vpv-ink"}`}>
        {value}
      </span>
    </div>
  );
}
