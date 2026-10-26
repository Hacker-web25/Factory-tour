/**
 * /get-started — where a Basic customer buys VPV on their own.
 *
 * No account needed to reach this page: the workspace and the login are
 * created by the payment. Pro and Ultra do not come through here; they
 * go to the enquiry form on /contact.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/legal/LegalPage";
import CheckoutFlow from "@/components/billing/CheckoutFlow";
import { SCENE_MIN, SCENE_MAX, priceForScenes, inr } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Choose how many scenes your virtual plant visit needs, pay once, and your branded workspace is ready in minutes.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/get-started" },
};

export default function GetStartedPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-5 py-12 lg:py-16">
        <nav className="mb-8 text-[12.5px] text-vpv-muted">
          <Link href="/pricing" className="hover:text-vpv-blue">
            Pricing
          </Link>
          <span className="mx-2 text-vpv-line">/</span>
          <span className="text-vpv-ink">Get started</span>
        </nav>

        <CheckoutFlow
          purpose="basic_licence"
          title="Build your virtual plant visit."
          subtitle={`Choose how many rooms your customers should walk through. From ${inr(
            priceForScenes(SCENE_MIN)
          )} for ${SCENE_MIN} scenes up to ${SCENE_MAX} — and the price per scene drops with every one you add.`}
        />
      </div>
    </PageShell>
  );
}
