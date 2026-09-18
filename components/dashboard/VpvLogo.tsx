/**
 * VpvLogo — the official VPV wordmark used across every dashboard sidebar
 * (org_admin, sales, team, analytics) and the browser tab. Sourced from the
 * live myvpv.com asset so the product and marketing site always match.
 */

export const VPV_LOGO_URL = "https://myvpv.com/vpv-mark.png";

export default function VpvLogo({
  sublabel = "FACTORY TOUR",
  height = 26,
}: {
  sublabel?: string | null;
  height?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={VPV_LOGO_URL}
        alt="VPV — Virtual Plant Visit"
        style={{ height, width: "auto", display: "block" }}
        draggable={false}
      />
      {sublabel && (
        <span className="text-[9px] font-semibold tracking-[0.18em] text-vpv-muted mt-1">
          {sublabel}
        </span>
      )}
    </div>
  );
}
