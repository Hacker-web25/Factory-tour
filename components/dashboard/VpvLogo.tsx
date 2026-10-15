/**
 * VpvLogo — the official VPV wordmark used across every dashboard sidebar
 * (org_admin, sales, team, analytics) and the browser tab. Served from this
 * app's own /public folder (public/vpv-mark.png), so it loads on every host.
 */

import BrandMark from "./BrandMark";

export const VPV_LOGO_URL = "/vpv-logo-transparent.png";

export default function VpvLogo({
  sublabel = "FACTORY TOUR",
  height = 26,
}: {
  sublabel?: string | null;
  height?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark src={VPV_LOGO_URL} height={height} alt="VPV — Virtual Plant Visit" />
      {sublabel && (
        <span className="text-[9px] font-semibold tracking-[0.18em] text-vpv-muted mt-1">
          {sublabel}
        </span>
      )}
    </div>
  );
}
