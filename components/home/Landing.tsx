/**
 * Landing — the public front page of myvpv.com.
 *
 * Server component, no client JS. It only states what is true of the
 * product today (no customer counts, logos or testimonials): add those
 * here once they can be evidenced. Every price comes from lib/pricing.ts.
 * The footer carries all seven policy pages plus the company pages.
 */

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Eye,
  Globe2,
  Languages,
  Link2,
  Lock,
  Presentation,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { PageShell } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";
import {
  PRO_MONTHLY_INR,
  SCENE_MAX,
  SCENE_MIN,
  SUPPORT_FREE_MONTHS,
  ULTRA_MONTHLY_INR,
  inr,
  priceForScenes,
} from "@/lib/pricing";

const STEPS = [
  {
    n: "01",
    title: "Capture",
    text: "Upload 360° panoramas of your plant. VPV links them into one connected, walkable tour.",
  },
  {
    n: "02",
    title: "Guide",
    text: "Add hotspots, narration and information that explain your process, quality and scale.",
  },
  {
    n: "03",
    title: "Present",
    text: "Walk a buyer through live, or send a private link they can open at their own pace.",
  },
];

const FEATURES = [
  {
    icon: Eye,
    title: "360° tours with hotspots",
    text: "Video, PDF, audio and image hotspots let each area of the plant explain itself.",
  },
  {
    icon: Languages,
    title: "Narration and subtitles",
    text: "Guided auto-tour with per-scene narration, subtitles and multiple languages.",
  },
  {
    icon: Presentation,
    title: "Live Present mode",
    text: "Take a buyer through the plant on a call from a clean presenter dashboard.",
  },
  {
    icon: Link2,
    title: "Private share links",
    text: "Send a link protected by a password, a device limit or a QR code. Revoke it any time.",
  },
  {
    icon: BarChart3,
    title: "Viewer analytics",
    text: "See who opened the tour, where they spent time, and keep leads in a client pipeline.",
  },
  {
    icon: Users,
    title: "Your team, your brand",
    text: "A workspace at your own address with your logo, plus accounts for your sales team.",
  },
];

export default function Landing() {
  const fromPrice = inr(priceForScenes(SCENE_MIN));

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "VPV - Virtual Plant Visit",
    alternateName: "VPV",
    url: COMPANY.website,
    logo: `${COMPANY.website}/vpv-mark.png`,
    slogan: "Real Factories. Real Confidence.",
    description:
      "VPV (Virtual Plant Visit) lets buyers explore your real factory online, before a physical visit.",
    email: COMPANY.emails.support,
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      {/* ───────────── Hero ───────────── */}
      <section
        className="border-b border-vpv-line"
        style={{
          backgroundImage:
            "radial-gradient(60% 110% at 95% 0%, rgba(25,184,242,0.14), rgba(255,255,255,0) 60%), radial-gradient(50% 100% at 0% 0%, rgba(20,104,216,0.09), rgba(255,255,255,0) 55%)",
        }}
      >
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-16 lg:pt-20 lg:pb-24 grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-vpv-blue mb-4">
              Virtual Plant Visit
            </div>
            <h1 className="text-[38px] sm:text-[52px] leading-[1.06] font-semibold tracking-tight text-vpv-ink">
              Let buyers explore your real factory online, before a physical
              visit.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-slate-600">
              Real factories. Real confidence. VPV turns 360° photos of your
              plant into a premium, private virtual tour that your sales team
              can present live or send as a link, so the conversation does not
              have to wait for a visit.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/get-started"
                className="inline-flex items-center gap-2 rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(20,104,216,0.75)] hover:opacity-90 transition-opacity"
              >
                Get started <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-full border border-vpv-line bg-white px-6 py-3 text-[14px] font-semibold text-vpv-ink hover:border-vpv-blue/40 hover:text-vpv-blue transition-colors"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-vpv-muted">
              From {fromPrice} for {SCENE_MIN} scenes · pay once · your branded
              workspace is ready in minutes.
            </p>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* ───────────── How it works ───────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <SectionTitle eyebrow="How it works" title="From plant floor to buyer’s screen in three steps." />
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-vpv-line p-7 bg-white">
              <span className="text-[13px] font-semibold tabular-nums text-vpv-blue">{s.n}</span>
              <h3 className="mt-3 text-[18px] font-semibold text-vpv-ink">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ───────────── Features ───────────── */}
      <section className="border-y border-vpv-line bg-vpv-canvas/70">
        <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
          <SectionTitle
            eyebrow="What you get"
            title="Everything a buyer needs to trust the plant."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-vpv-line bg-white p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
                  <f.icon size={19} />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-vpv-ink">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Pricing teaser ───────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <SectionTitle
          eyebrow="Pricing"
          title="Pay once for the scenes you need, or go unlimited."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <PlanCard
            name="Basic"
            price={`from ${fromPrice}`}
            unit="one-time"
            lines={[
              `Choose ${SCENE_MIN} to ${SCENE_MAX} scenes`,
              "The price per scene falls as you add more",
              `Technical support free for ${SUPPORT_FREE_MONTHS} months`,
            ]}
            href="/get-started"
            cta="Get started"
            primary
          />
          <PlanCard
            name="Pro"
            price={inr(PRO_MONTHLY_INR)}
            unit="per month"
            lines={["Unlimited scenes", "Add scenes any time", "Support included"]}
            href="/contact"
            cta="Talk to us"
          />
          <PlanCard
            name="Ultra"
            price={inr(ULTRA_MONTHLY_INR)}
            unit="per month"
            lines={[
              "Everything in Pro",
              "AI meeting review: transcript, score, insights",
              "Priority support",
            ]}
            href="/contact"
            cta="Talk to us"
          />
        </div>
        <p className="mt-5 text-[12.5px] text-vpv-muted">
          Prices are in INR and include GST. Online payments are processed by
          Razorpay. <Link href="/pricing" className="text-vpv-blue underline underline-offset-2">Full price list and comparison</Link>
        </p>
      </section>

      {/* ───────────── Trust ───────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:pb-20">
        <div className="rounded-2xl border border-vpv-line p-7 lg:p-9 grid gap-6 lg:grid-cols-3">
          <TrustItem
            icon={Lock}
            title="Private by design"
            text="Each organisation’s data is isolated, and tours are shared by private link, not listed publicly."
          />
          <TrustItem
            icon={ShieldCheck}
            title="Clear policies"
            text={
              <>
                Plain-language{" "}
                <Link href="/terms" className="text-vpv-blue underline underline-offset-2">Terms</Link>,{" "}
                <Link href="/privacy" className="text-vpv-blue underline underline-offset-2">Privacy</Link> and{" "}
                <Link href="/refund-policy" className="text-vpv-blue underline underline-offset-2">Refund</Link> policies.
              </>
            }
          />
          <TrustItem
            icon={Globe2}
            title="Built for exporters"
            text="For manufacturers who sell across borders and need buyers to understand their scale and standards early."
          />
        </div>
      </section>

      {/* ───────────── Closing call to action ───────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-3xl bg-vpv-grad px-7 py-12 lg:px-14 lg:py-14 text-white flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-[26px] sm:text-[32px] font-semibold tracking-tight leading-tight">
              Show your plant to the next buyer before they land.
            </h2>
            <p className="mt-3 text-[15px] text-white/80">
              Questions first? Write to {COMPANY.emails.support} and a person
              will reply.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/get-started"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-vpv-navy hover:bg-white/90 transition-colors"
            >
              Get started <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full border border-white/40 px-6 py-3 text-[14px] font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/* ─────────────────────────── Pieces ─────────────────────────── */

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-vpv-blue mb-3">
        {eyebrow}
      </div>
      <h2 className="text-[28px] sm:text-[34px] leading-[1.12] font-semibold tracking-tight text-vpv-ink max-w-2xl">
        {title}
      </h2>
    </div>
  );
}

