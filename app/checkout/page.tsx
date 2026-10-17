/**
 * /checkout — paying for a plan chosen on the marketing site.
 *
 * The site (the single-page app) runs the assessment and settles on a
 * plan and a travel zone, then sends the visitor here. This page picks
 * that up, shows the full breakdown and runs the SAME payment flow as
 * /get-started: one order route, one Razorpay integration, one set of
 * guarantees about double clicks, refunds and invoices.
 *
 * It never decides a price. It names a plan; the server prices it from
 * lib/pricing.ts and charges that.
 *
 * No account is needed to be here: the workspace and the login are
 * created by the payment, exactly as they are for a Basic licence.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import SitePlanCheckout from "@/components/billing/SitePlanCheckout";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Pay for your VPV and we will start the shoot.",
  // A transactional page with the buyer's own selections on it. Nothing
  // to index, and a search result landing here would show an empty form.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-5 py-12 lg:py-16">
        <SitePlanCheckout />
      </div>
    </PageShell>
  );
}
