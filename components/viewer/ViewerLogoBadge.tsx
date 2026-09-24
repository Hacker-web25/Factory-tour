"use client";

/**
 * ViewerLogoBadge — small rounded-square glass tile in the top-left of the
 * viewer that carries the VPV wordmark. Discreet, always visible, matches
 * the brand aesthetic without competing with scene content.
 */

import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";

export default function ViewerLogoBadge() {
  return (
    <div
      title="VPV — Virtual Plant Visit"
      className="w-11 h-11 rounded-xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_10px_30px_-10px_rgba(11,61,145,0.4)] grid place-items-center"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={VPV_LOGO_URL}
        alt="VPV"
        draggable={false}
        style={{ height: 20, width: "auto", display: "block" }}
      />
    </div>
  );
}
