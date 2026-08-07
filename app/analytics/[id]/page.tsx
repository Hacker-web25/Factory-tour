"use client";

/**
 * Per-tour analytics dashboard. Reads aggregated event data from
 * lib/analytics.ts (which queries public.tour_events) and renders:
 *   • KPI strip — views, sessions, avg duration, hotspot clicks
 *   • 30-day views timeline (simple bar chart, pure SVG)
 *   • Top scenes ranked by views
 *   • Top hotspots ranked by clicks
 *
 * Everything is client-rendered so it always shows fresh numbers —
 * analytics doesn't need SSR.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import type { Hotspot, Scene, Tour } from "@/lib/types";
import {
  loadDashboardData,
  type KpiSummary,
  type ViewsPerDay,
  type SceneRank,
  type HotspotRank,
} from "@/lib/analytics";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  Eye,
  Users,
  Clock,
  MousePointerClick,
  ArrowLeft,
} from "lucide-react";

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const initialPresenter = searchParams?.get("presenter") ?? "";
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [viewsPerDay, setViewsPerDay] = useState<ViewsPerDay[]>([]);
  const [topScenes, setTopScenes] = useState<SceneRank[]>([]);
  const [topHotspots, setTopHotspots] = useState<HotspotRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  // Per-presenter filter — populated when the current user can see team
  // analytics (owner or org_admin). Selecting one narrows every metric
  // on the page to that presenter's attributed sessions only.
  const [presenters, setPresenters] = useState<Profile[]>([]);
  const [selectedPresenter, setSelectedPresenter] =
    useState<string>(initialPresenter);
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const profile = await getMyProfile();
      setMe(profile);

      const { data: t } = await supabase
        .from("tours")
        .select("*")
        .eq("id", id)
        .single();
      setTour((t as Tour) ?? null);

      // Load presenters this user can see — org's team for org_admin,
      // everyone for owner. Others don't get the filter at all.
      if (profile?.role === "owner" || profile?.role === "org_admin") {
        let q = supabase
          .from("profiles")
          .select("*")
          .eq("role", "presenter");
        if (profile.role === "org_admin" && profile.org_id) {
          q = q.eq("org_id", profile.org_id);
        }
        const { data: pr } = await q.order("email");
        setPresenters((pr ?? []) as Profile[]);
      }

      const { data: s } = await supabase
        .from("scenes")
        .select("id, name, image_path, thumbnail_path, tour_id, order_index")
        .eq("tour_id", id)
        .order("order_index");
      setScenes((s as Scene[]) ?? []);

      const sceneIds = (s ?? []).map((sc) => (sc as Scene).id);
      if (sceneIds.length > 0) {
        // Pull the columns we need to build a human-readable label so the
        // TopHotspots list shows e.g. "→ Warehouse" instead of "icon · a1b2".
        const { data: h } = await supabase
          .from("hotspots")
          .select(
            "id, label, info_title, scene_id, action, type, target_scene_id, video_url, url, icon_key, yaw, pitch"
          )
          .in("scene_id", sceneIds);
        setHotspots((h as Hotspot[]) ?? []);
      }

      const dash = await loadDashboardData(id, range, {
        presenterId: selectedPresenter || null,
      });
      setKpis(dash.kpis);
      setViewsPerDay(dash.viewsPerDay);
      setTopScenes(dash.topScenes);
      setTopHotspots(dash.topHotspots);
      setLoading(false);
    }
    load();
  }, [id, range, selectedPresenter]);

  const sceneName = (sid: string) =>
    scenes.find((s) => s.id === sid)?.name ?? sid.slice(0, 8);

  /** Build a human-readable primary label + scene-context subtitle for
   *  a hotspot. Falls through several fields — user's own label first,
   *  then the info title, then the type of thing it does (nav / URL /
   *  video / etc.), so the analytics list always reads as something
   *  identifiable, never a random UUID slice. */
  const hotspotDisplay = (
    hid: string
  ): { label: string; sub: string; sceneId: string | null } => {
    const h = hotspots.find((x) => x.id === hid);
    if (!h)
      return {
        label: hid.slice(0, 8),
        sub: "(deleted)",
        sceneId: null,
      };
    const parentScene = h.scene_id ? sceneName(h.scene_id) : "";

    // 1. User-supplied text always wins
    if (h.label && h.label.trim()) {
      return { label: h.label, sub: `in ${parentScene}`, sceneId: h.scene_id };
    }
    if (h.info_title && h.info_title.trim()) {
      return {
        label: h.info_title,
        sub: `in ${parentScene}`,
        sceneId: h.scene_id,
      };
    }

    // 2. Otherwise derive from what the hotspot DOES
    const action = h.action && h.action !== "none" ? h.action : null;
    if ((action === "nav" || h.type === "nav") && h.target_scene_id) {
      return {
        label: `→ ${sceneName(h.target_scene_id)}`,
        sub: `nav · in ${parentScene}`,
        sceneId: h.scene_id,
      };
    }
    if (action === "url" && h.url) {
      const short = h.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40);
      return {
        label: `🔗 ${short}`,
        sub: `link · in ${parentScene}`,
        sceneId: h.scene_id,
      };
    }
    if (h.type === "video" && h.video_url) {
      const ytMatch = /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(
        h.video_url
      );
      const short = ytMatch
        ? `YouTube · ${ytMatch[1]}`
        : h.video_url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32);
      return {
        label: `▶ ${short}`,
        sub: `video · in ${parentScene}`,
        sceneId: h.scene_id,
      };
    }
    if (h.type === "polygon") {
      return {
        label: "Polygon region",
        sub: `in ${parentScene}`,
        sceneId: h.scene_id,
      };
    }

    // 3. Last-resort: icon key + short id so at least the row is
    //    disambiguated within the scene
    const kind = h.icon_key || h.type || "hotspot";
    return {
      label: `${kind} · ${h.id.slice(0, 6)}`,
      sub: `in ${parentScene}`,
      sceneId: h.scene_id,
    };
  };

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
          <div>
            <Link
              href="/"
              className="text-2xs text-neutral-400 hover:text-white flex items-center gap-1 mb-1"
            >
              <ArrowLeft size={12} /> Dashboard
            </Link>
            <div className="eyebrow mb-0.5">Analytics</div>
            <h1 className="text-[22px] font-semibold leading-tight truncate max-w-[500px]">
              {tour?.title ?? "…"}
            </h1>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {/* Presenter filter — visible only when the current user can
                see team analytics (owner or org_admin). Selecting a
                presenter narrows every metric to their sessions only. */}
            {(me?.role === "owner" || me?.role === "org_admin") &&
              presenters.length > 0 && (
                <select
                  value={selectedPresenter}
                  onChange={(e) => setSelectedPresenter(e.target.value)}
                  className="bg-panelSoft border border-border rounded px-2 py-1 text-xs min-w-[160px] mr-2"
                  title="Filter analytics by presenter"
                >
                  <option value="">All presenters</option>
                  {presenters.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
              )}
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setRange(d as 7 | 30 | 90)}
                className={`chip ${range === d ? "active" : ""}`}
              >
                {d}d
              </button>
            ))}
            {me?.role === "owner" && (
              <Link
                href={`/tour/${id}/edit`}
                className="chip ml-2"
                title="Open editor"
              >
                Open editor →
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-neutral-500 text-sm py-10 text-center">
            Loading…
          </div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              <Kpi
                icon={<Eye size={14} />}
                label="Scene views"
                value={kpis?.totalViews ?? 0}
              />
              <Kpi
                icon={<Users size={14} />}
                label="Unique sessions"
                value={kpis?.uniqueSessions ?? 0}
              />
              <Kpi
                icon={<Clock size={14} />}
                label="Avg session"
                value={formatDuration(kpis?.avgSessionSec ?? 0)}
              />
              <Kpi
                icon={<MousePointerClick size={14} />}
                label="Hotspot clicks"
                value={kpis?.hotspotClicks ?? 0}
              />
            </div>

            {/* Views timeline */}
            <Section title={`Views · last ${range} days`}>
              <ViewsChart data={viewsPerDay} />
            </Section>

            {/* Two-column: top scenes + top hotspots */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <Section title="Top scenes">
                {topScenes.length === 0 ? (
                  <EmptyRow label="No scene views yet" />
                ) : (
                  <RankedList
                    rows={topScenes.map((r) => ({
                      key: r.scene_id,
                      label: sceneName(r.scene_id),
                      value: r.count,
                    }))}
                  />
                )}
              </Section>
              <Section title="Top hotspots">
                {topHotspots.length === 0 ? (
                  <EmptyRow label="No hotspot clicks yet" />
                ) : (
                  <RankedList
                    rows={topHotspots.map((r) => {
                      const d = hotspotDisplay(r.hotspot_id);
                      return {
                        key: r.hotspot_id,
                        label: d.label,
                        sub: d.sub,
                        value: r.count,
                      };
                    })}
                  />
                )}
              </Section>
            </div>

            {(kpis?.totalViews ?? 0) === 0 && (
              <div className="text-center text-xs text-neutral-500 mt-8">
                No analytics yet. Share the tour link with someone — every
                scene view and hotspot click will land here.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* -------------------------------- UI atoms ------------------------------- */

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-panelSoft border border-border rounded px-3 py-2.5 flex items-center gap-2.5">
      <div className="w-8 h-8 grid place-items-center rounded bg-black/40 text-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-3xs uppercase tracking-wider text-neutral-500">
          {label}
        </div>
        <div className="text-[17px] font-semibold leading-tight">{value}</div>
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
    <div className="bg-panelSoft border border-border rounded p-4">
      <div className="eyebrow mb-3">{title}</div>
      {children}
    </div>
  );
}

function ViewsChart({ data }: { data: ViewsPerDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const H = 120;
  const barW = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        className="w-full h-32"
      >
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 6);
          return (
            <g key={d.day}>
              <rect
                x={i * barW + barW * 0.15}
                y={H - h}
                width={barW * 0.7}
                height={h}
                fill="currentColor"
                className="text-accent"
                opacity={d.count > 0 ? 0.9 : 0.25}
              >
                <title>{`${d.day}: ${d.count} view${
                  d.count === 1 ? "" : "s"
                }`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-3xs text-neutral-500 mt-1">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function RankedList({
  rows,
}: {
  rows: { key: string; label: string; sub?: string; value: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="text-xs">
          <div className="flex items-baseline justify-between mb-0.5 gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-neutral-100">{r.label}</div>
              {r.sub && (
                <div className="text-3xs text-neutral-500 truncate">
                  {r.sub}
                </div>
              )}
            </div>
            <span className="text-neutral-400 tabular-nums shrink-0">
              {r.value}
            </span>
          </div>
          <div className="h-1 bg-neutral-800 rounded overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="text-xs text-neutral-500 py-4 text-center">{label}</div>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