function PlanCard({
  name,
  price,
  unit,
  lines,
  href,
  cta,
  primary = false,
}: {
  name: string;
  price: string;
  unit: string;
  lines: string[];
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-7 flex flex-col ${
        primary ? "border-vpv-blue/40 shadow-[0_18px_40px_-24px_rgba(20,104,216,0.55)]" : "border-vpv-line"
      }`}
    >
      <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-vpv-blue">{name}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[30px] font-semibold tracking-tight text-vpv-ink">{price}</span>
        <span className="text-[13px] text-vpv-muted">{unit}</span>
      </div>
      <ul className="mt-5 space-y-2.5 text-[14px] text-slate-600 flex-1">
        {lines.map((l) => (
          <li key={l} className="flex gap-2.5">
            <Check size={16} className="mt-0.5 shrink-0 text-vpv-blue" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-7 inline-flex justify-center rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-colors ${
          primary
            ? "bg-vpv-grad text-white hover:opacity-90"
            : "border border-vpv-line text-vpv-ink hover:border-vpv-blue/40 hover:text-vpv-blue"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function TrustItem({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Lock;
  title: string;
  text: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
        <Icon size={19} />
      </span>
      <div>
        <h3 className="text-[15.5px] font-semibold text-vpv-ink">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">{text}</p>
      </div>
    </div>
  );
}

/** A drawn stand-in for a tour: an illustration, not a screenshot. */
function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative">
      <div className="relative aspect-[16/11] overflow-hidden rounded-3xl border border-vpv-line shadow-[0_30px_60px_-30px_rgba(11,61,145,0.55)] bg-vpv-grad">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            transform: "perspective(500px) rotateX(58deg) translateY(30%) scale(1.8)",
            transformOrigin: "50% 100%",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
        <Hotspot className="left-[22%] top-[44%]" />
        <Hotspot className="left-[58%] top-[34%]" />
        <Hotspot className="left-[74%] top-[58%]" />
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] font-semibold text-vpv-ink">
          <Sparkles size={13} className="text-vpv-blue" /> Scene 3 of 8
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl bg-white/90 px-4 py-3">
          <div>
            <div className="text-[12.5px] font-semibold text-vpv-ink">Production line</div>
            <div className="text-[11px] text-vpv-muted">Narration on · English</div>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full ${i === 2 ? "w-5 bg-vpv-blue" : "w-1.5 bg-vpv-line"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hotspot({ className }: { className: string }) {
  return (
    <span className={`absolute grid h-8 w-8 place-items-center ${className}`}>
      <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
      <span className="relative h-3.5 w-3.5 rounded-full border-2 border-vpv-blue bg-white" />
    </span>
  );
}
