/**
 * Step 5 of the funnel — the bill, e-mail verification, and the payment.
 *
 * Everything the buyer is being charged for is itemised on this screen
 * before anything is asked of them: the plan, each add-on, the travel
 * charge for their city, any second shoot day, and the GST. Whatever the
 * tier leaves to them to arrange is printed in full as well. There is no
 * figure on the Razorpay screen that was not on this one.
 *
 * Two gates before the pay button lights up:
 *   1. the e-mail address is verified by a code, because the workspace, the
 *      first password and the GST invoice are all delivered to it; and
 *   2. the Terms and the Refund Policy are accepted by an explicit tick.
 *
 * The amount is NOT taken from this page. It posts the plan, the city and
 * the add-on counts, and /api/billing/order prices it again from
 * lib/pricing.ts — so a visitor who edits this page changes what they see,
 * never what they are charged.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, CreditCard, Lock, Mail, Receipt, ScrollText, ShieldCheck } from "lucide-react";
import {
  BackLink,
  Card,
  Field,
  FunnelBody,
  FunnelHeader,
  PrimaryButton,
  RestartNotice,
  SectionTitle,
  SelectInput,
  TextInput,
  useOfferState,
} from "@/components/funnel/FunnelShell";
import { useRazorpayPayment } from "@/components/billing/useRazorpayPayment";
import { INDIAN_STATES } from "@/lib/indianStates";
import { validGstin } from "@/lib/gstin";
import { LAUNCH_OFFER, SUPPORT_ANNUAL_INR, hoursLabel, inr, siteQuote } from "@/lib/pricing";
import { ACCOMMODATION_RULE } from "@/lib/logistics";
import { COMPANY } from "@/lib/company";
import {
  clearFunnel,
  loadFunnel,
  mirrorLead,
  saveFunnel,
  type FunnelState,
} from "@/lib/funnel";

type OtpPhase = "unsent" | "sending" | "sent" | "verifying" | "verified";

export default function Step5Billing() {
  const [s, setS] = useState<FunnelState | null>(null);
  const [ready, setReady] = useState(false);
  const [otp, setOtp] = useState<OtpPhase>("unsent");
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [gstinError, setGstinError] = useState<string | null>(null);
  const pay = useRazorpayPayment();
  const offer = useOfferState();
  const [offerClosedNotice, setOfferClosedNotice] = useState(false);
  const offerOpen = offer.open && LAUNCH_OFFER.active && !offerClosedNotice;

  useEffect(() => {
    const loaded = loadFunnel();
    setS(loaded);
    if (loaded.emailVerified) setOtp("verified");
    setReady(true);
  }, []);

  const quote = useMemo(
    () =>
      s && s.chosenPlan
        ? siteQuote(s.chosenPlan, {
            extraAreas: s.extraAreas,
            extraVideos: s.extraVideos,
            city: s.factoryCity,
            offerOpen,
          })
        : null,
    [s, offerOpen]
  );

  async function sendCode() {
    if (!s) return;
    setOtpError(null);
    setOtp("sending");
    try {
      const res = await fetch("/api/funnel/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: s.email, leadId: s.leadId }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setOtpError(data.message ?? "We could not send the code. Please try again.");
        setOtp("unsent");
        return;
      }
      setOtp("sent");
    } catch {
      setOtpError("We could not reach our server. Please check your connection.");
      setOtp("unsent");
    }
  }

  async function verifyCode() {
    if (!s) return;
    setOtpError(null);
    setOtp("verifying");
    try {
      const res = await fetch("/api/funnel/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: s.email, code, leadId: s.leadId }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setOtpError(data.message ?? "That code is not right.");
        setOtp("sent");
        return;
      }
      const saved = saveFunnel({ emailVerified: true });
      setS(saved);
      setOtp("verified");
    } catch {
      setOtpError("We could not reach our server. Please try again.");
      setOtp("sent");
    }
  }

  async function onPay() {
    if (!s || !s.chosenPlan || !quote) return;
    // The special offer is for the first 100 customers. If the last place
    // went while this page was open, show the new total HERE, before
    // Razorpay opens — never let the first sight of it be the payment sheet.
    if (offerOpen) {
      try {
        const res = await fetch("/api/funnel/offer", { cache: "no-store" });
        const data = (await res.json()) as { open?: boolean };
        if (data.open === false) {
          // Re-prices the bill on this screen and says why; the buyer
          // presses Pay again once they have seen the new total.
          setOfferClosedNotice(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      } catch {
        /* intentional — the order route re-checks the count for real. */
      }
    }
    if (s.gstin && !validGstin(s.gstin)) {
      setGstinError("That GSTIN does not look right. Leave it blank if you do not have one.");
      return;
    }
    setGstinError(null);
    const saved = saveFunnel({ termsAccepted: true });
    void mirrorLead("billing", saved, { termsAccepted: true });
    void pay.start({
      purpose: "site_plan",
      sitePlanId: s.chosenPlan,
      city: s.factoryCity,
      extraAreas: s.extraAreas,
      extraVideos: s.extraVideos,
      buyer: {
        name: s.name,
        email: s.email,
        phone: s.phone,
        company: s.company,
        gstin: s.gstin,
        state: s.factoryState,
      },
    });
  }

  if (!ready || !s) {
    return (
      <>
        <FunnelHeader step={4} title="Your bill" />
        <FunnelBody>
          <Card>
            <div className="h-5 w-40 animate-pulse rounded bg-vpv-tint" />
          </Card>
        </FunnelBody>
      </>
    );
  }

  if (!s.chosenPlan || !quote || !s.factoryCity) {
    return (
      <>
        <FunnelHeader step={4} title="Your bill" />
        <FunnelBody>
          <RestartNotice missing="your plan and your factory's city" />
        </FunnelBody>
      </>
    );
  }

  /* ── Paid. ─────────────────────────────────────────────────────── */
  if (pay.result && pay.result.outcome === "ready") {
    return (
      <>
        <FunnelHeader step={4} title="Your VPV is paid for" />
        <FunnelBody>
          <Card>
            <p className="text-[15px] leading-relaxed text-slate-700">
              Thank you. Your workspace is being set up and your GST invoice
              {pay.result.invoiceNo ? ` (${pay.result.invoiceNo})` : ""} is on its
              way to <strong className="font-semibold text-vpv-ink">{s.email}</strong>.
            </p>
            {pay.result.slug && (
              <p className="mt-4 text-[15px] text-slate-700">
                Sign in at{" "}
                <a
                  href={`https://${pay.result.slug}.myvpv.com`}
                  className="font-semibold text-vpv-blue underline underline-offset-2"
                >
                  {pay.result.slug}.myvpv.com
                </a>{" "}
                with the first password in your welcome e-mail.
              </p>
            )}
            <p className="mt-4 text-[14px] leading-relaxed text-slate-600">
              We will call you on {s.phone} to agree the shoot date for your
              {" "}{s.factoryCity} plant.
            </p>
            <button
              type="button"
              onClick={() => clearFunnel()}
              className="mt-6 text-[13px] font-medium text-vpv-blue underline underline-offset-2"
            >
              Clear these answers from this browser
            </button>
          </Card>
        </FunnelBody>
      </>
    );
  }

  const canPay = otp === "verified" && s.termsAccepted && !pay.busy;

  return (
    <>
      <FunnelHeader
        step={4}
       
        title="Your bill"
        summary="Everything you are paying for, itemised. Nothing is added after this screen."
        image="shoot-crew"
        imageAlt="The VPV crew getting ready for a factory shoot"
        caption="Our crew comes to your plant"
      />
      <FunnelBody>
        {/* The bill. */}
        <Card>
          <SectionTitle
            icon={Receipt}
            title={`${quote.plan.name} for ${s.company}`}
            aside={
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
                <Clock className="h-4 w-4 text-vpv-blue" aria-hidden />
                {hoursLabel(quote.shoot.totalHours)} on site
              </span>
            }
          />
          <dl className="mt-5 divide-y divide-vpv-line text-[14.5px]">
            {quote.lines.map((l) => (
              <div
                key={l.label}
                className={`flex items-start justify-between gap-4 py-3 ${l.kind === "offer" ? "-mx-3 rounded-lg bg-[#FFF7E0] px-3" : ""}`}
              >
                <dt className={l.kind === "offer" ? "font-semibold text-[#7A5600]" : "text-slate-600"}>
                  {l.label}
                  {l.note && <span className="mt-0.5 block text-[12.5px] font-normal text-slate-500">{l.note}</span>}
                </dt>
                <dd className={`shrink-0 tabular-nums font-semibold ${l.kind === "offer" ? "text-[#7A5600]" : "text-vpv-ink"}`}>
                  {l.amountInr < 0 ? `− ${inr(-l.amountInr)}` : inr(l.amountInr)}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-600">Taxable value</dt>
              <dd className="shrink-0 tabular-nums font-medium text-vpv-ink">{inr(quote.taxableInr)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-600">18% GST</dt>
              <dd className="shrink-0 tabular-nums font-medium text-vpv-ink">{inr(quote.gstInr)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pt-4">
              <dt className="text-[16px] font-semibold text-vpv-ink">Total payable now</dt>
              <dd className="text-[34px] font-semibold tracking-[-0.02em] tabular-nums text-vpv-ink">{inr(quote.totalInr)}</dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3">
            {quote.logistics && quote.logistics.spec.clientArranges.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3.5">
                <p className="text-[13px] font-semibold text-amber-900">
                  Arranged and paid by you, not part of this bill
                </p>
                <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-amber-900">
                  {quote.logistics.spec.clientArranges.map((c) => (
                    <li key={c}>• {c}</li>
                  ))}
                  <li>• {ACCOMMODATION_RULE}</li>
                </ul>
              </div>
            )}
            {quote.logistics?.needsConfirmation && (
              <p className="rounded-xl border border-vpv-line bg-vpv-canvas px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
                We have not yet priced travel to {quote.logistics.city}. The
                charge above is our standard air-travel figure and we will
                confirm your exact arrangement with you before the shoot.
              </p>
            )}
            <p className="text-[12.5px] leading-relaxed text-slate-500">
              Annual technical support, maintenance and hosting is{" "}
              {inr(SUPPORT_ANNUAL_INR)}/year + GST. Your first year is included
              free, so it is not charged today.
            </p>
          </div>
        </Card>

        {/* Invoice details. */}
        <Card className="mt-5">
          <SectionTitle icon={ScrollText} title="Invoice details">
            Your GST invoice is raised to these details and e-mailed to you.
          </SectionTitle>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Billed to">
              <TextInput value={s.company} onChange={(e) => setS({ ...s, company: e.target.value })} />
            </Field>
            <Field label="Contact name">
              <TextInput value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
            </Field>
            <Field
              label="GSTIN"
              hint="Optional. With it, your invoice carries your GST credit."
              error={gstinError ?? undefined}
            >
              <TextInput
                value={s.gstin}
                onChange={(e) => setS({ ...s, gstin: e.target.value.toUpperCase() })}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
            </Field>
            <Field label="Place of supply" hint="Decides CGST + SGST or IGST on your invoice.">
              <SelectInput
                value={s.factoryState}
                onChange={(e) => setS({ ...s, factoryState: e.target.value })}
              >
                <option value="">Select your state…</option>
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </Card>

        {/* E-mail verification. */}
        <Card className="mt-5">
          <SectionTitle icon={Mail} title="Confirm your e-mail">
            Your workspace link, your first password and your GST invoice all go to{" "}
            <strong className="font-semibold text-vpv-ink">{s.email}</strong>, so we check it before taking any money.
          </SectionTitle>

          {otp === "verified" ? (
            <p className="mt-5 flex items-center gap-2 rounded-xl border border-vpv-line bg-vpv-tint/50 px-4 py-3 text-[14px] font-medium text-vpv-blue">
              ✓ {s.email} is confirmed
            </p>
          ) : otp === "sent" || otp === "verifying" ? (
            <div className="mt-5">
              <Field label="Six-digit code" error={otpError ?? undefined}>
                <TextInput
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="max-w-[12rem] text-center text-[20px] tracking-[0.3em]"
                />
              </Field>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void verifyCode()}
                  disabled={code.length !== 6 || otp === "verifying"}
                  className="rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
                >
                  {otp === "verifying" ? "Checking…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  className="text-[13px] font-medium text-vpv-blue underline underline-offset-2"
                >
                  Send a new code
                </button>
              </div>
              <p className="mt-3 text-[12.5px] text-slate-500">
                The code expires in 10 minutes. Check your spam folder if it
                has not arrived.
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={otp === "sending"}
                className="rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
              >
                {otp === "sending" ? "Sending…" : "E-mail me a code"}
              </button>
              {otpError && (
                <p role="alert" className="mt-3 text-[12.5px] font-medium text-red-600">
                  {otpError}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Terms. */}
        <Card className="mt-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={s.termsAccepted}
              onChange={(e) => setS({ ...s, termsAccepted: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-vpv-blue"
            />
            <span className="text-[14px] leading-relaxed text-slate-700">
              I have read and accept the{" "}
              <Link href="/terms" className="font-medium text-vpv-blue underline underline-offset-2">
                Terms &amp; Conditions
              </Link>{" "}
              and the{" "}
              <Link href="/refund-policy" className="font-medium text-vpv-blue underline underline-offset-2">
                Refund Policy
              </Link>
              , and I understand that payments are non-refundable by default.
            </span>
          </label>
        </Card>

        {/* Pay. */}
        <div className="mt-7">
          {offerClosedNotice && (
            <p className="mb-4 rounded-xl border border-vpv-line bg-vpv-canvas px-4 py-3 text-[13px] text-slate-700">
              The special offer has just been taken by our {LAUNCH_OFFER.limit}th customer, so your total has been
              updated to the regular price. Please check it before you pay.
            </p>
          )}
          {pay.testMode && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12.5px] font-medium text-amber-900">
              Razorpay is in test mode. No real money will move.
            </p>
          )}
          {pay.error && (
            <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
              {pay.error}
            </p>
          )}
          {pay.notice && (
            <p className="mb-4 rounded-xl border border-vpv-line bg-vpv-canvas px-4 py-3 text-[13px] text-slate-600">
              {pay.notice}
            </p>
          )}
          <PrimaryButton onClick={() => void onPay()} disabled={!canPay} busy={pay.busy}>
            Pay {inr(quote.totalInr)}
          </PrimaryButton>
          {!canPay && !pay.busy && (
            <p className="mt-3 text-[12.5px] text-slate-500">
              {otp !== "verified"
                ? "Confirm your e-mail address to continue."
                : "Accept the Terms and the Refund Policy to continue."}
            </p>
          )}
          <ul className="mt-6 grid gap-3 text-[12.5px] text-slate-600 sm:grid-cols-3">
            <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-vpv-blue" aria-hidden />Secure payment by Razorpay</li>
            <li className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-vpv-blue" aria-hidden />UPI, cards and netbanking</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-vpv-blue" aria-hidden />GST invoice by e-mail</li>
          </ul>
          <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
            Payment is taken by Razorpay. We never see or store your card
            details. Questions before you pay? Write to{" "}
            <a href={`mailto:${COMPANY.emails.support}`} className="font-medium text-vpv-blue underline underline-offset-2">
              {COMPANY.emails.support}
            </a>
            .
          </p>
        </div>

        <div className="mt-7">
          <BackLink href="/assessment/plan">Back to your plan</BackLink>
        </div>
      </FunnelBody>
    </>
  );
}
