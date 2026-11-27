/**
 * Step 4 of the funnel — the recommended plan and the add-ons.
 *
 * Two things on this screen, in the order a buyer decides:
 *
 *   1. THE PLAN, revealed as a deep navy card with the gold special-offer
 *      seal: regular price struck through, the offer price, and the saving.
 *      The gold seal is the single loudest object in the funnel.
 *   2. THE ADD-ONS, each with its own price: extra areas (the price of the
 *      next one on the left, a slider to 500 on the right, a small chip of
 *      the lower prices unlocked as they add) and process videos (the total
 *      on the left, a ₹99 and a ₹499 slider side by side). The message is
 *      that what the plan includes is already theirs; they pay for extras.
 *
 * The bill sits underneath, with what is free and what is saved set large.
 * Time on site is not shown as a block (it is still priced by the hour, as a
 * line on the bill when a plan's hours are exceeded). Every figure comes
 * from siteQuote() in lib/pricing.ts — the
 * same function /api/billing/order charges the card with — and the special
 * offer is shown only while the server's real count says it is open.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent, Camera, Check, Clock, FileText, Layers, Lock, Receipt, Star, UserCheck, Video,
} from "lucide-react";
import {
  BackLink,
  Card,
  ComingSoonCity,
  FunnelBody,
  FunnelHeader,
  OfferSeal,
  PrimaryButton,
  RestartNotice,
  SectionTitle,
  useOfferState,
} from "@/components/funnel/FunnelShell";
import {
  EXTRA_AREA_MAX,
  EXTRA_VIDEO_MAX,
  LAUNCH_OFFER,
  ENTERPRISE_PERSONAL,
  SITE_PLANS,
  SITE_PLAN_DISPLAY_ORDER,
  AOA_HINT,
  VIDEO_SELF_INR,
  VIDEO_SELF_NOTE,
  VIDEO_SHOT_INR,
  VIDEO_SHOT_NOTE,
  videoShotWasLabel,
  discountBands,
  extraAreaCost,
  extrasSaving,
  hoursLabel,
  inr,
  nextExtraAreaPrice,
  planMonthly,
  planPrice,
  regularPlanPrice,
  SUPPORT_MONTHLY_INR,
  type PurchaseBilling,
  siteQuote,
  type SitePlanId,
  type SoldPlanId,
  infoIconsLabel,
  PLAN_PERKS,
  linkControlLabels,
} from "@/lib/pricing";
import { loadFunnel, mirrorLead, recommendPlan, saveFunnel, type FunnelState } from "@/lib/funnel";
import BillingSwitch from "@/components/funnel/BillingSwitch";

/**
 * A slider with a stepper either side. A range of hundreds is too coarse to
 * land on one number by dragging alone, so − and + (and the arrow keys) move
 * it a single step.
 */
function Slider({
  value,
  onChange,
  max,
  label,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  label: string;
  id: string;
}) {
  const pct = (value / max) * 100;
  const step = (d: number) => onChange(Math.max(0, Math.min(max, value + d)));
  const btn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-vpv-line bg-white text-[18px] font-semibold leading-none text-vpv-blue transition hover:border-vpv-blue/50 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-vpv-blue/50";
  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} aria-label={`One fewer: ${label}`} disabled={value <= 0} onClick={() => step(-1)}>
          −
        </button>
        <input
          id={id}
          aria-label={label}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full accent-vpv-blue"
          style={{ backgroundImage: `linear-gradient(90deg, #1468D8 ${pct}%, #EAF2FE ${pct}%)` }}
        />
        <button type="button" className={btn} aria-label={`One more: ${label}`} disabled={value >= max} onClick={() => step(1)}>
          +
        </button>
      </div>
      <div className="mt-1.5 flex justify-between px-12 text-[11.5px] text-slate-400">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/**
 * A small navy-and-gold chip: the lower prices a buyer unlocks as they add
 * extra areas. Light on the page on purpose; it shows each step, whether it
 * is reached, and what has been saved so far.
 */
