"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/auth";
import { getMyProfile, signOut } from "@/lib/auth";
import { slugForOrgId } from "@/lib/orgSlug";
import {
  Box,
  Users,
  Eye,
  BarChart3,
  Bell,
  LogOut,
  ChevronDown,
  Factory,
  UserPlus,
  ArrowRight,
  Clock,
  Play,
  MoreVertical,
  Trash2,
  Copy as CopyIcon,
  Check,
  X,
  KeyRound,
} from "lucide-react";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "org_admin" | "presenter";
  presentations: number;
  totalSec: number;
  avgSec: number;
  lastActive: string | null;
  toursAssigned: number;
  joinedAt: string;
};

type PendingInvite = {
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usedCount: number;
  maxUses: number;
};

/**
 * /team — team management for org_admin. Matches the new dashboard
 * design language (sidebar + top bar + rounded card tables) and shows
 * per-member analytics: presentations, total/avg time, last active.
 */
export default function TeamPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [orgSlug, setOrgSlug] = useState<string>("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace("/login?next=/team");
        return;
      }
      if (p.role === "presenter") {
        // Presenters shouldn't see team management. Redirect to their sales dashboard.
        if (p.org_id) {
          const slug = await slugForOrgId(p.org_id);
          if (slug) {
            router.replace(`/${slug}/sales`);
            return;
          }
        }
        router.replace("/setup");
        return;
      }
      setMe(p);

      if (p.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name, slug")
          .eq("id", p.org_id)
          .maybeSingle();
        if (org) {
          setOrgName(org.name);
          setOrgSlug(org.slug ?? "");
        }

        // Members
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, role, created_at")
          .eq("org_id", p.org_id)
          .order("created_at");
        const rows = (profs ?? []) as any[];

        // Analytics per presenter — 30 day window
        const thirtyDaysAgo = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: tourRows } = await supabase
          .from("tours")
          .select("id")
          .eq("org_id", p.org_id);
        const tourIds = (tourRows ?? []).map((t: any) => t.id);

        // Attribution: presenter → sessions (via viewer_fingerprint clusters)
        const byPresenter = new Map<
          string,
          { sessions: Map<string, number[]>; last: number | null }
        >();
        if (tourIds.length > 0) {
          const { data: events } = await supabase
            .from("tour_events")
            .select("presenter_user_id, viewer_fingerprint, created_at")
            .in("tour_id", tourIds)
            .gte("created_at", thirtyDaysAgo);
          for (const e of (events ?? []) as any[]) {
            const pid = e.presenter_user_id as string | null;
            if (!pid) continue;
            let entry = byPresenter.get(pid);
            if (!entry) {
              entry = { sessions: new Map(), last: null };
              byPresenter.set(pid, entry);
            }
            const ts = new Date(e.created_at).getTime();
            entry.last = Math.max(entry.last ?? 0, ts);
            if (e.viewer_fingerprint) {
              const arr =
                entry.sessions.get(e.viewer_fingerprint as string) ?? [];
              arr.push(ts);
              entry.sessions.set(e.viewer_fingerprint as string, arr);
            }
          }
        }

        // Tours-assigned = share_links owned by presenter
        const linkCount = new Map<string, number>();
        if (rows.length > 0) {
          const ids = rows.map((r) => r.id);
          const { data: links } = await supabase
            .from("share_links")
            .select("owner_user_id")
            .in("owner_user_id", ids)
            .is("revoked_at", null);
          for (const l of (links ?? []) as any[]) {
            const oid = l.owner_user_id as string;
            linkCount.set(oid, (linkCount.get(oid) ?? 0) + 1);
          }
        }

        const teamRows: TeamMember[] = rows.map((r: any) => {
          const entry = byPresenter.get(r.id);
          const durs: number[] = [];
          if (entry) {
            for (const times of entry.sessions.values()) {
              times.sort((a, b) => a - b);
              durs.push(
                times.length < 2
                  ? 30
                  : (times[times.length - 1] - times[0]) / 1000
              );
            }
          }
          const totalSec = durs.reduce((a, b) => a + b, 0);
          const avgSec = durs.length ? totalSec / durs.length : 0;
          return {
            id: r.id,
            name: r.full_name || r.email.split("@")[0],
            email: r.email,
            role: r.role,
            presentations: durs.length,
            totalSec: Math.round(totalSec),
            avgSec: Math.round(avgSec),
            lastActive: entry?.last ? new Date(entry.last).toISOString() : null,
            toursAssigned: linkCount.get(r.id) ?? 0,
            joinedAt: r.created_at,
          };
        });
        teamRows.sort((a, b) => b.presentations - a.presentations);
        setMembers(teamRows);

        // Pending invites — unused, unexpired
        const { data: invites } = await supabase
          .from("invite_codes")
          .select("*")
          .eq("org_id", p.org_id)
          .order("created_at", { ascending: false });
        const now = Date.now();
        const active = ((invites ?? []) as any[])
          .filter((iv) => {
            if (iv.used_count >= (iv.max_uses ?? 1)) return false;
            if (iv.expires_at && new Date(iv.expires_at).getTime() < now)
              return false;
            return true;
          })
          .map((iv) => ({
            code: iv.code,
            createdAt: iv.created_at,
            expiresAt: iv.expires_at,
            usedCount: iv.used_count ?? 0,
            maxUses: iv.max_uses ?? 1,
          }));
        setPending(active);
      }

      setLoading(false);
    })();
  }, [router]);

  async function onSignOut() {
    await signOut();
    router.push("/login");
  }

  async function removeMember(m: TeamMember) {
    if (m.role === "org_admin") {
      alert("Can't remove an admin.");
      return;
    }
    if (
      !window.confirm(
        `Remove ${m.name} from ${orgName}? They'll lose access immediately.`
      )
    )
      return;
    await supabase.from("profiles").update({ org_id: null }).eq("id", m.id);
    setMembers((list) => list.filter((x) => x.id !== m.id));
  }

  async function revokeInvite(code: string) {
    if (!window.confirm(`Revoke code ${code}?`)) return;
    await supabase.from("invite_codes").delete().eq("code", code);
    setPending((list) => list.filter((x) => x.code !== code));
  }

  const firstName = (me?.full_name || me?.email || "there").split(/[\s@]/)[0];

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white/40 text-sm">
        Loading team…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-[240px] bg-black border-r border-white/[0.06] flex flex-col">
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
        <nav className="px-3 space-y-0.5">
          <Link
            href="/client"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04]"
          >
            <Box size={16} className="text-white/60" />
            All Tours
          </Link>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] bg-blue-500/15 text-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]">
            <Users size={16} className="text-blue-400" />
            Team
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/30 cursor-not-allowed">
            <Eye size={16} className="text-white/30" />
            Visitors
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/30 cursor-not-allowed">
            <BarChart3 size={16} className="text-white/30" />
            Analytics
          </div>
        </nav>

        <div className="px-3 mt-6">
          <LimitedOffer />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 ml-[240px]">
        {/* Top bar */}
        <div className="px-10 pt-8 pb-6 flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Team
            </h1>
            <p className="text-[13px] text-white/50 mt-1">
              Manage presenters — see their activity, revoke access, generate
              invite codes.
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

        {/* Summary tiles */}
        <div className="px-10 grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <SummaryTile
            icon={<Users size={20} />}
            iconBg="bg-blue-500/10"
            iconRing="text-blue-400"
            label="Team size"
            value={String(members.length)}
          />
          <SummaryTile
            icon={<Play size={20} />}
            iconBg="bg-pink-500/10"
            iconRing="text-pink-400"
            label="Presentations · 30d"
            value={String(members.reduce((s, m) => s + m.presentations, 0))}
          />
          <SummaryTile
            icon={<Clock size={20} />}
            iconBg="bg-emerald-500/10"
            iconRing="text-emerald-400"
            label="Total presenter hours · 30d"
            value={formatHours(
              members.reduce((s, m) => s + m.totalSec, 0) / 3600
            )}
          />
        </div>

        {/* Members table */}
        <div className="px-10 mb-8">
          <div className="rounded-2xl bg-[#0f0f14] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-white/60" />
                <h2 className="text-[16px] font-semibold">
                  Presenters — {orgName}
                </h2>
              </div>
              <button
                onClick={() => setInviteOpen(true)}
                className="text-[12px] text-white bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium shadow-[0_8px_24px_-8px_rgba(59,130,246,0.5)]"
              >
                <UserPlus size={12} /> Invite presenter
              </button>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-white/40 border-t border-b border-white/[0.06]">
                  <th className="text-left px-5 py-2.5 font-medium">
                    Team member
                  </th>
                  <th className="text-left px-5 py-2.5 font-medium">Role</th>
                  <th className="text-right px-5 py-2.5 font-medium">Tours assigned</th>
                  <th className="text-right px-5 py-2.5 font-medium">Presentations</th>
                  <th className="text-right px-5 py-2.5 font-medium">Total time</th>
                  <th className="text-right px-5 py-2.5 font-medium">Avg time</th>
                  <th className="text-right px-5 py-2.5 font-medium">Last active</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-8 text-center text-[13px] text-white/40"
                    >
                      No team members yet.{" "}
                      <button
                        onClick={() => setInviteOpen(true)}
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        Generate an invite code
                      </button>{" "}
                      to add your first presenter.
                    </td>
                  </tr>
                ) : (
                  members.map((m, idx) => (
                    <tr
                      key={m.id}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg grid place-items-center text-[12px] font-semibold text-white ${avatarColor(idx)}`}
                          >
                            {m.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-white/90 truncate">
                              {m.name}
                            </div>
                            <div className="text-[11px] text-white/40 truncate">
                              {m.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            m.role === "org_admin"
                              ? "bg-blue-500/15 text-blue-300"
                              : "bg-white/[0.05] text-white/60"
                          }`}
                        >
                          {m.role === "org_admin" ? "ADMIN" : "PRESENTER"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {m.toursAssigned}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {m.presentations}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatDuration(m.totalSec)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {m.avgSec ? formatDuration(m.avgSec) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-white/60">
                        {m.lastActive ? timeAgo(m.lastActive) : "never"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {m.role !== "org_admin" && (
                          <button
                            onClick={() => removeMember(m)}
                            className="w-7 h-7 rounded-md hover:bg-rose-500/10 grid place-items-center text-white/40 hover:text-rose-300"
                            title="Remove from team"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending invites */}
        {pending.length > 0 && (
          <div className="px-10 mb-12">
            <div className="rounded-2xl bg-[#0f0f14] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
                <KeyRound size={14} className="text-cyan-300" />
                <h2 className="text-[16px] font-semibold">
                  Pending invite codes
                </h2>
                <span className="text-[11px] text-white/40">
                  · {pending.length} unused
                </span>
              </div>
              <div className="p-4 space-y-2">
                {pending.map((inv) => (
                  <PendingInviteRow
                    key={inv.code}
                    invite={inv}
                    onRevoke={() => revokeInvite(inv.code)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {inviteOpen && (
        <InvitePresenterModal
          orgId={me?.org_id ?? null}
          onClose={() => setInviteOpen(false)}
          onCreated={(code) =>
            setPending((list) => [
              {
                code,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
                usedCount: 0,
                maxUses: 1,
              },
              ...list,
            ])
          }
        />
      )}
    </div>
  );
}

/* --------------------------- Summary tile --------------------------- */
function SummaryTile({
  icon,
  iconBg,
  iconRing,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconRing: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#0f0f14] border border-white/[0.06] p-5 flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-xl ${iconBg} grid place-items-center ${iconRing}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-medium mb-1">
          {label}
        </div>
        <div className="text-[26px] font-semibold tracking-tight tabular-nums leading-none">
          {value}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Pending invite row --------------------------- */
function PendingInviteRow({
  invite,
  onRevoke,
}: {
  invite: PendingInvite;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const expiresLabel = invite.expiresAt
    ? `expires ${timeUntil(invite.expiresAt)}`
    : "no expiry";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-white/[0.06]">
      <div className="font-mono text-[16px] tracking-widest text-cyan-200 select-all flex-1">
        {invite.code}
      </div>
      <span className="text-[11px] text-white/40">{expiresLabel}</span>
      <button
        onClick={copy}
        className="px-2.5 py-1 rounded-md hover:bg-white/[0.05] text-[11px] text-white/70 flex items-center gap-1"
      >
        {copied ? (
          <>
            <Check size={11} className="text-emerald-300" /> Copied
          </>
        ) : (
          <>
            <CopyIcon size={11} /> Copy
          </>
        )}
      </button>
      <button
        onClick={onRevoke}
        className="w-7 h-7 rounded-md hover:bg-rose-500/10 grid place-items-center text-white/40 hover:text-rose-300"
        title="Revoke this code"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* --------------------------- Invite modal --------------------------- */
function InvitePresenterModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string | null;
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
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
      setCode(res.code);
      onCreated(res.code);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate code");
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function emailCode() {
    if (!code) return;
    const subject = encodeURIComponent(
      "You're invited to join our Factory Tour team"
    );
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/signup`
        : "/signup";
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited to join our team on Factory Tour as a presenter.\n\n1. Sign up at ${url}\n2. When asked, pick "I'm on the Sales Team"\n3. Paste this invite code:\n\n   ${code}\n\n(Code expires in 7 days.)\n\nSee you inside!`
    );
    window.location.href = `mailto:${email || ""}?subject=${subject}&body=${body}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[92vw] rounded-2xl bg-[#0f0f14] border border-white/10 p-6 shadow-2xl"
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

        {code ? (
          <div>
            <div className="text-[11px] text-white/60 mb-3">
              Share this code with your presenter. They&apos;ll enter it on the
              signup page under <span className="text-white">Sales Team</span>.
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border border-cyan-400/30 font-mono text-[24px] tracking-widest text-cyan-200 text-center mb-3 select-all">
              {code}
            </div>
            <div className="text-[10px] text-white/40 text-center mb-3">
              Expires in 7 days · single use
            </div>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1.5">
              Their email (optional — pre-fills the email invite)
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
                {copied ? (
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
        ) : (
          <div>
            <p className="text-[12px] text-white/60 mb-4">
              Generate a one-time invite code. Share it with your presenter —
              they&apos;ll paste it during signup to join your organization.
            </p>
            {error && (
              <div className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}
            <button
              onClick={generate}
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-black text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? "Generating…" : <>🔑 Generate invite code</>}
            </button>
            <p className="text-[10px] text-white/40 mt-3 text-center">
              Expires in 7 days · single use · no email required
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Limited offer (shared) --------------------------- */
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

/* --------------------------- Helpers --------------------------- */
function avatarColor(idx: number) {
  const c = [
    "bg-gradient-to-br from-blue-500 to-cyan-400",
    "bg-gradient-to-br from-violet-500 to-fuchsia-500",
    "bg-gradient-to-br from-pink-500 to-rose-500",
    "bg-gradient-to-br from-emerald-500 to-teal-400",
    "bg-gradient-to-br from-amber-500 to-orange-500",
  ];
  return c[idx % c.length];
}
function formatDuration(sec: number) {
  if (!sec) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
function formatHours(hours: number) {
  return `${hours.toFixed(1)}h`;
}
function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "expired";
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `in ${days}d`;
  const hrs = Math.floor(diff / 3600000);
  return `in ${hrs}h`;
}
