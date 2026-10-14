/**
 * "/" — the public front page of myvpv.com.
 *
 * Server component: the whole landing page (and its policy links) is in
 * the HTML that crawlers and payment-gateway reviewers fetch. Signed-in
 * owners are swapped to their dashboard by HomeGate once the browser has
 * checked its session.
 */

import type { Metadata } from "next";
import HomeGate from "@/components/home/HomeGate";
import Landing from "@/components/home/Landing";

export const metadata: Metadata = {
  title: { absolute: "VPV — Virtual Plant Visit | Real Factories. Real Confidence." },
  description:
    "VPV lets your buyers explore your real factory online, before a physical visit. Premium 360° virtual plant tours with narration, hotspots and private share links.",
  alternates: { canonical: "https://myvpv.com/" },
};

export default function HomePage() {
  return <HomeGate landing={<Landing />} />;
}
