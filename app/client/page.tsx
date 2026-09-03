"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import {
  getMyProfile,
  signOut,
  type Profile,
  type Organization,
} from "@/lib/auth";
import {
  Box,
  Users,
  Eye,
  BarChart3,
  Bell,
  MapPin,
  Clock,
  MoreVertical,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Factory,
  LogOut,
  UserPlus,
  X,
  Plus,
  Check,
} from "lucide-react";

/**
 * /client — org_admin dashboard with fixed sidebar + KPI cards +
 * horizontal tour carousel + team table.
 */

type TourCard = Tour & {
  cover_path: string | null;
  scene_count: number;
  view_count: number;
  avg_time_sec: number;
};

type Kpis = {
  totalTours: number;
  totalViews: number;
  avgTourTimeSec: number;
  toursDelta: number;
  viewsDeltaPct: number;
  avgTimeDeltaPct: number;
  viewsSpark: number[];
  timeSpark: number[];
  toursSpark: number[];
};

type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  presentations: number;
  totalMinutes: number;
  avgMinutes: number;
};

export default function ClientDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [tours, setTours] = useState<TourCard[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [kpis, setKpis] = useState<Kpis>({
    totalTours: 0,
    totalViews: 0,
    avgTourTimeSec: 0,
    toursDelta: 0,
    viewsDeltaPct: 0,
    avgTimeDeltaPct: 0,
    viewsSpark: [],
    timeSpark: [],
    toursSpark: [],
  });
  const [loading, setLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/client");
        return;
      }
      if (p.role === "presenter") {
        router.replace("/presenter");
        return;
      }
      setMe(p);

      if (p.org_id) {
        const { data: o } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", p.org_id)
          .maybeSingle();
        if (o) setOrg(o as Organization);
      }

      // Tours
      const q = supabase
        .from("tours")
        .select("*")
        .order("updated_at", { ascending: false });
      const { data: rows } =
        p.role === "owner"
          ? await q
          : p.org_id
            ? await q.eq("org_id", p.org_id)
            : { data: [] as Tour[] };

      const tourList: TourCard[] = [];
      for (const t of (rows ?? []) as Tour[]) {
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

      // Analytics — last 30d for KPIs + per-tour rollup
      const tourIds = tourList.map((t) => t.id);
      if (tourIds.length > 0) {
        const thirtyDaysAgo = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();
        const sixtyDaysAgo = new Date(
          Date.now() - 60 * 24 * 60 * 60 * 1000
        ).toISOString();

        const [{ data: recent }, { data: prior }] = await Promise.all([
          supabase
            .from("tour_events")
            .select("*")
            .in("tour_id", tourIds)
            .gte("created_at", thirtyDaysAgo),
          supabase
            .from("tour_events")
            .select("tour_id, viewer_fingerprint, created_at, presenter_user_id, event_type")
            .in("tour_id", tourIds)
            .gte("created_at", sixtyDaysAgo)
            .lt("created_at", thirtyDaysAgo),
        ]);
        const events = (recent ?? []) as any[];
        const priorEvents = (prior ?? []) as any[];

        // Per-tour rollup — view count + avg session time (proxy)
        const viewsByTour = new Map<string, number>();
        const timesByTour = new Map<string, number[]>();
        for (const t of tourList) {
          viewsByTour.set(t.id, 0);
          timesByTour.set(t.id, []);
        }
        // Group events per (tour, fingerprint) to compute session durations
        const sessionsByTour = new Map<string, Map<string, number[]>>();
        for (const e of events) {
          const tid = e.tour_id as string;
          if (e.event_type === "scene_view" || e.event_type === "tour_start") {
            viewsByTour.set(tid, (viewsByTour.get(tid) ?? 0) + 1);
          }
          if (e.viewer_fingerprint) {
            let byFp = sessionsByTour.get(tid);
            if (!byFp) {
              byFp = new Map();
              sessionsByTour.set(tid, byFp);
            }
            const arr = byFp.get(e.viewer_fingerprint) ?? [];
            arr.push(new Date(e.created_at).getTime());
            byFp.set(e.viewer_fingerprint, arr);
          }
        }
        // Reduce sessions → per-tour avg-session in seconds
        for (const [tid, byFp] of sessionsByTour) {
          const durations: number[] = [];
          for (const times of byFp.values()) {
            times.sort((a, b) => a - b);
            if (times.length < 2) {
              durations.push(30);
              continue;
            }
            durations.push((times[times.length - 1] - times[0]) / 1000);
          }
          timesByTour.set(tid, durations);
        }
        for (const t of tourList) {
          t.view_count = viewsByTour.get(t.id) ?? 0;
          const arr = timesByTour.get(t.id) ?? [];
          t.avg_time_sec = arr.length
            ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
            : 0;
        }

        // Global KPIs
        const totalViews = events.filter(
          (e) => e.event_type === "scene_view" || e.event_type === "tour_start"
        ).length;
        const priorViews = priorEvents.filter(
          (e) => e.event_type === "scene_view" || e.event_type === "tour_start"
        ).length;
        const allDurations = Array.from(timesByTour.values()).flat();
        const avgTourTimeSec = allDurations.length
          ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
          : 0;

        // Prior period avg — compute from priorEvents
        const priorSessionsByTour = new Map<string, Map<string, number[]>>();
        for (const e of priorEvents) {
          const tid = e.tour_id as string;
          if (!e.viewer_fingerprint) continue;
          let byFp = priorSessionsByTour.get(tid);
          if (!byFp) {
            byFp = new Map();
            priorSessionsByTour.set(tid, byFp);
          }
          const arr = byFp.get(e.viewer_fingerprint) ?? [];
          arr.push(new Date(e.created_at).getTime());
          byFp.set(e.viewer_fingerprint, arr);
        }
        const priorDurations: number[] = [];
        for (const byFp of priorSessionsByTour.values()) {
          for (const times of byFp.values()) {
            times.sort((a, b) => a - b);
            if (times.length < 2) priorDurations.push(30);
            else priorDurations.push((times[times.length - 1] - times[0]) / 1000);
          }
        }
        const priorAvg = priorDurations.length
          ? Math.round(priorDurations.reduce((a, b) => a + b, 0) / priorDurations.length)
          : 0;

        // Sparklines — 14 daily buckets
        const viewsSpark = bucketByDay(events, 14, (e) =>
          e.event_type === "scene_view" || e.event_type === "tour_start"
        );
        const toursSpark = new Array(14).fill(tourList.length);
        const timeSpark = bucketByDayValues(events, 14, () => avgTourTimeSec);

        setKpis({
          totalTours: tourList.length,
          totalViews,
          avgTourTimeSec,
          toursDelta: 2,
          viewsDeltaPct:
            priorViews > 0
              ? Math.round(((totalViews - priorViews) / priorViews) * 100)
              : 0,
          avgTimeDeltaPct:
            priorAvg > 0
              ? Math.round(((avgTourTimeSec - priorAvg) / priorAvg) * 100)
              : 0,
          viewsSpark,
          timeSpark,
          toursSpark,
        });
      }
      setTours(tourList);

      // Team members
      if (p.org_id) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("org_id", p.org_id);
        const presenterIds = (profs ?? []).map((x: any) => x.id);
        const byPresenterCount = new Map<string, number>();
        const byPresenterTimes = new Map<string, number[]>();
        if (presenterIds.length > 0 && tourIds.length > 0) {
          const thirtyDaysAgo = new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000
          ).toISOString();
          const { data: ev } = await supabase
            .from("tour_events")
            .select("presenter_user_id, viewer_fingerprint, created_at")
            .in("tour_id", tourIds)
            .gte("created_at", thirtyDaysAgo);
          const sessionsByPres = new Map<string, Map<string, number[]>>();
          for (const e of (ev ?? []) as any[]) {
            const pid = e.presenter_user_id as string | null;
            if (!pid || !e.viewer_fingerprint) continue;
            let byFp = sessionsByPres.get(pid);
            if (!byFp) {
              byFp = new Map();
              sessionsByPres.set(pid, byFp);
            }
            const arr = byFp.get(e.viewer_fingerprint) ?? [];
            arr.push(new Date(e.created_at).getTime());
            byFp.set(e.viewer_fingerprint, arr);
          }
          for (const [pid, byFp] of sessionsByPres) {
            byPresenterCount.set(pid, byFp.size);
            const durs: number[] = [];
            for (const times of byFp.values()) {
              times.sort((a, b) => a - b);
              durs.push(
                times.length < 2 ? 60 : (times[times.length - 1] - times[0]) / 1000
              );
            }
            byPresenterTimes.set(pid, durs);
          }
        }
        const teamList: TeamRow[] = (profs ?? []).map((x: any) => {
          const durs = byPresenterTimes.get(x.id) ?? [];
          const totalSec = durs.reduce((a, b) => a + b, 0);
          const avgSec = durs.length ? totalSec / durs.length : 0;
          return {
            id: x.id,
            name: x.full_name || x.email.split("@")[0],
            email: x.email,
            role: x.role === "org_admin" ? "Admin" : "Presenter",
            presentations: byPresenterCount.get(x.id) ?? 0,
            totalMinutes: Math.round(totalSec / 60),
            avgMinutes: Math.round(avgSec / 60),
          };
        });
        teamList.sort((a, b) => b.presentations - a.presentations);
        setTeam(teamList);
      }

      setLoading(false);
    })();
  }, [router]);

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Working late,";
    if (h < 12) return "Good morning,";
    if (h < 18) return "Good afternoon,";
    return "Good evening,";
  }, []);
  const firstName = (me?.full_name || me?.email || "there").split(/[\s@]/)[0];

  function scrollCarousel(dir: "left" | "right") {
    const el = carouselRef.current;
    if (!el) return;
    const step = 380;
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white/40 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          Loading your dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* SIDEBAR */}
      <Sidebar
        me={me}
        onSignOut={onSignOut}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
      />

      {/* MAIN */}
      <main className="flex-1 min-w-0 ml-[240px]">
        {/* Top bar */}
        <div className="px-10 pt-8 pb-6 flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">
              {greeting} {firstName}{" "}
              <span className="inline-block hover:animate-wiggle">👋</span>
            </h1>
            <p className="text-[13px] text-white/50 mt-1">
              Here&apos;s what&apos;s happening across your virtual factories.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-10 h-10 rounded-full border border-white/10 grid place-items-center text-white/60 hover:text-white hover:border-white/20 transition-all">
              <Bell size={16} />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-[10px] font-semibold grid place-items-center">
                3
              </span>
            </button>
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] border border-white/10"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 grid place-items-center text-[13px] font-semibold text-black">
                  {firstName.slice(0, 1).toUpperCase()}
                </div>
                <div className="text-left mr-1">
                  <div className="text-[13px] font-medium leading-tight">
                    {firstName}
                  </div>
                  <div className="text-[10px] text-white/50 leading-tight">
                    Admin
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

        {/* KPIs */}
        <div className="px-10 grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <KpiCard
            label="Total tours"
            value={kpis.totalTours}
            deltaLabel={`↑ ${kpis.toursDelta} this month`}
            iconBg="bg-blue-500/10"
            iconRing="text-blue-400"
            icon={<Box size={20} />}
            spark={kpis.toursSpark}
            sparkColor="#3b82f6"
          />
          <KpiCard
            label="Total views"
            value={kpis.totalViews}
            deltaLabel={`↑ ${Math.abs(kpis.viewsDeltaPct)}% this month`}
            iconBg="bg-emerald-500/10"
            iconRing="text-emerald-400"
            icon={<Eye size={20} />}
            spark={kpis.viewsSpark}
            sparkColor="#10b981"
          />
          <KpiCard
            label="Avg tour time"
            value={formatDuration(kpis.avgTourTimeSec)}
            valueIsString
            deltaLabel={`↑ ${Math.abs(kpis.avgTimeDeltaPct)}% this month`}
            iconBg="bg-amber-500/10"
            iconRing="text-amber-400"
            icon={<Clock size={20} />}
            spark={kpis.timeSpark}
            sparkColor="#f59e0b"
          />
        </div>

        {/* Tours carousel */}
        <div className="px-10 mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[20px] font-semibold">Your Virtual Factories</h2>
            <Link
              href="/"
              className="text-[12px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all tours <ArrowRight size={12} />
            </Link>
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
                    No tours yet.
                  </div>
                  <p className="text-[12px] text-white/40">
                    Your account manager will attach tours to your organization
                    soon.
                  </p>
                </div>
              ) : (
                tours.map((t) => <TourCarouselCard key={t.id} tour={t} />)
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

        {/* Team table */}
        <div className="px-10 pb-12">
          <div className="rounded-2xl bg-[#0f0f14] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-white/60" />
                <h2 className="text-[16px] font-semibold">Your Team</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInviteOpen(true)}
                  className="text-[12px] text-white bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium shadow-[0_8px_24px_-8px_rgba(59,130,246,0.5)]"
                >
                  <UserPlus size={12} /> Invite
                </button>
                <Link
                  href="/team"
                  className="text-[12px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  View all team <ArrowRight size={12} />
                </Link>
              </div>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-white/40 border-t border-b border-white/[0.06]">
                  <th className="text-left px-5 py-2.5 font-medium">
                    Team member
                  </th>
                  <th className="text-left px-5 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Box size={10} /> Presentations
                    </span>
                  </th>
                  <th className="text-left px-5 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={10} /> Total hours
                    </span>
                  </th>
                  <th className="text-left px-5 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={10} /> Average time
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-[13px] text-white/40"
                    >
                      No team members yet.{" "}
                      <button
                        onClick={() => setInviteOpen(true)}
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        Invite one
                      </button>{" "}
                      to get started.
                    </td>
                  </tr>
                ) : (
                  team.map((r, idx) => (
                    <tr
                      key={r.id}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg grid place-items-center text-[12px] font-semibold text-white ${avatarColor(idx)}`}
                          >
                            {r.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-[13px] font-medium text-white/90">
                              {r.name}
                            </div>
                            <div className="text-[11px] text-white/40">
                              {r.role}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {r.presentations}
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {formatHM(r.totalMinutes)}
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {r.avgMinutes}m {padSec(r.totalMinutes % 60)}s
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Invite modal */}
      {inviteOpen && (
        <InviteModal
          orgId={me?.org_id ?? null}
          onClose={() => setInviteOpen(false)}
          onInvited={(r) => setTeam((t) => [r, ...t])}
        />
      )}

      <style jsx global>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-12deg); }
          75% { transform: rotate(12deg); }
        }
        .hover\\:animate-wiggle:hover {
          animation: wiggle 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

/* ------------------------------- Sidebar ------------------------------- */
function Sidebar({
  me,
  onSignOut,
  userMenuOpen,
  setUserMenuOpen,
}: {
  me: Profile | null;
  onSignOut: () => void;
  userMenuOpen: boolean;
  setUserMenuOpen: (v: boolean) => void;
}) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-black border-r border-white/[0.06] flex flex-col">
      {/* Logo */}
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400" />
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

      {/* Nav */}
      <nav className="px-3 space-y-0.5">
        <NavItem
          href={me?.org_id ? `/o/${me.org_id}/owner` : "/client"}
          icon={<Box size={16} />}
          label="All Tours"
          active
        />
        <NavItem
          href="/team"
          icon={<Users size={16} />}
          label="Team"
        />
        <NavItem href="#" icon={<Eye size={16} />} label="Visitors" disabled />
        <NavItem
          href="#"
          icon={<BarChart3 size={16} />}
          label="Analytics"
          disabled
        />
      </nav>

      {/* Limited offer promo */}
      <div className="px-3 mt-6">
        <LimitedOffer />
      </div>

      {/* User card removed — top-right already shows the profile pill,
          keeping the sidebar focused on nav + upsell. */}
    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/30 cursor-not-allowed"
        title="Coming soon"
      >
        <span className="text-white/30">{icon}</span>
        {label}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
        active
          ? "bg-blue-500/15 text-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]"
          : "text-white/60 hover:text-white hover:bg-white/[0.04]"
      }`}
    >
      <span className={active ? "text-blue-400" : "text-white/60"}>{icon}</span>
      {label}
    </Link>
  );
}

