"use client";

/**
 * TitleChip — glassmorphism chip in the top-left that shows the tour +
 * active scene name. Collapses to a compact icon-only pill after a moment
 * so the scene stays uncluttered, and expands on hover (or when the scene
 * changes). Purely decorative — no side effects.
 */

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

export default function TitleChip({
  tourTitle,
  sceneName,
}: {
  tourTitle: string;
  sceneName: string;
}) {
  const [hovered, setHovered] = useState(false);
  // Show once briefly on first mount so viewers see where they are,
  // then stay collapsed — only hover opens it after that.
  const [firstOpen, setFirstOpen] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setFirstOpen(false), 2500);
    return () => window.clearTimeout(t);
  }, []);

  const open = hovered || firstOpen;

  return (
    <div
      className="absolute top-4 left-4 z-30 select-none"
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
          style={{
            opacity: open ? 1 : 0,
          }}
        >
          <span className="text-[13px] font-semibold whitespace-nowrap">
            {tourTitle}
          </span>
          <span className="text-vpv-muted text-[12px]">·</span>
          <span className="text-[12.5px] text-vpv-ink truncate">
            {sceneName}
          </span>
        </div>
      </div>
    </div>
  );
}
