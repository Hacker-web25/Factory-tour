/**
 * /why-vpv — the benefits of a virtual plant visit. Linked from the homepage hero ("Why VPV?") and the menu.
 */

import type { Metadata } from "next";
import { PageShell } from "@/components/legal/LegalPage";
import WhyVpv from "@/components/site/WhyVpv";

export const metadata: Metadata = {
  title: "Why VPV: what a virtual plant visit does for your sales",
  description:
    "Win buyer confidence, present like the best in your industry and reach buyers wherever they are: nine ways a virtual plant visit changes how manufacturers sell.",
  alternates: { canonical: "https://myvpv.com/why-vpv" },
};

export default function Page() {
  return (
    <PageShell>
      <WhyVpv />
    </PageShell>
  );
}
