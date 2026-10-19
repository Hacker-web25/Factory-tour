/**
 * Step 4 of the funnel — the recommended plan, the add-ons, and the time.
 *
 * Three things on this screen, in the order a buyer decides:
 *
 *   1. THE PLAN, revealed as a deep navy card with the gold special-offer
 *      seal: regular price struck through, the offer price, and the saving.
 *      The gold seal is the single loudest object in the funnel.
 *   2. THE ADD-ONS — sliders for areas and videos, the falling price per
 *      area in the largest type, and a banner showing the discount bands
 *      the buyer moves through as they add areas.
 *   3. THE TIME — hours on site, drawn as a bar of hours, with any extra
 *      hour priced as it appears.
 *
 * The running total sits underneath, smaller than the per-area number but
 * never hidden. Every figure comes from siteQuote() in lib/pricing.ts — the
 * same function /api/billing/order charges the card with — and the special
 * offer is shown only while the server's real count says it is open.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent, Check, Clock, FileText, Layers, Lock, Receipt, Video,
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
  EXTRA_HOUR_INR,
  EXTRA_VIDEO_INR,
  EXTRA_VIDEO_MAX,
  LAUNCH_OFFER,
  MINUTES_PER_EXTRA_AREA,
  SHOOT_DAY_HOURS,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  SUPPORT_MONTHLY_INR,
  VIDEO_SHOT_NOTE,
  discountBands,
  extraAreaCost,
  extrasSaving,
  hoursLabel,
  inr,
  nextExtraAreaPrice,
  planPrice,
  siteQuote,
  sitePerArea,
  type SitePlanId,
} from "@/lib/pricing";
import { loadFunnel, mirrorLead, recommendPlan, saveFunnel, type FunnelState } from "@/lib/funnel";

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
  return (
    <div>
      <label htmlFor={id} className="mb-2.5 block text-[13.5px] font-medium text-vpv-ink">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full accent-vpv-blue"
        style={{ backgroundImage: `linear-gradient(90deg, #1468D8 ${pct}%, #EAF2FE ${pct}%)` }}
      />
      <div className="mt-1.5 flex justify-between text-[11.5px] text-slate-400">
        <span>None</span>
        <span>+{max}</span>
      </div>
    </div>
  );
}

/** The discount bands as a stepped strip: every band the buyer has reached
 *  is filled, the next one shows what it takes to get there. */
function DiscountBanner({
  planId,
  extraAreas,
  offerOpen,
}: {
  planId: SitePlanId;
  extraAreas: number;
  offerOpen: boolean;
}) {
  const bands = discountBands(planId, offerOpen);
  const saving = extrasSaving(planId, extraAreas, offerOpen);
  const next = bands.find((b) => extraAreas < b.from);
  return (
    <div className="overflow-hidden rounded-2xl bg-vpv-grad-soft text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <BadgePercent className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-[15.5px] font-semibold">The more areas you add, the less each one costs</p>
            <p className="text-[12.5px] text-white/75">
              Compared with {inr(sitePerArea(planId, 0, offerOpen))} per area on the plan itself
            </p>
          </div>
        </div>
        {saving > 0 && (
          <p className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-vpv-navy">
            You save {inr(saving)} on extras
          </p>
        )}
      </div>
      <ol className={`mt-5 grid grid-cols-1 gap-px bg-white/10 ${bands.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {bands.map((b) => {
          const reached = extraAreas >= b.from;
          return (
            <li key={b.from} className={`px-4 py-4 transition-colors ${reached ? "bg-white/20" : "bg-white/[0.04]"}`}>
              <p className="text-[24px] font-semibold leading-none tabular-nums">{b.percentOff}% off</p>
              <p className="mt-1.5 text-[12.5px] text-white/85">
                {inr(b.each)} per area
              </p>
              <p className="mt-0.5 text-[11.5px] text-white/65">
                {b.to === null ? `${b.from}+ extra areas` : b.from === b.to ? `extra area ${b.from}` : `extra areas ${b.from}–${b.to}`}
              </p>
            </li>
          );
        })}
      </ol>
      {next && (
        <p className="px-5 py-3 text-[12.5px] text-white/80">
          {extraAreas === 0
            ? `Your first extra area costs ${inr(next.each)}, already ${next.percentOff}% below the plan's own rate.`
            : `Add ${next.from - extraAreas} more and every extra area from number ${next.from} costs ${inr(next.each)}, ${next.percentOff}% off.`}
        </p>
      )}
    </div>
  );
}

/** Hours on site as a row of hour blocks: what the plan includes in blue,
 *  anything extra in cyan with its price. */