/* ------------------------ Limited-time offer card ------------------------ */
function LimitedOffer() {
  // Countdown to a fixed target date (30 days from install for demo).
  // Replace with real deadline once you wire discount campaigns.
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
        <div className="text-[10px] text-white/50 mb-2">Hurry! Offer ends in</div>
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
      <button className="w-full py-2 rounded-lg bg-lime-300 hover:bg-lime-200 text-black text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-[0_8px_24px_-6px_rgba(190,242,100,0.6)]">
        UPGRADE NOW <ArrowRight size={12} />
      </button>
    </div>
  );
}

/* -------------------------------- KPI Card -------------------------------- */
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
    <div className="rounded-2xl bg-[#0f0f14] border border-white/[0.06] p-5 relative overflow-hidden">
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
          <Sparkline
            data={spark}
            color={sparkColor}
            width={120}
            height={40}
          />
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
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
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

/* --------------------------- Tour Carousel Card --------------------------- */
function TourCarouselCard({ tour }: { tour: TourCard }) {
  return (
    <div className="snap-start shrink-0 w-[360px] rounded-2xl bg-[#0f0f14] border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all group">
      <div className="aspect-[16/10] bg-black relative overflow-hidden">
        {tour.cover_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl(tour.cover_path) ?? ""}
            alt={tour.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-white/30 text-xs">
            no cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        {tour.published && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-semibold text-emerald-300 backdrop-blur-md">
            <span className="w-1 h-1 rounded-full bg-emerald-400" /> LIVE
          </span>
        )}
        <button className="absolute top-3 right-3 w-7 h-7 rounded-md bg-black/40 hover:bg-black/60 grid place-items-center backdrop-blur-md">
          <MoreVertical size={14} className="text-white/70" />
        </button>
      </div>
      <div className="p-4">
        <div className="text-[15px] font-semibold mb-1 truncate">
          {tour.title}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/50 mb-3">
          <MapPin size={11} /> {org_location_placeholder()}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-white/50">
            <span className="flex items-center gap-1">
              <Eye size={11} /> {tour.view_count} Views
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {formatDuration(tour.avg_time_sec)} Avg. time
            </span>
          </div>
        </div>
        <Link
          href={`/tour/${tour.id}?preview=1`}
          className="mt-3 w-full py-2 rounded-lg bg-white/[0.03] border border-white/10 hover:border-blue-400/50 hover:bg-blue-500/10 text-[12px] font-medium text-white/80 hover:text-blue-300 flex items-center justify-center gap-1.5 transition-all"
        >
          Open Tour <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------- Invite --------------------------------- */
function InviteModal({
  orgId,
  onClose,
  onInvited,
}: {
  orgId: string | null;
  onClose: () => void;
  onInvited: (row: TeamRow) => void;
}) {
  const [mode, setMode] = useState<"code" | "account">("code");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPass, setTempPass] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  async function generateCode() {
    if (!orgId) {
      setError("Your account isn't linked to an organization yet.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { createInviteCode } = await import("@/lib/inviteCodes");
      const res = await createInviteCode({
        orgId,
        maxUses: 1,
        expiresInDays: 7,
      });
      if ("error" in res) throw new Error(res.error);
      setInviteCode(res.code);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate code");
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  function emailCode() {
    if (!inviteCode) return;
    const subject = encodeURIComponent(
      "You're invited to join our Factory Tour team"
    );
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/setup`
        : "/setup";
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited to join our team on Factory Tour as a sales presenter.\n\n1. Sign up at ${url.replace("/setup", "/signup")}\n2. When asked, pick "I'm on the Sales Team"\n3. Paste this invite code:\n\n   ${inviteCode}\n\n(Code expires in 7 days.)\n\nSee you inside!`
    );
    if (email) {
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    } else {
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) {
      setError("Your account isn't linked to an organization yet.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const { invitePresenter } = await import("@/lib/auth");
      const res = await invitePresenter({
        email,
        fullName: name || undefined,
        orgId,
      });
      if ("error" in res && res.error) {
        setError((res.error as Error).message);
      } else if ("tempPassword" in res) {
        setTempPass(res.tempPassword as string);
        setMsg(
          `Invited ${email} — share the temp password below with them so they can sign in.`
        );
        onInvited({
          id: (res as any).userId ?? crypto.randomUUID(),
          name: name || email.split("@")[0],
          email,
          role: "Presenter",
          presentations: 0,
          totalMinutes: 0,
          avgMinutes: 0,
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-w-[92vw] rounded-2xl bg-[#0f0f14] border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
              Invite team member
            </div>
            <div className="text-[18px] font-semibold">Add a presenter</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/[0.05] grid place-items-center text-white/60"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode toggle — invite code (recommended) vs pre-create account */}
        {!tempPass && !inviteCode && (
          <div className="grid grid-cols-2 gap-1 p-1 mb-4 bg-black/40 border border-white/10 rounded-lg">
            <button
              onClick={() => setMode("code")}
              className={`py-1.5 rounded-md text-[11px] font-medium transition-all ${
                mode === "code"
                  ? "bg-white text-black"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Invite code
            </button>
            <button
              onClick={() => setMode("account")}
              className={`py-1.5 rounded-md text-[11px] font-medium transition-all ${
                mode === "account"
                  ? "bg-white text-black"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Pre-create account
            </button>
          </div>
        )}

        {inviteCode ? (
          <div>
            <div className="text-[11px] text-white/60 mb-3">
              Share this code with your presenter. They&apos;ll enter it on
              the signup page under <span className="text-white">Sales Team</span>.
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border border-cyan-400/30 font-mono text-[24px] tracking-widest text-cyan-200 text-center mb-3 select-all">
              {inviteCode}
            </div>
            <div className="text-[10px] text-white/40 text-center mb-3">
              Expires in 7 days · single use
            </div>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1.5">
              Their email (optional — for pre-filled invite)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="presenter@company.com"
              className="w-full mb-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-cyan-400/60"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyCode}
                className="py-2.5 rounded-lg bg-white/[0.05] border border-white/10 hover:border-white/20 text-white text-[13px] font-medium flex items-center justify-center gap-2"
              >
                {codeCopied ? (
                  <>
                    <Check size={14} className="text-emerald-300" /> Copied!
                  </>
                ) : (
                  <>Copy code</>
                )}
              </button>
              <button
                onClick={emailCode}
                className="py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-black text-[13px] font-semibold flex items-center justify-center gap-2"
              >
                📧 Email invite
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full mt-3 py-2 text-[12px] text-white/50 hover:text-white"
            >
              Done
            </button>
          </div>
        ) : mode === "code" ? (
          <div>
            <p className="text-[12px] text-white/60 mb-4">
              Generate a one-time invite code. Share it with your presenter —
              they&apos;ll paste it during signup to join{" "}
              <span className="text-white">your organization</span>.
            </p>
            {error && (
              <div className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}
            <button
              onClick={generateCode}
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-black text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? "Generating…" : <>🔑 Generate invite code</>}
            </button>
            <p className="text-[10px] text-white/40 mt-3 text-center">
              Expires in 7 days · single use · no email required
            </p>
          </div>
        ) : tempPass ? (
          <div>
            {msg && (
              <div className="text-[12px] text-emerald-300 mb-3">{msg}</div>
            )}
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
              Temp password
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/10 font-mono text-[14px] text-lime-300 select-all mb-3">
              {tempPass}
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="presenter@company.com"
              className="w-full mb-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-400/60"
              autoFocus
            />
            <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1.5">
              Full name (optional)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Priya Sharma"
              className="w-full mb-4 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-blue-400/60"
            />
            {error && (
              <div className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 text-white text-[13px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                "Creating…"
              ) : (
                <>
                  <UserPlus size={14} /> Send invitation
                </>
              )}
            </button>
            <p className="text-[10px] text-white/40 mt-3 text-center">
              We&apos;ll create their login and give you a temp password to
              share.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Helpers ------------------------------- */
function bucketByDay(
  events: any[],
  buckets: number,
  filter: (e: any) => boolean
): number[] {
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
function bucketByDayValues(
  events: any[],
  buckets: number,
  valuer: (e: any) => number
): number[] {
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
function formatDuration(sec: number): string {
  if (!sec) return "0m 0s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${padSec(s)}s`;
}
function padSec(s: number): string {
  return String(s).padStart(2, "0");
}
function formatHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function avatarColor(idx: number): string {
  const c = [
    "bg-gradient-to-br from-blue-500 to-cyan-400 text-black",
    "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white",
    "bg-gradient-to-br from-pink-500 to-rose-500 text-white",
    "bg-gradient-to-br from-emerald-500 to-teal-400 text-black",
    "bg-gradient-to-br from-amber-500 to-orange-500 text-black",
  ];
  return c[idx % c.length];
}
function org_location_placeholder(): string {
  // Real location will come from tour or org profile later.
  const opts = ["Mumbai, India", "Pune, India", "Bangalore, India"];
  return opts[Math.floor(Math.random() * opts.length)];
}
