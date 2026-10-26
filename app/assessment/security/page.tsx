/**
 * /assessment/security — step of the VPV pricing funnel.
 *
 * The funnel is real app pages, not screens of the marketing single-page
 * app: every step reads or writes the server (lead capture, the city
 * logistics table, the e-mail code, the priced order), none of which a
 * static bundle can do. See components/funnel/ for the steps and
 * lib/funnel.ts for the answers carried between them.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import Step3Security from "@/components/funnel/Step3Security";

export const metadata: Metadata = {
  title: "Stop your VPV being shared with competitors",
  description: "How one-time links, expiry, device limits and share restrictions keep your factory tour away from your competitors.",
  // Needs the answers from the step before it, so a visitor arriving from
  // a search result would land on a dead end.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <PageShell>
      <Step3Security />
    </PageShell>
  );
}
