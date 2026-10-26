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
  preciseSessionsForMember,
  bucketSessionsByDay,
  type Insight,
  type MemberStats,
  type PreciseSession,
  type TeamMember,
  type TeamOverview,
  type TourEvent,
} from "@/lib/salesAnalytics";
import {
  recordingUrl,
  type PresentationSession,
} from "@/lib/presentationSession";
import {
  Sparkles as AiIcon,
  ChevronDown,
  MapPin as MapPinIcon,
  Volume2,
} from "lucide-react";

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
    <div className="relative bg-white border border-vpv-line rounded-2xl p-5 overflow-hidden group shadow-[0_1px_2px_rgba(11,61,145,0.04),0_10px_30px_-18px_rgba(11,61,145,0.22)] hover:shadow-[0_16px_36px_-16px_rgba(11,61,145,0.28)] transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        <DeltaChip pct={delta} />
      </div>
      <div className="text-[11px] uppercase tracking-wider text-vpv-muted mb-1">
        {label}
      </div>
      <div className="text-[32px] font-semibold leading-none text-vpv-ink mb-3 tabular-nums">
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
      className="text-left bg-white border border-vpv-line rounded-2xl p-4 hover:border-vpv-blue/40 hover:shadow-[0_16px_40px_-20px_rgba(11,61,145,0.3)] transition-all group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-vpv-grad grid place-items-center text-white text-[13px] font-semibold shrink-0">
              {initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-white">
              <StatusDot status={status} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-vpv-ink truncate">
              {displayName}
            </div>
            <div className="text-[11px] text-vpv-muted truncate">
              {member.email}
            </div>
          </div>
        </div>
        <ChevronRight
          size={14}
          className="text-vpv-muted/50 group-hover:text-vpv-blue transition-colors mt-1 shrink-0"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Talks" value={stats.presentations} />
        <MiniStat label="Time" value={formatHours(stats.totalSeconds)} />
        <MiniStat label="Prospects" value={stats.uniqueProspects} />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-vpv-line">
        <div className="text-[10.5px] text-vpv-muted">
          Active {formatRelative(stats.lastActive)}
        </div>
        <WeekStrip values={stats.weeklySeries} />
      </div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-vpv-canvas border border-vpv-line rounded-lg px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wider text-vpv-muted leading-none mb-1">
        {label}
      </div>
      <div className="text-[14px] font-semibold text-vpv-ink tabular-nums leading-none">
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
    <div className="bg-gradient-to-br from-vpv-tint via-white to-white border border-vpv-line rounded-2xl p-4 shadow-[0_10px_30px_-18px_rgba(11,61,145,0.2)]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={13} className="text-vpv-blue" />
        <div className="text-[11px] uppercase tracking-wider text-vpv-blue font-semibold">
          Insights for you
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {insights.slice(0, 4).map((it, i) => (
          <div
            key={i}
            className="bg-white border border-vpv-line rounded-xl p-3"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  it.tone === "positive"
                    ? "bg-emerald-500"
                    : it.tone === "warning"
                      ? "bg-amber-500"
                      : "bg-vpv-muted"
                }`}
              />
              <span className="text-[11px] font-semibold text-vpv-ink">
                {it.title}
              </span>
            </div>
            <div className="text-[11.5px] text-vpv-muted leading-snug">
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
      className="fixed inset-0 z-50 bg-vpv-navy/30 backdrop-blur-sm grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-vpv-line rounded-2xl w-[720px] max-w-full max-h-[90vh] overflow-hidden flex flex-col shadow-[0_30px_80px_-20px_rgba(11,61,145,0.4)]"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-vpv-line">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-vpv-grad grid place-items-center text-white text-[18px] font-semibold">
                  {initialsOf(displayName)}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-white">
                  <StatusDot status={status} />
                </div>
              </div>
              <div>
                <div className="text-[18px] font-semibold text-vpv-ink">
                  {displayName}
                </div>
                <div className="text-[12px] text-vpv-muted">{member.email}</div>
                <div className="text-[10.5px] text-vpv-muted/80 mt-1">
                  Last active {formatRelative(stats.lastActive)} ·{" "}
                  {stats.daysActiveInLast7}/7 active days
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-vpv-muted hover:text-vpv-ink p-1"
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
                      className="w-full rounded-t bg-vpv-grad"
                      style={{ height: `${Math.max(4, h)}px`, opacity: v === 0 ? 0.15 : 0.9 }}
                    />
                    <span className="text-[9.5px] text-vpv-muted">
                      {["S", "M", "T", "W", "T", "F", "S"][
                        (new Date().getDay() - (6 - i) + 7) % 7
                      ]}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Per-session drilldown — one row per presentation, each
              expandable to reveal per-scene time + hotspot details.
              The AI Analysis button is a placeholder for the future
              voice-recording pipeline. */}
          <SessionsSection overview={overview} member={member} />

          {/* Countries reached */}
          {stats.countries.length > 0 && (
            <Section title="Prospect countries">
              <div className="flex flex-wrap gap-1.5">
                {stats.countries.map((c) => (
                  <span
                    key={c}
                    className="text-[11px] px-2 py-1 rounded-md bg-vpv-tint border border-vpv-line text-vpv-navy inline-flex items-center gap-1"
                  >
                    <Globe2 size={10} className="text-vpv-blue" />
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
    <div className="bg-vpv-canvas border border-vpv-line rounded-xl p-3">
      <div className="text-[9.5px] uppercase tracking-wider text-vpv-muted leading-none mb-1.5">
        {label}
      </div>
      <div className="text-[18px] font-semibold text-vpv-ink tabular-nums leading-none">
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
      <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted font-semibold mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

/* Re-export KPI icons for the page */
export const KpiIcons = { Users2, Clock, Presentation, Globe2 };

/* ---------------------- SessionsSection --------------------------- */

/** Per-session list — every presentation this member ran, one row each.
 *  Row layout: Tour name · Date · Duration · AI Analysis button.
 *  Clicking the AI button expands an inline panel with per-scene time
 *  and the list of hotspots opened during that session. */
function SessionsSection({
  overview,
  member,
}: {
  overview: TeamOverview;
  member: TeamMember;
}) {
  // Precise, session_id-based sessions over the FULL event window.
  const days = useMemo(() => {
    const sessions = preciseSessionsForMember(member.id, overview.allEvents);
    return bucketSessionsByDay(sessions);
  }, [member.id, overview.allEvents]);

  const totalSessions = days.reduce((a, d) => a + d.presentations, 0);
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (totalSessions === 0) {
    return (
      <Section title="Presentations">
        <div className="text-[12px] text-vpv-muted text-center py-6 border border-dashed border-vpv-line rounded-lg">
          No presentations yet.
        </div>
      </Section>
    );
  }

  return (
    <Section title={`Presentations by day (${totalSessions})`}>
      <div className="space-y-3">
        {days.map((day) => (
          <div
            key={day.dayKey}
            className="rounded-xl border border-vpv-line overflow-hidden bg-white"
          >
            {/* Day header — weekday + rollup */}
            <div className="flex items-center justify-between px-3 py-2 bg-vpv-canvas border-b border-vpv-line">
              <div className="text-[12px] font-semibold text-vpv-ink">
                {day.weekday}
                <span className="text-vpv-muted font-normal">
                  {" "}
                  · {day.label}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-[10.5px] text-vpv-muted">
                <span className="text-vpv-navy font-medium">
                  {day.presentations} present{day.presentations === 1 ? "" : "s"}
                </span>
                <span>· {formatHours(day.totalSec)}</span>
                <span>· {day.clicks} clicks</span>
                <span>· {day.hovers} hovers</span>
              </div>
            </div>

            {/* Sessions in this day */}
            {day.sessions.map((s) => {
              const tourName = s.tourId
                ? overview.toursById.get(s.tourId) ?? "Untitled tour"
                : "Untitled tour";
              const startStr = new Date(s.startMs).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              });
              const open = openKey === s.sessionId;
              return (
                <div
                  key={s.sessionId}
                  className={`border-b border-vpv-line last:border-0 ${
                    open ? "bg-vpv-tint/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Start time */}
                    <div className="text-[12px] text-vpv-navy font-semibold tabular-nums w-[72px] shrink-0">
                      {startStr}
                    </div>
                    {/* Tour + interaction chips */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-vpv-ink truncate">
                        {tourName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-vpv-muted">
                        <span className="tabular-nums text-vpv-ink font-medium">
                          {formatHours(s.durationSec)}
                        </span>
                        <span>· {s.scenesViewed} scenes</span>
                        <span>· {s.totalClicks} clicks</span>
                        <span>· {s.totalHovers} hovers</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setOpenKey(open ? null : s.sessionId)}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-semibold transition-colors ${
                        open
                          ? "bg-vpv-grad text-white"
                          : "border border-vpv-blue/40 text-vpv-blue hover:bg-vpv-tint"
                      }`}
                    >
                      <AiIcon size={10} /> Details
                      <ChevronDown
                        size={10}
                        className={`transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                  {open && (
                    <AiAnalysisPanel session={s} overview={overview} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Section>
  );
}

function AiAnalysisPanel({
  session,
  overview,
}: {
  session: PreciseSession;
  overview: TeamOverview;
}) {
  const sceneRows = Object.entries(session.sceneSeconds)
    .map(([sceneId, secs]) => ({
      sceneId,
      name: overview.scenesById.get(sceneId)?.name ?? "Scene",
      seconds: secs,
    }))
    .sort((a, b) => b.seconds - a.seconds);
  const totalSceneSec = sceneRows.reduce((a, r) => a + r.seconds, 0) || 1;

  const clickRows = Object.entries(session.hotspotClicks).sort(
    (a, b) => b[1] - a[1]
  );
  const hoverRows = Object.entries(session.hotspotHovers).sort(
    (a, b) => b[1] - a[1]
  );
  const endStr = new Date(session.endMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const startStr = new Date(session.startMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="px-4 py-4 border-t border-vpv-line bg-vpv-canvas space-y-4">
      {/* Precise session facts */}
      <div className="grid grid-cols-4 gap-2">
        <MiniKpi label="Duration" value={formatHours(session.durationSec)} />
        <MiniKpi label="Scenes viewed" value={session.scenesViewed} />
        <MiniKpi label="Clicks" value={session.totalClicks} />
        <MiniKpi label="Hovers" value={session.totalHovers} />
      </div>
      <div className="text-[10.5px] text-vpv-muted">
        Ran from <span className="text-vpv-ink font-medium">{startStr}</span> to{" "}
        <span className="text-vpv-ink font-medium">{endStr}</span>
      </div>

      {/* GPS location + voice recording + AI topic insights (advanced
          tracking). Pulled from presentation_sessions by session_id. */}
      <PresentationInsights
        ps={overview.presentationSessions.get(session.sessionId) ?? null}
      />

      {/* Per-scene bar chart */}
      {sceneRows.length > 0 && (
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted font-semibold mb-2">
            Time spent per scene
          </div>
          <div className="space-y-1.5">
            {sceneRows.map((r) => {
              const pct = Math.round((r.seconds / totalSceneSec) * 100);
              return (
                <div key={r.sceneId} className="text-[11.5px]">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-vpv-ink truncate max-w-[260px]">
                      {r.name}
                    </span>
                    <span className="text-vpv-muted tabular-nums">
                      {formatHours(r.seconds)} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-vpv-line rounded overflow-hidden">
                    <div
                      className="h-full bg-vpv-grad"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hotspots clicked */}
      {clickRows.length > 0 && (
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted font-semibold mb-2">
            Hotspots clicked
          </div>
          <div className="flex flex-wrap gap-1">
            {clickRows.map(([hid, n]) => (
              <span
                key={hid}
                className="text-[10.5px] px-1.5 py-0.5 rounded bg-vpv-tint border border-vpv-line text-vpv-navy"
              >
                {hotspotLabel(hid, overview)}{n > 1 ? ` ×${n}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hotspots hovered */}
      {hoverRows.length > 0 && (
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted font-semibold mb-2">
            Hotspots hovered
          </div>
          <div className="flex flex-wrap gap-1">
            {hoverRows.map(([hid, n]) => (
              <span
                key={hid}
                className="text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-vpv-line text-vpv-muted"
              >
                {hotspotLabel(hid, overview)}{n > 1 ? ` ×${n}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/* ---- Advanced tracking: location + recording + topic insights ---------- */

function PresentationInsights({
  ps,
}: {
  ps: PresentationSession | null;
}) {
  const hasLocation = ps && (ps.place || (ps.lat != null && ps.lng != null));
  const audio = ps ? recordingUrl(ps.audio_path) : null;
  const topics = ps?.topics ?? [];
  const transcript = ps?.transcript ?? "";
  // "AI Analysis" button only shows when a deep report is actually
  // meaningful — i.e. we have a recording AND some transcript to analyse.
  const canAnalyse = !!(ps?.audio_path && transcript.trim().length > 20);

  if (!ps || (!hasLocation && !audio && topics.length === 0)) {
    return (
      <div className="rounded-lg border border-dashed border-vpv-line p-3 text-[11px] text-vpv-muted">
        No location or recording captured for this session.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canAnalyse && (
        <a
          href={`/team/analytics/session/${ps.session_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full bg-vpv-grad text-white text-[12.5px] font-semibold shadow-[0_10px_28px_-10px_rgba(20,104,216,0.55)] hover:opacity-90"
        >
          <AiIcon size={13} /> Open full AI analysis ↗
        </a>
      )}
      {/* Location */}
      {hasLocation && (
        <div className="flex items-center gap-2 text-[12px]">
          <MapPinIcon size={13} className="text-vpv-blue shrink-0" />
          <span className="text-vpv-ink truncate">
            {ps.place ||
              `${ps.lat!.toFixed(4)}, ${ps.lng!.toFixed(4)}`}
          </span>
          {ps.lat != null && ps.lng != null && (
            <a
              href={`https://www.google.com/maps?q=${ps.lat},${ps.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-vpv-blue hover:text-vpv-navy font-medium shrink-0"
            >
              View on map ↗
            </a>
          )}
        </div>
      )}

      {/* Audio playback */}
      {audio && (
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted font-semibold mb-1.5 flex items-center gap-1.5">
            <Volume2 size={11} /> Recording
            {ps.duration_sec ? ` · ${formatHours(ps.duration_sec)}` : ""}
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audio} controls className="w-full h-9" />
        </div>
      )}

      {/* AI topics */}
      {topics.length > 0 && (
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-vpv-blue font-semibold mb-2 flex items-center gap-1.5">
            <AiIcon size={11} /> Spoke on {topics.length} topic
            {topics.length === 1 ? "" : "s"}
          </div>
          <div className="space-y-1.5">
            {topics.map((tp) => (
              <div
                key={tp.key}
                className="rounded-lg border border-vpv-line bg-white p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-vpv-navy">
                    {tp.label}
                  </span>
                  <span className="text-[10px] text-vpv-muted">
                    {tp.mentions} mention{tp.mentions === 1 ? "" : "s"}
                  </span>
                </div>
                {tp.detail && (
                  <div className="text-[11px] text-vpv-muted mt-0.5 leading-snug">
                    “{tp.detail}”
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full transcript (collapsible) */}
      {transcript && <TranscriptBlock text={transcript} />}
    </div>
  );
}

function TranscriptBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-vpv-blue hover:text-vpv-navy font-medium flex items-center gap-1"
      >
        <ChevronDown
          size={11}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Hide transcript" : "Show full transcript"}
      </button>
      {open && (
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-vpv-line bg-vpv-canvas p-2.5 text-[11.5px] text-vpv-ink leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

/** Human label for a hotspot id from the overview lookup (falls back to a
 *  short id only if the hotspot was deleted). */
function hotspotLabel(id: string, overview: TeamOverview): string {
  return overview.hotspotsById.get(id) ?? `Hotspot #${id.slice(0, 6)}`;
}
