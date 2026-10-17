"use client";

/**
 * SitePlanCheckout — the bridge between the marketing site and payment.
 *
 * The site settles on a plan and a travel zone and keeps them, with the
 * buyer's details, in one localStorage key on this same origin. This
 * component reads that (lib/site/handoff.ts), confirms it back to the
 * buyer in plain numbers, and hands over to CheckoutFlow, which is the
 * same component /get-started and the dashboard use.
 *
 * Nothing here is trusted. The plan id and travel zone are names, not
 * amounts: the server prices them from lib/pricing.ts. The worst a
 * tampered browser can do is show itself the wrong figure and then be
 * charged the right one.
 *
 * Storage can be empty — a visitor who opened this URL directly, or who
 * blocks storage — so the page has to work from nothing, and says to go
 * back and choose a plan rather than guessing one.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import CheckoutFlow from "./CheckoutFlow";
import { readHandoff, type Handoff } from "@/lib/site/handoff";
import { SITE_PLANS, TRAVEL_FEES, inr, sitePlanQuote } from "@/lib/pricing";

export default function SitePlanCheckout() {
  // Read on the client only: localStorage does not exist while this is
  // prerendered, and a server guess would flash the wrong plan.
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  useEffect(() => {
    setHandoff(readHandoff(window.location.search));
  }, []);

  if (!handoff) {
    return (
      <div className="flex items-center gap-3 text-[14px] text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading your selection…
      </div>
    );
  }

  const { planId, travel, buyer } = handoff;

  if (!planId || !travel) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-vpv-line bg-white p-8 text-center">
        <h1 className="text-[24px] font-semibold tracking-tight text-vpv-ink">
          Let&rsquo;s pick your plan first
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          {planId
            ? "We still need to know where your factory is, so we can add travel for the shoot."
            : "The assessment takes a couple of minutes and recommends the smallest plan that covers everything you need."}
        </p>
        <Link
          href="/assessment"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-vpv-grad px-6 py-3 text-[14px] font-semibold text-white"
        >
          Start the assessment <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  const quote = sitePlanQuote(planId, travel);
  const plan = SITE_PLANS[planId];

  return (
    <>
      <nav className="mb-8 text-[12.5px] text-vpv-muted">
        <Link href="/plans" className="hover:text-vpv-blue">
          Plans
        </Link>
        <span className="mx-2 text-vpv-line">/</span>
        <span className="text-vpv-ink">Checkout</span>
      </nav>

      <h1 className="text-[30px] font-semibold tracking-tight text-vpv-ink sm:text-[36px]">
        {plan.name}
      </h1>
      <p className="mt-2 max-w-xl text-[16px] text-slate-600">
        {plan.scenes} areas of your factory, filmed in one visit to{" "}
        {TRAVEL_FEES[travel].label.toLowerCase()}, and a dashboard your whole
        sales team can use. {inr(quote.amountInr)} + GST today.{" "}
        <Link href="/assessment/plan" className="text-vpv-blue underline underline-offset-2">
          Change plan
        </Link>
      </p>

      <div className="mt-9">
        <CheckoutFlow purpose="site_plan" sitePlanId={planId} travel={travel} prefill={buyer} />
      </div>
    </>
  );
}
