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
 * Every payment step — the double-click lock, opening Razorpay, verifying
 * with our server, waiting for the workspace, resuming after a reload —
 * lives in useRazorpayPayment, shared with the dashboard's top-up button,
 * so there is exactly one implementation to keep correct.
 *
 * Also used, with `purpose="support_renewal"`, by the billing page
 * inside the dashboard, and with `purpose="site_plan"` by /checkout,
 * where the marketing site has already settled the plan and the travel
 * zone, so the scene step is skipped and a plan summary takes its place.
 */

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";
import SceneCalculator from "./SceneCalculator";
import { useRazorpayPayment, type Buyer, type Purpose } from "./useRazorpayPayment";
import {
  LAUNCH_OFFER,
  SCENE_DEFAULT,
  SUPPORT_ANNUAL_INR,
  SUPPORT_ANNUAL_INR as DIGITAL_CARE_INR,
  TRAVEL_FEES,
  inr,
  inr2,
  priceForScenes,
  sitePlanQuote,
  withGst,
  type SitePlanId,
  type TravelZone,
} from "@/lib/pricing";
import { INDIAN_STATES, canonicalIndianState } from "@/lib/indianStates";

type Step = "choose" | "details";


export default function CheckoutFlow({
  purpose = "basic_licence",
  /** Which named pack, when purpose is "site_plan". */
  sitePlanId,
  /** Where the factory is, when purpose is "site_plan". Sets the travel fee. */
  travel,
  /** Pre-filled for a signed-in customer renewing support. */
  prefill,
  /** Supabase access token, when an existing customer is buying. */
  accessToken,
  /** Called once a purchase is fully complete (e.g. so the dashboard can refresh). */
  onComplete,
  title,
  subtitle,
}: {
  purpose?: Purpose;
  sitePlanId?: SitePlanId;
  travel?: TravelZone;
  prefill?: Partial<Buyer>;
  accessToken?: string | null;
  onComplete?: () => void;
  title?: string;
  subtitle?: string;
}) {
  // Only the scene-ladder purchase starts on the calculator. A site plan
  // was already chosen on the marketing site, so it opens on the form.
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
  const [agreed, setAgreed] = useState(false);

  const payment = useRazorpayPayment({ accessToken });
  const { phase, busy, error, notice, testMode, result, scriptReady } = payment;
  const scriptState = scriptReady;

  // The plan quote, when this is a site plan. Same function the server
  // prices the order with, so the screen and the charge cannot disagree.
  const quote =
    purpose === "site_plan" && sitePlanId && travel
      ? sitePlanQuote(sitePlanId, travel)
      : null;

  const amount = quote
    ? quote.amountInr
    : purpose === "support_renewal"
      ? SUPPORT_ANNUAL_INR
      : priceForScenes(scenes);
  // What the server will send to Razorpay (base + 18% GST). We show this
  // breakdown on the final checkout screen, right before the Pay button.
  const split = withGst(amount);

  const pay = () => {
    void payment.start({
      purpose,
      scenes: purpose === "basic_licence" ? scenes : undefined,
      sitePlanId: purpose === "site_plan" ? sitePlanId : undefined,
      travel: purpose === "site_plan" ? travel : undefined,
      buyer,
    });
  };

  /* ───────────────────── Waiting for confirmation ────────────────── */

  if (phase === "verifying") {
    return (
      <div className="rounded-3xl border border-vpv-blue/25 bg-white p-8 text-center">
        <Loader2 className="mx-auto h-9 w-9 animate-spin text-vpv-blue" />
        <h2 className="mt-5 text-[22px] font-semibold tracking-tight text-vpv-ink">
          Confirming your payment…
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-600">
          {notice ?? "This usually takes a few seconds."} Please keep this page open
          and <strong className="text-vpv-ink">do not pay again</strong> — if anything is
          delayed, we finish the set-up automatically and e-mail you.
        </p>
      </div>
    );
  }

  /* ─────────────────────────── Done ─────────────────────────────── */

  if (phase === "done" && result) {
    if (result.outcome === "ready") {
      return (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h2 className="mt-5 text-[26px] font-semibold tracking-tight text-vpv-ink">
            {purpose === "support_renewal"
              ? "Support renewed"
              : purpose === "scene_topup"
                ? "Scenes added"
                : "Your workspace is ready"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-600">
            {purpose === "support_renewal"
              ? "Thank you. Your technical support and hosting is extended by one year, and the invoice is on its way to your inbox."
              : purpose === "scene_topup"
                ? "Thank you. The new scenes are live for your customers now, and the invoice is on its way to your inbox."
                : "Thank you. We have e-mailed your sign-in details and your GST invoice. Check your spam folder if it is not there in a few minutes."}
          </p>

          {result.slug && (purpose === "basic_licence" || purpose === "site_plan") && (
            <a
              href={`https://${result.slug}.myvpv.com`}
              className="mt-6 inline-block rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white"
            >
              Open {result.slug}.myvpv.com
            </a>
          )}
          {purpose !== "basic_licence" && purpose !== "site_plan" && onComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="mt-6 inline-block rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white"
            >
              Back to billing
            </button>
          )}
          {result.invoiceNo && (
            <p className="mt-4 text-[13px] text-slate-500">Invoice {result.invoiceNo}</p>
          )}
        </div>
      );
    }

    if (result.outcome === "refunded") {
      return (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-[22px] font-semibold tracking-tight text-vpv-ink">This payment was refunded</h2>
          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-600">
            The money is on its way back to your original payment method (5 to 7 business days).
            You are welcome to start again whenever you like.
          </p>
        </div>
      );
    }

    if (result.outcome === "failed") {
      return (
        <div className="rounded-3xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-[22px] font-semibold tracking-tight text-vpv-ink">The payment did not complete</h2>
          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-600">
            If your bank shows a debit, it is refunded automatically — you never pay for something you do not get.
            To try again, refresh this page. Questions: billing@myvpv.com.
          </p>
        </div>
      );
    }

    // processing | review — the money is safe, a person or a retry finishes the job.
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100">
          <Clock size={26} className="text-amber-600" />
        </div>
        <h2 className="mt-5 text-[24px] font-semibold tracking-tight text-vpv-ink">
          Payment received — finishing your set-up
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-600">
          {result.outcome === "review"
            ? "Your payment is safe. Our team is checking one detail and will e-mail you shortly."
            : "Your payment is safe. Set-up is taking a little longer than usual, so we are completing it in the background and will e-mail you as soon as it is done."}{" "}
          <strong className="text-vpv-ink">Please do not pay again.</strong> Questions: billing@myvpv.com.
        </p>
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
    canonicalIndianState(buyer.state) !== null &&
    agreed &&
    !busy;

  // For a signed-in customer the invoice identity is the organisation's,
  // set by the server — so these two fields are shown but not editable.
  const identityLocked = purpose !== "basic_licence" && purpose !== "site_plan";

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
              readOnly={identityLocked}
              autoComplete="email"
              onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
            />
          </Field>
          <Field label="Company name" required>
            <input
              className="vpv-input"
              value={buyer.company}
              readOnly={identityLocked}
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
          <Field label="State" required hint="Decides the GST split on your invoice">
            <select
              className="vpv-input"
              value={buyer.state}
              onChange={(e) => setBuyer({ ...buyer, state: e.target.value })}
            >
              <option value="">Select a state</option>
              {INDIAN_STATES.map((s) => (
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
          <div role="alert" className="mt-5 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!error && notice && (
          <div role="status" className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <button
          type="button"
          disabled={!canPay}
          onClick={pay}
          className="mt-6 w-full rounded-full bg-vpv-grad py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_36px_-14px_rgba(20,104,216,0.75)] transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-10"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Opening secure payment…
            </span>
          ) : (
            <>Pay {inr2(split.total)} securely</>
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
          {quote ? (
            <>
              <Row label={`${quote.plan.name} · ${quote.plan.scenes} areas`} value={inr(quote.base)} />
              {quote.discount > 0 && (
                <Row label={LAUNCH_OFFER.label} value={`− ${inr(quote.discount)}`} muted />
              )}
              <Row
                label={`Travel & logistics · ${TRAVEL_FEES[travel!].label}`}
                value={inr(quote.travelFee)}
                muted
              />
              <Row label="First year of support" value="Free" muted />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="mt-4 border-t border-vpv-line pt-4 space-y-2">
          <Row label="Subtotal" value={inr2(split.taxable)} muted />
          <Row label="GST @ 18%" value={inr2(split.gst)} muted />
          <div className="flex items-baseline justify-between pt-2 border-t border-vpv-line">
            <span className="text-[14px] font-semibold text-vpv-ink">Total payable</span>
            <span className="text-[22px] font-semibold tabular-nums text-vpv-ink">{inr2(split.total)}</span>
          </div>
        </div>
        <p className="mt-1.5 text-[12px] text-slate-500">
          You pay the total above. The invoice carries our GSTIN so you can
          claim input credit.
        </p>
        {quote && (
          <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600 ring-1 ring-vpv-line">
            <strong className="text-vpv-ink">Not in this payment:</strong> Digital
            Care is {inr(DIGITAL_CARE_INR)} + GST a year and is required to keep
            your VPV online. Your first year is included, so the first bill comes
            a year after go-live.
          </p>
        )}

        <div className="mt-5 flex gap-2 rounded-xl bg-white p-3 text-[12.5px] text-slate-600 ring-1 ring-vpv-line">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-vpv-blue" />
          <span>
            Payments to VPV are non-refundable by default. If something
            on our side fails, write to us and we will review it — see our{" "}
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
