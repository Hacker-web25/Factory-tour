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
 * Clicking a salesperson (or picking one from "Team View") opens a
 * drill-down: the same dashboard scoped to that person, plus the tours
 * they presented. Both views end with the "All presentations" list,
 * where each meeting has an AI Analysis button (ULTRA).
 *
 * The selected presenter lives in the URL (?presenter=<id>) so the
 * browser Back button and shared links work.
 */

import { ROLLOUT } from "@/lib/entitlements";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, publicUrl } from "@/lib/supabase";
import {
  loadTeamOverview,
  scopeOverviewToMember,
  type TeamOverview,
  type MemberStats,
} from "@/lib/salesAnalytics";
import { loadOrgPlan } from "@/lib/presentationAi";
import PresentationsList from "@/components/dashboard/mis/PresentationsList";
import AiAnalysisDrawer, { type AiRowUpdate } from "@/components/dashboard/mis/AiAnalysisDrawer";
import {
  buildPresentationRows,
  loadRowExtras,
  type PresentationRow,
  type RowExtras,
} from "@/components/dashboard/mis/presentationRows";
import {
  dealsClosedByMember,
  pipelineBreakdown,
  type ClientStatus,
} from "@/lib/clients";
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
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Check,
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
  pipelineByMember: Map<string, Record<ClientStatus, number>>;
  topSceneCountsByMember: Map<string, Array<{ sceneId: string; count: number }>>;
  perMemberLastPres: Map<string, string>;
  globalScenes: SceneAggregate[];
  dayOfWeekCounts: number[]; // Mon..Sun
  dailyBuckets: Array<{ date: string; presentations: number; avgSec: number }>;
};

/* ---------- Root component ------------------------------------------ */

const PRESENTER_PARAM = "presenter";

function presenterFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PRESENTER_PARAM);
}

