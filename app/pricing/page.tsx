/**
 * /pricing — three plans, one calculator, no surprises.
 *
 *   Basic   one-time. The customer picks the number of scenes and the
 *           price per scene falls as the pack grows. Bought online.
 *   Pro     ₹5,000 a month, unlimited scenes. Sold by conversation.
 *   Ultra   ₹15,000 a month, everything. Sold by conversation.
 *
 * Every number comes from lib/pricing.ts, which is also what the server
 * charges — so this page can never quote a price we do not honour.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Crown, Minus } from "lucide-react";
import { PageHero, PageShell } from "@/components/legal/LegalPage";
import SceneCalculator from "@/components/billing/SceneCalculator";
import EnquiryForm from "@/components/billing/EnquiryForm";
import { POLICY } from "@/lib/company";
import {
  FEATURE_MATRIX,
  GST_LABEL,
  PRO_MONTHLY_INR,
  SCENE_MAX,
  SCENE_MIN,
  SUPPORT_ANNUAL_INR,
  ULTRA_MONTHLY_INR,
  inr,
  inr2,
  priceForScenes,
  pricePerScene,
  sceneLadderRows,
  splitGst,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "VPV pricing: Basic is a one-time licence where you choose the number of scenes and the price per scene falls as you add more. Pro is ₹5,000 a month and Ultra ₹15,000 a month, both with unlimited scenes. All prices include GST.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/pricing" },
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is GST included in these prices?",
    a: (
      <>
        Yes. Every price on this page includes {GST_LABEL}, so the amount you
        see is the amount you pay. Your tax invoice shows the breakup — a{" "}
        {inr(priceForScenes(5))} purchase, for example, is{" "}
        {inr2(splitGst(priceForScenes(5)).taxable)} plus{" "}
        {inr2(splitGst(priceForScenes(5)).gst)} GST.
      </>
    ),
  },
  {
    q: "Why does the price per scene go down?",
    a: "Because the work of setting up your workspace happens once, whether you show two rooms or twenty. We would rather you showed your customers the whole plant, so each extra scene costs less than the one before.",
  },
  {
    q: "What happens after the first year of support?",
    a: (
      <>
        Basic includes technical support free for the first year. After that it
        is {inr(SUPPORT_ANNUAL_INR)} a year, and renewing is a button inside
        your dashboard. If you choose not to renew, your workspace and your
        tours keep working — only support and maintenance pause, after a{" "}
        {POLICY.supportGraceDays}-day grace period. Support is included in Pro
        and Ultra.
      </>
    ),
  },
  {
    q: "Can I add scenes later?",
    a: "Yes. Open Plan and billing in your dashboard, drag to the new total, and you pay only the difference — at the same falling rate, so you are never penalised for starting small.",
  },
  {
    q: "How do I pay, and will I get an invoice?",
    a: "Card, UPI, net banking or wallet through Razorpay, an RBI-authorised payment aggregator. We never see or store your card details. A GST invoice is e-mailed the moment the payment succeeds.",
  },
  {
    q: "Can your prices change?",
    a: (
      <>
        Yes, but never behind your back. We e-mail you at least{" "}
        {POLICY.priceChangeNoticeDays} days before a new price applies to you,
        and a change never touches a fee you have already paid. Full detail in{" "}
        <Link href="/terms#price-changes" className="text-vpv-blue underline underline-offset-2">
          Terms › Price changes
        </Link>
        .
      </>
    ),
  },
  {
    q: "What if it is not right for us?",
    a: (
      <>
        Ask within {POLICY.refundWindowDays} days and, if you have not started
        using the paid workspace or something core does not work as described,
        you get a full refund. See the{" "}
        <Link href="/refund-policy" className="text-vpv-blue underline underline-offset-2">
          Cancellation &amp; Refund Policy
        </Link>
        .
      </>
    ),
  },
];

export default function PricingPage() {
  const ladder = sceneLadderRows().filter((r) =>
    [SCENE_MIN, 3, 5, 8, 10, 15, SCENE_MAX].includes(r.scenes)
  );

  return (
    <PageShell>
      <PageHero
        eyebrow="Pricing"
        title="Pay for the rooms you want to show."
        summary="Basic is a one-time licence and the price per scene falls the more you add. Pro and Ultra are monthly, with no limit at all. Every price includes GST."
      />

      <div className="mx-auto max-w-6xl px-5 py-12 lg:py-16">
        {/* ── The three plans ──────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          {/* Basic */}
          <div className="relative rounded-3xl border border-vpv-blue/30 bg-white p-7 shadow-[0_30px_70px_-34px_rgba(20,104,216,0.5)] lg:col-span-1">
            <div className="absolute -top-3 left-7 rounded-full bg-vpv-grad px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white">
              Buy online
            </div>
            <h2 className="text-[21px] font-semibold text-vpv-ink">Basic</h2>
            <p className="mt-1 text-[13.5px] text-slate-500">
              Pick your scenes. Pay once. Own it.
            </p>

            <div className="mt-6">
              <div className="flex items-end gap-2">
                <span className="text-[38px] font-semibold tracking-tight leading-none text-vpv-ink">
                  {inr(pricePerScene(SCENE_MAX))}
                </span>
                <span className="pb-1 text-[13px] text-slate-500">per scene</span>
              </div>
              <div className="mt-1.5 text-[12.5px] text-slate-500">
                at {SCENE_MAX} scenes · from {inr(priceForScenes(SCENE_MIN))} for{" "}
                {SCENE_MIN} scenes
              </div>
            </div>

            <ul className="mt-6 space-y-2.5 text-[14px]">
              {[
                "Every feature of Pro",
                "First year of technical support free",
                "Your own branded workspace",
                "One payment — no monthly fee",
                "Add scenes later at the same falling rate",
              ].map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check size={16} className="mt-1 shrink-0 text-vpv-blue" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/get-started"
              className="mt-7 block rounded-full bg-vpv-grad py-3 text-center text-[14px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(20,104,216,0.7)] hover:opacity-95 transition-opacity"
            >
              Build your plan
            </Link>
          </div>

          <PlanCard
            name="Pro"
            price={PRO_MONTHLY_INR}
            tagline="Unlimited scenes, every month."
            points={[
              "Everything in Basic",
              "No limit on scenes — show the whole plant",
              "Technical support included",
              "Scope and onboarding in a written proposal",
            ]}
          />

          <PlanCard
            name="Ultra"
            price={ULTRA_MONTHLY_INR}
            tagline="Everything, including AI meeting review."
            points={[
              "Everything in Pro",
              "AI meeting review: transcript, score, insights",
              "Priority technical support",
              "Commercial terms in a written proposal",
            ]}
            dark
          />
        </div>

        {/* ── The calculator ───────────────────────────────────────── */}
        <section id="calculator" className="mt-16">
          <div className="mb-6 max-w-2xl">
            <h2 className="text-[27px] font-semibold tracking-tight text-vpv-ink">
              How many rooms will you show?
            </h2>
            <p className="mt-2 text-[15.5px] leading-relaxed text-slate-600">
              Drag the slider. Watch the price per scene fall — the more of your
              plant your customers can walk through, the less each room costs you.
            </p>
          </div>

          <div id="calculator-grid" className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
            <SceneCalculator />

            <div className="rounded-2xl border border-vpv-line bg-white p-6">
              <h3 className="text-[15px] font-semibold text-vpv-ink">
                The whole ladder, in one look
              </h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-[13.5px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.08em] text-vpv-muted">
                      <th className="pb-2 font-semibold">Scenes</th>
                      <th className="pb-2 text-right font-semibold">Per scene</th>
                      <th className="pb-2 text-right font-semibold">You pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.map((r) => (
                      <tr key={r.scenes} className="border-t border-vpv-line">
                        <td className="py-2.5 font-medium text-vpv-ink tabular-nums">{r.scenes}</td>
                        <td className="py-2.5 text-right tabular-nums text-vpv-blue font-medium">
                          {inr(r.perScene)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">
                          {inr(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
                All amounts include {GST_LABEL} and the first year of technical
                support. Beyond {SCENE_MAX} scenes, Pro is the better value — and
                has no limit at all.
              </p>
            </div>
          </div>
        </section>

        {/* ── What is in each plan ─────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="text-[27px] font-semibold tracking-tight text-vpv-ink">
            What you get
          </h2>
          <p className="mt-2 max-w-2xl text-[15.5px] text-slate-600">
            Basic and Pro have the same features. The difference is the number of
            scenes and how you pay for them.
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-vpv-line">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead>
                <tr className="bg-vpv-canvas">
                  <th className="px-4 py-3.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-vpv-muted">
                    Feature
                  </th>
                  {["Basic", "Pro", "Ultra"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3.5 text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-vpv-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row) => (
                  <tr key={row.label} className="border-t border-vpv-line">
                    <td className="px-4 py-3 text-slate-700">{row.label}</td>
                    <Cell value={row.basic} />
                    <Cell value={row.pro} />
                    <Cell value={row.ultra} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Price changes ────────────────────────────────────────── */}
        <section className="mt-14 rounded-2xl border border-amber-200 bg-amber-50/60 p-6 sm:p-7">
          <h2 className="text-[17px] font-semibold text-vpv-ink">
            A note on price changes
          </h2>
          <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-slate-700">
            Our prices are in INR and include GST unless stated. We may change
            them at any time.{" "}
            <strong className="text-vpv-ink">
              We always e-mail you at least {POLICY.priceChangeNoticeDays} days
              before a new price applies to you
            </strong>
            , and a change never touches a fee you have already paid, a support
            year you have already paid for, or a proposal you have accepted. The
            price you see at checkout is the price you pay.
          </p>
          <Link
            href="/terms#price-changes"
            className="mt-3 inline-block text-[13px] font-medium text-vpv-blue underline underline-offset-2"
          >
            Read the price-change terms
          </Link>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section className="mt-16 max-w-3xl">
          <h2 className="text-[27px] font-semibold tracking-tight text-vpv-ink">
            Questions, answered
          </h2>
          <div className="mt-5 divide-y divide-vpv-line rounded-2xl border border-vpv-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-vpv-ink">
                  {f.q}
                  <span className="text-xl leading-none text-vpv-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-3 text-[14.5px] leading-relaxed text-slate-600">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Talk to us ───────────────────────────────────────────── */}
        <section id="talk" className="mt-16 grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start scroll-mt-24">
          <div>
            <h2 className="text-[27px] font-semibold tracking-tight text-vpv-ink">
              Thinking about Pro or Ultra?
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-slate-600">
              Those are monthly plans with no scene limit, and we set them up with
              you rather than selling them from a web page. Tell us about your
              plants and we will reply with a written proposal.
            </p>
            <ul className="mt-5 space-y-2.5 text-[14.5px] text-slate-600">
              {[
                `Pro — ${inr(PRO_MONTHLY_INR)} a month, unlimited scenes`,
                `Ultra — ${inr(ULTRA_MONTHLY_INR)} a month, plus AI meeting review`,
                "Support included on both",
              ].map((l) => (
                <li key={l} className="flex gap-2.5">
                  <ArrowRight size={16} className="mt-1 shrink-0 text-vpv-blue" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <EnquiryForm />
        </section>
      </div>
    </PageShell>
  );
}

/* ───────────────────────────── pieces ────────────────────────────── */

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <td className="px-4 py-3 text-center">
        <Check size={17} className="mx-auto text-vpv-blue" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-4 py-3 text-center">
        <Minus size={15} className="mx-auto text-slate-300" />
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center text-[13px] text-slate-600">{value}</td>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  points,
  dark = false,
}: {
  name: string;
  price: number;
  tagline: string;
  points: string[];
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-7 ${
        dark
          ? "border-vpv-navy bg-gradient-to-b from-vpv-navy to-[#0a2a63] text-white"
          : "border-vpv-line bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <h2 className={`text-[21px] font-semibold ${dark ? "text-white" : "text-vpv-ink"}`}>
          {name}
        </h2>
        <Crown size={15} className={dark ? "text-amber-300" : "text-amber-500"} />
      </div>
      <p className={`mt-1 text-[13.5px] ${dark ? "text-white/70" : "text-slate-500"}`}>{tagline}</p>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <span
            className={`text-[38px] font-semibold tracking-tight leading-none ${
              dark ? "text-white" : "text-vpv-ink"
            }`}
          >
            {inr(price)}
          </span>
          <span className={`pb-1 text-[13px] ${dark ? "text-white/60" : "text-slate-500"}`}>
            per month
          </span>
        </div>
        <div className={`mt-1.5 text-[12.5px] ${dark ? "text-white/60" : "text-slate-500"}`}>
          Inclusive of GST · billed as agreed
        </div>
      </div>

      <ul className="mt-6 space-y-2.5 text-[14px]">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5">
            <Check size={16} className={`mt-1 shrink-0 ${dark ? "text-cyan-300" : "text-vpv-blue"}`} />
            <span className={dark ? "text-white/90" : ""}>{p}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/pricing#talk"
        className={`mt-7 block rounded-full border py-3 text-center text-[14px] font-semibold transition-colors ${
          dark
            ? "border-white/30 text-white hover:bg-white/10"
            : "border-vpv-blue/40 text-vpv-blue hover:bg-vpv-tint"
        }`}
      >
        Talk to us
      </Link>
    </div>
  );
}
