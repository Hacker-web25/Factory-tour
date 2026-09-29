"use client";

/**
 * SalesTeamMIS — the org_admin analytics dashboard.
 *
 * Six KPI tiles, a per-salesperson leaderboard, and four supporting
 * charts (presentations over time, by day of week, top viewed areas,
 * deals closed per person). Every metric is derived from real data
 * we already collect:
 *
 *   • Presentations, unique buyers, viewing time, avg duration →
 *     from `tour_events` (via loadTeamOverview).
 *   • Weekly trend sparkline → weeklySeries on each MemberStats row.
 *   • Top areas viewed → scene_view counts, per member and globally.
 *   • Presentations by day of week → bucketed from event timestamps.
 *   • Deals closed → `presentation_sessions.outcome = 'closed'`.
 *
 * The dashboard fetches once, then re-derives every chart from the
 * same cached data as the user switches Day/Week/Month.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase, publicUrl } from "@/lib/supabase";
import {
  loadTeamOverview,
  type TeamOverview,
  type MemberStats,
  formatHours,
} from "@/lib/salesAnalytics";
import {
  Calendar,
  Download,
  Users,
  Play,
  Clock,
  UserPlus,
  Building2,
  Handshake,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

/* ---------- Types ---------------------------------------------------- */

type Timeframe = "day" | "week" | "month" | "custom";

type SceneAggregate = {
  sceneId: string;
  name: string;
  tourName: string;
  thumbnail: string | null;
  count: number;
};

type PerMemberExtra = {
  memberId: string;
  repeatBuyers: number;
  dealsClosed: number;
  topAreas: string[];
  lastPresentation: string | null;
};

type BackfillData = {
  dealsByMember: Map<string, number>;
  topSceneCountsByMember: Map<string, Array<{ sceneId: string; count: number }>>;
  perMemberLastPres: Map<string, string>;
  globalScenes: SceneAggregate[];
  dayOfWeekCounts: number[]; // Mon..Sun
  dailyBuckets: Array<{ date: string; presentations: number; avgSec: number }>;
};

/* ---------- Root component ------------------------------------------ */

