/**
 * /why-vpv — what buyers who never see the factory cost, on the visitor's
 * own numbers. Linked from the homepage hero ("Why VPV?") and the menu.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import WhyVpv from "@/components/site/WhyVpv";

export const metadata: Metadata = {
  title: "Why VPV: what unconverted leads cost your factory",
  description:
    "Put in your qualified leads, business per lead and conversion, and see your total opportunity, what is left on the table, and what a virtual plant visit can win back.",
  alternates: { canonical: "https://myvpv.com/why-vpv" },
};

export default function Page() {
  return (
    <PageShell>
      <WhyVpv />
    </PageShell>
  );
}
