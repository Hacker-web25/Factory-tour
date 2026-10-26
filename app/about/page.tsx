/**
 * /about — About us.
 *
 * Only states what is true of the product today: no customer counts, no
 * named clients, no awards. Add those here once they can be evidenced.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Check, Eye, Globe2, Lock, Sparkles } from "lucide-react";
import { PageHero, PageShell } from "@/components/legal/LegalPage";
import { COMPANY, companyIdentity } from "@/lib/company";

export const metadata: Metadata = {
  title: "About us",
  description:
    "VPV (Virtual Plant Visit) lets manufacturers show their plants to customers anywhere in the world through premium, secure 360° virtual tours.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/about" },
};

const STEPS = [
  {
    n: "01",
    title: "Capture",
    text: "Upload 360° panoramas of your plant. VPV turns them into a connected, walkable tour.",
  },
  {
    n: "02",
    title: "Guide",
    text: "Add hotspots, narration and information that explain your process, quality and scale.",
  },
  {
    n: "03",
    title: "Present",
    text: "Run live walkthroughs with a customer, or send a private link they can open at their own pace.",
  },
];

const PRINCIPLES = [
  {
    icon: Eye,
    title: "Show the real plant",
    text: "Buyers trust what they can see for themselves. VPV puts your facility in front of them without a flight.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Tours are shared by private link, with passwords, device limits and per-organisation data isolation.",
  },
  {
    icon: Sparkles,
    title: "Premium, not noisy",
    text: "A calm, polished experience that reflects the standard of the factory it represents.",
  },
  {
    icon: Globe2,
    title: "Built for exporters",
    text: "Made for manufacturers who sell across borders and need buyers to understand their scale and standards early.",
  },
];

/** The three things the founder's note promises, as pointers. */
const GOALS = [
  "Win more orders.",
  "Earn the respect you deserve.",
  "Feel proud when you present your factory to a buyer.",
];

