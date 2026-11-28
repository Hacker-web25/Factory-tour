"use client";

/**
 * /buy — Buy now: the whole purchase on one page, with a live total.
 *
 * For a buyer who already knows they want VPV. The assessment asks about the
 * factory first and recommends a plan; this page starts from the plan and takes
 * every detail we need to deliver it: who is buying, the GST particulars for the
 * invoice, where the crew shoots, the extras, and payment.
 *
 * It sells nothing the assessment does not: the same plans, extra areas, videos,
 * sales logins, coupon and special offer, priced by the same function
 * (siteQuote in lib/pricing.ts), plus the Security features add-on for VPV Light.
 * The total on this page is for the buyer to read; /api/billing/order prices the
 * order again from the same function and the payment is for THAT amount. A page
 * edited in the browser changes what it shows, never what is charged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Camera,
  Check,
  Film,
  Info,
  Layers,
  Lock,
  Mail,
  MapPin,
  Receipt,
  ShieldCheck,
  Tag,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, Counter, Field, SelectInput, TextInput, useOfferState } from "@/components/funnel/FunnelShell";
import { WorkspaceAddressCard, type SlugStatus } from "@/components/funnel/Step5Billing";
import { useRazorpayPayment } from "@/components/billing/useRazorpayPayment";
import {
  AOA_HINT,
  EXTRA_AREA_MAX,
  EXTRA_VIDEO_MAX,
  LAUNCH_OFFER,
  SALES_TEAM,
  SECURITY_ADDON,
  SITE_PLANS,
  SITE_PLAN_DISPLAY_ORDER,
  SUPPORT_ANNUAL_INR,
  SUPPORT_MONTHLY_INR,
  SUPPORT_NAME,
  VIDEO_SELF_INR,
  VIDEO_SHOT_INR,
  VIDEO_SHOT_NOTE,
  VIDEO_SELF_NOTE,
  extraAreaCost,
  hoursLabel,
  inr,
  inr2,
  isSitePlanId,
  planMonthly,
  planPrice,
  securityAddonApplies,
  seatPrice,
  siteQuote,
  soldPlanId,
  type Coupon,
  type PurchaseBilling,
  type SoldPlanId,
} from "@/lib/pricing";
import { COMPANY } from "@/lib/company";
import { gstinEntityLabel, stateFromGstin, stateWithCode, validGstin } from "@/lib/gstin";
import { INDIAN_STATES } from "@/lib/indianStates";
import { SHOOT_WINDOWS, cleanPhone, composeAddress, parseBuyDetails, placeOfSupplyState, taxSplit, validPincode, type ShootWindowId } from "@/lib/buyNow";
import { comingSoonTitle, logisticsFor } from "@/lib/logistics";
import { slugProblem, workspaceSlug } from "@/lib/slugs";

/* ───────────────────────────── the form ───────────────────────────── */

type Form = {
  plan: SoldPlanId;
  billing: PurchaseBilling;
  extraAreas: number;
  selfVideos: number;
  shotVideos: number;
  salesSeats: number;
  security: boolean;
  name: string;
  email: string;
  phone: string;
  company: string;
  gstin: string;
  billLine: string;
  billCity: string;
  billPin: string;
  billState: string;
  sameSite: boolean;
  siteLine: string;
  siteCity: string;
  sitePin: string;
  siteState: string;
  landmark: string;
  sameContact: boolean;
  siteContactName: string;
  siteContactPhone: string;
  window: ShootWindowId;
  fromDate: string;
  notes: string;
  slug: string;
  /** The exact address a code was confirmed for. */
  verifiedEmail: string;
};

const EMPTY: Form = {
  plan: "premium",
  billing: "annual",
  extraAreas: 0,
  selfVideos: 0,
  shotVideos: 0,
  salesSeats: 0,
  security: false,
  name: "",
  email: "",
  phone: "",
  company: "",
  gstin: "",
  billLine: "",
  billCity: "",
  billPin: "",
  billState: "",
  sameSite: true,
  siteLine: "",
  siteCity: "",
  sitePin: "",
  siteState: "",
  landmark: "",
  sameContact: true,
  siteContactName: "",
  siteContactPhone: "",
  window: "asap",
  fromDate: "",
  notes: "",
  slug: "",
  verifiedEmail: "",
};

const KEY = "vpv:buy:v1";
const norm = (e: string) => e.trim().toLowerCase();
// A light check for the form; the server checks again (and refuses throw-away addresses).
const validEmail = (e: string) => e.length <= 254 && /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/.test(e.trim()) && !e.includes("..");

function load(): Partial<Form> {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Form>) : {};
  } catch {
    return {};
  }
}

type OtpPhase = "unsent" | "sending" | "sent" | "verifying" | "verified";

/** Today in India, as YYYY-MM-DD, for the date picker's minimum. */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/* ───────────────────────────── the page ───────────────────────────── */

