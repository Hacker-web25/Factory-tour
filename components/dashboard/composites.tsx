"use client";

/**
 * Composite dashboard widgets — assembled from the atoms.
 *
 * Rendered on the org_admin sales-team analytics page. Every widget:
 *   • takes fully-derived data (no queries inside),
 *   • fades in on mount with a small stagger,
 *   • uses a single accent hue + generous whitespace,
 *   • degrades gracefully when a data field is missing.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Users2,
  Clock,
  Presentation,
  Globe2,
  Trophy,
  Activity,
  Sparkles,
  X,
  MapPin,
  ChevronRight,
} from "lucide-react";
import {
  CountUp,
  DeltaChip,
  SparklineMini,
  StatusDot,
  WeekStrip,
} from "@/components/dashboard/atoms";
import {
  formatHours,
  formatRelative,
  statusFor,
  type Insight,
  type MemberStats,
  type TeamMember,
  type TeamOverview,
  type TourEvent,
} from "@/lib/salesAnalytics";

/* ------------------------------ KpiTile -------------------------------- */

export function KpiTile({
  label,
  value,
  suffix,
  delta,
  sparkline,
  icon,
  accent = "#a78bfa",
}: {
  label: string;
  value: number;
  suffix?: string;
  delta: number;
  sparkline: number[];
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="relative bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 overflow-hidden group hover:border-white/15 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        <DeltaChip pct={delta} />
      </div>
      <div className="text-[11px] uppercase tracking-wider text-white/40 mb-1">
        {label}
      </div>
      <div className="text-[32px] font-semibold leading-none text-white mb-3 tabular-nums">
        <CountUp to={value} suffix={suffix} />
      </div>
      <div className="opacity-70 group-hover:opacity-100 transition-opacity">
        <SparklineMini values={sparkline} width={220} height={28} color={accent} />
      </div>
    </div>
  );
}

/* ------------------------------ MemberCard ----------------------------- */