/** The founder's note: the first thing a visitor should read on this page. */
function FounderNote() {
  return (
    <section
      aria-labelledby="founder-note"
      className="border-b border-vpv-line bg-gradient-to-b from-vpv-tint/50 to-transparent"
    >
      <div className="mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          {/* The note. */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-vpv-blue">
              A note from the founder
            </p>
            <h2
              id="founder-note"
              className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-tight text-vpv-ink sm:text-[38px]"
            >
              You&rsquo;ve built something worth showing.
            </h2>

            <div className="mt-6 space-y-5 text-[16px] leading-8 text-slate-700">
              <p>
                I have always believed that Indian manufacturers deserve more than
                just another price comparison.
              </p>
              <p>
                You have spent years building your factory, investing in machines,
                training people and perfecting your products. But how often does a
                buyer get to see what you have actually built?
              </p>
              <p>
                That is why I created{" "}
                <strong className="font-semibold text-vpv-ink">
                  VPV (Virtual Plant Visit)
                </strong>
                . I wanted to help you show your factory to buyers anywhere in the
                world, without waiting for them to visit in person.
              </p>
            </div>

            {/* My goal is simple — the three pointers. */}
            <div className="mt-7 rounded-2xl border border-vpv-line bg-white/70 p-6">
              <p className="text-[15.5px] font-semibold text-vpv-ink">
                My goal is simple. I want to help you:
              </p>
              <ul className="mt-4 space-y-2.5">
                {GOALS.map((g) => (
                  <li key={g} className="flex gap-3 text-[15.5px] leading-relaxed text-slate-700">
                    <Check size={18} className="mt-1 shrink-0 text-vpv-blue" aria-hidden />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 space-y-5 text-[16px] leading-8 text-slate-700">
              <p>
                VPV comes from my experience of over two decades in branding and
                communication through{" "}
                <a
                  href="https://www.thenextdesign.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-vpv-blue underline underline-offset-2"
                >
                  The Next Design
                </a>
                , which I founded in 2004.
              </p>
              <p>
                I know your factory is more than a workplace. It represents your
                hard work, your investment and your dream.
              </p>
            </div>

            {/* The line the whole note is written for. */}
            <blockquote className="mt-7 border-l-[3px] border-vpv-blue pl-5 text-[19px] font-semibold leading-relaxed tracking-tight text-vpv-ink sm:text-[21px]">
              I want the world to see it the way you see it.
            </blockquote>

            <div className="mt-8 border-t border-vpv-line pt-6">
              <p className="text-[15px] text-slate-600">Warm regards,</p>
              <p className="mt-2 text-[18px] font-semibold tracking-tight text-vpv-ink">
                Nitin Gupta
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                Founder, The Next Design
                <br />
                Author &middot; Export Marketing Strategist
              </p>
              <p className="mt-4 text-[13.5px] font-semibold text-vpv-blue">
                Built for manufacturers. Created to help them win.
              </p>
            </div>
          </div>

          {/* The portrait. */}
          <div className="order-first lg:order-none">
            <div className="relative mx-auto w-full max-w-[380px]">
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 top-8 rounded-[32px] bg-vpv-grad opacity-[0.13]"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/nitin-gupta.webp"
                alt="Nitin Gupta, founder of The Next Design and creator of VPV"
                width={760}
                height={880}
                className="relative mx-auto h-auto w-full max-w-[340px] object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="About us"
        title="Your plant, visited by customers anywhere in the world."
        summary="VPV — Virtual Plant Visit — is premium 360° virtual-tour software for manufacturers."
      />

      <FounderNote />

      <div className="mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5 text-[16px] leading-8 text-slate-700">
            <h2 className="text-[26px] font-semibold tracking-tight text-vpv-ink">
              Why VPV exists
            </h2>
            <p>
              A customer’s decision to trust a manufacturer often begins with
              a visit to the plant. For exporters and growing manufacturers,
              that visit is expensive, slow, and sometimes impossible.
            </p>
            <p>
              VPV removes that distance. It lets your sales team walk a buyer
              through your factory in real time — or lets the buyer explore on
              their own — with the detail, narration and information that
              make your standards visible.
            </p>
            <p>
              Alongside the tours, VPV gives your team a presenter dashboard,
              viewer analytics and an optional AI-assisted review of client
              meetings, so every walkthrough teaches you something.
            </p>
          </div>

          <div className="rounded-2xl border border-vpv-line bg-vpv-canvas/60 p-7">
            <h2 className="text-[18px] font-semibold text-vpv-ink">How it works</h2>
            <ol className="mt-5 space-y-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="text-[13px] font-semibold tabular-nums text-vpv-blue pt-1">
                    {s.n}
                  </span>
                  <div>
                    <div className="text-[15.5px] font-semibold text-vpv-ink">{s.title}</div>
                    <p className="mt-1 text-[14px] leading-relaxed text-slate-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <h2 className="mt-16 text-[26px] font-semibold tracking-tight text-vpv-ink">
          What we stand for
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="rounded-2xl border border-vpv-line p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-vpv-tint text-vpv-blue">
                <p.icon size={19} />
              </span>
              <h3 className="mt-4 text-[16px] font-semibold text-vpv-ink">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-vpv-line p-7 lg:p-9 grid gap-6 lg:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight text-vpv-ink">
              The company behind VPV
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              VPV is built and operated by {companyIdentity()}. We take
              security, privacy and straightforward billing seriously; you can
              read how in our{" "}
              <Link href="/security" className="text-vpv-blue underline underline-offset-2">Security</Link>,{" "}
              <Link href="/privacy" className="text-vpv-blue underline underline-offset-2">Privacy</Link> and{" "}
              <Link href="/terms" className="text-vpv-blue underline underline-offset-2">Terms</Link> pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              href="/plans"
              className="rounded-full bg-vpv-grad px-5 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              See pricing
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-vpv-blue/40 px-5 py-2.5 text-[13.5px] font-semibold text-vpv-blue hover:bg-vpv-tint transition-colors"
            >
              Contact us
            </Link>
          </div>
        </div>
        <p className="sr-only">{COMPANY.productName}</p>
      </div>
    </PageShell>
  );
}
