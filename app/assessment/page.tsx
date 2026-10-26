/**
 * /assessment — step of the VPV pricing funnel.
 *
 * The funnel is real app pages, not screens of the marketing single-page
 * app: every step reads or writes the server (lead capture, the city
 * logistics table, the e-mail code, the priced order), none of which a
 * static bundle can do. See components/funnel/ for the steps and
 * lib/funnel.ts for the answers carried between them.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import Step1Info from "@/components/funnel/Step1Info";

export const metadata: Metadata = {
  title: "Find the right VPV for your factory",
  description: "Answer five quick questions about your plant and your factory city to see the VPV plan and the full price that fit.",
};

export default function Page() {
  return (
    <PageShell>
      <Step1Info />
    </PageShell>
  );
}