export function MemberCard({
  member,
  stats,
  onClick,
}: {
  member: TeamMember;
  stats: MemberStats;
  onClick?: () => void;
}) {
  // Prefer presence-derived status when available (heartbeat is more
  // accurate than "most recent event") but fall back to event ts.
  const status = stats.status ?? statusFor(stats.lastActive);
  const displayName = member.full_name ?? member.email.split("@")[0];
  const initials = initialsOf(displayName);
  return (
    <button
      onClick={onClick}
      className="text-left bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 hover:border-white/15 hover:bg-white/[0.05] transition-colors group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white text-[13px] font-semibold shrink-0">
              {initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-neutral-900">
              <StatusDot status={status} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-white truncate">
              {displayName}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {member.email}
            </div>
          </div>
        </div>
        <ChevronRight
          size={14}
          className="text-white/20 group-hover:text-white/60 transition-colors mt-1 shrink-0"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Talks" value={stats.presentations} />
        <MiniStat label="Time" value={formatHours(stats.totalSeconds)} />
        <MiniStat label="Prospects" value={stats.uniqueProspects} />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
        <div className="text-[10.5px] text-white/40">
          Active {formatRelative(stats.lastActive)}
        </div>
        <WeekStrip values={stats.weeklySeries} />
      </div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wider text-white/35 leading-none mb-1">
        {label}
      </div>
      <div className="text-[14px] font-semibold text-white tabular-nums leading-none">
        {value}
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------ Leaderboard ---------------------------- */

export function LeaderboardCard({
  overview,
  onPick,
}: {
  overview: TeamOverview;
  onPick?: (m: TeamMember) => void;
}) {
  const ranked = useMemo(() => {
    const list = overview.members
      .map((m) => ({ m, s: overview.perMember.get(m.id)! }))
      .filter((r) => r.s && r.s.presentations > 0)
      .sort((a, b) => b.s.presentations - a.s.presentations);
    return list.slice(0, 3);
  }, [overview]);
  const trophyColors = ["#facc15", "#e5e7eb", "#f59e0b"]; // gold, silver, bronze

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-amber-400" />
          <div className="text-[12px] uppercase tracking-wider text-white/60 font-semibold">
            Leaderboard
          </div>
        </div>
        <span className="text-[10.5px] text-white/30">this month</span>
      </div>
      {ranked.length === 0 && (
        <div className="text-[12px] text-white/40 text-center py-8">
          No presentations yet this month.
        </div>
      )}
      <div className="space-y-2">
        {ranked.map((r, i) => (
          <button
            key={r.m.id}
            onClick={() => onPick?.(r.m)}
            className="w-full flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
          >
            <Trophy
              size={16}
              style={{ color: trophyColors[i] }}
              fill="currentColor"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white font-medium truncate">
                {r.m.full_name ?? r.m.email.split("@")[0]}
              </div>
              <div className="text-[10.5px] text-white/40">
                {r.s.presentations} talks · {formatHours(r.s.totalSeconds)}
              </div>
            </div>
            <div className="text-[11px] font-semibold text-white/80 tabular-nums">
              #{i + 1}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ InsightStrip --------------------------- */

export function InsightStrip({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="bg-gradient-to-br from-violet-500/[0.06] via-fuchsia-500/[0.03] to-transparent border border-violet-500/15 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={13} className="text-violet-300" />
        <div className="text-[11px] uppercase tracking-wider text-violet-200 font-semibold">
          Insights for you
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {insights.slice(0, 4).map((it, i) => (
          <div
            key={i}
            className="bg-black/30 border border-white/[0.05] rounded-xl p-3"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  it.tone === "positive"
                    ? "bg-emerald-400"
                    : it.tone === "warning"
                      ? "bg-amber-400"
                      : "bg-white/40"
                }`}
              />
              <span className="text-[11px] font-semibold text-white/90">
                {it.title}
              </span>
            </div>
            <div className="text-[11.5px] text-white/50 leading-snug">
              {it.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ ActivityTicker ------------------------- */

export function ActivityTicker({
  events,
  overview,
}: {
  events: TourEvent[];
  overview: TeamOverview;
}) {
  const rows = useMemo(() => {
    return events.slice(0, 10).map((e) => {
      const member =
        overview.members.find((m) => m.id === e.presenter_user_id) ?? null;
      const memberName = member
        ? member.full_name ?? member.email.split("@")[0]
        : "Someone";
      const tourName = e.tour_id ? overview.toursById.get(e.tour_id) : null;
      const sceneName = e.scene_id
        ? overview.scenesById.get(e.scene_id)?.name
        : null;
      let verb = "opened";
      if (e.event_type === "scene_view") verb = "viewed";
      else if (e.event_type === "hotspot_click") verb = "clicked into";
      else if (e.event_type === "session_start") verb = "started";
      return {
        id: e.id,
        memberName,
        verb,
        tourName: tourName ?? "a tour",
        sceneName,
        country: e.country,
        at: formatRelative(e.created_at),
      };
    });
  }, [events, overview]);

  if (rows.length === 0) return null;
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05]">
        <Activity size={13} className="text-emerald-400" />
        <div className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">
          Recent activity
        </div>
      </div>
      <div className="max-h-[280px] overflow-y-auto panel-scroll">
        {rows.map((r) => (
          <div
            key={r.id}
            className="px-5 py-2.5 border-b border-white/[0.03] last:border-0 flex items-center gap-3 text-[12px]"
          >
            <div className="w-7 h-7 rounded-full bg-white/5 grid place-items-center text-[10px] font-semibold text-white/70 shrink-0">
              {r.memberName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-white/90 font-medium">{r.memberName}</span>
              <span className="text-white/50"> {r.verb} </span>
              <span className="text-white/90 truncate">
                {r.sceneName ?? r.tourName}
              </span>
              {r.country && (
                <span className="text-white/40">
                  {" "}
                  · <MapPin size={9} className="inline -mt-0.5" /> {r.country}
                </span>
              )}
            </div>
            <div className="text-[10.5px] text-white/30 whitespace-nowrap">
              {r.at}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ MemberDetailModal ---------------------- */

export function MemberDetailModal({
  overview,
  member,
  onClose,
}: {
  overview: TeamOverview;
  member: TeamMember;
  onClose: () => void;
}) {
  const stats = overview.perMember.get(member.id);
  if (!stats) return null;
  const displayName = member.full_name ?? member.email.split("@")[0];
  // Prefer presence-derived status when available (heartbeat is more
  // accurate than "most recent event") but fall back to event ts.
  const status = stats.status ?? statusFor(stats.lastActive);

  // Per-tour breakdown for this member.
  const tourRows = useMemo(() => {
    const map = new Map<
      string,
      { title: string; count: number; secondsSum: number }
    >();
    for (const id of stats.toursPresented) {
      map.set(id, {
        title: overview.toursById.get(id) ?? "Untitled tour",
        count: 0,
        secondsSum: 0,
      });
    }
    // Rough per-tour count from raw events.
    const buckets = new Map<string, number>();
    for (const e of overview.recentEvents) {
      if (e.presenter_user_id !== member.id) continue;
      if (!e.tour_id) continue;
      buckets.set(e.tour_id, (buckets.get(e.tour_id) ?? 0) + 1);
    }
    for (const [tid, count] of buckets) {
      const row = map.get(tid) ?? {
        title: overview.toursById.get(tid) ?? "Untitled tour",
        count: 0,
        secondsSum: 0,
      };
      row.count = Math.max(row.count, Math.ceil(count / 4)); // rough
      map.set(tid, row);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [member.id, stats, overview]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-950 border border-white/10 rounded-2xl w-[720px] max-w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-white/5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white text-[18px] font-semibold">
                  {initialsOf(displayName)}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-neutral-950">
                  <StatusDot status={status} />
                </div>
              </div>
              <div>
                <div className="text-[18px] font-semibold text-white">
                  {displayName}
                </div>
                <div className="text-[12px] text-white/50">{member.email}</div>
                <div className="text-[10.5px] text-white/30 mt-1">
                  Last active {formatRelative(stats.lastActive)} ·{" "}
                  {stats.daysActiveInLast7}/7 active days
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white p-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="px-6 py-4 grid grid-cols-4 gap-3">
          <MiniKpi label="Presentations" value={stats.presentations} />
          <MiniKpi
            label="Time presenting"
            value={formatHours(stats.totalSeconds)}
          />
          <MiniKpi
            label="Avg session"
            value={formatHours(stats.avgSeconds)}
          />
          <MiniKpi label="Unique prospects" value={stats.uniqueProspects} />
        </div>

        <div className="flex-1 overflow-auto panel-scroll px-6 pb-6 space-y-5">
          {/* Weekly rhythm */}
          <Section title="Weekly rhythm">
            <div className="flex items-end justify-between gap-1">
              {stats.weeklySeries.map((v, i) => {
                const max = Math.max(1, ...stats.weeklySeries);
                const h = 60 * (v / max);
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-violet-500 to-fuchsia-500"
                      style={{ height: `${Math.max(4, h)}px`, opacity: v === 0 ? 0.15 : 0.9 }}
                    />
                    <span className="text-[9.5px] text-white/30">
                      {["S", "M", "T", "W", "T", "F", "S"][
                        (new Date().getDay() - (6 - i) + 7) % 7
                      ]}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Tours presented */}
          {tourRows.length > 0 && (
            <Section title="Tours presented">
              <div className="space-y-1">
                {tourRows.slice(0, 5).map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                  >
                    <div className="text-[12.5px] text-white/90 truncate flex-1 pr-3">
                      {t.title}
                    </div>
                    <div className="text-[11px] text-white/50 tabular-nums">
                      {t.count} time{t.count === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Countries reached */}
          {stats.countries.length > 0 && (
            <Section title="Prospect countries">
              <div className="flex flex-wrap gap-1.5">
                {stats.countries.map((c) => (
                  <span
                    key={c}
                    className="text-[11px] px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-white/80 inline-flex items-center gap-1"
                  >
                    <Globe2 size={10} className="text-white/40" />
                    {c}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3">
      <div className="text-[9.5px] uppercase tracking-wider text-white/40 leading-none mb-1.5">
        {label}
      </div>
      <div className="text-[18px] font-semibold text-white tabular-nums leading-none">
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-white/40 font-semibold mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

/* Re-export KPI icons for the page */
export const KpiIcons = { Users2, Clock, Presentation, Globe2 };
