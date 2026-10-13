"use client";

/**
 * TitleChip — glassmorphism chip in the TOP-RIGHT of the viewer that shows
 * the tour title + the organization it belongs to. Collapses to a small
 * icon-only pill after a moment so the scene stays uncluttered, and
 * expands on hover. Purely decorative — no side effects.
 */

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

export default function TitleChip({
  tourTitle,
  orgName,
}: {
  tourTitle: string;
  orgName?: string | null;
}) {
  const [hovered, setHovered] = useState(false);
  const [firstOpen, setFirstOpen] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setFirstOpen(false), 2500);
    return () => window.clearTimeout(t);
  }, []);

  const open = hovered || firstOpen;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-xl border border-white/60 text-vpv-navy shadow-[0_10px_30px_-10px_rgba(11,61,145,0.4)] transition-all duration-300 overflow-hidden"
        style={{
          paddingLeft: 10,
          paddingRight: open ? 14 : 10,
          height: 36,
          maxWidth: open ? 520 : 36,
        }}
      >
        <Layers size={15} className="shrink-0 text-vpv-blue" />
        <div
          className="min-w-0 flex items-baseline gap-1.5 transition-opacity duration-200"
          style={{ opacity: open ? 1 : 0 }}
        >
          <span className="text-[13px] font-semibold whitespace-nowrap">
            {tourTitle}
          </span>
          {orgName && (
            <>
              <span className="text-vpv-muted text-[12px]">·</span>
              <span className="text-[12.5px] text-vpv-ink truncate">
                {orgName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