export default function SalesTeamMIS({ orgId }: { orgId: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("month");
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [extra, setExtra] = useState<BackfillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down + presentations list state.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [plan, setPlan] = useState<"pro" | "ultra">("pro");
  const [rowExtras, setRowExtras] = useState<RowExtras | null>(null);
  const [rowPatches, setRowPatches] = useState<Map<string, AiRowUpdate>>(new Map());
  const [aiRowId, setAiRowId] = useState<string | null>(null);

  const windowDays = timeframe === "day" ? 1 : timeframe === "week" ? 7 : 30;

  // URL ⇄ focused presenter (Back button returns to the team view).
  useEffect(() => {
    setFocusId(presenterFromUrl());
    const onPop = () => setFocusId(presenterFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const focusPresenter = useCallback((id: string | null) => {
    setFocusId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(PRESENTER_PARAM, id);
    else url.searchParams.delete(PRESENTER_PARAM);
    window.history.pushState(null, "", url.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadOrgPlan(orgId).then((p) => {
      if (!cancelled) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ov = await loadTeamOverview(orgId, windowDays);
        if (cancelled) return;
        setOverview(ov);
        setRowPatches(new Map());
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

  // The overview actually on screen — whole team, or one presenter.
  const view = useMemo(() => {
    if (!overview) return null;
    if (focusId && overview.members.some((m) => m.id === focusId)) {
      return scopeOverviewToMember(overview, focusId);
    }
    return overview;
  }, [overview, focusId]);
  const focusedMember = view && view !== overview ? view.members[0] : null;

  // Second pass — the "extras" that aren't in the base overview API:
  // deals closed, per-member top areas, day-of-week, daily buckets.
  // The previous result stays on screen while this recomputes.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    computeBackfill(orgId, view, windowDays)
      .then((back) => {
        if (!cancelled) setExtra(back);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, view, windowDays]);

  // One row per meeting. Built from the whole team once; the drill-down
  // filters it, so thumbnails/clients are fetched only once.
  const teamRows = useMemo(
    () => (overview ? buildPresentationRows(overview, windowDays) : []),
    [overview, windowDays]
  );
  useEffect(() => {
    let cancelled = false;
    if (teamRows.length === 0) return;
    loadRowExtras(teamRows)
      .then((x) => {
        if (!cancelled) setRowExtras(x);
      })
      .catch(() => {
        /* intentional — thumbnails are cosmetic */
      });
    return () => {
      cancelled = true;
    };
  }, [teamRows]);

  const rows = useMemo(() => {
    const scoped = focusId ? teamRows.filter((r) => r.presenterId === focusId) : teamRows;
    if (rowPatches.size === 0) return scoped;
    return scoped.map((r) => {
      const p = rowPatches.get(r.sessionId);
      return p ? { ...r, ...p } : r;
    });
  }, [teamRows, focusId, rowPatches]);

  const patchRow = useCallback((sessionId: string, patch: AiRowUpdate) => {
    setRowPatches((prev) => {
      const next = new Map(prev);
      next.set(sessionId, { ...(prev.get(sessionId) ?? {}), ...patch });
      return next;
    });
  }, []);

  const aiRow = aiRowId ? rows.find((r) => r.sessionId === aiRowId) ?? null : null;
  const closeAi = useCallback(() => setAiRowId(null), []);

  const rangeLabel = useMemo(() => rangeLabelFor(windowDays), [windowDays]);
  const ready = view && extra && !loading;

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 p-6">
      {/* Header strip */}
      <header className="flex flex-wrap items-start gap-4 mb-6">
        <div className="flex items-center gap-4 mr-auto min-w-0">
          {focusedMember ? (
            <>
              <button
                onClick={() => focusPresenter(null)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 grid place-items-center text-slate-500 hover:text-slate-900 shadow-sm flex-shrink-0"
                aria-label="Back to whole team"
                title="Back to whole team"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white font-bold grid place-items-center shadow-md flex-shrink-0">
                {initials(focusedMember.full_name || focusedMember.email)}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <button onClick={() => focusPresenter(null)} className="hover:text-blue-600">Sales Team MIS</button>
                  <ChevronRight className="w-3 h-3" />
                  <span>Salesperson</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight truncate">
                  {focusedMember.full_name || focusedMember.email.split("@")[0]}
                </h1>
                <p className="text-sm text-slate-500 truncate">{focusedMember.email}</p>
              </div>
            </>
          ) : (
            <>
              {/* Logo mark — a small VPV badge. */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 grid place-items-center text-white font-bold text-lg shadow-md">
                VPV
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Sales Team MIS</h1>
                <p className="text-sm text-slate-500">VPV Presentations, Buyer Engagement and Business Impact</p>
              </div>
            </>
          )}
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

        <TeamViewMenu
          members={overview?.members ?? []}
          focusId={focusedMember?.id ?? null}
          onPick={focusPresenter}
        />
        <button
          onClick={() => view && extra && exportCsv(view, extra)}
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

      {ready && (
        <>
          <KpiRow overview={view} extra={extra} presenterMode={!!focusedMember} />
          {focusedMember ? (
            <ToursPresentedTable rows={rows} extras={rowExtras} />
          ) : (
            <LeaderboardTable overview={view} extra={extra} onSelect={focusPresenter} />
          )}
          <BottomCharts overview={view} extra={extra} />
          <PresentationsList
            rows={rows}
            extras={rowExtras}
            plan={plan}
            showPresenter={!focusedMember}
            onOpenAi={(r) => setAiRowId(r.sessionId)}
          />
        </>
      )}

      {aiRow && overview && ROLLOUT.ai_meeting_analysis.tier !== "hidden" && (
        <AiAnalysisDrawer
          row={aiRow}
          thumbnail={aiRow.tourId ? rowExtras?.thumbnails.get(aiRow.tourId) ?? null : null}
          clientLabel={aiRow.clientId ? rowExtras?.clients.get(aiRow.clientId) ?? null : null}
          plan={plan}
          overview={overview}
          onClose={closeAi}
          onUpdate={patchRow}
        />
      )}
    </div>
  );
}

/* ---------- Team View menu ------------------------------------------ */

function TeamViewMenu({
  members,
  focusId,
  onPick,
}: {
  members: TeamOverview["members"];
  focusId: string | null;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Users className="w-4 h-4 text-slate-500" />
        <span>Team View</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1"
        >
          <MenuItem active={!focusId} onClick={() => { onPick(null); setOpen(false); }}>
            <Users className="w-4 h-4 text-slate-400" /> Whole team
          </MenuItem>
          <li className="border-t border-slate-100 my-1" />
          {members.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">No salespeople yet</li>}
          {members.map((m) => (
            <MenuItem key={m.id} active={focusId === m.id} onClick={() => { onPick(m.id); setOpen(false); }}>
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-[9px] font-bold grid place-items-center flex-shrink-0">
                {initials(m.full_name || m.email)}
              </span>
              <span className="truncate">{m.full_name || m.email.split("@")[0]}</span>
            </MenuItem>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        role="option"
        aria-selected={active}
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 ${active ? "text-blue-700 font-medium" : "text-slate-700"}`}
      >
        {children}
        {active && <Check className="w-3.5 h-3.5 ml-auto text-blue-600" />}
      </button>
    </li>
  );
}

/* ---------- Tours presented (drill-down) ----------------------------- */

function ToursPresentedTable({ rows, extras }: { rows: PresentationRow[]; extras: RowExtras | null }) {
  const tours = useMemo(() => {
    const map = new Map<string, { tourId: string | null; title: string; count: number; total: number; last: number; places: Set<string> }>();
    for (const r of rows) {
      const key = r.tourId ?? "none";
      const t = map.get(key) ?? { tourId: r.tourId, title: r.tourTitle, count: 0, total: 0, last: 0, places: new Set<string>() };
      t.count += 1;
      t.total += r.durationSec;
      t.last = Math.max(t.last, r.startMs);
      if (r.place || r.country) t.places.add((r.place || r.country) as string);
      map.set(key, t);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rows]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Tours presented</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left">Tour</th>
              <th className="px-2 py-2.5 text-left">Presentations</th>
              <th className="px-2 py-2.5 text-left">Total time</th>
              <th className="px-2 py-2.5 text-left">Avg duration</th>
              <th className="px-2 py-2.5 text-left">Locations</th>
              <th className="px-2 py-2.5 text-left">Last presented</th>
            </tr>
          </thead>
          <tbody>
            {tours.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400">No presentations in this period.</td>
              </tr>
            )}
            {tours.map((t) => {
              const thumb = t.tourId ? extras?.thumbnails.get(t.tourId) : null;
              return (
                <tr key={t.tourId ?? "none"} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-8 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
                        )}
                      </div>
                      <span className="font-medium text-slate-800 truncate max-w-[260px]">{t.title}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 tabular-nums">{t.count}</td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-700">{formatDurationShort(t.total)}</td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-700">{formatDurationShort(Math.round(t.total / t.count))}</td>
                  <td className="px-2 py-2.5 text-slate-600 text-xs max-w-[220px] truncate" title={Array.from(t.places).join(" · ")}>
                    {t.places.size === 0 ? "—" : Array.from(t.places).slice(0, 2).join(" · ") + (t.places.size > 2 ? ` +${t.places.size - 2}` : "")}
                  </td>
                  <td className="px-2 py-2.5 text-slate-500 text-xs whitespace-nowrap">{formatDateShort(new Date(t.last).toISOString())}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- KPI row -------------------------------------------------- */

function KpiRow({
  overview,
  extra,
  presenterMode = false,
}: {
  overview: TeamOverview;
  extra: BackfillData;
  presenterMode?: boolean;
}) {
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
      {presenterMode ? (
        <KpiCard
          icon={<UserPlus className="w-5 h-5" />}
          tone="purple"
          title="Tours Presented"
          value={String(overview.perMember.get(overview.members[0]?.id ?? "")?.toursPresented.length ?? 0)}
          subtext="distinct tours shown"
        />
      ) : (
        <KpiCard
          icon={<UserPlus className="w-5 h-5" />}
          tone="purple"
          title="Active Salespeople"
          value={`${activeCount} / ${totalMembers}`}
          subtext="used VPV in this period"
        />
      )}
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
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-10 h-10 rounded-full grid place-items-center flex-shrink-0 ${bg}`}>{icon}</div>
        <div className="text-[11px] text-slate-500 font-medium leading-tight">{title}</div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums whitespace-nowrap">{value}</div>
      {typeof delta === "number" ? (
        <DeltaLabel value={delta} />
      ) : subtext ? (
        <div className="text-[11px] text-slate-500 mt-0.5">{subtext}</div>
      ) : null}
    </div>
  );
}

function DeltaLabel({ value }: { value: number }) {
  if (value === 0)
    return (
      <div className="flex items-center gap-1 text-[11px] mt-0.5 text-slate-500 whitespace-nowrap">
        <Minus className="w-3 h-3" />
        <span>0% vs prev.</span>
      </div>
    );
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div
      className={`flex items-center gap-1 text-[11px] mt-0.5 whitespace-nowrap ${
        up ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      <Icon className="w-3 h-3" />
      <span>{Math.abs(value)}% vs prev.</span>
    </div>
  );
}

/* ---------- Leaderboard table --------------------------------------- */

function LeaderboardTable({
  overview,
  extra,
  onSelect,
}: {
  overview: TeamOverview;
  extra: BackfillData;
  onSelect: (memberId: string) => void;
}) {
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
        <table className="w-full text-[13px] table-auto">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="px-2 py-3 text-left w-6">#</th>
              <th className="px-2 py-3 text-left">Salesperson</th>
              <th className="px-2 py-3 text-left">Pres. ↓</th>
              <th className="px-2 py-3 text-left">vs Prev</th>
              <th className="px-2 py-3 text-left">Total Time</th>
              <th className="px-2 py-3 text-left">Avg Dur.</th>
              <th className="px-2 py-3 text-left">Unique</th>
              <th className="px-2 py-3 text-left">Repeat</th>
              <th className="px-2 py-3 text-left">Deals</th>
              <th className="px-2 py-3 text-left">Top Areas Viewed</th>
              <th className="px-2 py-3 text-left">Weekly Trend</th>
              <th className="px-2 py-3 text-left">Last Presentation</th>
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
              <tr
                key={r.member.id}
                onClick={() => onSelect(r.member.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.member.id);
                  }
                }}
                tabIndex={0}
                role="button"
                title={`View ${r.member.full_name || r.member.email.split("@")[0]}'s presentations`}
                className="group border-b border-slate-100 last:border-0 hover:bg-blue-50/50 cursor-pointer focus:outline-none focus-visible:bg-blue-50"
              >
                <td className="px-2 py-3 text-slate-400">{i + 1}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-[10px] font-bold grid place-items-center flex-shrink-0">
                      {initials(r.member.full_name || r.member.email)}
                    </div>
                    <span className="font-medium text-slate-800 truncate group-hover:text-blue-700">
                      {r.member.full_name || r.member.email.split("@")[0]}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                  </div>
                </td>
                <td className="px-2 py-3">
                  <span
                    className={`inline-block font-semibold tabular-nums px-2 py-0.5 rounded text-xs ${
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
                <td className="px-2 py-3">
                  <MiniDelta value={r.vsPrev} />
                </td>
                <td className="px-2 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                  {formatDurationShort(r.stats.totalSeconds)}
                </td>
                <td className="px-2 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                  {formatDurationShort(r.stats.avgSeconds)}
                </td>
                <td className="px-2 py-3 text-slate-700 tabular-nums">{r.stats.uniqueProspects}</td>
                <td className="px-2 py-3 text-slate-700 tabular-nums">
                  {repeatBuyerCount(r.stats, overview.allEvents, r.member.id)}
                </td>
                <td className="px-2 py-3">
                  <span
                    className={`inline-block font-semibold tabular-nums px-2 py-0.5 rounded text-xs ${
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
                <td className="px-2 py-3 text-slate-600 text-xs max-w-[180px] truncate">
                  {r.topAreas.length === 0
                    ? "—"
                    : r.topAreas
                        .slice(0, 2)
                        .map((a) => overview.scenesById.get(a.sceneId)?.name || "Scene")
                        .join(", ")}
                </td>
                <td className="px-2 py-3">
                  <Sparkline data={r.stats.sparkline} />
                </td>
                <td className="px-2 py-3 text-slate-500 text-xs whitespace-nowrap">
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
  // Deals closed per member — from the clients pipeline table. Falls
  // back to an empty map if the migration hasn't been run yet.
  let dealsByMember = new Map<string, number>();
  let pipelineByMember = new Map<string, Record<ClientStatus, number>>();
  try {
    [dealsByMember, pipelineByMember] = await Promise.all([
      dealsClosedByMember(orgId, windowDays),
      pipelineBreakdown(orgId),
    ]);
  } catch {
    /* migration not run — leave maps empty */
  }
  // Only count people on screen (the whole team, or one presenter).
  const onScreen = new Set(ov.members.map((m) => m.id));
  dealsByMember = new Map(Array.from(dealsByMember).filter(([id]) => onScreen.has(id)));

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
    pipelineByMember,
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

/** Repeat buyers = distinct viewers who appear in more than one session
 *  for this presenter. A rough proxy: count viewer_fingerprints that
 *  appear across >1 session_id for this member. */
function repeatBuyerCount(
  stats: MemberStats,
  events: TeamOverview["allEvents"],
  memberId: string
): number {
  const bySession = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.presenter_user_id !== memberId) continue;
    if (!e.viewer_fingerprint || !e.session_id) continue;
    let s = bySession.get(e.viewer_fingerprint);
    if (!s) {
      s = new Set();
      bySession.set(e.viewer_fingerprint, s);
    }
    s.add(e.session_id);
  }
  let repeats = 0;
  for (const sessions of bySession.values()) {
    if (sessions.size > 1) repeats += 1;
  }
  return repeats;
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