function UnlockChip({
  planId,
  extraAreas,
  billing,
}: {
  planId: SitePlanId;
  extraAreas: number;
  billing: PurchaseBilling;
}) {
  const later = discountBands(planId, true, billing).slice(1);
  const saving = extrasSaving(planId, extraAreas, true, billing);
  const next = later.find((b) => extraAreas < b.from);
  return (
    <div
      data-testid="unlock-chip"
      className="mt-6 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-vpv-navy px-4 py-2.5 text-white shadow-[0_10px_24px_-16px_rgba(11,61,145,0.8)]"
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#FFE7A0]">
        <BadgePercent className="h-4 w-4" aria-hidden /> Unlock lower prices
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {later.map((b) => {
          const reached = extraAreas >= b.from;
          return (
            <li
              key={b.from}
              data-reached={reached ? "true" : "false"}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold tabular-nums ${
                reached ? "bg-[#F6D87A] text-[#4A3300]" : "border border-white/30 text-white/80"
              }`}
            >
              {reached ? <Check className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
              {b.from}+ extra · {b.percentOff}% off
            </li>
          );
        })}
      </ul>
      <span className="text-[12px] text-white/80">
        {saving > 0 ? (
          <>You save <strong className="text-[#FFE7A0]">{inr(saving)}</strong></>
        ) : next ? (
          <>Add {next.from - extraAreas} more for {inr(next.each)} each</>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A "?" beside a term the buyer is not expected to know, with the
 * explanation on hover, on keyboard focus, and on tap — focus-within is
 * what makes it work on a phone, where there is no hover.
 */
function Hint({ text, onLight = false }: { text: string; onLight?: boolean }) {
  return (
    <span className="group relative inline-flex align-middle focus-within:z-20 hover:z-20">
      <button
        type="button"
        aria-label={text}
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[11px] font-bold leading-none transition focus:outline-none focus-visible:ring-2 ${
          onLight
            ? "border-slate-400 text-slate-500 hover:border-vpv-blue hover:text-vpv-blue focus-visible:ring-vpv-blue/50"
            : "border-white/45 text-white/80 hover:border-white hover:text-white focus-visible:ring-white/70"
        }`}
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 w-[248px] -translate-x-1/2 rounded-xl border border-vpv-line bg-white px-3 py-2.5 text-left text-[12.5px] font-normal leading-relaxed text-vpv-ink opacity-0 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export default function Step4Plan() {
  const router = useRouter();
  const offer = useOfferState();
  const [s, setS] = useState<FunnelState | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    const loaded = loadFunnel();
    const rec = recommendPlan(loaded);
    setS({
      ...loaded,
      chosenPlan: loaded.chosenPlan ?? rec.plan,
      extraAreas: loaded.chosenPlan ? loaded.extraAreas : rec.extraAreas,
      selfVideos: loaded.selfVideos,
      shotVideos: loaded.shotVideos,
    });
  }, []);

  const rec = useMemo(() => (s ? recommendPlan(s) : null), [s]);
  const planId: SoldPlanId = s?.chosenPlan ?? "premium";
  const offerOpen = offer.open && LAUNCH_OFFER.active;
  const founding = offer.founding && offerOpen;
  const billing: PurchaseBilling = s?.billing ?? "annual";
  const quote = useMemo(
    () =>
      s
        ? siteQuote(planId, {
            extraAreas: s.extraAreas,
            selfVideos: s.selfVideos,
            shotVideos: s.shotVideos,
            city: s.factoryCity,
            offerOpen,
            founding,
            billing,
            // Asked on the step before this one, so the total is the real one.
            salesSeats: s.hasSalesTeam ? s.salesSeats : 0,
          })
        : null,
    [s, planId, offerOpen, founding, billing]
  );

  function pick(id: SoldPlanId) {
    if (!s) return;
    // Extra areas are priced per plan, so carrying a count across would
    // silently change what it costs: that slider starts again. Videos cost
    // the same on every plan, so the buyer's answer from the scope step stays.
    setS({ ...s, chosenPlan: id, extraAreas: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit() {
    if (!s || !quote) return;
    setBusy(true);
    const saved = saveFunnel({ chosenPlan: planId, billing, extraAreas: s.extraAreas, selfVideos: s.selfVideos, shotVideos: s.shotVideos });
    await mirrorLead("plan", saved, { recommendedPlan: rec?.plan });
    router.push("/assessment/billing");
  }

  const header = (title: string, summary?: string) => (
    <FunnelHeader
      step={4}
      title={title}
      summary={summary}
      image="vpv-preview"
      imageAlt="A real VPV screen: a factory floor with clickable hotspots"
      caption="What your buyers will see"
    />
  );

  if (!s || !quote || !rec) {
    return (
      <>
        {header("Your recommended plan")}
        <FunnelBody wide>
          <Card><div className="h-24 animate-pulse rounded-xl bg-vpv-canvas" /></Card>
        </FunnelBody>
      </>
    );
  }

  if (!s.factoryCity || s.wantsSharingControls === null) {
    return (
      <>
        {header("Your recommended plan")}
        <FunnelBody><RestartNotice missing="your earlier answers" /></FunnelBody>
      </>
    );
  }

  const plan = SITE_PLANS[planId];
  const isRecommended = planId === rec.plan;
  const life = billing === "lifetime";
  const price = planPrice(planId, offerOpen, billing);
  const regular = regularPlanPrice(planId, billing);
  const monthly = planMonthly(planId, offerOpen);
  const areasCost = extraAreaCost(planId, s.extraAreas, billing);
  const selfIncluded = Math.min(s.selfVideos, plan.videos);
  const selfExtra = Math.max(0, s.selfVideos - plan.videos);
  const videosCost = selfExtra * VIDEO_SELF_INR + s.shotVideos * VIDEO_SHOT_INR;
  // The price of the next extra area: it falls as bands are reached.
  const nextAreaPrice = nextExtraAreaPrice(planId, Math.min(s.extraAreas, EXTRA_AREA_MAX - 1), billing);

  const inclusions: { icon: typeof Layers; text: string; strong?: boolean; hint?: string }[] = [
    ...(SITE_PLANS[planId].personal
      ? [{ icon: Star, text: ENTERPRISE_PERSONAL.discussion.short, strong: true }]
      : []),
    {
      icon: Layers,
      text: `${plan.scenes} AOAs (Active Operational Areas)`,
      hint: AOA_HINT,
    },
    {
      icon: Video,
      text: plan.videos > 0 ? `${plan.videos} process videos` : "Process videos as add-ons",
      hint:
        plan.videos > 0
          ? `Upload ${plan.videos} videos you already have at no extra cost, then ${inr(VIDEO_SELF_INR)} each. Want us to shoot one instead? ${inr(VIDEO_SHOT_INR)} a video.`
          : `Upload your own for ${inr(VIDEO_SELF_INR)} a video, or we shoot it for ${inr(VIDEO_SHOT_INR)}.`,
    },
    { icon: FileText, text: plan.pdfs > 0 ? `${plan.pdfs} lab reports & certifications` : "Lab reports & certifications as add-ons" },
    { icon: Clock, text: `${hoursLabel(plan.shootHours)} of shoot time on site` },
    { icon: Check, text: "Information icons on every hotspot" },
    { icon: Check, text: "Your own branded workspace and domain" },
    founding
      ? { icon: Check, text: `Support, hosting & security free for ${quote.firstMonths} months`, strong: true }
      : { icon: Check, text: `Support, hosting & security: ${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly` },
    ...(plan.freeSalesLogins > 0 ? [{ icon: UserCheck, text: PLAN_PERKS.salesLogin.row, strong: true, hint: PLAN_PERKS.salesLogin.note }] : []),
    ...(plan.updateShoots > 0 ? [{ icon: Camera, text: PLAN_PERKS.updateShoot.row, strong: true, hint: PLAN_PERKS.updateShoot.note }] : []),
  ];

  return (
    <>
      {header(
        isRecommended ? `We recommend ${plan.name}` : `You chose ${plan.name}`,
        isRecommended
          ? "The lowest plan that covers everything you picked. You can add to it below, or compare the others."
          : "A different plan from the one we suggested, which is entirely your call."
      )}
      <FunnelBody wide>
        {/* ── The plan ─────────────────────────────────────────────── */}
        <div className="relative">
          {offerOpen && (
            <OfferSeal size={136} className="absolute -right-3 -top-12 z-10 sm:-right-6 sm:-top-14" />
          )}
          <div className="overflow-hidden rounded-[26px] bg-vpv-grad-soft text-white shadow-[0_40px_80px_-40px_rgba(11,61,145,0.75)]">
            <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_1.05fr]">
              <div>
                <p className="text-[14px] font-medium text-white/70">{isRecommended ? "Recommended for you" : "Your choice"}</p>
                <h2 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">{plan.name}</h2>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-white/80">{plan.tagline}</p>

                <div className="mt-8">
                  <div className="mb-5 inline-flex rounded-full bg-white px-4 py-2 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]">
                    <BillingSwitch
                      value={billing}
                      onChange={(v) => {
                        // Saved straight away, so a reload or the back button keeps the choice.
                        setS({ ...s, billing: v });
                        saveFunnel({ billing: v });
                      }}
                    />
                  </div>
                  {offerOpen && (
                    <p className="text-[17px] text-white/55 line-through decoration-white/50">
                      {life ? inr(regular) : `${inr(plan.regularMonthlyInr)}/month`}
                    </p>
                  )}
                  <p className="text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                    {life ? inr(price) : inr(monthly)}
                    <span className="ml-1 text-[18px] font-medium tracking-normal text-white/75">{life ? " once" : "/month"}</span>
                  </p>
                  <p className="mt-2 text-[13px] text-white/70">
                    {life
                      ? "One payment + 18% GST. Your plan is yours for life."
                      : `Billed yearly: ${inr(price)} + 18% GST. Renews every year at the same price.`}
                  </p>
                  {offerOpen && (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FFF2C4] px-4 py-1.5 text-[13.5px] font-semibold text-[#5A3D00]">
                      {life
                        ? `You save ${inr(regular - price)} as one of our first ${LAUNCH_OFFER.limit} customers`
                        : `You save ${inr(regular - price)} a year, every year, as one of our first ${LAUNCH_OFFER.limit} customers`}
                    </p>
                  )}
                  {founding && (
                    <ul className="mt-3 space-y-1.5 text-[13px] text-[#FFE7A0]">
                      <li>
                        ★ Founding {LAUNCH_OFFER.limit}:{" "}
                        {life
                          ? `support, hosting & security free for your first ${quote.firstMonths} months`
                          : `${LAUNCH_OFFER.freeMonths} months free (your first year runs ${quote.firstMonths} months), and support free for them`}
                        , plus a free cab to your plant
                        {offer.foundingRemaining != null ? ` · ${offer.foundingRemaining} of ${LAUNCH_OFFER.limit} places left` : ""}
                      </li>
                    </ul>
                  )}
                </div>
              </div>

              <ul className="grid content-start gap-3 rounded-2xl bg-white/[0.08] p-5 text-[14.5px] sm:p-6">
                {inclusions.map(({ icon: Icon, text, strong, hint }) => (
                  <li key={text} className={`flex items-center gap-3 ${strong ? "font-bold text-[#FFE7A0]" : ""}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="flex items-center gap-1.5">
                      {text}
                      {hint && <Hint text={hint} />}
                    </span>
                  </li>
                ))}
                <li className={`flex items-center gap-3 border-t border-white/15 pt-3 ${plan.sharingControls ? "font-semibold" : "text-white/55"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${plan.sharingControls ? "bg-white text-vpv-navy" : "bg-white/10"}`}>
                    <Lock className="h-4 w-4" aria-hidden />
                  </span>
                  {plan.sharingControls ? linkControlLabels(planId).join(" · ") : "Link controls: VPV Premium and up"}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {SITE_PLANS[planId].personal && (
          <div
            className="mt-5 grid gap-4 rounded-2xl border border-[#E9D49A] bg-[#FFF9E8] p-5 sm:grid-cols-2 sm:p-6"
            data-testid="enterprise-personal"
          >
            {[ENTERPRISE_PERSONAL.discussion, ENTERPRISE_PERSONAL.shoot].map((d) => (
              <div key={d.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F6E3A8] text-[#6B4A00]">
                  <Star className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[15.5px] font-semibold leading-snug text-[#4A3300]">{d.title}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#6B5420]">{d.long}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {isRecommended && rec.reasons.length > 0 && (
          <div className="mt-5 rounded-2xl border border-vpv-line bg-vpv-canvas px-6 py-5">
            <p className="text-[14px] font-semibold text-vpv-ink">Why this plan</p>
            <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-slate-700">
              {rec.reasons.map((r) => (
                <li key={r} className="flex gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-vpv-blue" aria-hidden />{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Add-ons ──────────────────────────────────────────────── */}
        <Card className="mt-8">
          <SectionTitle icon={Layers} title="Need more than that?">
            Everything above is already yours. You only pay for what you add here.
          </SectionTitle>

          {/* Areas: the price of the next extra area on the left (it falls
              as the buyer adds more), the slider and the count on the right. */}
          <div className="mt-7 grid items-center gap-8 lg:grid-cols-[1fr_1.5fr]" data-testid="addon-areas">
            <div className="rounded-2xl bg-vpv-canvas p-6 text-center">
              <p className="text-[13px] font-medium text-vpv-blue">Price per extra AOA right now</p>
              <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-vpv-ink" data-testid="extra-area-price">
                {inr(nextAreaPrice)}
              </p>
              <p className="mt-2.5 text-[13px] text-slate-600">{life ? "once, for life" : "a year"} + GST</p>
              {s.extraAreas > 0 && (
                <p className="mt-4 border-t border-vpv-line pt-3 text-[13.5px] text-slate-700">
                  {s.extraAreas} extra {s.extraAreas === 1 ? "AOA" : "AOAs"}: <strong className="text-vpv-ink">{inr(areasCost)}</strong>
                </p>
              )}
            </div>
            <div>
              <p className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-vpv-blue sm:text-[36px]">Need more AOAs?</p>
              <div className="mt-4">
                <Slider
                  id="extra-areas"
                  label="Extra AOAs"
                  value={s.extraAreas}
                  max={EXTRA_AREA_MAX}
                  onChange={(n) => setS({ ...s, extraAreas: n })}
                />
              </div>
              <p className="mt-3 text-[15px] text-vpv-ink" data-testid="total-areas">
                Total AOAs: <strong className="text-[20px]">{quote.totalAreas}</strong>
                <span className="text-slate-500">
                  {" "}= {plan.scenes} included in {plan.name} + {s.extraAreas} extra
                </span>
              </p>
            </div>
          </div>

          <UnlockChip planId={planId} extraAreas={s.extraAreas} billing={billing} />

          {/* Videos: the price of each is fixed, so the left side is the total
              cost; two ways to get one, side by side. Both land on THEIR
              YouTube channel. */}
          <div className="mt-9 grid items-center gap-8 border-t border-vpv-line pt-9 lg:grid-cols-[1fr_1.5fr]" data-testid="addon-videos">
            <div className="rounded-2xl bg-vpv-canvas p-6 text-center">
              <p className="text-[13px] font-medium text-vpv-blue">Your video add-ons</p>
              <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-vpv-ink" data-testid="video-total">
                {inr(videosCost)}
              </p>
              <p className="mt-2.5 text-[13px] text-slate-600">
                {videosCost > 0 ? "+ GST, paid once" : "Nothing extra to pay"}
              </p>
              <p className="mt-4 border-t border-vpv-line pt-3 text-[13.5px] text-slate-700">
                {s.selfVideos + s.shotVideos} process {s.selfVideos + s.shotVideos === 1 ? "video" : "videos"} in your VPV
              </p>
            </div>
            <div>
              <p className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-vpv-blue sm:text-[36px]">Need extra process videos?</p>
              <div className="mt-5 grid gap-7 sm:grid-cols-2">
                <div data-testid="addon-self-videos">
                  <p className="text-[13px] font-medium text-slate-600">Shoot yourself, we upload</p>
                  <p className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-vpv-ink">
                    {inr(VIDEO_SELF_INR)}<span className="ml-1 text-[14px] font-medium text-slate-500">each</span>
                  </p>
                  <div className="mt-4">
                    <Slider
                      id="self-videos"
                      label="Videos you already have"
                      value={s.selfVideos}
                      max={EXTRA_VIDEO_MAX}
                      onChange={(n) => setS({ ...s, selfVideos: n })}
                    />
                  </div>
                  <p className="mt-3 text-[14px] text-vpv-ink">
                    Total <strong>{s.selfVideos}</strong> {s.selfVideos === 1 ? "video" : "videos"}, worth{" "}
                    <strong>{inr(s.selfVideos * VIDEO_SELF_INR)}</strong>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                    <span className="font-semibold text-[#1F8A4C]">{selfIncluded} included free</span> with {plan.name}
                    {selfExtra > 0 && (
                      <>
                        {" "}+ <span className="font-semibold text-vpv-ink">{selfExtra} extra = {inr(selfExtra * VIDEO_SELF_INR)}</span>
                      </>
                    )}
                    <sup className="text-vpv-blue">*</sup>
                  </p>
                </div>
                <div data-testid="addon-shot-videos">
                  <p className="text-[13px] font-medium text-slate-600">We shoot for you</p>
                  <p className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-vpv-ink">
                    {videoShotWasLabel(offerOpen) && (
                      <s className="mr-2 text-[16px] font-normal text-slate-400">{videoShotWasLabel(offerOpen)}</s>
                    )}
                    {inr(VIDEO_SHOT_INR)}<span className="ml-1 text-[14px] font-medium text-slate-500">each</span>
                  </p>
                  <div className="mt-4">
                    <Slider
                      id="shot-videos"
                      label="Videos we shoot for you"
                      value={s.shotVideos}
                      max={EXTRA_VIDEO_MAX}
                      onChange={(n) => setS({ ...s, shotVideos: n })}
                    />
                  </div>
                  <p className="mt-3 text-[14px] text-vpv-ink">
                    Total <strong>{s.shotVideos}</strong> {s.shotVideos === 1 ? "video" : "videos"}, worth{" "}
                    <strong>{inr(s.shotVideos * VIDEO_SHOT_INR)}</strong>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                    {VIDEO_SHOT_NOTE}
                    <sup className="text-vpv-blue">*</sup>
                  </p>
                </div>
              </div>
              <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
                <sup className="text-vpv-blue">*</sup> {VIDEO_SELF_NOTE} The YouTube channel is yours, not ours. You keep
                control of every video on it and can change or remove one at any time — which also
                means what happens to it afterwards is outside our hands. See the{" "}
                <a href="/disclaimer" className="text-vpv-blue underline underline-offset-2">
                  disclaimer
                </a>
                .
              </p>
            </div>
          </div>
        </Card>

        {/* ── Running total ────────────────────────────────────────── */}
        <Card className="mt-6">
          <SectionTitle icon={Receipt} title="Your total so far" />
          <dl className="mt-5 divide-y divide-vpv-line text-[14px]">
            {quote.lines.map((l) => {
              // What the buyer gets free, and what they save, are what the eye
              // should find first on this bill: both are set large and bold.
              const free = l.amountInr === 0 && l.kind !== "plan";
              const deal = l.kind === "offer" || l.kind === "coupon";
              return (
                <div
                  key={l.label}
                  data-testid={free ? "bill-free" : deal ? "bill-discount" : undefined}
                  className={`flex items-start justify-between gap-4 ${
                    free
                      ? "-mx-3 my-1 rounded-xl bg-[#EAF7EF] px-3 py-3.5"
                      : deal
                        ? "-mx-3 my-1 rounded-xl bg-[#FFF3CC] px-3 py-3.5"
                        : "py-2.5"
                  }`}
                >
                  <dt
                    className={
                      free
                        ? "text-[16px] font-bold text-[#14532D]"
                        : deal
                          ? "text-[16px] font-bold text-[#7A5600]"
                          : "text-slate-600"
                    }
                  >
                    {l.label}
                    {l.note && (
                      <span className={`mt-0.5 block text-[12px] font-normal ${free ? "text-[#2F6B49]" : deal ? "text-[#8A6100]" : "text-slate-500"}`}>
                        {l.note}
                      </span>
                    )}
                  </dt>
                  <dd className={`shrink-0 text-right tabular-nums ${deal ? "text-[22px] font-bold text-[#7A5600]" : "font-medium text-vpv-ink"}`}>
                    {l.regularInr != null && l.regularInr > l.amountInr && !deal && (
                      <span className="mr-2 text-[12.5px] font-normal text-slate-400 line-through">{inr(l.regularInr)}</span>
                    )}
                    {free ? (
                      <span className="inline-block rounded-full bg-[#1F8A4C] px-3.5 py-1 text-[14px] font-bold uppercase tracking-wide text-white">
                        Free
                      </span>
                    ) : l.amountInr < 0 ? (
                      `− ${inr(-l.amountInr)}`
                    ) : (
                      inr(l.amountInr)
                    )}
                  </dd>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-slate-600">18% GST</dt>
              <dd className="shrink-0 tabular-nums font-medium text-vpv-ink">{inr(quote.gstInr)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pt-3.5">
              <dt className="text-[15px] font-semibold text-vpv-ink">Total payable</dt>
              <dd className="text-[24px] font-semibold tabular-nums text-vpv-ink">{inr(quote.totalInr)}</dd>
            </div>
          </dl>
          {!quote.available && quote.logistics && (
            <ComingSoonCity
              city={quote.logistics.city}
              className="mt-5"
              body="We do not shoot there just yet, so this is your price for when we do. Cab travel will be added once we start in your city."
            />
          )}
        </Card>

        {/* ── Compare ──────────────────────────────────────────────── */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            aria-expanded={compare}
            className="text-[14px] font-medium text-vpv-blue underline underline-offset-2"
          >
            {compare ? "Hide plan comparison" : `Compare all ${SITE_PLAN_DISPLAY_ORDER.length === 3 ? "three" : SITE_PLAN_DISPLAY_ORDER.length} plans`}
          </button>
        </div>
        {compare && (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {SITE_PLAN_DISPLAY_ORDER.map((id) => {
              const p = SITE_PLANS[id];
              const active = id === planId;
              return (
                <div key={id} className={`relative flex flex-col rounded-2xl border p-6 ${active ? "border-vpv-blue bg-vpv-tint/40" : "border-vpv-line bg-white"}`}>
                  {id === rec.plan && (
                    <span className="absolute -top-3 left-6 rounded-full bg-vpv-grad px-3 py-1 text-[11.5px] font-semibold text-white">
                      Recommended
                    </span>
                  )}
                  <h3 className="text-[17px] font-semibold text-vpv-ink">{p.name}</h3>
                  <div className="mt-3">
                    {offerOpen && (
                      <p className="text-[13px] text-slate-400 line-through">
                        {life ? inr(regularPlanPrice(id, "lifetime")) : `${inr(p.regularMonthlyInr)}/month`}
                      </p>
                    )}
                    <p className="text-[26px] font-semibold tabular-nums text-vpv-ink">
                      {life ? inr(planPrice(id, offerOpen, "lifetime")) : inr(planMonthly(id, offerOpen))}
                      <span className="ml-0.5 text-[13px] font-medium text-slate-500">{life ? " once" : "/month"}</span>
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {life ? "One payment + GST, for life" : `Billed yearly: ${inr(planPrice(id, offerOpen))} + GST`}
                    </p>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 text-[13.5px] text-slate-600">
                    {p.personal && (
                      <li className="font-medium text-[#8A6100]">
                        Private discussion and personal shoot by {ENTERPRISE_PERSONAL.person}
                      </li>
                    )}
                    <li className="flex items-center gap-1.5">
                      {p.scenes} AOAs <Hint text={AOA_HINT} onLight />
                    </li>
                    <li>{p.videos} process videos, {p.pdfs} lab reports & certifications</li>
                    <li>{hoursLabel(p.shootHours)} shoot</li>
                    <li>{infoIconsLabel(id)}</li>
                    <li className={p.sharingControls ? "font-medium text-vpv-blue" : "text-slate-400"}>
                      {p.sharingControls ? linkControlLabels(id).join(" · ") : "No link controls"}
                    </li>
                    {p.freeSalesLogins > 0 && <li className="font-medium text-[#8A6100]">★ {PLAN_PERKS.salesLogin.row}</li>}
                    {p.updateShoots > 0 && <li className="font-medium text-[#8A6100]">★ {PLAN_PERKS.updateShoot.row}</li>}
                  </ul>
                  <button
                    type="button"
                    onClick={() => pick(id)}
                    disabled={active}
                    className="mt-6 w-full rounded-full border border-vpv-line px-4 py-2.5 text-[13.5px] font-semibold text-vpv-ink transition-colors hover:border-vpv-blue/40 hover:text-vpv-blue disabled:opacity-40"
                  >
                    {active ? "Selected" : `Choose ${p.name.replace("VPV ", "")}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <PrimaryButton onClick={() => void onSubmit()} busy={busy}>
            Continue with {plan.name.replace("VPV ", "")}
          </PrimaryButton>
          <BackLink href="/assessment/sales-team">Back to sales team</BackLink>
        </div>
      </FunnelBody>
    </>
  );
}
