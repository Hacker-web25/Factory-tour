/**
 * /assessment/welcome — where a buyer lands the moment their payment goes
 * through. See components/funnel/PaymentWelcome.tsx.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import PaymentWelcome from "@/components/funnel/PaymentWelcome";

export const metadata: Metadata = {
  title: "Welcome to VPV",
  description: "Your payment is confirmed. Here is what happens next.",
  // Personal to one buyer and one order.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <PageShell>
      <PaymentWelcome />
    </PageShell>
  );
}
