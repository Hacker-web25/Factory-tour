/**
 * /buy — Buy now: choose a plan, tell us where to shoot and how to bill you,
 * and pay, all on one page. The "Buy now" strip under the plan cards on /plans
 * links here with the plan already chosen (?plan=premium&billing=annual).
 *
 * A real app page rather than a screen of the marketing bundle, for the same
 * reason as the assessment: it talks to the server (the e-mail code, the coupon,
 * the priced order) and needs a form that can be checked.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import BuyNow from "@/components/buy/BuyNow";

export const metadata: Metadata = {
  title: "Buy VPV",
  description: "Choose your VPV plan, add the extras you need and pay online. Your GST tax invoice, with your GSTIN, comes by e-mail.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/buy" },
};

export default function Page() {
  return (
    <PageShell>
      <Suspense fallback={<div className="mx-auto h-[60vh] max-w-6xl px-5 py-12" />}>
        <BuyNow />
      </Suspense>
    </PageShell>
  );
}