export default function BuyNow() {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState<Form>(EMPTY);
  const [ready, setReady] = useState(false);
  const [tried, setTried] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ state: "idle", slug: "" });
  const [otp, setOtp] = useState<OtpPhase>("unsent");
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [pendingPay, setPendingPay] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [offerClosedNotice, setOfferClosedNotice] = useState(false);
  const offer = useOfferState();
  const offerOpen = offer.open && LAUNCH_OFFER.active && !offerClosedNotice;
  const founding = offer.founding && offerOpen;

  const pay = useRazorpayPayment({
    onPaid: (orderId) => {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* nothing to clear */
      }
      router.replace(`/assessment/welcome?order=${encodeURIComponent(orderId)}`);
    },
  });

  // The plan and the way to pay come from the plans page (?plan=light&billing=lifetime);
  // anything typed earlier in this tab is restored under them.
  useEffect(() => {
    const saved = load();
    const planQ = soldPlanId(params.get("plan"));
    const billingQ = params.get("billing") === "lifetime" ? "lifetime" : params.get("billing") === "annual" ? "annual" : null;
    const merged: Form = { ...EMPTY, ...saved, ...(planQ ? { plan: planQ } : {}), ...(billingQ ? { billing: billingQ } : {}) };
    if (!merged.slug) merged.slug = workspaceSlug(merged.company);
    setF(merged);
    if (merged.verifiedEmail && norm(merged.verifiedEmail) === norm(merged.email)) setOtp("verified");
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(f));
    } catch {
      /* private mode: the page still works, it just will not remember */
    }
  }, [f, ready]);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v })), []);

  // The add-on belongs to a yearly Light plan only; follow the plan and the way to pay.
  const addonAllowed = securityAddonApplies(f.plan, f.billing);
  useEffect(() => {
    if (ready && f.security && !addonAllowed) setF((s) => ({ ...s, security: false }));
  }, [ready, f.security, addonAllowed]);

  /* ── GST: which state decides the tax ── */

  const gstin = f.gstin.trim().toUpperCase();
  const gstinOk = gstin.length === 15 && validGstin(gstin);
  const gstinState = gstinOk ? stateFromGstin(gstin) : null;
  const placeState = placeOfSupplyState(gstinOk ? gstin : "", f.billState);

  /* ── where the crew shoots ── */

  const site = f.sameSite
    ? { line: f.billLine.trim(), city: f.billCity.trim(), pincode: f.billPin.trim(), state: gstinState ?? f.billState }
    : { line: f.siteLine.trim(), city: f.siteCity.trim(), pincode: f.sitePin.trim(), state: f.siteState };
  const contactName = f.sameContact ? f.name.trim() : f.siteContactName.trim();
  const contactPhone = f.sameContact ? f.phone : f.siteContactPhone;
  const logistics = site.city ? logisticsFor(site.city) : null;
  const cityServed = logistics ? logistics.inServiceArea : null;

  const details = {
    siteContactName: contactName,
    siteContactPhone: contactPhone,
    shoot: { line: site.line, city: site.city, state: site.state, pincode: site.pincode, landmark: f.sameSite ? "" : f.landmark },
    window: f.window,
    fromDate: f.fromDate,
    notes: f.notes,
  };
  const detailsCheck = useMemo(() => parseBuyDetails(details), [details.siteContactName, details.siteContactPhone, site.line, site.city, site.state, site.pincode, f.landmark, f.window, f.fromDate, f.notes, f.sameSite]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── the bill ── */

  const quote = useMemo(
    () =>
      siteQuote(f.plan, {
        extraAreas: f.extraAreas,
        selfVideos: f.selfVideos,
        shotVideos: f.shotVideos,
        city: site.city || undefined,
        offerOpen,
        founding,
        billing: f.billing,
        salesSeats: f.salesSeats,
        securityAddon: f.security,
        coupon,
      }),
    [f.plan, f.extraAreas, f.selfVideos, f.shotVideos, site.city, offerOpen, founding, f.billing, f.salesSeats, f.security, coupon]
  );
  const tax = placeState ? taxSplit(quote.taxableInr, placeState, COMPANY.state) : null;
  const plan = SITE_PLANS[f.plan];

  /* ── what is still missing ── */

  const emailOk = otp === "verified" && norm(f.verifiedEmail) === norm(f.email) && norm(f.email) !== "";
  const problems = {
    name: f.name.trim().length < 2 ? "Please tell us your name." : "",
    email: validEmail(f.email) ? "" : "That e-mail address does not look right.",
    phone: cleanPhone(f.phone) ? "" : "Please give a phone number we can reach you on (10 digits).",
    company: f.company.trim().length < 2 ? "Please give the business name as it should appear on the invoice." : "",
    gstin: gstin && !gstinOk ? "That GSTIN does not look right. Check it against your GST certificate, or leave it blank if you do not have one." : "",
    billLine: f.billLine.trim().length < 6 ? "Please give the billing address: it is printed on your tax invoice." : "",
    billCity: f.billCity.trim().length < 2 ? "Please give the city." : "",
    billPin: validPincode(f.billPin.trim()) ? "" : "That PIN code does not look right.",
    billState: placeState ? "" : "Please choose your state: it decides the GST on your invoice.",
    site: f.sameSite ? "" : !detailsCheck.ok ? detailsCheck.message : "",
    contact: f.sameContact ? "" : contactName.length < 2 ? "Please name the person who will be at the plant." : cleanPhone(f.siteContactPhone) ? "" : "Please give that person's phone number.",
    window: detailsCheck.ok || detailsCheck.error !== "bad_from_date" ? "" : detailsCheck.message,
    city: cityServed === false ? `${comingSoonTitle(logistics!.city)}. We do not shoot there just yet, so we cannot take an order for that site today.` : site.city ? "" : "Please tell us the city of the plant.",
    slug: slugProblem(f.slug) ?? (slugStatus.state === "taken" ? "That VPV address is taken. Please choose another." : slugStatus.state === "checking" ? "Checking that VPV address…" : ""),
    email_confirmed: emailOk ? "" : "Please confirm your e-mail address with the code we send you.",
    terms: terms ? "" : "Please accept the Terms and the Privacy Policy to continue.",
  };
  const firstProblem = Object.values(problems).find(Boolean) ?? "";
  const show = (k: keyof typeof problems) => (tried ? problems[k] : "");

  /* ── e-mail code ── */

  async function sendCode() {
    setOtpError(null);
    if (problems.email) {
      setTried(true);
      return;
    }
    setOtp("sending");
    try {
      const res = await fetch("/api/funnel/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.email, leadId: null }),
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
    setOtpError(null);
    setOtp("verifying");
    try {
      const res = await fetch("/api/funnel/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.email, code, leadId: null }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; accountExists?: boolean };
      if (!res.ok || !data.ok) {
        setOtpError(data.message ?? "That code is not right.");
        setOtp("sent");
        return;
      }
      set("verifiedEmail", f.email);
      setOtp("verified");
      if (data.accountExists) router.replace(`/login?existing=1&email=${encodeURIComponent(norm(f.email))}`);
    } catch {
      setOtpError("We could not reach our server. Please try again.");
      setOtp("sent");
    }
  }

  useEffect(() => {
    if (pay.errorCode === "account_exists" && f.email) router.replace(`/login?existing=1&email=${encodeURIComponent(norm(f.email))}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay.errorCode]);

  /* ── coupon ── */

  const carried = useRef(false);
  useEffect(() => {
    if (carried.current) return;
    carried.current = true;
    let c = "";
    try {
      c = decodeURIComponent(/(?:^|;\s*)vpv_coupon=([^;]+)/.exec(document.cookie)?.[1] ?? "");
    } catch {
      c = "";
    }
    if (c) void applyCoupon(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyCoupon(carriedCode?: string) {
    const c = (carriedCode ?? couponInput).trim();
    if (!c) return;
    setCouponError(null);
    setCouponBusy(true);
    try {
      const res = await fetch("/api/funnel/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; coupon?: Coupon };
      if (!res.ok || !data.ok || !data.coupon) {
        if (!carriedCode) setCouponError(data.message ?? "That coupon code is not valid.");
        return;
      }
      setCoupon(data.coupon);
      setCouponInput("");
    } catch {
      if (!carriedCode) setCouponError("We could not check that code. Please try again.");
    } finally {
      setCouponBusy(false);
    }
  }

  /* ── pay ── */

  useEffect(() => {
    if (pendingPay && slugStatus.state !== "checking") {
      setPendingPay(false);
      void onPay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPay, slugStatus.state]);

  async function onPay() {
    setTried(true);
    // The address check is still running: finish it, then pay, rather than making the buyer press Pay twice.
    const others = Object.entries(problems).find(([k, v]) => k !== "slug" && v);
    if (!others && detailsCheck.ok && slugStatus.state === "checking") {
      setPendingPay(true);
      return;
    }
    if (firstProblem || !detailsCheck.ok) {
      // Errors appear once the form knows we tried; then take the person to the first one.
      setTimeout(() => {
        const first = document.querySelector<HTMLElement>("#buy-fields [role='alert']");
        (first ?? document.getElementById("buy-form"))?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
      return;
    }
    // The offer is for our first 20 customers. If the last place went while this page
    // was open, show the new total HERE, before Razorpay opens.
    if (offerOpen) {
      try {
        const res = await fetch("/api/funnel/offer", { cache: "no-store" });
        const data = (await res.json()) as { open?: boolean };
        if (data.open === false) {
          setOfferClosedNotice(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      } catch {
        /* the order route re-checks the count for real */
      }
    }
    void pay.start({
      purpose: "site_plan",
      sitePlanId: f.plan,
      billing: f.billing,
      city: site.city,
      extraAreas: f.extraAreas,
      selfVideos: f.selfVideos,
      shotVideos: f.shotVideos,
      salesSeats: f.salesSeats,
      securityAddon: f.security,
      coupon: coupon?.code,
      workspaceSlug: f.slug,
      buy: true,
      details,
      termsAccepted: terms,
      marketingConsent: marketing,
      buyer: {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        company: f.company.trim(),
        gstin,
        state: placeState ?? f.billState,
        address: composeAddress({ line: f.billLine.trim(), city: f.billCity.trim(), state: placeState ?? f.billState, pincode: f.billPin.trim() }),
      },
    });
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="h-8 w-64 animate-pulse rounded bg-vpv-tint" />
        <div className="mt-6 h-72 animate-pulse rounded-2xl bg-vpv-tint/60" />
      </div>
    );
  }

  const comparison = f.plan === "light" && f.security && addonAllowed;
  const lightPlus = planPrice("light", offerOpen) + SECURITY_ADDON.yearlyInr;
  const premium = SITE_PLANS.premium;

  return (
    <div
      style={{
        colorScheme: "light",
        backgroundImage:
          "radial-gradient(60% 120% at 90% 0%, rgba(25,184,242,0.12), rgba(255,255,255,0) 60%), radial-gradient(50% 100% at 0% 0%, rgba(20,104,216,0.08), rgba(255,255,255,0) 55%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-5 pt-10 pb-6">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-vpv-blue">Buy now</p>
        <h1 className="mt-2 max-w-3xl text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-vpv-navy sm:text-[40px]">
          Buy your VPV today, in one page.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          Choose your plan, tell us where to shoot and how to bill you, and pay. Not sure which plan fits? The{" "}
          <Link href="/assessment" className="font-medium text-vpv-blue underline underline-offset-2">
            two-minute assessment
          </Link>{" "}
          recommends one.
        </p>
      </div>

      <div id="buy-form" className="mx-auto grid max-w-6xl gap-8 px-5 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-16">
        <div id="buy-fields" className="space-y-6">
          {/* ───────── 1. plan ───────── */}
          <Section n={1} icon={Layers} title="Your plan" aside={<BillingSwitch value={f.billing} onChange={(v) => set("billing", v)} />}>
            <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-3">
              {SITE_PLAN_DISPLAY_ORDER.map((id) => {
                const p = SITE_PLANS[id];
                const on = f.plan === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("plan", id)}
                    className={`flex h-full flex-col rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vpv-blue/40 ${
                      on ? "border-vpv-blue bg-vpv-tint/60 shadow-[0_10px_26px_-16px_rgba(20,104,216,0.8)]" : "border-vpv-line bg-white hover:border-vpv-blue/40"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-vpv-ink">{p.name}</span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${on ? "border-vpv-blue bg-vpv-blue text-white" : "border-slate-300"}`}>
                        {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                      </span>
                    </span>
                    <span className="mt-2 block text-[22px] font-semibold leading-none tabular-nums text-vpv-navy">
                      {f.billing === "lifetime" ? inr(planPrice(id, offerOpen, "lifetime")) : inr(planMonthly(id, offerOpen))}
                    </span>
                    <span className="mt-1 block text-[12px] leading-snug text-slate-500">
                      {f.billing === "lifetime" ? "once, + GST" : `per month + GST, billed yearly (${inr(planPrice(id, offerOpen))})`}
                    </span>
                    <span className="mt-3 block text-[12.5px] leading-relaxed text-slate-600">
                      {p.scenes} areas
                      {p.videos > 0 ? ` · ${p.videos} process videos` : ""}
                      {p.pdfs > 0 ? ` · ${p.pdfs} lab reports` : ""}
                      {` · ${hoursLabel(p.shootHours)} of shoot time`}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-1.5 pt-3">
                      <Chip on={p.sharingControls}>Security features</Chip>
                      <Chip on={p.freeSalesLogins > 0}>{p.freeSalesLogins > 0 ? `${p.freeSalesLogins} salesperson` : "No salesperson"}</Chip>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
              {f.billing === "lifetime"
                ? `Lifetime: you pay for the plan once and it is yours for life. ${SUPPORT_NAME} is billed yearly at ${inr(SUPPORT_ANNUAL_INR)} + GST (${inr(SUPPORT_MONTHLY_INR)}/month)`
                : `Yearly: your plan renews every year. ${SUPPORT_NAME} is billed yearly at ${inr(SUPPORT_ANNUAL_INR)} + GST (${inr(SUPPORT_MONTHLY_INR)}/month)`}
              {offerOpen ? `, and free for your first ${founding ? quote.firstMonths : 12} months as one of our first ${LAUNCH_OFFER.limit} customers.` : "."}
            </p>
          </Section>

          {/* ───────── 2. extras ───────── */}
          <Section n={2} icon={Camera} title="Extras" aside={<span className="text-[12.5px] text-slate-500">Everything is optional</span>}>
            <div className="space-y-5">
              <ExtraRow
                title="Extra areas"
                hint={AOA_HINT}
                note={`${plan.scenes} areas are included. ${f.extraAreas > 0 ? `${quote.totalAreas} in total, ${inr(extraAreaCost(f.plan, f.extraAreas, f.billing))}${f.billing === "annual" ? " a year" : ", once"}.` : `From ${inr(extraAreaCost(f.plan, 1, f.billing))} each${f.billing === "annual" ? " a year" : ""}, cheaper in bulk.`}`}
              >
                <Counter value={f.extraAreas} onChange={(n) => set("extraAreas", n)} max={EXTRA_AREA_MAX} />
              </ExtraRow>

              <ExtraRow
                title="Process videos you already have"
                note={`${plan.videos > 0 ? `${plan.videos} included with ${plan.name}, then ${inr(VIDEO_SELF_INR)} each. ` : `${inr(VIDEO_SELF_INR)} each. `}${VIDEO_SELF_NOTE}`}
              >
                <Counter value={f.selfVideos} onChange={(n) => set("selfVideos", n)} max={EXTRA_VIDEO_MAX} />
              </ExtraRow>

              <ExtraRow title="Process videos we shoot for you" note={`${inr(VIDEO_SHOT_INR)} each. ${VIDEO_SHOT_NOTE}`}>
                <Counter value={f.shotVideos} onChange={(n) => set("shotVideos", n)} max={EXTRA_VIDEO_MAX} />
              </ExtraRow>

              <div className="rounded-2xl border border-vpv-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[14.5px] font-semibold text-vpv-ink">
                      <ShieldCheck className="h-4 w-4 text-vpv-blue" aria-hidden />
                      Security features
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{SECURITY_ADDON.includes}. Keep your tour away from competitors.</p>
                  </div>
                  {plan.sharingControls ? (
                    <span className="rounded-full bg-vpv-tint px-3 py-1 text-[12.5px] font-semibold text-vpv-blue">Included in {plan.name}</span>
                  ) : addonAllowed ? (
                    <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-vpv-ink">
                      <input type="checkbox" checked={f.security} onChange={(e) => set("security", e.target.checked)} className="h-5 w-5 rounded border-slate-300 accent-[#1468D8]" />
                      Add for {inr(SECURITY_ADDON.monthlyInr)}/month
                    </label>
                  ) : (
                    <span className="max-w-[16rem] text-right text-[12.5px] text-slate-500">For a plan you pay yearly. On a lifetime plan, choose Premium, which includes them.</span>
                  )}
                </div>
                {addonAllowed && (
                  <p className="mt-2 text-[12.5px] text-slate-500">
                    Billed yearly: {inr(SECURITY_ADDON.yearlyInr)} + GST a year, renewing with your plan.
                  </p>
                )}
                {comparison && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-vpv-canvas px-3.5 py-3 text-[13px] leading-relaxed text-slate-700">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-vpv-blue" aria-hidden />
                    <span>
                      Light with Security features is {inr(lightPlus)} a year. {premium.name} is {inr(planPrice("premium", offerOpen))} a year and already includes them, with {premium.scenes} areas, {premium.videos} process videos, a salesperson login and a free update shoot. Choose what suits you.
                    </span>
                  </p>
                )}
              </div>

              <ExtraRow
                title="Salesperson logins"
                note={
                  plan.freeSalesLogins > 0
                    ? `${plan.freeSalesLogins} included with ${plan.name}. More are ${inr(seatPrice(offerOpen))} per login per year${offerOpen ? ` (then ${inr(SALES_TEAM.regularInr)})` : ""}, each with the MD's sales dashboard.`
                    : `${plan.name} has none included. Each login is ${inr(seatPrice(offerOpen))} per year${offerOpen ? ` (then ${inr(SALES_TEAM.regularInr)})` : ""}, with the MD's sales dashboard. Renews yearly with support.`
                }
                icon={Users}
              >
                <Counter value={f.salesSeats} onChange={(n) => set("salesSeats", n)} max={SALES_TEAM.maxSeats} />
              </ExtraRow>
            </div>
          </Section>

          {/* ───────── 3. you ───────── */}
          <Section n={3} icon={UserRound} title="About you" data-clarity-mask="true">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" required error={show("name")}>
                <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Phone" required error={show("phone")} hint="We call this number to agree the shoot date.">
                <TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98xxxxxxxx" />
              </Field>
            </div>
            <div className="mt-4">
              <Field
                label="Work e-mail"
                required
                error={show("email")}
                hint="Your invoice, workspace link and first password go here."
              >
                <TextInput
                  type="email"
                  value={f.email}
                  onChange={(e) => {
                    set("email", e.target.value);
                    if (norm(e.target.value) !== norm(f.verifiedEmail)) setOtp("unsent");
                  }}
                  autoComplete="email"
                />
              </Field>
              <div className="mt-3">
                {emailOk ? (
                  <p className="flex items-center gap-2 rounded-xl border border-vpv-line bg-vpv-tint/50 px-4 py-3 text-[14px] font-medium text-vpv-blue">
                    <Check className="h-4 w-4" aria-hidden /> {f.email} is confirmed
                  </p>
                ) : otp === "sent" || otp === "verifying" ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-44">
                      <Field label="Six-digit code" error={otpError ?? undefined}>
                        <TextInput value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" />
                      </Field>
                    </div>
                    <button type="button" onClick={() => void verifyCode()} disabled={code.length !== 6 || otp === "verifying"} className="rounded-full bg-vpv-navy px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-45">
                      {otp === "verifying" ? "Checking…" : "Confirm"}
                    </button>
                    <button type="button" onClick={() => void sendCode()} className="text-[13px] font-medium text-vpv-blue underline underline-offset-2">
                      Send a new code
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => void sendCode()} disabled={otp === "sending"} className="inline-flex items-center gap-2 rounded-full border border-vpv-blue px-5 py-2.5 text-[14px] font-semibold text-vpv-blue transition-colors hover:bg-vpv-tint disabled:opacity-45">
                      <Mail className="h-4 w-4" aria-hidden />
                      {otp === "sending" ? "Sending…" : "E-mail me a code"}
                    </button>
                    {otpError && <span role="alert" className="text-[12.5px] font-medium text-red-600">{otpError}</span>}
                    {tried && !otpError && problems.email_confirmed && !problems.email && <span role="alert" className="text-[12.5px] font-medium text-red-600">{problems.email_confirmed}</span>}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ───────── 4. billing and GST ───────── */}
          <Section n={4} icon={Receipt} title="Billing and GST invoice" data-clarity-mask="true">
            <p className="mb-4 rounded-xl bg-vpv-canvas px-4 py-3 text-[13.5px] leading-relaxed text-slate-700">
              Your tax invoice carries your GSTIN, so your business can claim the GST back as input tax credit. Enter the name, GSTIN and address exactly as they are on your GST certificate.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name on the invoice" required error={show("company")}>
                <TextInput
                  value={f.company}
                  onChange={(e) => {
                    set("company", e.target.value);
                    if (!f.slug || f.slug === workspaceSlug(f.company)) set("slug", workspaceSlug(e.target.value));
                  }}
                  autoComplete="organization"
                />
              </Field>
              <Field
                label="GSTIN"
                error={show("gstin")}
                hint={gstinOk ? undefined : "Leave blank if you are not GST-registered."}
              >
                <TextInput value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15))} placeholder="22AAAAA0000A1Z5" spellCheck={false} autoCapitalize="characters" />
                {gstinOk && (
                  <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Valid · registered in {gstinState}
                    {gstinEntityLabel(gstin) ? ` · ${gstinEntityLabel(gstin)}` : ""}
                  </span>
                )}
              </Field>
            </div>
            <div className="mt-4 grid gap-4">
              <Field label="Billing address" required error={show("billLine")} hint="Building, street or plot. As on your GST certificate.">
                <TextInput value={f.billLine} onChange={(e) => set("billLine", e.target.value)} autoComplete="address-line1" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="City" required error={show("billCity")}>
                  <TextInput value={f.billCity} onChange={(e) => set("billCity", e.target.value)} autoComplete="address-level2" />
                </Field>
                <Field label="PIN code" required error={show("billPin")}>
                  <TextInput value={f.billPin} onChange={(e) => set("billPin", e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="postal-code" />
                </Field>
                <Field label="State" required error={show("billState")} hint={gstinOk ? "Taken from your GSTIN." : undefined}>
                  <SelectInput value={gstinState ?? f.billState} onChange={(e) => set("billState", e.target.value)} disabled={gstinOk}>
                    <option value="">Choose your state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
            </div>
            <GstNote placeState={placeState} />
          </Section>

          {/* ───────── 5. shoot site ───────── */}
          <Section n={5} icon={MapPin} title="Where we shoot" data-clarity-mask="true">
            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-vpv-ink">
              <input type="checkbox" checked={f.sameSite} onChange={(e) => set("sameSite", e.target.checked)} className="h-5 w-5 rounded border-slate-300 accent-[#1468D8]" />
              The plant is at my billing address
            </label>
            {!f.sameSite && (
              <div className="mt-4 grid gap-4">
                <Field label="Plant address" required hint="Where our crew should go: building, street or plot.">
                  <TextInput value={f.siteLine} onChange={(e) => set("siteLine", e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="City" required>
                    <TextInput value={f.siteCity} onChange={(e) => set("siteCity", e.target.value)} />
                  </Field>
                  <Field label="PIN code" required>
                    <TextInput value={f.sitePin} onChange={(e) => set("sitePin", e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
                  </Field>
                  <Field label="State">
                    <SelectInput value={f.siteState} onChange={(e) => set("siteState", e.target.value)}>
                      <option value="">Choose</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
                <Field label="Landmark" hint="Optional: it helps the driver find the gate.">
                  <TextInput value={f.landmark} onChange={(e) => set("landmark", e.target.value)} />
                </Field>
                {show("site") && <p role="alert" className="text-[12.5px] font-medium text-red-600">{problems.site}</p>}
                <p className="rounded-xl bg-vpv-canvas px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
                  Your invoice is billed to your registered address above. We print this plant address on it as the address of delivery.
                </p>
              </div>
            )}
            {show("city") && <p role="alert" className="mt-3 text-[12.5px] font-medium text-red-600">{problems.city}</p>}
            {cityServed && logistics && (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-emerald-700">
                <Check className="h-4 w-4" aria-hidden /> We shoot in {logistics.city}.
              </p>
            )}

            <div className="mt-6 border-t border-vpv-line pt-5">
              <p className="text-[14px] font-semibold text-vpv-ink">Who will be at the plant on the day?</p>
              <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-[14px] text-slate-700">
                <input type="checkbox" checked={f.sameContact} onChange={(e) => set("sameContact", e.target.checked)} className="h-5 w-5 rounded border-slate-300 accent-[#1468D8]" />
                Me ({f.name.trim() || "the name above"})
              </label>
              {!f.sameContact && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Name" required>
                    <TextInput value={f.siteContactName} onChange={(e) => set("siteContactName", e.target.value)} />
                  </Field>
                  <Field label="Phone" required error={show("contact")}>
                    <TextInput value={f.siteContactPhone} onChange={(e) => set("siteContactPhone", e.target.value)} inputMode="tel" />
                  </Field>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-vpv-line pt-5">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-vpv-ink">
                <CalendarDays className="h-4 w-4 text-vpv-blue" aria-hidden /> When would you like the shoot?
              </p>
              <div role="radiogroup" aria-label="When to shoot" className="mt-3 grid gap-2 sm:grid-cols-2">
                {SHOOT_WINDOWS.map((w) => (
                  <label key={w.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[14px] ${f.window === w.id ? "border-vpv-blue bg-vpv-tint/60 text-vpv-ink" : "border-vpv-line text-slate-700"}`}>
                    <input type="radio" name="window" checked={f.window === w.id} onChange={() => set("window", w.id)} className="accent-[#1468D8]" />
                    {w.label}
                  </label>
                ))}
              </div>
              {f.window === "from_date" && (
                <div className="mt-3 max-w-xs">
                  <Field label="Date" error={show("window")}>
                    <TextInput type="date" min={todayIst()} value={f.fromDate} onChange={(e) => set("fromDate", e.target.value)} />
                  </Field>
                </div>
              )}
              <p className="mt-3 text-[12.5px] text-slate-500">We call you within two working days of payment to fix the exact day.</p>
              <div className="mt-4">
                <Field label="Anything our crew should know?" hint="Optional: shifts, visitor passes, areas that are off limits.">
                  <textarea
                    value={f.notes}
                    onChange={(e) => set("notes", e.target.value.slice(0, 500))}
                    rows={3}
                    className="w-full rounded-xl border border-vpv-line bg-white px-3.5 py-2.5 text-[15px] text-vpv-ink outline-none transition-colors placeholder:text-slate-400 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/15"
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* ───────── 6. address and pay ───────── */}
          <WorkspaceAddressCard company={f.company} slug={f.slug} onChange={(s) => set("slug", s)} onStatus={setSlugStatus} />

          <Section n={6} icon={Lock} title="Confirm and pay">
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-relaxed text-slate-700">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#1468D8]" />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-vpv-blue underline underline-offset-2">Terms</Link>, the{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-vpv-blue underline underline-offset-2">Privacy Policy</Link> and the{" "}
                  <Link href="/refund-policy" target="_blank" className="font-medium text-vpv-blue underline underline-offset-2">Refund Policy</Link>.
                </span>
              </label>
              {show("terms") && <p role="alert" className="text-[12.5px] font-medium text-red-600">{problems.terms}</p>}
              <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-relaxed text-slate-600">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#1468D8]" />
                <span>Send me occasional product news. Optional; you can stop it any time.</span>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-slate-500">
              <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-vpv-blue" aria-hidden /> Secure payment by Razorpay. We never see your card.</span>
              <span className="flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5 text-vpv-blue" aria-hidden /> GST tax invoice by e-mail</span>
            </div>
            {pay.testMode && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-800">Razorpay is in test mode. No real money will move.</p>}
          </Section>
        </div>

        {/* ───────── the bill ───────── */}
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Your bill">
          <Card className="!p-5 sm:!p-6">
            <h2 className="text-[17px] font-semibold text-vpv-ink">Your bill</h2>
            {offerClosedNotice && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
                The special offer for our first {LAUNCH_OFFER.limit} customers has just closed, so the total below is the regular price. Press Pay again when you are happy with it.
              </p>
            )}
            <ul className="mt-4 divide-y divide-vpv-line text-[13.5px]">
              {quote.lines.map((l, i) => (
                <li key={`${l.label}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0 text-slate-700">
                    {l.label}
                    {l.note && l.kind !== "plan" && <span className="block text-[11.5px] leading-snug text-slate-500">{l.note}</span>}
                  </span>
                  <span className={`shrink-0 tabular-nums ${l.amountInr < 0 ? "text-emerald-700" : "text-vpv-ink"}`}>
                    {l.regularInr && l.amountInr === 0 ? (
                      <>
                        <s className="mr-1 text-slate-400">{inr(l.regularInr)}</s>Free
                      </>
                    ) : l.amountInr === 0 ? (
                      "Included"
                    ) : l.amountInr < 0 ? (
                      `−${inr(-l.amountInr)}`
                    ) : (
                      inr(l.amountInr)
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-vpv-line pt-4 text-[13.5px]">
              <Row k="Taxable value" v={inr2(quote.taxableInr)} />
              {tax ? (
                tax.kind === "intra" ? (
                  <>
                    <Row k="CGST @ 9%" v={inr2(tax.cgst)} />
                    <Row k="SGST @ 9%" v={inr2(tax.sgst)} />
                  </>
                ) : (
                  <Row k="IGST @ 18%" v={inr2(tax.igst)} />
                )
              ) : (
                <Row k="GST @ 18%" v={inr2(quote.gstInr)} />
              )}
              <div className="flex items-baseline justify-between gap-3 border-t border-vpv-line pt-3">
                <dt className="text-[15px] font-semibold text-vpv-ink">Total to pay</dt>
                <dd className="text-[24px] font-semibold tabular-nums text-vpv-navy" data-testid="buy-total">{inr2(quote.totalInr)}</dd>
              </div>
            </dl>
            {placeState && <p className="mt-2 text-[12px] text-slate-500">Place of supply: {stateWithCode(placeState)}.</p>}
            <p className="mt-3 rounded-xl bg-vpv-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {quote.billing === "lifetime" ? (
                <>
                  Your plan is yours for life. From the second year only {SUPPORT_NAME.toLowerCase()} renews, at {inr(SUPPORT_ANNUAL_INR)} + GST a year
                  {quote.salesSeats > 0 ? `, plus ${inr(quote.salesSeats * seatPrice(offerOpen))} for your sales logins` : ""}.
                </>
              ) : (
                <>
                  Every year your plan{quote.extraAreas > 0 ? " and its extra areas" : ""}
                  {quote.securityAddon ? ", Security features" : ""} and {SUPPORT_NAME.toLowerCase()} renew together at {inr(quote.yearlyInr)} + {inr(SUPPORT_ANNUAL_INR)} + GST
                  {quote.salesSeats > 0 ? `, plus ${inr(quote.salesSeats * seatPrice(offerOpen))} for your sales logins` : ""}.
                </>
              )}{" "}
              We remind you before anything is due. Travel, shoot time and process videos are one-off.
            </p>

            <div className="mt-4 border-t border-vpv-line pt-4">
              {coupon ? (
                <p className="flex items-center justify-between text-[13px] text-emerald-700">
                  <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" aria-hidden /> {coupon.code} applied</span>
                  <button type="button" onClick={() => setCoupon(null)} className="text-slate-500 underline underline-offset-2">Remove</button>
                </p>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <TextInput value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Coupon code" aria-label="Coupon code" className="!py-2" />
                    <button type="button" onClick={() => void applyCoupon()} disabled={couponBusy || !couponInput.trim()} className="rounded-xl border border-vpv-line px-4 text-[13.5px] font-semibold text-vpv-navy disabled:opacity-45">
                      Apply
                    </button>
                  </div>
                  {couponError && <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-red-600">{couponError}</p>}
                </div>
              )}
            </div>

            <div className="mt-5 hidden lg:block">
              <PayButton onClick={() => void onPay()} busy={pay.busy || pendingPay} total={quote.totalInr} />
            </div>
            {tried && firstProblem && <p role="alert" className="mt-3 text-[12.5px] font-medium text-red-600">{firstProblem}</p>}
            {pay.error && <p role="alert" className="mt-3 text-[12.5px] font-medium text-red-600">{pay.error}</p>}
            {pay.notice && <p className="mt-3 text-[12.5px] text-slate-600">{pay.notice}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-500"><Building2 className="h-3.5 w-3.5" aria-hidden /> Sold by {COMPANY.legalName}, GSTIN {COMPANY.gstin}.</p>
          </Card>
        </aside>
      </div>

      {/* a bar for phones: the total and the button stay in reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-vpv-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div>
            <p className="text-[11.5px] text-slate-500">Total with GST</p>
            <p className="text-[19px] font-semibold tabular-nums text-vpv-navy">{inr2(quote.totalInr)}</p>
          </div>
          <PayButton onClick={() => void onPay()} busy={pay.busy || pendingPay} total={quote.totalInr} compact />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── small parts ───────────────────────────── */

function Section({
  n,
  icon: Icon,
  title,
  aside,
  children,
  ...rest
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card {...rest}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-[18px] font-semibold text-vpv-ink">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-vpv-tint text-vpv-blue">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
          </span>
          <span>
            <span className="mr-2 text-[13px] font-semibold text-slate-400">{n}</span>
            {title}
          </span>
        </h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${on ? "bg-vpv-tint text-vpv-blue" : "bg-slate-100 text-slate-500"}`}>
      {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
      {children}
    </span>
  );
}

function ExtraRow({ title, note, hint, icon: Icon = Film, children }: { title: string; note: string; hint?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-vpv-line bg-white p-4">
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-vpv-ink">
          <Icon className="h-4 w-4 text-vpv-blue" aria-hidden />
          {title}
          {hint && (
            <span title={hint} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600" aria-label={hint}>
              ?
            </span>
          )}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{note}</p>
      </div>
      {children}
    </div>
  );
}

function BillingSwitch({ value, onChange }: { value: PurchaseBilling; onChange: (v: PurchaseBilling) => void }) {
  const opt = (v: PurchaseBilling, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${value === v ? "bg-vpv-navy text-white" : "text-slate-600 hover:text-vpv-navy"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="How you pay" className="inline-flex rounded-full border border-vpv-line bg-white p-1">
      {opt("annual", "Yearly")}
      {opt("lifetime", "Lifetime, pay once")}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{k}</dt>
      <dd className="tabular-nums text-vpv-ink">{v}</dd>
    </div>
  );
}

function GstNote({ placeState }: { placeState: string | null }) {
  const same = placeState && placeState.toLowerCase() === COMPANY.state.toLowerCase();
  return (
    <div className="mt-4 rounded-xl border border-vpv-line bg-white px-4 py-3 text-[13px] leading-relaxed text-slate-600" aria-live="polite">
      <p className="font-medium text-vpv-ink">Which GST you pay</p>
      <p className="mt-1">
        GST is charged on the state of your GST registration. We are registered in {COMPANY.state}: a business in {COMPANY.state} pays CGST 9% + SGST 9%; a business in any other state pays IGST 18%. It is the same 18% either way.
      </p>
      {placeState && (
        <p className="mt-2 font-medium text-vpv-navy">
          {placeState}: you will be charged {same ? "CGST 9% + SGST 9%" : "IGST 18%"}.
        </p>
      )}
    </div>
  );
}

function PayButton({ onClick, busy, total, compact = false }: { onClick: () => void; busy: boolean; total: number; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`rounded-full bg-vpv-grad font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vpv-blue/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        compact ? "px-6 py-3 text-[14.5px]" : "w-full px-7 py-3.5 text-[15px]"
      }`}
      data-testid="buy-pay"
    >
      {busy ? "Just a moment…" : compact ? "Pay now" : `Pay ${inr2(total)} securely`}
    </button>
  );
}