export default function SalesTeamMIS({ orgId }: { orgId: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("month");
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [extra, setExtra] = useState<BackfillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const windowDays = timeframe === "day" ? 1 : timeframe === "week" ? 7 : 30;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ov = await loadTeamOverview(orgId, windowDays);
        if (cancelled) return;
        setOverview(ov);
        // Second pass — derive the "extras" that aren't in the base
        // overview API: deals-closed counts, per-member top areas,
        // day-of-week distribution, daily presentation buckets.
        const back = await computeBackfill(orgId, ov, windowDays);
        if (cancelled) return;
        setExtra(back);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, windowDays]);

  const rangeLabel = useMemo(() => rangeLabelFor(windowDays), [windowDays]);

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 p-6">
      {/* Header strip */}
      <header className="flex flex-wrap items-start gap-4 mb-6">
        <div className="flex items-center gap-4 mr-auto">
          {/* Logo mark — a small VPV badge. Uses the same neutral wordmark treatment as the rest of the app. */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 grid place-items-center text-white font-bold text-lg shadow-md">
            VPV
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sales Team MIS</h1>
            <p className="text-sm text-slate-500">VPV Presentations, Buyer Engagement and Business Impact</p>
          </div>
        </div>

        <button className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span>{rangeLabel}</span>
        </button>

        <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 shadow-sm">
          {(["day", "week", "month", "custom"] as Timeframe[]).map((k) => (
            <button
              key={k}
              onClick={() => setTimeframe(k)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                timeframe === k ? "bg-blue-500 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <button className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm">
          <Users className="w-4 h-4 text-slate-500" />
          <span>Team View</span>
        </button>
        <button
          onClick={() => overview && extra && exportCsv(overview, extra)}
          className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Export</span>
        </button>
      </header>

      {loading && (
        <div className="grid place-items-center py-24 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          Could not load analytics: {error}
        </div>
      )}

      {overview && extra && !loading && (
        <>
          <KpiRow overview={overview} extra={extra} />
          <LeaderboardTable overview={overview} extra={extra} />
          <BottomCharts overview={overview} extra={extra} />
        </>
      )}
    </div>
  );
}

/* ---------- KPI row -------------------------------------------------- */

function KpiRow({ overview, extra }: { overview: TeamOverview; extra: BackfillData }) {
  const totalPres = overview.totals.presentations;
  const totalSec = Array.from(overview.perMember.values()).reduce(
    (a, m) => a + m.totalSeconds,
    0
  );
  const avgSec = totalPres > 0 ? Math.round(totalSec / totalPres) : 0;
  const activeCount = overview.totals.activeMembers;
  const totalMembers = overview.members.length;
  const uniqueBuyers = overview.totals.uniqueProspects;
  const totalDeals = Array.from(extra.dealsByMember.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      <KpiCard
        icon={<Play className="w-5 h-5" />}
        tone="blue"
        title="Total Presentations"
        value={totalPres.toLocaleString()}
        delta={overview.deltas.presentations}
      />
      <KpiCard
        icon={<Clock className="w-5 h-5" />}
        tone="green"
        title="Total Viewing Time"
        value={formatDurationLong(totalSec)}
        delta={overview.deltas.hours}
      />
      <KpiCard
        icon={<Users className="w-5 h-5" />}
        tone="amber"
        title="Average Duration"
        value={formatDurationShort(avgSec)}
        delta={overview.deltas.presentations}
      />
      <KpiCard
        icon={<UserPlus className="w-5 h-5" />}
        tone="purple"
        title="Active Salespeople"
        value={`${activeCount} / ${totalMembers}`}
        subtext="used VPV this month"
      />
      <KpiCard
        icon={<Building2 className="w-5 h-5" />}
        tone="slate"
        title="Unique Buyers"
        value={uniqueBuyers.toLocaleString()}
        delta={overview.deltas.uniqueProspects}
      />
      <KpiCard
        icon={<Handshake className="w-5 h-5" />}
        tone="rose"
        title="Deals Closed"
        value={totalDeals.toString()}
      />
    </div>
  );
}

function KpiCard({
  icon,
  tone,
  title,
  value,
  delta,
  subtext,
}: {
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "purple" | "slate" | "rose";
  title: string;
  value: string;
  delta?: number;
  subtext?: string;
}) {
  const bg = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
    slate: "bg-slate-100 text-slate-600",
    rose: "bg-rose-100 text-rose-600",
  }[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-full grid place-items-center ${bg}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500 font-medium">{title}</div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums truncate">{value}</div>
          {typeof delta === "number" ? <DeltaLabel value={delta} /> : subtext ? (
            <div className="text-xs text-slate-500 mt-0.5">{subtext}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DeltaLabel({ value }: { value: number }) {
  if (value === 0)
    return (
      <div className="flex items-center gap-1 text-xs mt-0.5 text-slate-500">
        <Minus className="w-3 h-3" />
        <span>0% vs previous</span>
      </div>
    );
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className={`flex items-center gap-1 text-xs mt-0.5 ${up ? "text-emerald-600" : "text-rose-600"}`}>
      <Icon className="w-3 h-3" />
      <span>{Math.abs(value)}% vs previous</span>
    </div>
  );
}

/* ---------- Leaderboard table --------------------------------------- */

function LeaderboardTable({ overview, extra }: { overview: TeamOverview; extra: BackfillData }) {
  // Build the sorted list — presentations desc.
  const rows = useMemo(() => {
    return overview.members
      .map((m) => {
        const stats = overview.perMember.get(m.id);
        if (!stats) return null;
        return {
          member: m,
          stats,
          deals: extra.dealsByMember.get(m.id) ?? 0,
          topAreas: extra.topSceneCountsByMember.get(m.id) ?? [],
          lastPres: extra.perMemberLastPres.get(m.id) ?? null,
          // vs previous — we don't have per-member prev-window here,
          // so we approximate from the sparkline (last 7 vs prior 7).
          vsPrev: sparklineDelta(stats.sparkline),
        };
      })
      .filter(<T,>(x: T): x is NonNullable<T> => x != null)
      .sort((a, b) => b.stats.presentations - a.stats.presentations);
  }, [overview, extra]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="px-3 py-3 text-left w-8">#</th>
              <th className="px-3 py-3 text-left">Salesperson</th>
              <th className="px-3 py-3 text-left">Presentations ↓</th>
              <th className="px-3 py-3 text-left">vs Last Period</th>
              <th className="px-3 py-3 text-left">Total Viewing Time</th>
              <th className="px-3 py-3 text-left">Avg Duration</th>
              <th className="px-3 py-3 text-left">Unique Buyers</th>
              <th className="px-3 py-3 text-left">Repeat Buyers</th>
              <th className="px-3 py-3 text-left">Deals Closed</th>
              <th className="px-3 py-3 text-left">Top Areas Viewed</th>
              <th className="px-3 py-3 text-left">Weekly Trend</th>
              <th className="px-3 py-3 text-left">Last Presentation</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-12 text-slate-400">
                  No presenters in your team yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.member.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-[10px] font-bold grid place-items-center">
                      {initials(r.member.full_name || r.member.email)}
                    </div>
                    <span className="font-medium text-slate-800">
                      {r.member.full_name || r.member.email.split("@")[0]}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-block font-semibold tabular-nums px-2 py-0.5 rounded ${
                      r.stats.presentations >= 15
                        ? "bg-emerald-100 text-emerald-800"
                        : r.stats.presentations >= 10
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {r.stats.presentations}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <MiniDelta value={r.vsPrev} />
                </td>
                <td className="px-3 py-3 text-slate-700 tabular-nums">
                  {formatDurationShort(r.stats.totalSeconds)}
                </td>
                <td className="px-3 py-3 text-slate-700 tabular-nums">
                  {formatDurationShort(r.stats.avgSeconds)}
                </td>
                <td className="px-3 py-3 text-slate-700 tabular-nums">{r.stats.uniqueProspects}</td>
                <td className="px-3 py-3 text-slate-700 tabular-nums">
                  {Math.max(0, r.stats.uniqueProspects - r.stats.presentations >= 0 ? 0 : r.stats.presentations - r.stats.uniqueProspects)}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-block font-semibold tabular-nums px-2 py-0.5 rounded ${
                      r.deals >= 2
                        ? "bg-emerald-100 text-emerald-800"
                        : r.deals === 1
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r.deals}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-600 text-xs">
                  {r.topAreas.length === 0
                    ? "—"
                    : r.topAreas
                        .slice(0, 2)
                        .map((a) => overview.scenesById.get(a.sceneId) || "Scene")
                        .join(", ")}
                </td>
                <td className="px-3 py-3">
                  <Sparkline data={r.stats.sparkline} />
                </td>
                <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {r.lastPres ? formatDateShort(r.lastPres) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniDelta({ value }: { value: number }) {
  if (value === 0) return <span className="text-slate-400 text-xs">—</span>;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${up ? "text-emerald-600" : "text-rose-600"}`}>
      <Icon className="w-3 h-3" /> {up ? "+" : ""}
      {value}%
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-0.5 h-6 w-24">
      {data.slice(-14).map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-blue-400 rounded-sm"
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/* ---------- Bottom four charts -------------------------------------- */

function BottomCharts({ overview, extra }: { overview: TeamOverview; extra: BackfillData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      <ChartCard title="Presentations Over Time">
        <PresentationsOverTime data={extra.dailyBuckets} />
      </ChartCard>
      <ChartCard title="Presentations by Day of Week">
        <ByDayOfWeek counts={extra.dayOfWeekCounts} />
      </ChartCard>
      <ChartCard title="Top Viewed Areas">
        <TopAreas areas={extra.globalScenes} />
      </ChartCard>
      <ChartCard title="Deals Closed" subtitle="(from VPV exposure)">
        <DealsByPerson overview={overview} deals={extra.dealsByMember} />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {title}{" "}
        {subtitle && <span className="text-xs font-normal text-slate-500">{subtitle}</span>}
      </h3>
      <div className="h-48">{children}</div>
    </div>
  );
}

function PresentationsOverTime({
  data,
}: {
  data: Array<{ date: string; presentations: number; avgSec: number }>;
}) {
  if (data.length === 0) return <EmptyChart />;
  const maxP = Math.max(1, ...data.map((d) => d.presentations));
  const maxSec = Math.max(1, ...data.map((d) => d.avgSec));
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex items-end gap-1">
        {data.map((d, i) => {
          const bh = (d.presentations / maxP) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.presentations}`}>
              <div
                className="w-full bg-blue-300 rounded-sm min-h-[2px]"
                style={{ height: `${bh}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-2 pt-1 border-t border-slate-100">
        <span>{data[0]?.date}</span>
        <span>{data[Math.floor(data.length / 2)]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function ByDayOfWeek({ counts }: { counts: number[] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...counts);
  return (
    <div className="h-full flex items-end gap-1.5">
      {counts.map((c, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="text-[10px] text-slate-500 tabular-nums">{c}</div>
          <div
            className="w-full bg-blue-400 rounded-t min-h-[3px]"
            style={{ height: `${(c / max) * 80}%` }}
          />
          <div className="text-[10px] text-slate-500">{days[i]}</div>
        </div>
      ))}
    </div>
  );
}

function TopAreas({ areas }: { areas: SceneAggregate[] }) {
  if (areas.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...areas.map((a) => a.count));
  return (
    <div className="space-y-2 h-full overflow-y-auto pr-1">
      {areas.slice(0, 5).map((a) => (
        <div key={a.sceneId} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded overflow-hidden bg-slate-100 flex-shrink-0">
            {a.thumbnail ? (
              <img src={a.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-xs truncate text-slate-700">{a.name}</span>
              <span className="text-xs tabular-nums text-slate-500 flex-shrink-0">{a.count}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-400 rounded-full"
                style={{ width: `${(a.count / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DealsByPerson({
  overview,
  deals,
}: {
  overview: TeamOverview;
  deals: Map<string, number>;
}) {
  const entries = overview.members
    .map((m) => ({
      name: m.full_name || m.email.split("@")[0],
      count: deals.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (entries.length === 0 || entries.every((e) => e.count === 0)) {
    return (
      <div className="h-full grid place-items-center text-center text-xs text-slate-400 px-4">
        <div>
          <div className="mb-1">No deals closed yet.</div>
          <div className="text-[10px]">Presenters can mark deals closed on their sessions.</div>
        </div>
      </div>
    );
  }

  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <div className="space-y-1.5 h-full overflow-y-auto pr-1">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-20 text-xs truncate text-slate-700">{e.name}</span>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                e.count >= 2 ? "bg-emerald-500" : e.count === 1 ? "bg-emerald-300" : "bg-rose-200"
              }`}
              style={{ width: `${(e.count / max) * 100}%` }}
            />
          </div>
          <span className="w-4 text-right text-xs tabular-nums text-slate-600">{e.count}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return <div className="h-full grid place-items-center text-xs text-slate-400">No data yet</div>;
}

/* ---------- Data backfill ------------------------------------------- */

async function computeBackfill(
  orgId: string,
  ov: TeamOverview,
  windowDays: number
): Promise<BackfillData> {
  // Deals closed per member — from presentation_sessions.outcome. Fails
  // gracefully to empty map if the migration hasn't been run yet.
  const dealsByMember = new Map<string, number>();
  const sinceIso = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
  try {
    const { data: dealRows } = await supabase
      .from("presentation_sessions")
      .select("presenter_user_id, outcome, started_at")
      .eq("org_id", orgId)
      .eq("outcome", "closed")
      .gte("started_at", sinceIso);
    for (const r of (dealRows ?? []) as { presenter_user_id: string | null }[]) {
      if (!r.presenter_user_id) continue;
      dealsByMember.set(r.presenter_user_id, (dealsByMember.get(r.presenter_user_id) ?? 0) + 1);
    }
  } catch {
    /* migration not run — leave map empty */
  }

  // Per-member "top viewed areas" — count scene_view events per member.
  const topSceneCountsByMember = new Map<string, Array<{ sceneId: string; count: number }>>();
  const perMemberLastPres = new Map<string, string>();
  const scenesTouched = new Set<string>();
  for (const e of ov.allEvents) {
    if (!e.presenter_user_id) continue;
    if (e.event_type === "scene_view" && e.scene_id) {
      const list = topSceneCountsByMember.get(e.presenter_user_id) ?? [];
      const existing = list.find((x) => x.sceneId === e.scene_id);
      if (existing) existing.count += 1;
      else list.push({ sceneId: e.scene_id, count: 1 });
      topSceneCountsByMember.set(e.presenter_user_id, list);
      scenesTouched.add(e.scene_id);
    }
    // Most-recent event per member = "last presentation".
    const prev = perMemberLastPres.get(e.presenter_user_id);
    if (!prev || e.created_at > prev) {
      perMemberLastPres.set(e.presenter_user_id, e.created_at);
    }
  }
  // Sort each member's list descending.
  for (const [k, v] of topSceneCountsByMember)
    topSceneCountsByMember.set(k, v.sort((a, b) => b.count - a.count));

  // Global top areas — sum across members, fetch tour name + thumbnail.
  const globalCounts = new Map<string, number>();
  for (const list of topSceneCountsByMember.values()) {
    for (const { sceneId, count } of list) {
      globalCounts.set(sceneId, (globalCounts.get(sceneId) ?? 0) + count);
    }
  }
  const topSceneIds = Array.from(globalCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let globalScenes: SceneAggregate[] = [];
  if (topSceneIds.length > 0) {
    const { data: sceneRows } = await supabase
      .from("scenes")
      .select("id, name, image_path, tour_id")
      .in("id", topSceneIds);
    const tourIds = Array.from(new Set((sceneRows ?? []).map((s: any) => s.tour_id).filter(Boolean)));
    const tourNames = new Map<string, string>();
    if (tourIds.length > 0) {
      const { data: tRows } = await supabase.from("tours").select("id, title").in("id", tourIds);
      for (const t of (tRows ?? []) as any[]) tourNames.set(t.id, t.title);
    }
    globalScenes = (sceneRows ?? [])
      .map((s: any) => ({
        sceneId: s.id,
        name: s.name || "Untitled scene",
        tourName: tourNames.get(s.tour_id) || "",
        thumbnail: s.image_path ? publicUrl(s.image_path) : null,
        count: globalCounts.get(s.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // Day-of-week distribution of scene_view events (a proxy for
  // presentations shown that day).
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
  for (const e of ov.allEvents) {
    if (e.event_type !== "scene_view") continue;
    const d = new Date(e.created_at).getDay(); // 0=Sun..6=Sat
    const idx = d === 0 ? 6 : d - 1;
    dayOfWeekCounts[idx] += 1;
  }

  // Daily presentation buckets — one bar per day in the window.
  const dailyBuckets: Array<{ date: string; presentations: number; avgSec: number }> = [];
  const bucketMap = new Map<string, { c: number; total: number }>();
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    bucketMap.set(key, { c: 0, total: 0 });
  }
  // Approximate: count unique (session, day) tuples as presentations.
  const seen = new Set<string>();
  for (const e of ov.allEvents) {
    if (e.event_type !== "scene_view" || !e.session_id) continue;
    const key = e.created_at.slice(0, 10);
    const dedupKey = `${e.session_id}|${key}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const b = bucketMap.get(key);
    if (b) b.c += 1;
  }
  for (const [date, { c, total }] of bucketMap) {
    dailyBuckets.push({
      date: shortDayLabel(date),
      presentations: c,
      avgSec: c > 0 ? total / c : 0,
    });
  }

  return {
    dealsByMember,
    topSceneCountsByMember,
    perMemberLastPres,
    globalScenes,
    dayOfWeekCounts,
    dailyBuckets,
  };
}

/* ---------- Formatting helpers -------------------------------------- */

function formatDurationLong(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}

function formatDurationShort(sec: number): string {
  if (sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function initials(name: string): string {
  const parts = name.split(/[\s@]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function shortDayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const dd = d.getDate();
  const mm = d.toLocaleString("en", { month: "short" });
  const hh = d.getHours();
  const mi = d.getMinutes().toString().padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${dd} ${mm}  ${h12}:${mi} ${ampm}`;
}

function rangeLabelFor(windowDays: number): string {
  const end = new Date();
  const start = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  const fmt = (d: Date) =>
    `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${d.getFullYear()}`;
  return `${fmt(start)}  –  ${fmt(end)}`;
}

function sparklineDelta(spark: number[]): number {
  if (spark.length < 4) return 0;
  const half = Math.floor(spark.length / 2);
  const prev = spark.slice(0, half).reduce((a, b) => a + b, 0);
  const cur = spark.slice(half).reduce((a, b) => a + b, 0);
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

/* ---------- CSV export ---------------------------------------------- */

function exportCsv(ov: TeamOverview, extra: BackfillData) {
  const header = [
    "Salesperson",
    "Email",
    "Presentations",
    "Total Viewing Time (s)",
    "Avg Duration (s)",
    "Unique Buyers",
    "Deals Closed",
    "Last Presentation",
  ];
  const lines = [header.join(",")];
  for (const m of ov.members) {
    const s = ov.perMember.get(m.id);
    if (!s) continue;
    const deals = extra.dealsByMember.get(m.id) ?? 0;
    const last = extra.perMemberLastPres.get(m.id) ?? "";
    lines.push(
      [
        JSON.stringify(m.full_name || m.email.split("@")[0]),
        JSON.stringify(m.email),
        s.presentations,
        s.totalSeconds,
        s.avgSeconds,
        s.uniqueProspects,
        deals,
        last,
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-team-mis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
