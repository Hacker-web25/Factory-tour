/**
 * Step 5 of the funnel — the sales team.
 *
 * A factory pays its salespeople every month to take the plant to buyers,
 * and today the MD cannot see a single one of those meetings. This step
 * sells the Sales Team add-on by putting those two facts side by side:
 *
 *   1. THE CALCULATOR — how many salespeople, what they are paid, and what
 *      that adds up to in a year, in lakhs, in the largest type on the page.
 *      Against it, a bar showing the one-time add-on as a sliver of that
 *      salary bill. Every figure is arithmetic on the two numbers the buyer
 *      typed (salesTeamMaths in lib/pricing.ts); there is no invented
 *      "return on investment".
 *   2. WHAT THE MD GETS — in the words a factory owner uses, and only
 *      features the product actually has today.
 *   3. THE PRICE — one login per salesperson, one flat price, shown at the
 *      special-offer price while it is open.
 *
 * The salary figure stays in the browser. It is never sent to our server.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, MapPin, Presentation, TrendingUp, Users, Wallet,
} from "lucide-react";
import {
  BackLink,
  Card,
  FunnelBody,
  FunnelHeader,
  OfferSeal,
  PrimaryButton,
  RestartNotice,
  SectionTitle,
  StarBadge,
  TextInput,
  YesNo,
  useOfferState,
} from "@/components/funnel/FunnelShell";
import {
  LAUNCH_OFFER,
  SALES_TEAM,
  inr,
  inrLakhs,
  salesTeamMaths,
  seatPrice,
} from "@/lib/pricing";
import { loadFunnel, mirrorLead, saveFunnel, type FunnelState } from "@/lib/funnel";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Your whole sales team on one screen",
    body: "A dashboard for you, the MD. Every salesperson, every meeting they held and every factory tour they showed, without asking anyone for a report.",
  },
  {
    icon: MapPin,
    title: "Know when and where every meeting started",
    body: "Each presentation records the time it started and the place it happened. You know the meeting was real, and you know where it was.",
  },
  {
    icon: Users,
    title: "Every client, every meeting, in one place",
    body: "See how many meetings each client has had, who from your team met them, and what was shown. Nothing lives only in one salesperson's phone.",
  },
  {
    icon: TrendingUp,
    title: "See how far each deal has moved",
    body: "Mark every client as new, moving ahead, order won or lost, and see your whole pipeline at a glance: which buyers are close, and which have gone quiet.",
  },
  {
    icon: Presentation,
    title: "The same factory, shown the same way",
    body: "Every salesperson presents the same approved VPV. No old brochures, no missing machines, no one making up their own pitch.",
  },
];

function SeatsSlider({
  value,
  onChange,
  onDark = false,
}: {
  value: number;
  onChange: (n: number) => void;
  /** On the navy calculator the blue fill would vanish, so it goes white. */
  onDark?: boolean;
}) {
  const max = 50;
  const shown = Math.min(value, max);
  const pct = ((shown - 1) / (max - 1)) * 100;
  return (
    <input
      type="range"
      min={1}
      max={max}
      value={shown}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Number of salespeople"
      className="h-2 w-full cursor-pointer appearance-none rounded-full accent-vpv-blue"
      style={{
        backgroundImage: onDark
          ? `linear-gradient(90deg, #FFFFFF ${pct}%, rgba(255,255,255,0.22) ${pct}%)`
          : `linear-gradient(90deg, #1468D8 ${pct}%, #EAF2FE ${pct}%)`,
      }}
    />
  );
}

