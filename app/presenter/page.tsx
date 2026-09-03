"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import { getMyProfile, signOut, type Profile } from "@/lib/auth";
import {
  LogOut,
  Play,
  Copy as CopyIcon,
  Zap,
  TrendingUp,
  Clock,
  Trophy,
  Sparkles,
  Rocket,
  Check,
} from "lucide-react";
import type { ShareLink } from "@/lib/shareLinks";

/**
 * /presenter — daily driver for salespeople.
 *
 * Focused on ACTION, not admin: big "Start a session" launcher on top,
 * personal KPIs below (meetings, avg duration, best tour), then the
 * grid of tours they can present.
 *
 * No org-wide analytics, no editor access — just what a presenter needs
 * to walk into a meeting and demo instantly.
 */

type Row = {
  link: ShareLink;
  tour: Tour;
  coverPath: string | null;
};

type PersonalStats = {
  meetingsThisMonth: number;
  totalMeetings: number;
  avgDurationMin: number;
  streakDays: number;
};

type RecentSession = {
  id: string;
  tourTitle: string;
  countryFlag: string;
  country: string;
  minutesAgo: number;
  durationMin: number;
};

export default function PresenterHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<PersonalStats>({
    meetingsThisMonth: 0,
    totalMeetings: 0,
    avgDurationMin: 0,
    streakDays: 0,
  });
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/presenter");
        return;
      }
      if (p.role === "owner") {
        router.replace("/");
        return;
      }
      if (p.role === "org_admin") {
        router.replace("/client");
        return;
      }
      setMe(p);

      // Fetch presenter's share links + hydrate with tour + cover.
      const { data: links } = await supabase
        .from("share_links")
        .select("*")
        .eq("owner_user_id", p.id)
        .eq("kind", "presenter")
        .is("revoked_at", null);

      const rowList: Row[] = [];
      for (const l of ((links ?? []) as ShareLink[])) {
        const { data: t } = await supabase
          .from("tours")
          .select("*")
          .eq("id", l.tour_id)
          .maybeSingle();
        if (!t) continue;
        const tour = t as Tour;
        const { data: scenes } = await supabase
          .from("scenes")
          .select("image_path")
          .eq("tour_id", tour.id)
          .order("order_index")
          .limit(1);
        const cover =
          tour.thumbnail_path ??
          (scenes && scenes[0]
            ? (scenes[0] as { image_path: string }).image_path
            : null);
        rowList.push({ link: l, tour, coverPath: cover });
      }
      setRows(rowList);

      // Personal stats — presenter_user_id attribution over last 30 days.
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: events } = await supabase
        .from("tour_events")
        .select("*")
        .eq("presenter_user_id", p.id)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false });
      const rowsE = (events ?? []) as any[];

      const meetings = new Set<string>(
        rowsE.filter((e) => e.viewer_fingerprint).map((e) => e.viewer_fingerprint as string)
      );

      // Streak — count consecutive days back from today with ≥1 event.
      const dayset = new Set<string>();
      for (const e of rowsE) {
        const d = new Date(e.created_at);
        dayset.add(d.toISOString().slice(0, 10));
      }
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (dayset.has(d.toISOString().slice(0, 10))) streak++;
        else break;
      }

      // Avg duration proxy — cluster events per fingerprint into sessions
      // (contiguous within 10 min) and take the mean duration.
      const byFp = new Map<string, number[]>();
      for (const e of rowsE) {
        const fp = e.viewer_fingerprint as string | null;
        if (!fp) continue;
        const t = new Date(e.created_at).getTime();
        const arr = byFp.get(fp) ?? [];
        arr.push(t);
        byFp.set(fp, arr);
      }
      const durations: number[] = [];
      for (const times of byFp.values()) {
        times.sort((a, b) => a - b);
        if (times.length < 2) continue;
        durations.push((times[times.length - 1] - times[0]) / 60000);
      }
      const avgDur = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

      setStats({
        meetingsThisMonth: meetings.size,
        totalMeetings: meetings.size,
        avgDurationMin: Math.round(avgDur),
        streakDays: streak,
      });

      // Recent sessions feed
      const tourById = new Map(rowList.map((r) => [r.tour.id, r.tour.title]));
      const recentFeed: RecentSession[] = rowsE.slice(0, 8).map((e) => ({
        id: e.id ?? crypto.randomUUID(),
        tourTitle: tourById.get(e.tour_id) ?? "Untitled tour",
        countryFlag: flagFromCountry(e.country ?? ""),
        country: e.country ?? "",
        minutesAgo: Math.max(
          0,
          Math.round((Date.now() - new Date(e.created_at).getTime()) / 60000)
        ),
        durationMin: 0,
      }));
      setRecent(recentFeed);

      setLoading(false);
    })();
  }, [router]);

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  function copyLink(link: ShareLink) {
    const url = `${origin}/tour/${link.tour_id}?share=${link.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(link.id);
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
      <div className="min-h-screen grid place-items-center bg-[#08080b] text-white/40 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          Loading your workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white bg-[#08080b] relative overflow-hidden">
      {/* Mesh gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(1100px 700px at 20% -10%, rgba(236,72,153,0.15), transparent 60%), radial-gradient(900px 600px at 90% 10%, rgba(139,92,246,0.15), transparent 60%), radial-gradient(700px 500px at 50% 100%, rgba(34,211,238,0.08), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <header className="relative border-b border-white/[0.06] backdrop-blur-md bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 via-violet-500 to-cyan-400 grid place-items-center text-black font-bold text-xs shadow-[0_4px_16px_-2px_rgba(236,72,153,0.6)]">
            {(me?.full_name || me?.email || "P").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              Presenter
            </div>
            <div className="text-[13px] font-medium text-white/90 truncate">
              {me?.full_name || me?.email}
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-white/70 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-lg transition-all"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-8">
        {/* Hero greeting */}
        <div className="mb-6">
          <div className="text-[13px] text-white/50 mb-1">{greeting}</div>
          <h1 className="text-[36px] leading-tight font-semibold tracking-tight">
            {firstName}{" "}
            <span className="inline-block hover:animate-wiggle">🎯</span>
          </h1>
          {stats.streakDays > 0 ? (
            <div className="text-[14px] text-white/60 mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-orange-300 font-medium">
                🔥 {stats.streakDays}-day streak
              </span>
              <span className="text-white/30">·</span>
              <span>Keep it going — one more session today wins.</span>
            </div>
          ) : (
            <div className="text-[14px] text-white/50 mt-1.5">
              {rows.length > 0
                ? "Ready for your next meeting."
                : "Once your admin assigns tours, they'll appear below."}
            </div>
          )}
        </div>

        {/* Personal stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <MiniStat
            label="Meetings · 30d"
            value={stats.meetingsThisMonth}
            gradient="from-pink-500/30 to-rose-500/10"
            icon={<Zap size={16} />}
          />
          <MiniStat
            label="Avg session"
            value={stats.avgDurationMin}
            suffix=" min"
            gradient="from-violet-500/30 to-fuchsia-500/10"
            icon={<Clock size={16} />}
          />
          <MiniStat
            label="Streak"
            value={stats.streakDays}
            suffix=" days"
            gradient="from-orange-500/30 to-amber-500/10"
            icon={<Trophy size={16} />}
          />
          <MiniStat
            label="Tours assigned"
            value={rows.length}
            gradient="from-cyan-500/30 to-blue-500/10"
            icon={<Sparkles size={16} />}
          />
        </div>

        {/* Quick launch hero — the biggest, boldest thing on the page */}
        {rows.length > 0 && (
          <div className="mb-8 rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-pink-500/20 via-violet-500/15 to-cyan-500/10 backdrop-blur-xl">
            <div className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 grid place-items-center shadow-[0_10px_30px_-8px_rgba(236,72,153,0.6)]">
                <Rocket size={26} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.15em] text-pink-200/80 mb-0.5">
                  Quick launch
                </div>
                <div className="text-[16px] font-semibold text-white/95 truncate">
                  {rows[0].tour.title}
                </div>
                <div className="text-[11px] text-white/50 truncate">
                  Your most-recent presenter link · click to open in a new tab
                </div>
              </div>
              <a
                href={`${origin}/tour/${rows[0].link.tour_id}?share=${rows[0].link.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-4 py-2.5 bg-white text-black text-[13px] font-semibold rounded-lg hover:bg-white/90 flex items-center gap-2 shadow-lg"
              >
                <Play size={14} /> Start
              </a>
            </div>
          </div>
        )}

        {/* Tours grid */}
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-2">
            Your assigned tours
          </div>
          {rows.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-2xl p-14 text-center bg-white/[0.02]">
              <Sparkles size={22} className="mx-auto text-white/30 mb-3" />
              <div className="text-[14px] text-white/70 mb-1">
                No tours assigned yet.
              </div>
              <p className="text-[12px] text-white/40">
                Ask your admin to share a presenter link with you.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rows.map((r) => (
                <PresenterCard
                  key={r.link.id}
                  row={r}
                  origin={origin}
                  copied={copiedId === r.link.id}
                  onCopy={() => copyLink(r.link)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        {recent.length > 0 && (
          <div className="mb-12 border border-white/[0.08] rounded-2xl bg-white/[0.02] backdrop-blur-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
              <TrendingUp size={14} className="text-cyan-300" />
              <span className="text-[12px] uppercase tracking-[0.15em] text-white/60 font-medium">
                Your recent activity
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="px-5 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] border-b border-white/[0.04] last:border-0"
                >
                  <span className="text-lg">{r.countryFlag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white/90 truncate">
                      Prospect viewed{" "}
                      <span className="text-white">{r.tourTitle}</span>
                    </div>
                    <div className="text-[11px] text-white/40">
                      {r.country || "unknown location"} · {timeAgoLabel(r.minutesAgo)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style jsx global>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }
        .hover\\:animate-wiggle:hover {
          animation: wiggle 0.6s ease-in-out;
        }
      `}</style>
    </div>
  );
}

/* --------------------------- Mini Stat --------------------------- */
function MiniStat({
  label,
  value,
  suffix,
  gradient,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  gradient: string;
  icon?: React.ReactNode;
}) {
  const [n, setN] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const dur = 800;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(value * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br ${gradient} backdrop-blur-xl p-4`}
    >
      <div className="absolute inset-0 bg-white/[0.02]" />
      <div className="relative flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.15em] text-white/50 font-medium">
          {label}
        </div>
        <div className="w-7 h-7 rounded-lg bg-white/[0.06] grid place-items-center text-white/60">
          {icon}
        </div>
      </div>
      <div className="relative text-[28px] font-semibold tabular-nums leading-none">
        {n.toLocaleString()}
        {suffix && (
          <span className="text-[13px] font-normal text-white/50 ml-1">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Presenter Card --------------------------- */
function PresenterCard({
  row,
  origin,
  copied,
  onCopy,
}: {
  row: Row;
  origin: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const url = `${origin}/tour/${row.link.tour_id}?share=${row.link.id}`;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.2] transition-all">
      <div className="aspect-[16/10] bg-black relative overflow-hidden">
        {row.coverPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl(row.coverPath) ?? ""}
            alt={row.tour.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-white/30 text-xs">
            no cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-[15px] font-medium text-white/95 mb-0.5 truncate">
            {row.tour.title}
          </div>
          {row.link.label && (
            <div className="text-[11px] text-white/50 truncate">
              {row.link.label}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-white/[0.06]">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="py-2.5 flex items-center justify-center gap-1.5 text-[11px] text-white/80 hover:text-white hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors font-medium"
        >
          <Play size={11} /> Start session
        </a>
        <button
          onClick={onCopy}
          className="py-2.5 flex items-center justify-center gap-1.5 text-[11px] text-white/60 hover:text-white hover:bg-white/[0.03] border-l border-white/[0.06] transition-colors"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-300" /> Copied!
            </>
          ) : (
            <>
              <CopyIcon size={11} /> Copy link
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Helpers --------------------------- */
function flagFromCountry(name: string): string {
  const m: Record<string, string> = {
    US: "🇺🇸", "United States": "🇺🇸",
    India: "🇮🇳", IN: "🇮🇳",
    Germany: "🇩🇪", DE: "🇩🇪",
    Japan: "🇯🇵", JP: "🇯🇵",
    China: "🇨🇳", CN: "🇨🇳",
    UK: "🇬🇧", "United Kingdom": "🇬🇧", GB: "🇬🇧",
    France: "🇫🇷", FR: "🇫🇷",
    Italy: "🇮🇹", IT: "🇮🇹",
    Spain: "🇪🇸", ES: "🇪🇸",
    Brazil: "🇧🇷", BR: "🇧🇷",
    Canada: "🇨🇦", CA: "🇨🇦",
    Australia: "🇦🇺", AU: "🇦🇺",
    Korea: "🇰🇷", KR: "🇰🇷",
    Mexico: "🇲🇽", MX: "🇲🇽",
    Netherlands: "🇳🇱", NL: "🇳🇱",
    UAE: "🇦🇪", Russia: "🇷🇺", RU: "🇷🇺",
    Singapore: "🇸🇬", SG: "🇸🇬",
    Turkey: "🇹🇷", TR: "🇹🇷",
    Indonesia: "🇮🇩", ID: "🇮🇩",
    Thailand: "🇹🇭", TH: "🇹🇭",
    Vietnam: "🇻🇳", VN: "🇻🇳",
    Pakistan: "🇵🇰", PK: "🇵🇰",
    Bangladesh: "🇧🇩", BD: "🇧🇩",
  };
  return m[name] ?? "🌍";
}

function timeAgoLabel(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