function ShootTimeBar({ included, extra }: { included: number; extra: number }) {
  const total = included + extra;
  return (
    <div>
      <div className="flex gap-1" role="img" aria-label={`${hoursLabel(total)} on site: ${hoursLabel(included)} included${extra ? `, ${hoursLabel(extra)} extra` : ""}`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`flex h-10 flex-1 items-end justify-center rounded-md pb-1 text-[10.5px] font-semibold ${i < included ? "bg-vpv-blue text-white/85" : "bg-vpv-cyan text-vpv-ink"}`}
          >
            {i + 1}h
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-vpv-blue" />{hoursLabel(included)} included</span>
        {extra > 0 && (
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-vpv-cyan" />{hoursLabel(extra)} extra at {inr(EXTRA_HOUR_INR)}/hour</span>
        )}
      </div>
    </div>
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
      extraVideos: loaded.chosenPlan ? loaded.extraVideos : rec.extraVideos,
    });
  }, []);

  const rec = useMemo(() => (s ? recommendPlan(s) : null), [s]);
  const planId: SitePlanId = s?.chosenPlan ?? "authority";
  const offerOpen = offer.open && LAUNCH_OFFER.active;
  const quote = useMemo(
    () =>
      s
        ? siteQuote(planId, { extraAreas: s.extraAreas, extraVideos: s.extraVideos, city: s.factoryCity, offerOpen })
        : null,
    [s, planId, offerOpen]
  );

  function pick(id: SitePlanId) {
    if (!s) return;
    // Extras are priced per plan, so carrying a count across would silently
    // change what it costs. Switching plan starts the sliders again.
    setS({ ...s, chosenPlan: id, extraAreas: 0, extraVideos: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit() {
    if (!s || !quote) return;
    setBusy(true);
    const saved = saveFunnel({ chosenPlan: planId, extraAreas: s.extraAreas, extraVideos: s.extraVideos });
    await mirrorLead("plan", saved, { recommendedPlan: rec?.plan });
    router.push("/assessment/sales-team");
  }

  const header = (title: string, summary?: string) => (
    <FunnelHeader
      step={3}
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
  const price = planPrice(planId, offerOpen);
  const extrasCost = extraAreaCost(planId, s.extraAreas) + s.extraVideos * EXTRA_VIDEO_INR;
  const basePerArea = sitePerArea(planId, 0, offerOpen);

  const inclusions: { icon: typeof Layers; text: string; strong?: boolean }[] = [
    { icon: Layers, text: `${plan.scenes} Active Operational Areas` },
    { icon: Video, text: plan.videos > 0 ? `${plan.videos} process videos` : "Process videos as add-ons" },
    { icon: FileText, text: plan.pdfs > 0 ? `${plan.pdfs} PDF reports` : "PDF reports as add-ons" },
    { icon: Clock, text: `${hoursLabel(plan.shootHours)} of shoot time on site` },
    { icon: Check, text: "Information icons on every hotspot" },
    { icon: Check, text: "Your own branded workspace and domain" },
    offerOpen
      ? { icon: Check, text: "First year of support is free", strong: true }
      : { icon: Check, text: `Support from ${inr(SUPPORT_MONTHLY_INR)}/month, billed yearly` },
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
                  {offerOpen && (
                    <p className="text-[17px] text-white/55 line-through decoration-white/50">{inr(plan.regularInr)}</p>
                  )}
                  <p className="text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{inr(price)}</p>
                  <p className="mt-2 text-[13px] text-white/70">one-time, + 18% GST</p>
                  {offerOpen && (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FFF2C4] px-4 py-1.5 text-[13.5px] font-semibold text-[#5A3D00]">
                      You save {inr(plan.regularInr - price)} as one of our first {LAUNCH_OFFER.limit} customers
                    </p>
                  )}
                </div>
              </div>

              <ul className="grid content-start gap-3 rounded-2xl bg-white/[0.08] p-5 text-[14.5px] sm:p-6">
                {inclusions.map(({ icon: Icon, text, strong }) => (
                  <li key={text} className={`flex items-center gap-3 ${strong ? "font-bold text-[#FFE7A0]" : ""}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    {text}
                  </li>
                ))}
                <li className={`flex items-center gap-3 border-t border-white/15 pt-3 ${plan.sharingControls ? "font-semibold" : "text-white/55"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${plan.sharingControls ? "bg-white text-vpv-navy" : "bg-white/10"}`}>
                    <Lock className="h-4 w-4" aria-hidden />
                  </span>
                  {plan.sharingControls ? "One-time links and sharing restrictions" : "Sharing restrictions: VPV Control only"}
                </li>
              </ul>
            </div>
          </div>
        </div>

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
            Every area you add costs less than the one before it, so a bigger VPV is always better value per area.
          </SectionTitle>

          <div className="mt-7 grid items-center gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl bg-vpv-canvas p-6 text-center">
              <p className="text-[13px] font-medium text-vpv-blue">Your price per area</p>
              <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-vpv-ink">
                {inr(quote.perAreaInr)}
              </p>
              <p className="mt-2.5 text-[13px] text-slate-600">
                across {quote.totalAreas} areas
                {quote.perAreaInr < basePerArea && (
                  <span className="mt-1 block font-semibold text-vpv-blue">down from {inr(basePerArea)}</span>
                )}
              </p>
            </div>
            <div className="space-y-7">
              <div>
                <Slider
                  id="extra-areas"
                  label={`Extra areas: ${s.extraAreas} more, ${quote.totalAreas} in total`}
                  value={s.extraAreas}
                  max={EXTRA_AREA_MAX}
                  onChange={(n) => setS({ ...s, extraAreas: n })}
                />
                <p className="mt-2 text-[12.5px] text-slate-500">Next area: {inr(nextExtraAreaPrice(planId, s.extraAreas))}</p>
              </div>
              <div>
                <Slider
                  id="extra-videos"
                  label={`Extra process videos: ${s.extraVideos} more, ${quote.totalVideos} in total`}
                  value={s.extraVideos}
                  max={EXTRA_VIDEO_MAX}
                  onChange={(n) => setS({ ...s, extraVideos: n })}
                />
                <p className="mt-2 text-[12.5px] text-slate-500">{inr(EXTRA_VIDEO_INR)} each. {VIDEO_SHOT_NOTE}</p>
              </div>
            </div>
          </div>

          <div className="mt-7">
            <DiscountBanner planId={planId} extraAreas={s.extraAreas} offerOpen={offerOpen} />
          </div>

          {extrasCost > 0 && (
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2 border-t border-vpv-line pt-5">
              <span className="text-[14px] text-slate-600">What you are adding to {plan.name}</span>
              <span className="text-[26px] font-semibold tabular-nums text-vpv-ink">
                + {inr(extrasCost)}<span className="ml-1 text-[12px] font-normal text-slate-500">+ GST</span>
              </span>
            </div>
          )}
        </Card>

        {/* ── Shoot time ───────────────────────────────────────────── */}
        <Card className="mt-6">
          <SectionTitle
            icon={Clock}
            title="Time on site"
            aside={<span className="text-[22px] font-semibold tabular-nums text-vpv-ink">{hoursLabel(quote.shoot.totalHours)}</span>}
          >
            {plan.name} includes {hoursLabel(plan.shootHours)} of shooting. Each extra area or process video adds about{" "}
            {MINUTES_PER_EXTRA_AREA} minutes; any time beyond the plan is {inr(EXTRA_HOUR_INR)} an hour, rounded up to
            the hour.
          </SectionTitle>
          <div className="mt-6">
            <ShootTimeBar included={quote.shoot.includedHours} extra={quote.shoot.extraHours} />
          </div>
          {quote.shoot.days > 1 && (
            <p className="mt-4 rounded-xl border border-vpv-line bg-vpv-canvas px-4 py-3 text-[13px] leading-relaxed text-slate-700">
              That is more than one {SHOOT_DAY_HOURS}-hour working day, so the shoot runs over {quote.shoot.days} days.
              The time is already priced by the hour above.
            </p>
          )}
        </Card>

        {/* ── Running total ────────────────────────────────────────── */}
        <Card className="mt-6">
          <SectionTitle icon={Receipt} title="Your total so far" />
          <dl className="mt-5 divide-y divide-vpv-line text-[14px]">
            {quote.lines.map((l) => (
              <div key={l.label} className="flex items-start justify-between gap-4 py-2.5">
                <dt className={l.kind === "offer" ? "font-medium text-[#8A6100]" : "text-slate-600"}>
                  {l.label}
                  {l.note && <span className="mt-0.5 block text-[12px] font-normal text-slate-500">{l.note}</span>}
                </dt>
                <dd className={`shrink-0 text-right tabular-nums font-medium ${l.kind === "offer" ? "text-[#8A6100]" : "text-vpv-ink"}`}>
                  {l.regularInr != null && l.regularInr > l.amountInr && (
                    <span className="mr-2 text-[12.5px] font-normal text-slate-400 line-through">{inr(l.regularInr)}</span>
                  )}
                  {l.kind === "support" && l.amountInr === 0
                    ? <span className="font-semibold text-[#1F8A4C]">Free</span>
                    : l.amountInr < 0 ? `− ${inr(-l.amountInr)}` : inr(l.amountInr)}
                </dd>
              </div>
            ))}
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
            {compare ? "Hide plan comparison" : "Compare all three plans"}
          </button>
        </div>
        {compare && (
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {SITE_PLAN_ORDER.map((id) => {
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
                    {offerOpen && <p className="text-[13px] text-slate-400 line-through">{inr(p.regularInr)}</p>}
                    <p className="text-[26px] font-semibold tabular-nums text-vpv-ink">{inr(planPrice(id, offerOpen))}</p>
                    <p className="text-[12px] text-slate-500">{inr(sitePerArea(id, 0, offerOpen))} per area</p>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 text-[13.5px] text-slate-600">
                    <li>{p.scenes} areas</li>
                    <li>{p.videos} process videos, {p.pdfs} PDFs</li>
                    <li>{hoursLabel(p.shootHours)} shoot</li>
                    <li className={p.sharingControls ? "font-medium text-vpv-blue" : "text-slate-400"}>
                      {p.sharingControls ? "Sharing controls included" : "No sharing controls"}
                    </li>
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
          <BackLink href="/assessment/security">Back to protection</BackLink>
        </div>
      </FunnelBody>
    </>
  );
}
