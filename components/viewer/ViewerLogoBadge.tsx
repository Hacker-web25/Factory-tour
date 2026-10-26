"use client";

/**
 * ViewerLogoBadge — rounded translucent glass pill carrying the VPV logo,
 * placed in the top-left of the viewer (or inside the optional top strip).
 */

import { VPV_LOGO_URL } from "@/components/dashboard/VpvLogo";
import BrandMark from "@/components/dashboard/BrandMark";

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
      <BrandMark src={VPV_LOGO_URL} height={Math.round(height * 0.55)} alt="VPV" />
    </div>
  );
}
