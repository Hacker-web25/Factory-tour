"use client";

/**
 * /team/analytics — the org_admin's sales-team analytics dashboard.
 *
 * Layout
 * ------
 * ┌────────────────────────────────────────────────────────────┐
 * │  Sidebar (reused)  │  Header: greeting + range selector    │
 * │                    │  4 KPI hero tiles                     │
 * │                    │  Insights strip                       │
 * │                    │  Team grid  +  Leaderboard sidebar    │
 * │                    │  Activity ticker                      │
 * └────────────────────────────────────────────────────────────┘
 *
 * All aggregation is done client-side over the last N days of
 * tour_events. Numbers count up on mount; cards fade+lift on entrance;
 * everything is minimal-but-premium.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getMyProfile, signOut, type Profile } from "@/lib/auth";
import {
  loadTeamOverview,
  generateInsights,
  formatHours,
  type TeamOverview,
  type TeamMember,
} from "@/lib/salesAnalytics";
import {
  KpiTile,
  MemberCard,
  MemberDetailModal,
  InsightStrip,
  KpiIcons,
} from "@/components/dashboard/composites";
import VpvLogo from "@/components/dashboard/VpvLogo";
import {
  Box,
  Users,
  Eye,
  BarChart3,
  Factory,
  Bell,
  LogOut,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Download,
} from "lucide-react";

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function TeamAnalyticsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(1); // default 30d
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<TeamMember | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Auth guard + initial fetch
  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/team/analytics");
        return;
      }
      if (p.role === "owner") {
        router.replace("/");
        return;
      }
      if (p.role !== "org_admin") {
        router.replace("/");
        return;
      }
      if (!p.org_id) {
        router.replace("/setup");
        return;
      }
      setMe(p);
    })();
  }, [router]);

  useEffect(() => {
    if (!me?.org_id) return;
    setLoading(true);
    loadTeamOverview(me.org_id, RANGES[rangeIdx].days)
      .then((o) => setOverview(o))
      .finally(() => setLoading(false));
  }, [me?.org_id, rangeIdx]);

  // Client-side status-decay tick — every 5s, re-derive each member's
  // `status` from their stored `presenceLastSeen` using the CURRENT
  // wall clock. Without this, a member whose heartbeat stopped 10min
  // ago would still show "online" until the next server poll writes
  // an updated row. Now they flip to idle within 5s of their tab
  // closing, and offline 30 min after that.
  useEffect(() => {
    if (!overview) return;
    const tick = window.setInterval(() => {
      import("@/lib/presence").then(({ statusFromLastSeen }) => {
        setOverview((cur) => {
          if (!cur) return cur;
          const next = new Map(cur.perMember);
          let changed = false;
          for (const [id, s] of cur.perMember) {
            const newStatus = statusFromLastSeen(s.presenceLastSeen);
            if (newStatus !== s.status) {
              next.set(id, { ...s, status: newStatus });
              changed = true;
            }
          }
          return changed ? { ...cur, perMember: next } : cur;
        });
      });
    }, 5_000);
    return () => window.clearInterval(tick);
  }, [overview]);

  // Real-time presence — refresh the overview every 20s so a
  // teammate signing in shows the live green dot without needing a
  // manual page reload. Also subscribes to Supabase realtime on the
  // presence table for zero-latency updates whenever supported.
  useEffect(() => {
    if (!me?.org_id) return;
    const poll = window.setInterval(() => {
      // Lightweight refresh — only fetches presence rows for members
      // we already know about, then patches into the existing overview.
      import("@/lib/presence").then(({ loadPresence, statusFromLastSeen }) => {
        setOverview((prev) => {
          if (!prev) return prev;
          const ids = prev.members.map((m) => m.id);
          loadPresence(ids).then((presenceMap) => {
            setOverview((cur) => {
              if (!cur) return cur;
              const next = new Map(cur.perMember);
              for (const m of cur.members) {
                const p = presenceMap.get(m.id);
                const existing = next.get(m.id);
                if (!existing) continue;
                next.set(m.id, {
                  ...existing,
                  presenceLastSeen: p?.last_seen ?? null,
                  status: statusFromLastSeen(p?.last_seen ?? null),
                  lastActive:
                    p?.last_seen && (!existing.lastActive ||
                      +new Date(p.last_seen) > +new Date(existing.lastActive))
                      ? p.last_seen
                      : existing.lastActive,
                });
              }
              return { ...cur, perMember: next };
            });
          });
          return prev;
        });
      });
    }, 20_000);

    // Supabase realtime channel — instant updates when a presence row
    // is upserted anywhere in the org. Requires realtime enabled on
    // the `presence` table (Supabase Dashboard → Database → Replication).
    let channel: any = null;
    import("@/lib/supabase").then(({ supabase }) => {
      channel = supabase
        .channel("presence-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "presence" },
          () => {
            // Just kick a refresh — the polling handler above does the
            // actual state merge so we don't duplicate logic.
            import("@/lib/presence").then(({ loadPresence, statusFromLastSeen }) => {
              setOverview((cur) => {
                if (!cur) return cur;
                const ids = cur.members.map((m) => m.id);
                loadPresence(ids).then((presenceMap) => {
                  setOverview((c) => {
                    if (!c) return c;
                    const next = new Map(c.perMember);
                    for (const m of c.members) {
                      const p = presenceMap.get(m.id);
                      const existing = next.get(m.id);
                      if (!existing) continue;
                      next.set(m.id, {
                        ...existing,
                        presenceLastSeen: p?.last_seen ?? null,
                        status: statusFromLastSeen(p?.last_seen ?? null),
                      });
                    }
                    return { ...c, perMember: next };
                  });
                });
                return cur;
              });
            });
          }
        )
        .subscribe();
    });

    return () => {
      window.clearInterval(poll);
      if (channel) {
        import("@/lib/supabase").then(({ supabase }) => {
          supabase.removeChannel(channel);
        });
      }
    };
  }, [me?.org_id]);

  const insights = useMemo(
    () => (overview ? generateInsights(overview) : []),
    [overview]
  );

  const firstName =
    (me?.full_name ?? me?.email?.split("@")[0] ?? "there").split(" ")[0] ?? "there";

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-vpv-canvas text-vpv-ink grid place-items-center">
        <Loader2 size={20} className="animate-spin text-vpv-blue/50" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-vpv-canvas text-vpv-ink flex"
      style={{
        backgroundImage:
          "radial-gradient(60% 55% at 85% 0%, rgba(25,184,242,0.10), rgba(0,0,0,0) 60%), radial-gradient(45% 45% at 5% 5%, rgba(20,104,216,0.08), rgba(0,0,0,0) 55%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* SIDEBAR */}
      <aside className="fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-vpv-line flex flex-col">
        <div className="px-6 pt-7 pb-8">
          <VpvLogo />
        </div>
        <nav className="px-3 space-y-0.5">
          <SideNav href="/client" icon={<Box size={16} />} label="All Tours" />
          <SideNav href="/team" icon={<Users size={16} />} label="Team" />
          <SideNav
            href="#"
            icon={<Eye size={16} />}
            label="Visitors"
            disabled
          />
          <SideNav
            href="/team/analytics"
            icon={<BarChart3 size={16} />}
            label="Analytics"
            active
          />
        </nav>
      </aside>

      {/* MAIN */}
      <main className="flex-1 ml-[240px] p-8">
        {/* Header row */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div className="min-w-0">
            <Link
              href="/client"
              className="text-[11px] text-vpv-muted hover:text-vpv-blue flex items-center gap-1 mb-2"
            >
              <ChevronLeft size={11} /> Back to dashboard
            </Link>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-vpv-ink">
              Sales team analytics
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Range selector */}
            <div className="relative">
              <button
                onClick={() => setRangeMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-white border border-vpv-line text-[12px] text-vpv-ink hover:border-vpv-blue/40"
              >
                {RANGES[rangeIdx].label}
                <ChevronDown size={12} />
              </button>
              {rangeMenuOpen && (
                <div
                  onMouseLeave={() => setRangeMenuOpen(false)}
                  className="absolute right-0 top-full mt-1 bg-white border border-vpv-line rounded-xl py-1 min-w-[160px] shadow-[0_12px_40px_-12px_rgba(11,61,145,0.25)] z-10"
                >
                  {RANGES.map((r, i) => (
                    <button
                      key={r.label}
                      onClick={() => {
                        setRangeIdx(i);
                        setRangeMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-vpv-tint ${
                        i === rangeIdx ? "text-vpv-blue font-medium" : "text-vpv-muted"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-vpv-line text-[12px] text-vpv-ink hover:border-vpv-blue/40"
              title="Print or save as PDF"
            >
              <Download size={12} /> Export
            </button>
            {/* User pill */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white border border-vpv-line hover:border-vpv-blue/40"
              >
                <div className="w-7 h-7 rounded-full bg-vpv-grad grid place-items-center text-white text-[11px] font-semibold">
                  {(me.full_name ?? me.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="text-[11.5px] font-medium text-vpv-ink">
                  {me.full_name?.split(" ")[0] ?? "You"}
                </div>
                <ChevronDown size={11} className="text-vpv-muted" />
              </button>
              {userMenuOpen && (
                <div
                  onMouseLeave={() => setUserMenuOpen(false)}
                  className="absolute right-0 top-full mt-1 bg-white border border-vpv-line rounded-xl py-1 min-w-[180px] shadow-[0_12px_40px_-12px_rgba(11,61,145,0.25)] z-10"
                >
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-vpv-tint flex items-center gap-2 text-rose-500"
                  >
                    <LogOut size={12} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading || !overview ? (
          <div className="grid place-items-center py-24">
            <Loader2 size={20} className="animate-spin text-vpv-blue/50" />
          </div>
        ) : (
          <>
            {/* Hero KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiTile
                label="Presentations"
                value={overview.totals.presentations}
                delta={overview.deltas.presentations}
                sparkline={sumSparklines(overview, "sparkline")}
                icon={<KpiIcons.Presentation size={16} />}
                accent="#1468D8"
              />
              <KpiTile
                label="Time presenting"
                value={overview.totals.hours}
                suffix="hrs"
                delta={overview.deltas.hours}
                sparkline={sumSparklines(overview, "sparkline")}
                icon={<KpiIcons.Clock size={16} />}
                accent="#19B8F2"
              />
              <KpiTile
                label="Unique prospects"
                value={overview.totals.uniqueProspects}
                delta={overview.deltas.uniqueProspects}
                sparkline={sumSparklines(overview, "sparkline")}
                icon={<KpiIcons.Globe2 size={16} />}
                accent="#0B3D91"
              />
              <KpiTile
                label="Active members"
                value={overview.totals.activeMembers}
                suffix={`/ ${overview.members.length}`}
                delta={overview.deltas.activeMembers}
                sparkline={overview.members.map(
                  (m) => overview.perMember.get(m.id)?.presentations ?? 0
                )}
                icon={<KpiIcons.Users2 size={16} />}
                accent="#0ea5b7"
              />
            </div>

            {/* Insights */}
            {insights.length > 0 && (
              <div className="mb-6">
                <InsightStrip insights={insights} />
              </div>
            )}

            {/* Team grid (leaderboard removed per design) */}
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-[15px] font-semibold text-vpv-ink">Your team</h2>
                <span className="text-[11px] text-vpv-muted">
                  {overview.members.length} member
                  {overview.members.length === 1 ? "" : "s"}
                </span>
              </div>
              {overview.members.length === 0 ? (
                <div className="bg-white border border-vpv-line rounded-2xl p-8 text-center shadow-[0_10px_30px_-18px_rgba(11,61,145,0.18)]">
                  <Users size={24} className="mx-auto text-vpv-blue/40 mb-2" />
                  <div className="text-[13px] text-vpv-ink mb-1">
                    No sales team members yet
                  </div>
                  <div className="text-[11px] text-vpv-muted mb-3">
                    Invite your first presenter to see stats here.
                  </div>
                  <Link
                    href="/team"
                    className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-vpv-grad text-white text-[12px] font-medium"
                  >
                    Go to Team page
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {overview.members.map((m) => {
                    const s = overview.perMember.get(m.id);
                    if (!s) return null;
                    return (
                      <MemberCard
                        key={m.id}
                        member={m}
                        stats={s}
                        onClick={() => setDetailMember(m)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Detail modal */}
      {detailMember && overview && (
        <MemberDetailModal
          overview={overview}
          member={detailMember}
          onClose={() => setDetailMember(null)}
        />
      )}
    </div>
  );
}

/** Sum sparklines across all members for team-level KPI trend. */
function sumSparklines(
  overview: TeamOverview,
  which: "sparkline" | "weeklySeries"
): number[] {
  let len = 0;
  for (const [, s] of overview.perMember) {
    const arr = s[which];
    if (arr.length > len) len = arr.length;
  }
  if (len === 0) return [];
  const out = new Array(len).fill(0);
  for (const [, s] of overview.perMember) {
    for (let i = 0; i < s[which].length; i++) out[i] += s[which][i];
  }
  return out;
}

function SideNav({
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
  const base =
    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors";
  if (disabled) {
    return (
      <div className={`${base} text-vpv-muted/50 cursor-not-allowed`}>
        {icon}
        {label}
      </div>
    );
  }
  if (active) {
    return (
      <div
        className={`${base} bg-vpv-tint text-vpv-navy font-medium shadow-[inset_0_0_0_1px_rgba(20,104,216,0.25)]`}
      >
        {icon}
        {label}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} text-vpv-muted hover:text-vpv-navy hover:bg-vpv-tint/50`}
    >
      {icon}
      {label}
    </Link>
  );
}
