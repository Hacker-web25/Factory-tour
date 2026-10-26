"use client";

/**
 * HiddenPageGuard — the pages of features that are not released yet
 * (lib/entitlements.ts, tier "hidden") are kept, but a customer who reaches
 * one by its address sees a short "not available yet" screen instead. Our
 * own team (the platform owner) sees the page as before.
 *
 * Mounted once in the root layout.
 */

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useEntitlements } from "@/lib/useEntitlements";
import type { FeatureKey } from "@/lib/entitlements";

const PAGES: Array<[RegExp, FeatureKey]> = [
  [/^\/visitors(\/|$)/, "visitor_analytics"],
  [/^\/analytics\//, "visitor_analytics"],
  [/^\/leads(\/|$)/, "leads"],
  [/\/recording-activity(\/|$)/, "meeting_recording"],
];

export default function HiddenPageGuard() {
  const pathname = usePathname();
  const ent = useEntitlements();
  const real = typeof window !== "undefined" ? window.location.pathname : "";
  const hit = PAGES.find(([re]) => re.test(pathname ?? "") || re.test(real));
  if (!hit || !ent.ready || !ent.hidden(hit[1])) return null;
  return (
    <div
      className="fixed inset-0 grid place-items-center bg-vpv-canvas p-5"
      style={{ zIndex: 2147481000 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl border border-vpv-line bg-white p-8 text-center shadow-xl">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-vpv-tint text-vpv-blue">
          <Sparkles size={22} />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-vpv-ink">Coming soon</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          This part of VPV is not available yet. We will tell you when it is.
        </p>
        <a
          href="/client"
          className="mt-6 inline-block rounded-full bg-vpv-grad px-6 py-2.5 text-[14px] font-semibold text-white"
        >
          Back to your dashboard
        </a>
      </div>
    </div>
  );
}
