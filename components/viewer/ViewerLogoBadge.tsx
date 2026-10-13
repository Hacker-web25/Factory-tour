"use client";

/**
 * ViewerLogoBadge — rounded translucent glass pill carrying the VPV logo,
 * placed in the top-left of the viewer (or inside the optional top strip).
 */

import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";

export default function ViewerLogoBadge({
  height = 36,
}: {
  height?: number;
}) {
  return (
    <div
      title="VPV — Virtual Plant Visit"
      className="select-none inline-flex items-center rounded-full bg-white/30 backdrop-blur-xl border border-white/40 shadow-[0_10px_30px_-12px_rgba(11,61,145,0.35)]"
      style={{ height, paddingLeft: 14, paddingRight: 14 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={VPV_LOGO_URL}
        alt="VPV"
        draggable={false}
        style={{
          height: Math.round(height * 0.55),
          width: "auto",
          display: "block",
        }}
      />
    </div>
  );
}
