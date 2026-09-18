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
  sessionsForMember,
  type Insight,
  type MemberStats,
  type Session,
  type TeamMember,
  type TeamOverview,
  type TourEvent,
} from "@/lib/salesAnalytics";
import { Sparkles as AiIcon, ChevronDown } from "lucide-react";

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
  const sessions = useMemo(() => {
    const list = sessionsForMember(member.id, overview.recentEvents);
    // Newest first.
    return list.sort((a, b) => b.first - a.first);
  }, [member.id, overview.recentEvents]);

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (sessions.length === 0) {
    return (
      <Section title="Presentations">
        <div className="text-[12px] text-vpv-muted text-center py-6 border border-dashed border-vpv-line rounded-lg">
          No presentations yet.
        </div>
      </Section>
    );
  }

  return (
    <Section title={`Presentations (${sessions.length})`}>
      <div className="rounded-xl border border-vpv-line overflow-hidden bg-vpv-canvas">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_90px_130px] gap-3 px-3 py-2 border-b border-vpv-line text-[10px] uppercase tracking-wider text-vpv-muted">
          <div>Tour</div>
          <div>Date</div>
          <div className="text-right">Duration</div>
          <div className="text-right">AI Analysis</div>
        </div>
        {sessions.map((s, i) => {
          const tourName = s.tourId
            ? overview.toursById.get(s.tourId) ?? "Untitled tour"
            : "Untitled tour";
          const date = new Date(s.first);
          const dateStr = date.toLocaleDateString([], {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          const dur = Math.round((s.last - s.first) / 1000);
          const durStr = formatHours(dur);
          const open = expandedIdx === i;
          return (
            <div
              key={i}
              className={`border-b border-vpv-line last:border-0 ${
                open ? "bg-vpv-tint/40" : ""
              }`}
            >
              <div className="grid grid-cols-[1fr_100px_90px_130px] gap-3 px-3 py-2.5 items-center">
                <div className="text-[12.5px] text-vpv-ink truncate">
                  {tourName}
                </div>
                <div className="text-[11.5px] text-vpv-muted tabular-nums">
                  {dateStr}
                </div>
                <div className="text-[11.5px] text-vpv-ink tabular-nums text-right font-medium">
                  {durStr}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setExpandedIdx(open ? null : i)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-semibold transition-colors ${
                      open
                        ? "bg-vpv-grad text-white"
                        : "border border-vpv-blue/40 text-vpv-blue hover:bg-vpv-tint"
                    }`}
                  >
                    <AiIcon size={10} /> AI Analysis
                    <ChevronDown
                      size={10}
                      className={`transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
              {open && (
                <AiAnalysisPanel session={s} overview={overview} />
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function AiAnalysisPanel({
  session,
  overview,
}: {
  session: Session;
  overview: TeamOverview;
}) {
  const sceneRows = Object.entries(session.sceneSeconds ?? {})
    .map(([sceneId, secs]) => ({
      sceneId,
      name: overview.scenesById.get(sceneId)?.name ?? "Scene",
      seconds: secs,
    }))
    .sort((a, b) => b.seconds - a.seconds);
  const totalSceneSec =
    sceneRows.reduce((a, r) => a + r.seconds, 0) || 1;
  const hotspotCount = session.hotspots?.length ?? 0;
  const country = session.country ?? "Unknown";

  return (
    <div className="px-4 py-4 border-t border-vpv-line bg-vpv-canvas space-y-4">
      {/* Coming-soon banner for voice pipeline */}
      <div className="rounded-lg border border-vpv-blue/25 bg-gradient-to-br from-vpv-tint via-white to-white p-3">
        <div className="flex items-center gap-2 text-[11.5px] text-vpv-blue font-semibold mb-0.5">
          <AiIcon size={11} /> Voice-recording analysis · coming soon
        </div>
        <div className="text-[11px] text-vpv-muted leading-relaxed">
          Auto-transcribed conversation with buying-signal + objection
          detection, pitch quality scoring, and best-line extraction.
          For now, below is the behavioural analysis derived from
          per-scene dwell time and hotspot interactions.
        </div>
      </div>

      {/* Behavioural summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        <MiniKpi
          label="Scenes viewed"
          value={sceneRows.length}
        />
        <MiniKpi
          label="Hotspots opened"
          value={hotspotCount}
        />
        <MiniKpi label="Buyer country" value={country} />
      </div>

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

      {/* Hotspot list */}
      {hotspotCount > 0 && (
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-vpv-muted font-semibold mb-2">
            Hotspots clicked in order
          </div>
          <div className="flex flex-wrap gap-1">
            {session.hotspots!.slice(0, 20).map((hid, i) => (
              <span
                key={i}
                className="text-[10.5px] px-1.5 py-0.5 rounded bg-vpv-tint border border-vpv-line text-vpv-navy font-mono"
              >
                #{i + 1} · {hid.slice(0, 6)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
