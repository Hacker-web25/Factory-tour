/**
 * /assessment/sales-team — step of the VPV pricing funnel.
 *
 * The funnel is real app pages, not screens of the marketing single-page
 * app: every step reads or writes the server. See components/funnel/ for
 * the steps and lib/funnel.ts for the answers carried between them.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import Step5SalesTeam from "@/components/funnel/Step5SalesTeam";

export const metadata: Metadata = {
  title: "Your sales team",
  description: "See every meeting your sales team holds: when, where, with which client, and how far each deal has moved.",
  // Needs the answers from the step before it.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <PageShell>
      <Step5SalesTeam />
    </PageShell>
  );
}
