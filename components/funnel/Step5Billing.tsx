/**
 * Step 5 of the funnel — the bill, e-mail verification, and the payment.
 *
 * Two columns on a wide screen: the bill on the left, where it stays in
 * view, and everything the buyer does on the right — invoice details, the
 * e-mail check, a coupon code and the pay button. On a phone they stack in
 * that order.
 *
 * Everything the buyer is being charged for is itemised before anything is
 * asked of them: the plan, each add-on, the cab, the first year of support,
 * hosting & security (with a "?" that explains what it pays for), any
 * coupon, and the GST. There is no figure on the Razorpay screen that was
 * not on this one. A factory in a city we do not shoot in yet sees its bill
 * and a "coming to your city soon" card in place of the pay button.
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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock, CreditCard, Lock, Mail, Receipt, ScrollText, ShieldCheck, Tag, X } from "lucide-react";
import {
  BackLink,
  Card,
  ComingSoonCity,
  Field,
  FunnelBody,
  FunnelHeader,
  HelpButton,
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
import {
  LAUNCH_OFFER,
  SUPPORT_ANNUAL_INR,
  SUPPORT_INCLUDES,
  SUPPORT_MONTHLY_INR,
  SUPPORT_NAME,
  couponLabel,
  hoursLabel,
  inr,
  siteQuote,
  type Coupon,
  type QuoteLine,
} from "@/lib/pricing";
import { COMPANY } from "@/lib/company";
import {
  clearFunnel,
  loadFunnel,
  mirrorLead,
  saveFunnel,
  isEmailVerified,
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
  const paidMirrored = useRef(false);
  const offer = useOfferState();
  const [offerClosedNotice, setOfferClosedNotice] = useState(false);
  const offerOpen = offer.open && LAUNCH_OFFER.active && !offerClosedNotice;
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    const loaded = loadFunnel();
    setS(loaded);
    if (isEmailVerified(loaded)) setOtp("verified");
    setReady(true);
  }, []);

  // "Confirmed" is only true for the exact address a code was confirmed for.
  const emailOk = otp === "verified" && s !== null && isEmailVerified(s);

  const quote = useMemo(
    () =>
      s && s.chosenPlan
        ? siteQuote(s.chosenPlan, {
            extraAreas: s.extraAreas,
            extraVideos: s.extraVideos,
            city: s.factoryCity,
            offerOpen,
            salesSeats: s.hasSalesTeam ? s.salesSeats : 0,
            coupon,
          })
        : null,
    [s, offerOpen, coupon]
  );

  // Mark the lead as paid once, so /admin/cities counts the order against
  // the city it came from.
  useEffect(() => {
    if (pay.result?.outcome === "ready" && s && !paidMirrored.current) {
      paidMirrored.current = true;
      void mirrorLead("paid", s);
    }
  }, [pay.result, s]);

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
      const saved = saveFunnel({ emailVerified: true, verifiedEmail: s.email });
      setS(saved);
      setOtp("verified");
    } catch {
      setOtpError("We could not reach our server. Please try again.");
      setOtp("sent");
    }
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponError(null);
    setCouponBusy(true);
    try {
      const res = await fetch("/api/funnel/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; coupon?: Coupon };
      if (!res.ok || !data.ok || !data.coupon) {
        setCouponError(data.message ?? "That coupon code is not valid.");
        return;
      }
      setCoupon(data.coupon);
      setCouponInput("");
    } catch {
      setCouponError("We could not check that code. Please try again.");
    } finally {
      setCouponBusy(false);
    }
  }

  async function onPay() {
    if (!s || !s.chosenPlan || !quote) return;
    // The special offer is for the first 50 customers. If the last place
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
      salesSeats: s.hasSalesTeam ? s.salesSeats : 0,
      coupon: coupon?.code,
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
        <FunnelHeader step={5} title="Your bill" />
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
        <FunnelHeader step={5} title="Your bill" />
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
        <FunnelHeader step={5} title="Your VPV is paid for" />
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

  const canPay = quote.available && emailOk && s.termsAccepted && !pay.busy;
  const billLines = quote.lines.filter((l) => l.kind !== "support" && l.kind !== "travel");
  const travel = quote.lines.find((l) => l.kind === "travel") ?? null;
  const travelFree = travel !== null && travel.amountInr === 0;
  const support = quote.lines.find((l) => l.kind === "support") as QuoteLine;
  const supportFree = support.amountInr === 0;

  return (
    <>
      <FunnelHeader
        step={5}
        title="Your bill"
        summary="Everything you are paying for, itemised. Nothing is added after this screen."
      />
      <FunnelBody wide>
        <div className="grid items-start gap-6 lg:grid-cols-[1.08fr_1fr] lg:gap-8">
          {/* ── Left: the bill. Stays in view while the right column scrolls. ── */}
          <div className="lg:sticky lg:top-20">
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
                {billLines.map((l) => {
                  const deal = l.kind === "offer" || l.kind === "coupon";
                  return (
                    <div
                      key={l.label}
                      className={`flex items-start justify-between gap-4 py-3 ${deal ? "-mx-3 rounded-lg bg-[#FFF7E0] px-3" : ""}`}
                    >
                      <dt className={deal ? "font-semibold text-[#7A5600]" : "text-slate-600"}>
                        {l.label}
                        {l.note && <span className="mt-0.5 block text-[12.5px] font-normal text-slate-500">{l.note}</span>}
                      </dt>
                      <dd className={`shrink-0 tabular-nums font-semibold ${deal ? "text-[#7A5600]" : "text-vpv-ink"}`}>
                        {l.amountInr < 0 ? `− ${inr(-l.amountInr)}` : inr(l.amountInr)}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              {/* Travel: its own block, like the support year — free for the first 50. */}
              {travel && (
                <div
                  className={`mt-4 rounded-2xl border p-4 sm:p-5 ${travelFree ? "border-[#BFE6CD] bg-[#F1FBF4]" : "border-vpv-line bg-vpv-canvas"}`}
                  data-testid="bill-travel"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[16.5px] font-semibold leading-snug text-vpv-ink">{travel.label}</p>
                      <p className="mt-0.5 text-[12.5px] text-slate-600">Our crew comes to your plant and back the same day</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {travelFree ? (
                        <>
                          <p className="text-[15px] font-semibold tabular-nums text-slate-400 line-through">{inr(travel.regularInr ?? 0)}</p>
                          <p className="text-[24px] font-bold leading-none tracking-[-0.01em] text-[#1F8A4C]">FREE</p>
                        </>
                      ) : (
                        <p className="text-[24px] font-bold leading-none tabular-nums text-vpv-ink">{inr(travel.amountInr)}</p>
                      )}
                    </div>
                  </div>
                  {travelFree && (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#1D5E37]">
                      <strong className="font-semibold">Travel is free</strong> for our first {LAUNCH_OFFER.limit} customers.
                    </p>
                  )}
                </div>
              )}

              {/* The support year: its own block, in big type, with a "?". */}
              <div
                className={`mt-4 rounded-2xl border p-4 sm:p-5 ${supportFree ? "border-[#BFE6CD] bg-[#F1FBF4]" : "border-vpv-line bg-vpv-canvas"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[16.5px] font-semibold leading-snug text-vpv-ink">
                      First year support
                      <HelpButton
                        label={`What ${SUPPORT_NAME.toLowerCase()} pays for`}
                        open={supportOpen}
                        onToggle={() => setSupportOpen((v) => !v)}
                      />
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-slate-600">
                      {SUPPORT_NAME} · {inr(SUPPORT_MONTHLY_INR)}/month, billed yearly
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {supportFree ? (
                      <>
                        <p className="text-[15px] font-semibold tabular-nums text-slate-400 line-through">{inr(SUPPORT_ANNUAL_INR)}</p>
                        <p className="text-[24px] font-bold leading-none tracking-[-0.01em] text-[#1F8A4C]">FREE</p>
                      </>
                    ) : (
                      <p className="text-[24px] font-bold leading-none tabular-nums text-vpv-ink">{inr(SUPPORT_ANNUAL_INR)}</p>
                    )}
                  </div>
                </div>
                <p className={`mt-3 text-[12.5px] leading-relaxed ${supportFree ? "text-[#1D5E37]" : "text-slate-600"}`}>
                  {supportFree ? (
                    <>
                      <strong className="font-semibold">Free for the first year</strong> for our first {LAUNCH_OFFER.limit}{" "}
                      customers. From year 2 it is {inr(SUPPORT_ANNUAL_INR)} + 18% GST a year, and we remind you before it
                      is due.
                    </>
                  ) : (
                    <>Charged with this order for your first year. From year 2 it renews at {inr(SUPPORT_ANNUAL_INR)} + 18% GST a year.</>
                  )}
                </p>
                {supportOpen && (
                  <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-vpv-line">
                    <p className="text-[13.5px] font-semibold text-vpv-ink">What it pays for</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
                      So you never have to think about where your tour is hosted or how it is kept safe.
                    </p>
                    <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {SUPPORT_INCLUDES.map((i) => (
                        <li key={i.title} className="flex gap-2.5 text-[12.5px] leading-relaxed text-slate-600">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-vpv-blue" aria-hidden />
                          <span>
                            <strong className="font-semibold text-vpv-ink">{i.title}.</strong> {i.body}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <dl className="mt-4 divide-y divide-vpv-line text-[14.5px]">
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
                  <dd className="text-[32px] font-semibold tracking-[-0.02em] tabular-nums text-vpv-ink">{inr(quote.totalInr)}</dd>
                </div>
              </dl>
            </Card>
            <div className="mt-5 hidden lg:block">
              <BackLink href="/assessment/sales-team">Back to sales team</BackLink>
            </div>
          </div>

          {/* ── Right: invoice details, e-mail, coupon, pay. ── */}
          <div className="space-y-5">
            {!quote.available && quote.logistics && (
              <ComingSoonCity
                city={quote.logistics.city}
                body={
                  <>
                    We do not shoot in {quote.logistics.city} just yet, so we cannot take your order today. This is your
                    bill for when we do, and we will call you on {s.phone} the moment we start in your city.
                  </>
                }
              />
            )}

            {/* Session recording must never capture a buyer's name, GSTIN or
                e-mail. Clarity masks typed text by default; this marks the
                whole block so the masking does not depend on that default
                staying switched on in someone's dashboard. */}
            <Card data-clarity-mask="true">
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
                  hint="Optional. Lets you claim GST credit."
                  error={gstinError ?? undefined}
                >
                  <TextInput
                    value={s.gstin}
                    onChange={(e) => setS({ ...s, gstin: e.target.value.toUpperCase() })}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </Field>
                <Field label="Place of supply" hint="Decides CGST + SGST or IGST.">
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

            {quote.available && (
              <>
                <Card>
                  <SectionTitle icon={Mail} title="Confirm your e-mail">
                    Your workspace link, first password and GST invoice go to{" "}
                    <strong className="font-semibold text-vpv-ink">{s.email}</strong>.
                  </SectionTitle>

                  {emailOk ? (
                    <p className="mt-5 flex items-center gap-2 rounded-xl border border-vpv-line bg-vpv-tint/50 px-4 py-3 text-[14px] font-medium text-vpv-blue">
                      ✓ {s.email} is confirmed
                    </p>
                  ) : otp === "sent" || otp === "verifying" ? (
                    <div className="mt-5">
                      <Field label="Six-digit code" error={otpError ?? undefined}>
                        <div className="flex flex-wrap items-center gap-3">
                          <TextInput
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="123456"
                            className="max-w-[11rem] text-center text-[20px] tracking-[0.3em]"
                          />
                          <button
                            type="button"
                            onClick={() => void verifyCode()}
                            disabled={code.length !== 6 || otp === "verifying"}
                            className="rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
                          >
                            {otp === "verifying" ? "Checking…" : "Confirm"}
                          </button>
                        </div>
                      </Field>
                      <p className="mt-3 text-[12.5px] text-slate-500">
                        Expires in 10 minutes. Not there? Check spam, or{" "}
                        <button
                          type="button"
                          onClick={() => void sendCode()}
                          className="font-medium text-vpv-blue underline underline-offset-2"
                        >
                          send a new code
                        </button>
                        .
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

                <Card>
                  {/* Coupon. */}
                  {coupon ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#EBC468] bg-[#FFF8E1] px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-[#5A3D00]">
                        <Tag className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <strong className="font-semibold">{coupon.code}</strong> applied: {couponLabel(coupon)}
                          {quote.couponInr > 0 && <>, you save {inr(quote.couponInr)}</>}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCoupon(null)}
                        aria-label="Remove coupon"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7A5600] hover:bg-[#FFEDB8]"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="coupon" className="mb-1.5 flex items-center gap-2 text-[13.5px] font-medium text-vpv-ink">
                        <Tag className="h-4 w-4 text-vpv-blue" aria-hidden /> Have a coupon code?
                      </label>
                      <div className="flex gap-2">
                        <TextInput
                          id="coupon"
                          value={couponInput}
                          onChange={(e) => {
                            setCouponInput(e.target.value.toUpperCase());
                            setCouponError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void applyCoupon();
                            }
                          }}
                          placeholder="Enter code"
                          autoComplete="off"
                          maxLength={24}
                          className="uppercase tracking-[0.08em]"
                        />
                        <button
                          type="button"
                          onClick={() => void applyCoupon()}
                          disabled={!couponInput.trim() || couponBusy}
                          className="shrink-0 rounded-xl border border-vpv-blue px-4 text-[13.5px] font-semibold text-vpv-blue transition-colors hover:bg-vpv-tint disabled:opacity-40"
                        >
                          {couponBusy ? "Checking…" : "Apply"}
                        </button>
                      </div>
                      {couponError && (
                        <p role="alert" className="mt-2 text-[12.5px] font-medium text-red-600">
                          {couponError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Terms. */}
                  <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-vpv-line pt-5">
                    <input
                      type="checkbox"
                      checked={s.termsAccepted}
                      onChange={(e) => setS({ ...s, termsAccepted: e.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-vpv-blue"
                    />
                    <span className="text-[13.5px] leading-relaxed text-slate-700">
                      I accept the{" "}
                      <Link href="/terms" className="font-medium text-vpv-blue underline underline-offset-2">
                        Terms &amp; Conditions
                      </Link>{" "}
                      and the{" "}
                      <Link href="/refund-policy" className="font-medium text-vpv-blue underline underline-offset-2">
                        Refund Policy
                      </Link>
                      , and understand payments are non-refundable by default.
                    </span>
                  </label>

                  {/* Pay. */}
                  <div className="mt-5">
                    {offerClosedNotice && (
                      <p className="mb-4 rounded-xl border border-vpv-line bg-vpv-canvas px-4 py-3 text-[13px] text-slate-700">
                        The special offer has just been taken by our {LAUNCH_OFFER.limit}th customer, so your total has
                        been updated to the regular price. Please check it before you pay.
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
                    <div className="[&>button]:w-full">
                      <PrimaryButton onClick={() => void onPay()} disabled={!canPay} busy={pay.busy}>
                        Pay {inr(quote.totalInr)}
                      </PrimaryButton>
                    </div>
                    {!canPay && !pay.busy && (
                      <p className="mt-3 text-center text-[12.5px] text-slate-500">
                        {!emailOk
                          ? "Confirm your e-mail address to continue."
                          : "Accept the Terms and the Refund Policy to continue."}
                      </p>
                    )}
                    <ul className="mt-5 grid gap-2 text-[12.5px] text-slate-600">
                      <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-vpv-blue" aria-hidden />Secure payment by Razorpay. We never see your card.</li>
                      <li className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-vpv-blue" aria-hidden />UPI, cards and netbanking</li>
                      <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-vpv-blue" aria-hidden />GST invoice by e-mail</li>
                    </ul>
                    <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
                      Questions before you pay? Write to{" "}
                      <a href={`mailto:${COMPANY.emails.support}`} className="font-medium text-vpv-blue underline underline-offset-2">
                        {COMPANY.emails.support}
                      </a>
                      .
                    </p>
                  </div>
                </Card>
              </>
            )}
            <div className="lg:hidden">
              <BackLink href="/assessment/sales-team">Back to sales team</BackLink>
            </div>
          </div>
        </div>
      </FunnelBody>
    </>
  );
}
