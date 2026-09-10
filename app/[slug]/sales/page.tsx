"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import {
  getMyProfile,
  signOut,
  type Profile,
  type Organization,
} from "@/lib/auth";
import { orgBySlug, slugForOrgId } from "@/lib/orgSlug";
import OfflineControls from "@/components/sales/OfflineControls";
import {
  Box,
  Bell,
  MapPin,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Factory,
  LogOut,
  ArrowRight,
  Play,
  Zap,
  Rocket,
  Copy as CopyIcon,
  Check,
} from "lucide-react";

type TourCard = Tour & {
  cover_path: string | null;
  scene_count: number;
  view_count: number;
  avg_time_sec: number;
};

/**
 * /{slug}/sales — presenter (sales team) dashboard.
 *
 * Same visual language as the owner dashboard (sidebar + top bar +
 * carousel + LIMITED-TIME-OFFER card), stripped to what a salesperson
 * actually needs mid-day: personal stats + tours ready to present.
 */
export default function SalesDashboardPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [tours, setTours] = useState<TourCard[]>([]);
  const [presentations, setPresentations] = useState(0);
  const [avgSec, setAvgSec] = useState(0);
  const [totalSec, setTotalSec] = useState(0);
  const [presentSpark, setPresentSpark] = useState<number[]>([]);
  const [avgSpark, setAvgSpark] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace(`/login?next=/${params.slug}/sales`);
        return;
      }
      // Super-owner (that's you, NITIN) always goes to the cross-org
      // tour editor at /, regardless of which slug URL they typed.
      if (p.role === "owner") {
        router.replace("/");
        return;
      }
      if (!p.org_id) {
        router.replace("/setup");
        return;
      }
      const orgRow = await orgBySlug(params.slug);
      if (!orgRow || orgRow.id !== p.org_id) {
        const mySlug = await slugForOrgId(p.org_id);
        router.replace(
          mySlug
            ? `/${mySlug}/${p.role === "org_admin" ? "owner" : "sales"}`
            : "/setup"
        );
        return;
      }
      if (p.role === "org_admin") {
        router.replace(`/${params.slug}/owner`);
        return;
      }
      setMe(p);
      setOrg(orgRow as Organization);

      // Fetch all tours in the org — sales can present any of them.
      const { data: tourRows } = await supabase
        .from("tours")
        .select("*")
        .eq("org_id", orgRow.id)
        .order("updated_at", { ascending: false });
      const tourList: TourCard[] = [];
      for (const t of (tourRows ?? []) as Tour[]) {
        const { data: scenes } = await supabase
          .from("scenes")
          .select("id, image_path")
          .eq("tour_id", t.id)
          .order("order_index");
        const cover = t.thumbnail_path ?? scenes?.[0]?.image_path ?? null;
        tourList.push({
          ...t,
          cover_path: cover,
          scene_count: scenes?.length ?? 0,
          view_count: 0,
          avg_time_sec: 0,
        });
      }

      // Analytics — presentations attributed to THIS presenter, 30d.
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const tourIds = tourList.map((t) => t.id);
      if (tourIds.length > 0) {
        const { data: events } = await supabase
          .from("tour_events")
          .select("*")
          .in("tour_id", tourIds)
          .eq("presenter_user_id", p.id)
          .gte("created_at", thirtyDaysAgo);
        const rowsE = (events ?? []) as any[];

        // Group events per fingerprint per tour → session durations
        const sessionsByTour = new Map<string, Map<string, number[]>>();
        for (const e of rowsE) {
          if (!e.viewer_fingerprint) continue;
          let byFp = sessionsByTour.get(e.tour_id as string);
          if (!byFp) {
            byFp = new Map();
            sessionsByTour.set(e.tour_id as string, byFp);
          }
          const arr = byFp.get(e.viewer_fingerprint) ?? [];
          arr.push(new Date(e.created_at).getTime());
          byFp.set(e.viewer_fingerprint, arr);
        }

        const allDurations: number[] = [];
        for (const t of tourList) {
          const byFp = sessionsByTour.get(t.id);
          const durs: number[] = [];
          if (byFp) {
            for (const times of byFp.values()) {
              times.sort((a, b) => a - b);
              durs.push(
                times.length < 2
                  ? 30
                  : (times[times.length - 1] - times[0]) / 1000
              );
            }
          }
          t.view_count = byFp ? byFp.size : 0;
          t.avg_time_sec = durs.length
            ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length)
            : 0;
          allDurations.push(...durs);
        }
        setPresentations(allDurations.length);
        setTotalSec(Math.round(allDurations.reduce((a, b) => a + b, 0)));
        setAvgSec(
          allDurations.length
            ? Math.round(
                allDurations.reduce((a, b) => a + b, 0) / allDurations.length
              )
            : 0
        );

        // Sparklines
        setPresentSpark(bucketByDay(rowsE, 14, () => true));
        setAvgSpark(bucketByDayValues(rowsE, 14, () => 1) as number[]);
      }
      setTours(tourList);
      setLoading(false);
    })();
  }, [params.slug, router]);

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  function scrollCarousel(dir: "left" | "right") {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -380 : 380, behavior: "smooth" });
  }

  function copyLink(t: TourCard) {
    const url = `${window.location.origin}/tour/${t.id}?presenter=${me?.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Working late,";
    if (h < 12) return "Good morning,";
    if (h < 18) return "Good afternoon,";
    return "Good evening,";
  }, []);
  const firstName = (me?.full_name || me?.email || "there").split(/[\s@]/)[0];

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white/40 text-sm">
        Loading your workspace…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Offline mode cockpit — floating status pill + prep modal +
          top banner when the network drops. Presenters can pre-download
          every tour they need before heading into a factory with poor wifi. */}
      <OfflineControls
        tours={tours.map((t) => ({ id: t.id, title: t.title }))}
      />
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-[240px] bg-black border-r border-white/[0.06] flex flex-col">
        <div className="px-6 pt-7 pb-8">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-pink-500 to-cyan-400" />
              <div className="absolute inset-[3px] rounded-md bg-black grid place-items-center">
                <Factory size={16} className="text-white" />
              </div>
            </div>
            <div className="text-[15px] font-semibold tracking-tight leading-none">
              FACTORY
              <br />
              TOUR
            </div>
          </div>
        </div>
        <nav className="px-3 space-y-0.5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] bg-pink-500/15 text-pink-300 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.3)]">
            <Box size={16} className="text-pink-400" />
            My Tours
          </div>
        </nav>

        {/* Limited offer */}
        <div className="px-3 mt-6">
          <LimitedOffer />
        </div>

        {/* User card removed — top-right handles the profile pill. */}
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 ml-[240px]">
        <div className="px-10 pt-8 pb-6 flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">
              {greeting} {firstName} 🎯
            </h1>
            <p className="text-[13px] text-white/50 mt-1">
              Your tours are ready. Pick one to open a live session.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-10 h-10 rounded-full border border-white/10 grid place-items-center text-white/60 hover:text-white hover:border-white/20 transition-all">
              <Bell size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] border border-white/10"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-cyan-400 grid place-items-center text-[13px] font-semibold text-black">
                  {firstName.slice(0, 1).toUpperCase()}
                </div>
                <div className="text-left mr-1">
                  <div className="text-[13px] font-medium leading-tight">
                    {firstName}
                  </div>
                  <div className="text-[10px] text-white/50 leading-tight">
                    Presenter
                  </div>
                </div>
                <ChevronDown size={14} className="text-white/40" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 min-w-[180px] rounded-lg border border-white/10 bg-[#0f0f14] shadow-2xl overflow-hidden z-10">
                  <div className="px-3 py-2.5 border-b border-white/10">
                    <div className="text-[12px] font-medium truncate">
                      {me?.full_name || me?.email}
                    </div>
                    <div className="text-[10px] text-white/50 truncate">
                      {me?.email}
                    </div>
                  </div>
                  <button
                    onClick={onSignOut}
                    className="w-full text-left px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.04] hover:text-white flex items-center gap-2"
                  >
                    <LogOut size={12} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPIs (only 2 — presentations count + avg time) */}
        <div className="px-10 grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <KpiCard
            label="Presentations · 30d"
            value={presentations}
            deltaLabel={`Total ${formatHM(Math.round(totalSec / 60))}`}
            iconBg="bg-pink-500/10"
            iconRing="text-pink-400"
            icon={<Zap size={20} />}
            spark={presentSpark}
            sparkColor="#ec4899"
          />
          <KpiCard
            label="Avg presentation time"
            value={formatDuration(avgSec)}
            valueIsString
            deltaLabel={
              avgSec > 300
                ? "Great engagement 🔥"
                : avgSec > 60
                  ? "Keep it going"
                  : "First few sessions"
            }
            iconBg="bg-cyan-500/10"
            iconRing="text-cyan-400"
            icon={<Clock size={20} />}
            spark={avgSpark}
            sparkColor="#22d3ee"
          />
        </div>

        {/* Quick launch — the most-recent tour, huge CTA */}
        {tours.length > 0 && (
          <div className="px-10 mb-8">
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-pink-500/20 via-violet-500/15 to-cyan-500/10 backdrop-blur-xl p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 grid place-items-center shadow-[0_10px_30px_-8px_rgba(236,72,153,0.6)]">
                <Rocket size={26} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.15em] text-pink-200/80 mb-0.5">
                  Quick launch
                </div>
                <div className="text-[16px] font-semibold text-white/95 truncate">
                  {tours[0].title}
                </div>
                <div className="text-[11px] text-white/50 truncate">
                  Open in a new tab and start presenting.
                </div>
              </div>
              <a
                href={`/tour/${tours[0].id}?presenter=${me?.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-4 py-2.5 bg-white text-black text-[13px] font-semibold rounded-lg hover:bg-white/90 flex items-center gap-2 shadow-lg"
              >
                <Play size={14} /> Start
              </a>
            </div>
          </div>
        )}

        {/* Tour carousel */}
        <div className="px-10 mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[20px] font-semibold">
              Your Virtual Factories
            </h2>
            <span className="text-[12px] text-white/40">
              {tours.length} {tours.length === 1 ? "tour" : "tours"}
            </span>
          </div>
          <div className="relative">
            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tours.length === 0 ? (
                <div className="w-full border border-dashed border-white/10 rounded-2xl p-14 text-center bg-white/[0.02]">
                  <Box size={22} className="mx-auto text-white/30 mb-3" />
                  <div className="text-[14px] text-white/70 mb-1">
                    No tours to present yet.
                  </div>
                  <p className="text-[12px] text-white/40">
                    Your admin will publish tours here soon.
                  </p>
                </div>
              ) : (
                tours.map((t) => (
                  <div
                    key={t.id}
                    className="snap-start shrink-0 w-[360px] rounded-2xl bg-[#0f0f14] border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all group"
                  >
                    <div className="aspect-[16/10] bg-black relative overflow-hidden">
                      {t.cover_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={publicUrl(t.cover_path) ?? ""}
                          alt={t.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-white/30 text-xs">
                          no cover
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
                      {t.published && (
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-semibold text-emerald-300 backdrop-blur-md">
                          <span className="w-1 h-1 rounded-full bg-emerald-400" />{" "}
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="text-[15px] font-semibold mb-1 truncate">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-white/50 mb-3">
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatDuration(t.avg_time_sec)} avg
                        </span>
                        <span>·</span>
                        <span>{t.view_count} sessions</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={`/tour/${t.id}?presenter=${me?.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2 rounded-lg bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-400 hover:to-violet-400 text-white text-[12px] font-medium flex items-center justify-center gap-1.5"
                        >
                          <Play size={11} /> Present
                        </a>
                        <button
                          onClick={() => copyLink(t)}
                          className="py-2 rounded-lg bg-white/[0.03] border border-white/10 hover:border-white/20 text-white/80 text-[12px] font-medium flex items-center justify-center gap-1.5"
                        >
                          {copiedId === t.id ? (
                            <>
                              <Check size={11} className="text-emerald-300" />{" "}
                              Copied
                            </>
                          ) : (
                            <>
                              <CopyIcon size={11} /> Copy link
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {tours.length > 3 && (
              <>
                <button
                  onClick={() => scrollCarousel("left")}
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md grid place-items-center border border-white/10"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => scrollCarousel("right")}
                  className="absolute -right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md grid place-items-center border border-white/10"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------ Limited offer (shared design) ------------------------ */
function LimitedOffer() {
  const target = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(23, 59, 59, 0);
    return d.getTime();
  }, []);
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const remaining = Math.max(0, target - now);
  const days = Math.floor(remaining / 86400000);
  const hrs = Math.floor((remaining % 86400000) / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0f0f14] p-4 text-center">
      <div className="text-[9px] uppercase tracking-[0.15em] text-lime-300 font-semibold flex items-center justify-center gap-1 mb-3">
        Limited Time Offer <span>🔥</span>
      </div>
      <div className="text-[10px] text-white/50 mb-0.5">Original Price</div>
      <div className="text-[13px] text-white/40 line-through mb-3">
        ₹3,00,000
      </div>
      <div className="text-[10px] text-white/50 mb-0.5">Special Discount</div>
      <div className="text-[18px] font-bold text-lime-300 mb-3">
        ₹30,000 OFF
      </div>
      <div className="border-t border-white/10 pt-3 mb-3">
        <div className="text-[10px] text-white/50 mb-2">
          Hurry! Offer ends in
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { v: days, l: "days" },
            { v: hrs, l: "hrs" },
            { v: mins, l: "min" },
            { v: secs, l: "sec" },
          ].map((t) => (
            <div key={t.l}>
              <div className="text-[16px] font-bold text-lime-300 tabular-nums leading-none">
                {String(t.v).padStart(2, "0")}
              </div>
              <div className="text-[8px] uppercase text-white/40 tracking-wider mt-1">
                {t.l}
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className="w-full py-2 rounded-lg bg-lime-300 hover:bg-lime-200 text-black text-[12px] font-semibold flex items-center justify-center gap-1.5">
        UPGRADE NOW <ArrowRight size={12} />
      </button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueIsString,
  deltaLabel,
  iconBg,
  iconRing,
  icon,
  spark,
  sparkColor,
}: {
  label: string;
  value: number | string;
  valueIsString?: boolean;
  deltaLabel: string;
  iconBg: string;
  iconRing: string;
  icon: React.ReactNode;
  spark: number[];
  sparkColor: string;
}) {
  const [n, setN] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (valueIsString) return;
    const target = value as number;
    const start = performance.now();
    const dur = 900;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, valueIsString]);
  return (
    <div className="rounded-2xl bg-[#0f0f14] border border-white/[0.06] p-5">
      <div className="flex items-start gap-4 mb-4">
        <div
          className={`w-12 h-12 rounded-xl ${iconBg} grid place-items-center ${iconRing}`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-medium mb-1">
            {label}
          </div>
          <div className="text-[30px] font-semibold tracking-tight tabular-nums leading-none">
            {valueIsString ? (value as string) : n.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-[11px] text-emerald-400 font-medium">
          {deltaLabel}
        </div>
        {spark.length > 1 && (
          <Sparkline data={spark} color={sparkColor} width={120} height={40} />
        )}
      </div>
    </div>
  );
}

function Sparkline({
  data,
  color,
  width,
  height,
}: {
  data: number[];
  color: string;
  width: number;
  height: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);
  const step = width / (data.length - 1);
  const points = data
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`
    )
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#spark-${color})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function bucketByDay(events: any[], buckets: number, filter: (e: any) => boolean) {
  const out = new Array(buckets).fill(0);
  const now = Date.now();
  const bucketMs = 86400000;
  for (const e of events) {
    if (!filter(e)) continue;
    const t = new Date(e.created_at).getTime();
    const ago = Math.floor((now - t) / bucketMs);
    if (ago >= 0 && ago < buckets) out[buckets - 1 - ago]++;
  }
  return out;
}
function bucketByDayValues(events: any[], buckets: number, valuer: (e: any) => number) {
  const out = new Array(buckets).fill(0);
  const now = Date.now();
  const bucketMs = 86400000;
  const counts = new Array(buckets).fill(0);
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    const ago = Math.floor((now - t) / bucketMs);
    if (ago >= 0 && ago < buckets) {
      out[buckets - 1 - ago] += valuer(e);
      counts[buckets - 1 - ago]++;
    }
  }
  return out.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0));
}
function formatDuration(sec: number) {
  if (!sec) return "0m 0s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
function formatHM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
