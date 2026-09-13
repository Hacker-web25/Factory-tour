"use client";

/**
 * Small reusable atoms for the sales-team analytics dashboard.
 *
 * Every atom is designed to feel premium without being loud:
 *   • generous whitespace,
 *   • one hero metric per element,
 *   • motion via CSS-composited props (transform + opacity),
 *   • never uses hex colours directly — reads from Tailwind theme
 *     tokens so a future white-label swap is one change.
 *
 * Intentionally NO chart library — hand-rolled SVG keeps the bundle
 * small and the visual style consistent.
 */

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/* ------------------------------ CountUp -------------------------------- */

/** Animated number counter. Runs once on mount, cubic-out easing. */
export function CountUp({
  to,
  duration = 900,
  format = (n: number) => n.toLocaleString("en-IN"),
  suffix,
}: {
  to: number;
  duration?: number;
  format?: (n: number) => string;
  suffix?: string;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (to === 0) {
      setV(0);
      return;
    }
    let raf: number | null = null;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [to, duration]);
  return (
    <>
      {format(v)}
      {suffix && <span className="text-white/40 text-[0.7em] ml-1">{suffix}</span>}
    </>
  );
}

/* ----------------------------- DeltaChip ------------------------------- */

export function DeltaChip({ pct }: { pct: number }) {
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-white/40 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full">
        <Minus size={9} /> 0%
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10.5px] font-medium px-1.5 py-0.5 rounded-full border ${
        up
          ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25"
          : "text-rose-300 bg-rose-500/10 border-rose-500/25"
      }`}
    >
      {up ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
      {Math.abs(pct)}%
    </span>
  );
}

/* ----------------------------- StatusDot ------------------------------- */

export function StatusDot({
  status,
}: {
  status: "online" | "idle" | "offline";
}) {
  const color =
    status === "online"
      ? "bg-emerald-400"
      : status === "idle"
        ? "bg-amber-400"
        : "bg-neutral-600";
  return (
    <span className="relative inline-flex w-2 h-2">
      <span
        className={`absolute inset-0 rounded-full ${color} ${
          status === "online" ? "animate-ping opacity-60" : "opacity-0"
        }`}
      />
      <span className={`relative w-2 h-2 rounded-full ${color}`} />
    </span>
  );
}

/* --------------------------- SparklineMini ----------------------------- */

/** Tiny SVG line chart. No axes, no labels — just the shape of the
 *  trend. Gradient fill under the line for extra "expensive" feel. */
export function SparklineMini({
  values,
  width = 120,
  height = 32,
  color = "#22c55e",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length === 0) {
    return <div style={{ width, height }} />;
  }
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const step = width / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const gradId = `spark-grad-${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${gradId})`}
      />
    </svg>
  );
}

/* ----------------------------- WeekStrip ------------------------------- */

/** Seven dots representing the last 7 days. Filled + tinted by
 *  activity intensity. */
export function WeekStrip({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="flex items-end gap-0.5">
      {values.map((v, i) => {
        const intensity = v / max;
        const label = dayLabels[(new Date().getDay() - (6 - i) + 7) % 7];
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-3 rounded-sm bg-accent"
              style={{
                height: `${Math.max(4, intensity * 20)}px`,
                opacity: v === 0 ? 0.12 : 0.35 + intensity * 0.65,
              }}
              title={`${v} presentation${v === 1 ? "" : "s"}`}
            />
            <span className="text-[8px] text-white/25">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
