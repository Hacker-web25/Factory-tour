"use client";

/**
 * "All presentations" — every meeting in the selected window, newest first.
 *
 * Three zoom levels the viewer can switch between (remembered per browser):
 *   • Large    — big thumbnails, only the essentials (title, presenter,
 *                when, where). Good for scanning visually.
 *   • Medium   — one row per meeting with the common details.
 *   • Compact  — dense table, every metric in its own column.
 *
 * Every entry is laid out THUMBNAIL · TITLE · AI ANALYSIS, then details.
 */

import { ROLLOUT } from "@/lib/entitlements";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  LayoutGrid,
  List,
  Rows3,
  Sparkles,
  Lock,
  Loader2,
  MapPin,
  Clock,
  CalendarDays,
  User,
  Mic,
  ChevronDown,
} from "lucide-react";
import type { PresentationRow, RowExtras } from "@/components/dashboard/mis/presentationRows";

export type Density = "large" | "medium" | "compact";
type SortKey = "newest" | "longest" | "score";

const DENSITY_KEY = "vpv.mis.presentations.density";
const PAGE = 25;

export default function PresentationsList({
  rows,
  extras,
  plan,
  showPresenter,
  onOpenAi,
}: {
  rows: PresentationRow[];
  extras: RowExtras | null;
  plan: "pro" | "ultra";
  /** Hidden in the single-presenter drill-down, where it's redundant. */
  showPresenter: boolean;
  onOpenAi: (row: PresentationRow) => void;
}) {
  const [density, setDensity] = useState<Density>("medium");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DENSITY_KEY) as Density | null;
      if (saved === "large" || saved === "medium" || saved === "compact") setDensity(saved);
    } catch {
      /* intentional — storage unavailable, keep default */
    }
  }, []);

  function changeDensity(d: Density) {
    setDensity(d);
    try {
      window.localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* intentional — storage unavailable */
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter((r) =>
        [
          r.tourTitle,
          r.presenterName,
          r.place,
          r.country,
          r.clientId ? extras?.clients.get(r.clientId) : null,
        ]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q))
      );
    }
    const sorted = list.slice();
    if (sort === "longest") sorted.sort((a, b) => b.durationSec - a.durationSec);
    else if (sort === "score") sorted.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
    return sorted;
  }, [rows, query, sort, extras]);

  useEffect(() => setLimit(PAGE), [query, sort, rows]);

  const visible = filtered.slice(0, limit);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm mt-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold text-slate-900">All presentations</h3>
          <p className="text-[11px] text-slate-500">
            {filtered.length} meeting{filtered.length === 1 ? "" : "s"} in this period
          </p>
        </div>

        <label className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tour, presenter, place…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-56"
          />
        </label>

        <label className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none pl-3 pr-7 py-1.5 text-xs text-slate-700 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Sort presentations"
          >
            <option value="newest">Newest first</option>
            <option value="longest">Longest first</option>
            <option value="score">Highest AI score</option>
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </label>

        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label="List size">
          {(
            [
              ["large", LayoutGrid, "Large — bigger, fewer details"],
              ["medium", List, "Medium"],
              ["compact", Rows3, "Compact — smaller, all details"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              role="radio"
              aria-checked={density === key}
              title={label}
              onClick={() => changeDensity(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                density === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline capitalize">{key}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-14 text-center text-sm text-slate-400">
          {rows.length === 0 ? "No presentations in this period yet." : "No presentations match your search."}
        </div>
      ) : density === "large" ? (
        <LargeGrid rows={visible} extras={extras} plan={plan} showPresenter={showPresenter} onOpenAi={onOpenAi} />
      ) : density === "medium" ? (
        <MediumList rows={visible} extras={extras} plan={plan} showPresenter={showPresenter} onOpenAi={onOpenAi} />
      ) : (
        <CompactTable rows={visible} extras={extras} plan={plan} showPresenter={showPresenter} onOpenAi={onOpenAi} />
      )}

      {filtered.length > limit && (
        <div className="border-t border-slate-100 py-3 text-center">
          <button
            onClick={() => setLimit((n) => n + PAGE)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Show {Math.min(PAGE, filtered.length - limit)} more
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------- Shared bits ------------------------------------------------ */

type ViewProps = {
  rows: PresentationRow[];
  extras: RowExtras | null;
  plan: "pro" | "ultra";
  showPresenter: boolean;
  onOpenAi: (row: PresentationRow) => void;
};

function Thumb({ row, extras, className }: { row: PresentationRow; extras: RowExtras | null; className: string }) {
  const src = row.tourId ? extras?.thumbnails.get(row.tourId) : null;
  return (
    <div className={`relative overflow-hidden bg-slate-100 flex-shrink-0 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
      )}
      {row.audioPath && (
        <span
          className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/55 grid place-items-center"
          title="Meeting was recorded"
        >
          <Mic className="w-2.5 h-2.5 text-white" />
        </span>
      )}
    </div>
  );
}

export function AiButton({
  row,
  plan,
  onOpen,
  size = "md",
}: {
  row: PresentationRow;
  plan: "pro" | "ultra";
  onOpen: () => void;
  size?: "sm" | "md";
}) {
  const pad =
    (size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11px]") +
    " whitespace-nowrap flex-shrink-0";
  const recorded = !!row.audioPath || row.hasTranscript;
  // AI meeting analysis is not released yet (lib/entitlements.ts).
  if (ROLLOUT.ai_meeting_analysis.tier === "hidden") return null;

  if (plan !== "ultra") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 font-semibold hover:border-violet-300 hover:text-violet-700 ${pad}`}
        title="AI meeting analysis is an ULTRA feature"
      >
        <Lock className="w-3 h-3" /> AI Analysis
      </button>
    );
  }
  if (row.aiScore != null) {
    const tone =
      row.aiScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : row.aiScore >= 65 ? "bg-blue-50 text-blue-700 border-blue-200"
      : row.aiScore >= 45 ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className={`inline-flex items-center gap-1 rounded-full border font-semibold ${tone} ${pad}`}
        title="Open AI analysis"
      >
        <Sparkles className="w-3 h-3" /> AI {row.aiScore}
      </button>
    );
  }
  if (row.aiStatus === "queued" || row.aiStatus === "processing") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className={`inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 text-violet-700 font-semibold ${pad}`}
      >
        <Loader2 className="w-3 h-3 animate-spin" /> Transcribing
      </button>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className={
        recorded
          ? `inline-flex items-center gap-1 rounded-full font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 shadow-sm hover:brightness-110 ${pad}`
          : `inline-flex items-center gap-1 rounded-full border border-slate-200 text-slate-400 font-semibold hover:text-slate-600 ${pad}`
      }
      title={recorded ? "Open AI analysis" : "No recording for this meeting"}
    >
      <Sparkles className="w-3 h-3" /> AI Analysis
    </button>
  );
}

function when(ms: number) {
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
  };
}

export function fmtDuration(sec: number): string {
  if (!sec) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${String(sec % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function locationOf(row: PresentationRow): string {
  return row.place || row.country || "—";
}

function OutcomeChip({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-slate-300">—</span>;
  const tone =
    outcome === "closed" ? "bg-emerald-100 text-emerald-800"
    : outcome === "lost" ? "bg-rose-100 text-rose-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-medium capitalize ${tone}`}>{outcome.replace("_", " ")}</span>;
}

/* ---------- Large -------------------------------------------------------- */

function LargeGrid({ rows, extras, plan, showPresenter, onOpenAi }: ViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
      {rows.map((r) => {
        const w = when(r.startMs);
        return (
          <article
            key={r.sessionId}
            className="rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow bg-white"
          >
            <Thumb row={r} extras={extras} className="w-full aspect-[16/9]" />
            <div className="p-3.5">
              <div className="flex items-start gap-2">
                <h4 className="text-[15px] font-semibold text-slate-900 leading-snug flex-1 min-w-0 truncate" title={r.tourTitle}>
                  {r.tourTitle}
                </h4>
                <AiButton row={r} plan={plan} onOpen={() => onOpenAi(r)} />
              </div>
              <div className="mt-2 space-y-1 text-[13px] text-slate-600">
                {showPresenter && (
                  <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" />{r.presenterName}</div>
                )}
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  {w.weekday}, {w.date} · {w.time}
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{locationOf(r)}</span>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------- Medium ------------------------------------------------------- */

function MediumList({ rows, extras, plan, showPresenter, onOpenAi }: ViewProps) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => {
        const w = when(r.startMs);
        const client = r.clientId ? extras?.clients.get(r.clientId) : null;
        return (
          <li key={r.sessionId} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
            <Thumb row={r} extras={extras} className="w-16 h-11 sm:w-24 sm:h-14 rounded-lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-slate-900 truncate" title={r.tourTitle}>{r.tourTitle}</span>
                <AiButton row={r} plan={plan} onOpen={() => onOpenAi(r)} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
                {showPresenter && <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.presenterName}</span>}
                <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{w.date}, {w.time}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(r.durationSec)}</span>
                <span className="flex items-center gap-1 max-w-[260px] truncate"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{locationOf(r)}</span></span>
                {client && <span className="text-slate-600">for <span className="font-medium">{client}</span></span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Compact ------------------------------------------------------ */

function CompactTable({ rows, extras, plan, showPresenter, onOpenAi }: ViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="text-[9.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/60">
            <th className="px-3 py-2 text-left">Presentation</th>
            <th className="px-2 py-2 text-left">Date</th>
            <th className="px-2 py-2 text-left">Time</th>
            <th className="px-2 py-2 text-left">Duration</th>
            <th className="px-2 py-2 text-left">Location</th>
            {showPresenter && <th className="px-2 py-2 text-left">Presenter</th>}
            <th className="px-2 py-2 text-left">Client</th>
            <th className="px-2 py-2 text-right">Areas</th>
            <th className="px-2 py-2 text-right">Clicks</th>
            <th className="px-2 py-2 text-left">Outcome</th>
            <th className="px-2 py-2 text-left">Recording</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = when(r.startMs);
            const client = r.clientId ? extras?.clients.get(r.clientId) : null;
            return (
              <tr key={r.sessionId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <Thumb row={r} extras={extras} className="w-10 h-7 rounded" />
                    <span className="font-medium text-slate-800 truncate max-w-[180px]" title={r.tourTitle}>{r.tourTitle}</span>
                    <AiButton row={r} plan={plan} onOpen={() => onOpenAi(r)} size="sm" />
                  </div>
                </td>
                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{w.date}</td>
                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{w.time}</td>
                <td className="px-2 py-1.5 text-slate-600 tabular-nums whitespace-nowrap">{fmtDuration(r.durationSec)}</td>
                <td className="px-2 py-1.5 text-slate-600 max-w-[180px] truncate" title={locationOf(r)}>{locationOf(r)}</td>
                {showPresenter && <td className="px-2 py-1.5 text-slate-700 whitespace-nowrap">{r.presenterName}</td>}
                <td className="px-2 py-1.5 text-slate-600 max-w-[140px] truncate">{client ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-600 tabular-nums text-right">{r.scenesViewed || "—"}</td>
                <td className="px-2 py-1.5 text-slate-600 tabular-nums text-right">{r.clicks || "—"}</td>
                <td className="px-2 py-1.5"><OutcomeChip outcome={r.outcome} /></td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                  {r.audioPath ? "Audio" : r.hasTranscript ? "Text only" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
