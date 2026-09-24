"use client";

/**
 * ViewerLogoBadge — top-left VPV wordmark on the viewer.
 * No background chip; the transparent PNG sits directly on the scene with
 * a subtle drop-shadow so it stays legible over both bright and dark
 * panorama areas.
 */

import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";

export default function ViewerLogoBadge() {
  return (
    <div title="VPV — Virtual Plant Visit" className="select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={VPV_LOGO_URL}
        alt="VPV"
        draggable={false}
        style={{
          height: 40,
          width: "auto",
          display: "block",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
        }}
      />
    </div>
  );
}