export default function Step5SalesTeam() {
  const router = useRouter();
  const offer = useOfferState();
  const [s, setS] = useState<FunnelState | null>(null);
  const [busy, setBusy] = useState(false);
  const [salaryText, setSalaryText] = useState("");

  useEffect(() => {
    const loaded = loadFunnel();
    setS(loaded);
    setSalaryText(String(loaded.monthlySalary || SALES_TEAM.defaultMonthlySalaryInr));
  }, []);

  const offerOpen = offer.open && LAUNCH_OFFER.active;

  async function onContinue() {
    if (!s || s.hasSalesTeam === null) return;
    setBusy(true);
    const saved = saveFunnel({
      hasSalesTeam: s.hasSalesTeam,
      salesSeats: s.salesSeats,
      monthlySalary: s.monthlySalary,
    });
    await mirrorLead("sales", saved);
    router.push("/assessment/billing");
  }

  const header = (
    <FunnelHeader
      step={4}
      title="Do you have a sales team?"
      summary="Your VPV can do more than show your factory. With a login for each salesperson, it shows you what your sales team is doing with it."
      image="sales-meeting"
      imageAlt="A salesperson presenting a factory tour to a buyer"
      caption="Every salesperson, the same factory"
    />
  );

  if (!s) {
    return (
      <>
        {header}
        <FunnelBody wide>
          <Card><div className="h-24 animate-pulse rounded-xl bg-vpv-canvas" /></Card>
        </FunnelBody>
      </>
    );
  }

  if (!s.chosenPlan || !s.factoryCity) {
    return (
      <>
        {header}
        <FunnelBody><RestartNotice missing="your plan" /></FunnelBody>
      </>
    );
  }

  const m = salesTeamMaths(s.salesSeats, s.monthlySalary, offerOpen);
  const sliverPct = Math.max(0.6, (m.addOnCost / m.annualSalaryBill) * 100);
  const setSeats = (n: number) => setS({ ...s, salesSeats: Math.max(1, Math.min(SALES_TEAM.maxSeats, Math.round(n) || 1)) });

  return (
    <>
      {header}
      <FunnelBody wide>
        <Card>
          <SectionTitle icon={Users} title="Do you have salespeople who meet buyers?">
            Answer no and we go straight to your bill. Nothing is added unless you choose it.
          </SectionTitle>
          <div className="mt-5">
            <YesNo
              value={s.hasSalesTeam}
              onChange={(v) => setS({ ...s, hasSalesTeam: v })}
              yesLabel="Yes, we have a sales team"
              noLabel="No, we sell it ourselves"
            />
          </div>
        </Card>

        {s.hasSalesTeam && (
          <>
            {/* ── The calculator ─────────────────────────────────────── */}
            <div className="mt-8 overflow-hidden rounded-[26px] bg-vpv-grad-soft text-white shadow-[0_40px_80px_-40px_rgba(11,61,145,0.75)]">
              <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-6">
                  <div>
                    <p className="text-[14px] font-medium text-white/75">How many salespeople do you have?</p>
                    <div className="mt-3 flex items-center gap-4">
                      <input
                        type="number"
                        min={1}
                        max={SALES_TEAM.maxSeats}
                        value={s.salesSeats}
                        onChange={(e) => setSeats(Number(e.target.value))}
                        aria-label="Number of salespeople"
                        className="w-24 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-center text-[22px] font-semibold tabular-nums text-white outline-none focus:border-white/60"
                      />
                      <div className="flex-1"><SeatsSlider value={s.salesSeats} onChange={setSeats} onDark /></div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-white/75">Average monthly salary of one salesperson</p>
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 focus-within:border-white/60">
                      <span className="text-[18px] font-semibold text-white/70">₹</span>
                      <input
                        inputMode="numeric"
                        value={salaryText ? Number(salaryText).toLocaleString("en-IN") : ""}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                          setSalaryText(digits);
                          if (Number(digits) >= 1000) setS({ ...s, monthlySalary: Number(digits) });
                        }}
                        aria-label="Average monthly salary"
                        className="w-full bg-transparent text-[20px] font-semibold tabular-nums text-white outline-none"
                      />
                      <span className="shrink-0 whitespace-nowrap text-[13px] text-white/60">a month</span>
                    </div>
                    <p className="mt-2 text-[12.5px] text-white/60">We start from ₹30,000. This number stays on your screen; we don&rsquo;t store it.</p>
                  </div>
                </div>

                <div>
                  <p className="text-[14px] font-medium text-white/75">Your sales team&rsquo;s salary, every year</p>
                  <p className="mt-1 text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-[68px]">
                    {inrLakhs(m.annualSalaryBill)}
                  </p>
                  <p className="mt-2 text-[14px] text-white/75">
                    {inrLakhs(m.monthlySalaryBill)} every month, for meetings you never get to see.
                  </p>

                  <div className="mt-7">
                    <div className="flex h-9 overflow-hidden rounded-lg bg-white/15" role="img" aria-label={`Sales Team VPV is ${m.percentOfAnnualSalary}% of one year's salary`}>
                      <div className="flex flex-1 items-center px-3 text-[12px] text-white/75">One year of salary</div>
                      <div className="bg-gradient-to-b from-[#F7DC86] to-[#E2B23E]" style={{ width: `${sliverPct}%` }} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                      <p className="text-[44px] font-semibold leading-none tracking-[-0.02em] text-[#F7DC86] tabular-nums">
                        {m.percentOfAnnualSalary < 0.01 ? "<0.01" : m.percentOfAnnualSalary}%
                      </p>
                      <p className="max-w-xs pb-1 text-[14px] leading-snug text-white/85">
                        of one year&rsquo;s salary gives you full sight of every meeting your team holds. Paid once, not every year.
                      </p>
                    </div>
                    <p className="mt-4 text-[13.5px] text-white/75">
                      {m.daysOfSalaryPerLogin < 1
                        ? "Each salesperson's login costs less than one day of their salary."
                        : `Each salesperson's login costs about ${Math.ceil(m.daysOfSalaryPerLogin)} days of their salary.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── What the MD gets ──────────────────────────────────── */}
            <h2 className="mt-12 text-[24px] font-semibold tracking-[-0.01em] text-vpv-ink">What you get as the MD</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <div
                  key={title}
                  className={`rounded-2xl border border-vpv-line bg-white p-5 ${i === FEATURES.length - 1 && FEATURES.length % 3 === 2 ? "lg:col-span-2" : ""}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-vpv-grad text-white">
                    <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[15.5px] font-semibold leading-snug text-vpv-ink">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>

            {/* ── The price ─────────────────────────────────────────── */}
            <div className="relative mt-12">
              {offerOpen && <OfferSeal size={124} percent={SALES_TEAM.percentOff} className="absolute -right-3 -top-12 z-10 sm:-right-6" />}
              <Card>
                <SectionTitle icon={Wallet} title="One login for each salesperson">
                  One flat price per login, however many you add. Paid once with your order; no monthly fee per salesperson.
                </SectionTitle>

                <div className="mt-7 grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
                  <div className="rounded-2xl bg-vpv-canvas p-6 text-center">
                    {offerOpen && (
                      <div className="mb-3 flex justify-center">
                        <StarBadge label={`${SALES_TEAM.percentOff}% off for our first ${LAUNCH_OFFER.limit} customers`} />
                      </div>
                    )}
                    {offerOpen && <p className="text-[17px] text-slate-400 line-through">{inr(SALES_TEAM.regularInr)}</p>}
                    <p className="text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-vpv-ink">{inr(seatPrice(offerOpen))}</p>
                    <p className="mt-2 text-[13px] text-slate-600">per salesperson, one time, + GST</p>
                  </div>
                  <div>
                    <p className="mb-2.5 text-[13.5px] font-medium text-vpv-ink">
                      Logins: {s.salesSeats} {s.salesSeats === 1 ? "salesperson" : "salespeople"}
                    </p>
                    <SeatsSlider value={s.salesSeats} onChange={setSeats} />
                    <p className="mt-1.5 text-[11.5px] text-slate-400">More than 50? Type the number in the calculator above.</p>
                    <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2 border-t border-vpv-line pt-5">
                      <span className="text-[14px] text-slate-600">
                        {s.salesSeats} × {inr(seatPrice(offerOpen))}
                      </span>
                      <span className="text-right">
                        {offerOpen && <span className="mr-2 text-[15px] text-slate-400 line-through">{inr(m.regularAddOnCost)}</span>}
                        <span className="text-[28px] font-semibold tabular-nums text-vpv-ink">{inr(m.addOnCost)}</span>
                        <span className="ml-1 text-[12px] text-slate-500">+ GST</span>
                      </span>
                    </div>
                    {offerOpen && (
                      <p className="mt-2 text-right text-[13px] font-semibold text-[#8A6100]">
                        You save {inr(m.regularAddOnCost - m.addOnCost)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        <div className="mt-10 flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <PrimaryButton onClick={() => void onContinue()} busy={busy} disabled={s.hasSalesTeam === null}>
            {s.hasSalesTeam ? `Add ${s.salesSeats} login${s.salesSeats === 1 ? "" : "s"} and continue` : "Continue to billing"}
          </PrimaryButton>
          <BackLink href="/assessment/plan">Back to your plan</BackLink>
        </div>
        {s.hasSalesTeam === null && <p className="mt-3 text-[12.5px] text-slate-500">Pick one to carry on.</p>}
      </FunnelBody>
    </>
  );
}
