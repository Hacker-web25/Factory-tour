/**
 * Step 4 of the funnel — the recommended plan, and the add-on sliders.
 *
 * The headline number here is the PRICE PER AREA, and it falls as the
 * slider moves right, because every extra area is cheaper than the plan's
 * own average. That falling number is what makes a bigger pack feel like a
 * better deal, and it is the largest type on the page.
 *
 * Underneath it sits what the extras cost — and then, deliberately, the
 * running total including GST and travel. The total is the smaller number
 * of the two, but it is never hidden: a buyer who first meets the real
 * figure on the payment screen either abandons or disputes, and our
 * payments are non-refundable by default.
 *
 * Every figure comes from siteQuote() in lib/pricing.ts, the same function
 * /api/billing/order prices the card with.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackLink,
  Card,
  FunnelBody,
  FunnelHeader,
  PrimaryButton,
  RestartNotice,
} from "@/components/funnel/FunnelShell";
import {
  EXTRA_AREA_MAX,
  EXTRA_VIDEO_INR,
  EXTRA_VIDEO_MAX,
  SITE_PLANS,
  SITE_PLAN_ORDER,
  VIDEO_SHOT_NOTE,
  extraAreaCost,
  inr,
  nextExtraAreaPrice,
  siteQuote,
  sitePerArea,
  type SitePlanId,
} from "@/lib/pricing";
import {
  loadFunnel,
  mirrorLead,
  recommendPlan,
  saveFunnel,
  type FunnelState,
} from "@/lib/funnel";

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
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13.5px] font-medium text-vpv-ink">
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
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-vpv-tint accent-vpv-blue"
        style={{
          backgroundImage: `linear-gradient(90deg, #1468D8 ${(value / max) * 100}%, #EAF2FE ${(value / max) * 100}%)`,
        }}
      />
      <div className="mt-1.5 flex justify-between text-[11.5px] text-slate-400">
        <span>None</span>
        <span>+{max}</span>
      </div>
    </div>
  );
}

export default function Step4Plan() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    const loaded = loadFunnel();
    const rec = recommendPlan(loaded);
    setS({
      ...loaded,
      // Honour an earlier choice; otherwise take the recommendation and
      // pre-set the sliders to cover whatever the plan does not include.
      chosenPlan: loaded.chosenPlan ?? rec.plan,
      extraAreas: loaded.chosenPlan ? loaded.extraAreas : rec.extraAreas,
      extraVideos: loaded.chosenPlan ? loaded.extraVideos : rec.extraVideos,
    });
    setReady(true);
  }, []);

  const rec = useMemo(() => (s ? recommendPlan(s) : null), [s]);

  const planId: SitePlanId = s?.chosenPlan ?? "authority";
  const quote = useMemo(
    () =>
      s
        ? siteQuote(planId, {
            extraAreas: s.extraAreas,
            extraVideos: s.extraVideos,
            city: s.factoryCity,
          })
        : null,
    [s, planId]
  );

  function pick(id: SitePlanId) {
    if (!s) return;
    // Switching plan re-bases the sliders: extras are priced per plan, so
    // carrying a count across would silently change what it costs.
    setS({ ...s, chosenPlan: id, extraAreas: 0, extraVideos: 0 });
  }

  async function onSubmit() {
    if (!s || !quote) return;
    setBusy(true);
    const saved = saveFunnel({
      chosenPlan: planId,
      extraAreas: s.extraAreas,
      extraVideos: s.extraVideos,
    });
    await mirrorLead("plan", saved, { recommendedPlan: rec?.plan });
    router.push("/assessment/billing");
  }

  if (!ready || !s || !quote || !rec) {
    return (
      <>
        <FunnelHeader step={3} eyebrow="Step 4 of 5" title="Your recommended plan" />
        <FunnelBody>
          <Card>
            <div className="h-5 w-48 animate-pulse rounded bg-vpv-tint" />
            <div className="mt-5 h-24 animate-pulse rounded-xl bg-vpv-canvas" />
          </Card>
        </FunnelBody>
      </>
    );
  }

  if (!s.factoryCity || s.wantsSharingControls === null) {
    return (
      <>
        <FunnelHeader step={3} eyebrow="Step 4 of 5" title="Your recommended plan" />
        <FunnelBody>
          <RestartNotice missing="your earlier answers" />
        </FunnelBody>
      </>
    );
  }

  const plan = SITE_PLANS[planId];
  const isRecommended = planId === rec.plan;
  const extrasCost =
    extraAreaCost(planId, s.extraAreas) + s.extraVideos * EXTRA_VIDEO_INR;
  const basePerArea = sitePerArea(planId, 0);
  const nowPerArea = quote.perAreaInr;

  return (
    <>
      <FunnelHeader
        step={3}
        eyebrow="Step 4 of 5"
        title={isRecommended ? `We recommend ${plan.name}` : `You chose ${plan.name}`}
        summary={
          isRecommended
            ? "The lowest plan that covers everything you asked for. You can change it, and you can add to it."
            : "You have picked a different plan from the one we suggested. That is entirely your call."
        }
      />
      <FunnelBody>
        {/* Why this plan. */}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-semibold text-vpv-ink">{plan.name}</h2>
              <p className="mt-1 text-[14px] text-slate-600">{plan.tagline}</p>
            </div>
            <div className="text-right">
              <div className="text-[26px] font-semibold tabular-nums leading-none text-vpv-ink">
                {inr(plan.priceInr)}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">one-time + GST</div>
            </div>
          </div>

          <ul className="mt-5 grid gap-2 text-[14px] text-slate-700 sm:grid-cols-2">
            <li>✓ {plan.scenes} areas of attention included</li>
            <li>✓ {plan.videos > 0 ? `${plan.videos} process videos` : "Process videos as add-ons"}</li>
            <li>✓ {plan.pdfs > 0 ? `${plan.pdfs} PDF reports` : "PDF reports as add-ons"}</li>
            <li>✓ Information icons on every hotspot</li>
            <li>✓ Your own branded workspace</li>
            <li>✓ First year of support and hosting free</li>
            <li className={plan.sharingControls ? "font-medium text-vpv-blue sm:col-span-2" : "text-slate-400 sm:col-span-2"}>
              {plan.sharingControls ? "✓" : "—"} One-time link expiry and sharing restrictions
              {!plan.sharingControls && " (VPV Control only)"}
            </li>
          </ul>

          {isRecommended && rec.reasons.length > 0 && (
            <div className="mt-5 rounded-xl border border-vpv-line bg-vpv-canvas p-4">
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-vpv-blue">
                Why this one
              </p>
              <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-slate-700">
                {rec.reasons.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* The sliders, and the falling per-area number. */}
        <Card className="mt-5">
          <h2 className="text-[17px] font-semibold text-vpv-ink">Need more than that?</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            Every area you add costs less than the one before it, so a bigger
            VPV is always better value per area.
          </p>

          <div className="mt-6 rounded-2xl border border-vpv-line bg-vpv-canvas p-5 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-vpv-blue">
              Your price per area
            </div>
            <div className="mt-2 text-[52px] font-semibold leading-none tabular-nums tracking-tight text-vpv-ink">
              {inr(nowPerArea)}
            </div>
            <div className="mt-2 text-[13px] text-slate-600">
              across {quote.totalAreas} areas
              {nowPerArea < basePerArea && (
                <>
                  {" · "}
                  <span className="font-medium text-vpv-blue">
                    down from {inr(basePerArea)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <Slider
                id="extra-areas"
                label={`Extra areas — ${s.extraAreas} more (${quote.totalAreas} in total)`}
                value={s.extraAreas}
                max={EXTRA_AREA_MAX}
                onChange={(n) => setS({ ...s, extraAreas: n })}
              />
              <p className="mt-2 text-[12.5px] text-slate-500">
                Next area: {inr(nextExtraAreaPrice(planId, s.extraAreas))}
              </p>
            </div>
            <div>
              <Slider
                id="extra-videos"
                label={`Extra videos — ${s.extraVideos} more (${quote.totalVideos} in total)`}
                value={s.extraVideos}
                max={EXTRA_VIDEO_MAX}
                onChange={(n) => setS({ ...s, extraVideos: n })}
              />
              <p className="mt-2 text-[12.5px] text-slate-500">
                {inr(EXTRA_VIDEO_INR)} each. {VIDEO_SHOT_NOTE}
              </p>
            </div>
          </div>

          {extrasCost > 0 && (
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2 border-t border-vpv-line pt-5">
              <span className="text-[14px] text-slate-600">
                What you are adding to {plan.name}
              </span>
              <span className="text-[24px] font-semibold tabular-nums text-vpv-ink">
                + {inr(extrasCost)}
                <span className="ml-1 text-[12px] font-normal text-slate-500">+ GST</span>
              </span>
            </div>
          )}
        </Card>

        {/* The honest running total. Smaller than the per-area number, but
            on screen from the moment there is something to total. */}
        <Card className="mt-5">
          <h2 className="text-[17px] font-semibold text-vpv-ink">Your total so far</h2>
          <dl className="mt-4 divide-y divide-vpv-line text-[14px]">
            {quote.lines.map((l) => (
              <div key={l.label} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-slate-600">
                  {l.label}
                  {l.note && (
                    <span className="mt-0.5 block text-[12px] text-slate-500">{l.note}</span>
                  )}
                </dt>
                <dd className="shrink-0 tabular-nums font-medium text-vpv-ink">
                  {inr(l.amountInr)}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-slate-600">18% GST</dt>
              <dd className="shrink-0 tabular-nums font-medium text-vpv-ink">{inr(quote.gstInr)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pt-3.5">
              <dt className="text-[15px] font-semibold text-vpv-ink">Total payable</dt>
              <dd className="text-[22px] font-semibold tabular-nums text-vpv-ink">
                {inr(quote.totalInr)}
              </dd>
            </div>
          </dl>
          {quote.logistics && quote.logistics.spec.clientArranges.length > 0 && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900">
              <strong className="font-semibold">Not included above:</strong>{" "}
              {quote.logistics.spec.clientArranges.join("; ")}. You arrange and
              pay for these directly.
            </p>
          )}
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
            Annual support and hosting is {inr(9999)}/year and your first year
            is free, so it is not on this bill.
          </p>
        </Card>

        {/* Compare the other plans. */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            className="text-[13.5px] font-medium text-vpv-blue underline underline-offset-2"
          >
            {compare ? "Hide plan comparison" : "Compare other plans"}
          </button>
        </div>

        {compare && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {SITE_PLAN_ORDER.map((id) => {
              const p = SITE_PLANS[id];
              const active = id === planId;
              return (
                <div
                  key={id}
                  className={[
                    "relative rounded-2xl border p-5",
                    active ? "border-vpv-blue bg-vpv-tint/40" : "border-vpv-line bg-white",
                  ].join(" ")}
                >
                  {id === rec.plan && (
                    <span className="absolute -top-3 left-5 rounded-full bg-vpv-grad px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white">
                      Recommended
                    </span>
                  )}
                  <h3 className="text-[16px] font-semibold text-vpv-ink">{p.name}</h3>
                  <div className="mt-1.5 text-[22px] font-semibold tabular-nums text-vpv-ink">
                    {inr(p.priceInr)}
                  </div>
                  <div className="text-[11.5px] text-slate-500">
                    {inr(sitePerArea(id, 0))} per area
                  </div>
                  <ul className="mt-4 space-y-1.5 text-[13px] text-slate-600">
                    <li>{p.scenes} areas</li>
                    <li>{p.videos} videos · {p.pdfs} PDFs</li>
                    <li className={p.sharingControls ? "font-medium text-vpv-blue" : "text-slate-400"}>
                      {p.sharingControls ? "Sharing controls included" : "No sharing controls"}
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => pick(id)}
                    disabled={active}
                    className="mt-5 w-full rounded-full border border-vpv-line px-4 py-2.5 text-[13px] font-semibold text-vpv-ink transition-colors hover:border-vpv-blue/40 hover:text-vpv-blue disabled:opacity-40"
                  >
                    {active ? "Selected" : `Choose ${p.name.replace("VPV ", "")}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <PrimaryButton onClick={() => void onSubmit()} busy={busy}>
            Continue with {plan.name.replace("VPV ", "")}
          </PrimaryButton>
          <BackLink href="/assessment/security">Back to protection</BackLink>
        </div>
      </FunnelBody>
    </>
  );
}
