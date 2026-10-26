/**
 * /experience — the live tour the homepage hero frames.
 *
 * Not a page anyone navigates to: the marketing site's hero puts it in an
 * iframe. Kept out of search results and the sitemap.
 */

import type { Metadata } from "next";
import HeroExperience from "@/components/site/HeroExperience";

export const metadata: Metadata = {
  title: "Live VPV",
  robots: { index: false, follow: false },
};

export default function ExperiencePage() {
  return <HeroExperience />;
}
