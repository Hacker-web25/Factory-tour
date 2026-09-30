"use client";

/**
 * VisitorsTab — the salesperson's Visitors screen. One expandable card
 * per tour with a big Share affordance and, when opened, a rich
 * analytics-style tracking table:
 *
 *   Status · Kind · Devices used · Views · Location · Last opened · Actions
 *
 * Devices and Location are derived from tour_events (viewer_fingerprint,
 * country) per share_link_id — nothing else to persist. Views uses the
 * share_links.view_count column bumped by recordLinkOpen(). Last opened
 * uses the new share_links.last_opened_at column.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import {
  listShareLinks,
  revokeLink,
  distinctDeviceCount,
  lastOpenedLocation,
  loadLinkAnalytics,
  type ShareLink,
  type LinkAnalytics,
} from "@/lib/shareLinks";
import ShareTourModal from "./ShareTourModal";
import {
  Share2,
  Link2,
  Clock,
  Zap,
  Copy,
  Check,
  Ban,
  Loader2,
  Users,
  Smartphone,
  Lock,
  Eye,
  MapPin,
  ChevronDown,
  ChevronRight,
  AtSign,
  MessageCircle,
  Send,
  MousePointerClick,
  Compass,
  AlertTriangle,
  Timer,
  BarChart3,
} from "lucide-react";

/** Aggregated stats for a share link, joined against tour_events. */
type LinkStats = {
  devices: number;
  views: number;
  country: string | null;
  lastAt: string | null;
};

export default function VisitorsTab({
  tours,
  presenterId: _presenterId,
}: {
  tours: Array<Pick<Tour, "id" | "title">>;
  presenterId: string;
}) {
  const [sharing, setSharing] = useState<null | { id: string; title: string }>(
    null
  );
  const [linksByTour, setLinksByTour] = useState<Map<string, ShareLink[]>>(
    new Map()
  );
  const [statsByLink, setStatsByLink] = useState<Map<string, LinkStats>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await Promise.all(tours.map((t) => listShareLinks(t.id)));
      const map = new Map<string, ShareLink[]>();
      tours.forEach((t, i) =>
        map.set(t.id, (all[i] ?? []).filter((l) => l.kind === "viewer"))
      );
      setLinksByTour(map);

      // Backfill devices + location per link.
      const flat = Array.from(map.values()).flat();
      const stats = new Map<string, LinkStats>();
      await Promise.all(
        flat.map(async (l) => {
          const [devices, loc] = await Promise.all([
            distinctDeviceCount(l.id),
            lastOpenedLocation(l.id),
          ]);
          stats.set(l.id, {
            devices,
            views: l.view_count ?? 0,
            country: loc.country,
            lastAt: l.last_opened_at ?? loc.at ?? null,
          });
        })
      );
      setStatsByLink(stats);
    } finally {
      setLoading(false);
    }
  }, [tours]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="bg-white border border-vpv-line rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-vpv-line">
        <h2 className="text-[18px] font-semibold text-vpv-ink flex items-center gap-2">
          <Users size={16} className="text-vpv-blue" />
          Visitors
        </h2>
        <p className="text-[13px] text-vpv-muted mt-1">
          Share any tour with a client via a secure link or QR code. Every
          link tracks views, devices and where it was opened.
        </p>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : tours.length === 0 ? (
        <div className="text-center py-16 text-vpv-muted text-sm">
          No tours assigned to you yet.
        </div>
      ) : (
        <ul className="divide-y divide-vpv-line">
          {tours.map((t, i) => {
            const links = linksByTour.get(t.id) ?? [];
            const active = links.filter(
              (l) =>
                !l.revoked_at &&
                (!l.expires_at || new Date(l.expires_at) > new Date()) &&
                (l.view_limit == null || l.view_count < l.view_limit)
            );
            const totalViews = links.reduce(
              (s, l) => s + (l.view_count ?? 0),
              0
            );
            const totalDevices = links.reduce(
              (s, l) => s + (statsByLink.get(l.id)?.devices ?? 0),
              0
            );
            const isExpanded = expanded === t.id;
            return (
              <li
                key={t.id}
                className="vpv-fade-up"
                style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
              >
                <div
                  className="px-6 py-5 flex items-center gap-4 hover:bg-vpv-canvas/40 vpv-table-row cursor-pointer"
                  onClick={() =>
                    setExpanded(isExpanded ? null : t.id)
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-vpv-ink truncate">
                      {t.title}
                    </div>
                    <div className="text-[12px] text-vpv-muted mt-1 flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        {active.length} active
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        {totalViews} view{totalViews === 1 ? "" : "s"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5" />
                        {totalDevices} device{totalDevices === 1 ? "" : "s"}
                      </span>
                      {links.length > active.length && (
                        <span className="text-slate-400">
                          {links.length - active.length} expired
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {links.length > 0 && (
                      <span
                        className={`text-xs text-vpv-muted transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSharing({ id: t.id, title: t.title });
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-vpv-grad hover:opacity-90 text-white text-[13px] font-medium shadow-[0_8px_20px_-10px_rgba(20,104,216,0.6)]"
                    >
                      <Share2 className="w-4 h-4" /> Share
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-5 pt-1 vpv-fade-up">
                    <LinkHistory
                      links={links}
                      stats={statsByLink}
                      onRevoke={async (id) => {
                        await revokeLink(id);
                        refresh();
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {sharing && (
        <ShareTourModal
          tourId={sharing.id}
          tourTitle={sharing.title}
          onClose={() => {
            setSharing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Analytics-style link history table ---------------------- */

function LinkHistory({
  links,
  stats,
  onRevoke,
}: {
  links: ShareLink[];
  stats: Map<string, LinkStats>;
  onRevoke: (id: string) => void | Promise<void>;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = Date.now();

  const copy = async (token: string, id: string) => {
    const url = `${window.location.origin}/v/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  if (links.length === 0) return null;

  return (
    <div className="rounded-xl border border-vpv-line overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] table-auto">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-vpv-muted bg-vpv-canvas/60 border-b border-vpv-line">
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-3 py-3 font-medium">Kind</th>
              <th className="text-left px-3 py-3 font-medium">
                <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> Devices</span>
              </th>
              <th className="text-left px-3 py-3 font-medium">
                <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Views</span>
              </th>
              <th className="text-left px-3 py-3 font-medium">
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</span>
              </th>
              <th className="text-left px-3 py-3 font-medium">
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Last opened</span>
              </th>
              <th className="text-left px-3 py-3 font-medium">Expiry</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => {
              const expired =
                !!l.expires_at && new Date(l.expires_at).getTime() < now;
              const oneTime = l.view_limit === 1;
              const hitLimit =
                l.view_limit != null && l.view_count >= l.view_limit;
              const revoked = !!l.revoked_at;
              const dead = expired || hitLimit || revoked;
              const st = stats.get(l.id) ?? {
                devices: 0,
                views: l.view_count ?? 0,
                country: null,
                lastAt: l.last_opened_at,
              };

              let statusText = "Active";
              let statusColor = "bg-emerald-100 text-emerald-700";
              if (revoked) {
                statusText = "Revoked";
                statusColor = "bg-slate-100 text-slate-500";
              } else if (expired) {
                statusText = "Expired";
                statusColor = "bg-slate-100 text-slate-500";
              } else if (hitLimit) {
                statusText = "Used";
                statusColor = "bg-amber-100 text-amber-700";
              }

              const kindBits: React.ReactNode[] = [];
              if (oneTime)
                kindBits.push(
                  <span key="ot" className="inline-flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" /> One-time
                  </span>
                );
              else
                kindBits.push(
                  <span key="lk" className="inline-flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-vpv-muted" /> Link
                  </span>
                );
              if (l.password_hash)
                kindBits.push(
                  <Lock key="pw" className="w-3 h-3 text-sky-500" />
                );
              if (l.device_limit != null)
                kindBits.push(
                  <span key="dv" className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                    ≤ {l.device_limit} dev
                  </span>
                );

              const isOpen = openId === l.id;
              return (
                <React.Fragment key={l.id}>
                <tr
                  className={`border-t border-vpv-line hover:bg-slate-50/60 cursor-pointer ${isOpen ? "bg-slate-50/60" : ""}`}
                  onClick={() => setOpenId(isOpen ? null : l.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-vpv-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}
                      >
                        {statusText}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">{kindBits}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-vpv-ink">
                    {st.devices}
                    {l.device_limit != null && (
                      <span className="text-vpv-muted">
                        {" "}
                        / {l.device_limit}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-vpv-ink">
                    {st.views}
                    {l.view_limit != null && (
                      <span className="text-vpv-muted">
                        {" "}
                        / {l.view_limit}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-vpv-muted text-xs">
                    {st.country ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-vpv-muted text-xs whitespace-nowrap">
                    {st.lastAt ? relative(st.lastAt, now) : "—"}
                  </td>
                  <td className="px-3 py-3 text-vpv-muted text-xs">
                    {l.expires_at ? relative(l.expires_at, now) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => copy(l.token, l.id)}
                        disabled={dead}
                        className="p-1.5 rounded hover:bg-vpv-tint text-vpv-muted hover:text-vpv-ink disabled:opacity-30"
                        title="Copy link"
                      >
                        {copiedId === l.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {!revoked && !expired && (
                        <button
                          onClick={() => onRevoke(l.id)}
                          className="p-1.5 rounded hover:bg-rose-50 text-vpv-muted hover:text-rose-600"
                          title="Revoke — kill this link now"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/40">
                    <td colSpan={8} className="px-4 pt-1 pb-5">
                      <LinkAnalyticsPanel link={l} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Per-link analytics detail panel ------------------------- */

function LinkAnalyticsPanel({ link }: { link: ShareLink }) {
  const [an, setAn] = useState<LinkAnalytics | null>(null);
  const [sceneNames, setSceneNames] = useState<Map<string, string>>(new Map());
  const [hotspotLabels, setHotspotLabels] = useState<Map<string, string>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const a = await loadLinkAnalytics(link);
      if (cancelled) return;
      setAn(a);
      // Resolve scene names + hotspot labels for the top-N rows.
      const sceneIds = a.scenes.slice(0, 8).map((s) => s.sceneId);
      const hsIds = a.hotspots.slice(0, 8).map((h) => h.hotspotId);
      const [scenesRes, hsRes] = await Promise.all([
        sceneIds.length
          ? supabase.from("scenes").select("id, name").in("id", sceneIds)
          : Promise.resolve({ data: [] }),
        hsIds.length
          ? supabase.from("hotspots").select("id, label, type").in("id", hsIds)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const sMap = new Map<string, string>();
      for (const r of (scenesRes.data ?? []) as any[]) sMap.set(r.id, r.name);
      setSceneNames(sMap);
      const hMap = new Map<string, string>();
      for (const r of (hsRes.data ?? []) as any[])
        hMap.set(r.id, r.label || r.type || "Hotspot");
      setHotspotLabels(hMap);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (loading || !an) {
    return (
      <div className="grid place-items-center py-8 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  const noActivity =
    an.sessions === 0 && an.distinctDevices === 0 && an.hotspots.length === 0;

  return (
    <div className="rounded-xl bg-white border border-vpv-line p-5 shadow-sm space-y-5">
      {/* Recipient row */}
      {(link.shared_to_email || link.shared_to_phone) && (
        <div className="flex items-center flex-wrap gap-3 pb-3 border-b border-vpv-line">
          <Send className="w-4 h-4 text-vpv-blue" />
          <span className="text-xs uppercase tracking-wider text-vpv-muted font-medium">
            Sent to
          </span>
          {link.shared_to_email && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-vpv-ink bg-vpv-tint px-3 py-1 rounded-full">
              <AtSign className="w-3 h-3 text-vpv-muted" />
              {link.shared_to_email}
            </span>
          )}
          {link.shared_to_phone && (
            <a
              href={`https://wa.me/${link.shared_to_phone.replace(/[^0-9+]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="w-3 h-3 text-emerald-600" />
              {link.shared_to_phone}
            </a>
          )}
        </div>
      )}

      {/* Forwarded warning */}
      {an.forwarded && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-rose-800 leading-snug">
            <strong>Looks forwarded.</strong> This link was opened on{" "}
            {an.distinctDevices} distinct devices
            {link.shared_to_email || link.shared_to_phone
              ? ` — more than the person it was sent to.`
              : link.device_limit != null
              ? ` — exceeds the ${link.device_limit}-device limit.`
              : `.`}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<BarChart3 className="w-4 h-4" />}
          label="Sessions"
          value={an.sessions.toString()}
          hint="Each open / reload counts once"
        />
        <StatTile
          icon={<Timer className="w-4 h-4" />}
          label="Total time used"
          value={formatDur(an.totalSeconds)}
          hint={
            an.sessions > 0 ? `avg ${formatDur(an.avgSessionSec)}` : undefined
          }
        />
        <StatTile
          icon={<Smartphone className="w-4 h-4" />}
          label="Distinct devices"
          value={an.distinctDevices.toString()}
          hint={
            link.device_limit != null
              ? `limit ${link.device_limit}`
              : undefined
          }
        />
        <StatTile
          icon={<Eye className="w-4 h-4" />}
          label="Views"
          value={(link.view_count ?? 0).toString()}
          hint={
            link.view_limit != null ? `limit ${link.view_limit}` : undefined
          }
        />
      </div>

      {noActivity ? (
        <div className="text-center text-xs text-vpv-muted py-6">
          No visitor activity recorded yet.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Scenes viewed with time-in-scene */}
          <AnalyticsList
            title="Scenes viewed"
            icon={<Compass className="w-3.5 h-3.5" />}
            empty="No scene views yet"
            items={an.scenes.slice(0, 6).map((s) => ({
              label: sceneNames.get(s.sceneId) || "Scene",
              detail: `${s.views} view${s.views === 1 ? "" : "s"}`,
              value: formatDur(s.seconds),
              barPct:
                (s.seconds / Math.max(1, an.scenes[0]?.seconds ?? 1)) * 100,
            }))}
          />
          <AnalyticsList
            title="Hotspots clicked"
            icon={<MousePointerClick className="w-3.5 h-3.5" />}
            empty="No hotspots clicked yet"
            items={an.hotspots.slice(0, 6).map((h) => ({
              label: hotspotLabels.get(h.hotspotId) || "Hotspot",
              detail: null,
              value: `${h.clicks}`,
              barPct:
                (h.clicks / Math.max(1, an.hotspots[0]?.clicks ?? 1)) * 100,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-vpv-canvas/60 border border-vpv-line px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-vpv-muted text-[10px] uppercase tracking-wider font-medium">
        {icon}
        {label}
      </div>
      <div className="text-[18px] font-semibold text-vpv-ink tabular-nums mt-0.5">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-vpv-muted mt-0.5">{hint}</div>
      )}
    </div>
  );
}

function AnalyticsList({
  title,
  icon,
  empty,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  items: Array<{ label: string; detail: string | null; value: string; barPct: number }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-vpv-muted font-medium mb-2">
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-vpv-muted text-center py-4">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[12.5px] text-vpv-ink truncate">{it.label}</span>
                <span className="text-[12px] tabular-nums text-vpv-muted flex-shrink-0">
                  {it.value}
                </span>
              </div>
              <div className="h-1 bg-vpv-line/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, it.barPct)}%` }}
                />
              </div>
              {it.detail && (
                <div className="text-[10px] text-vpv-muted mt-0.5">{it.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDur(sec: number): string {
  if (sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* ---------- helpers -------------------------------------------------- */

function relative(iso: string, now: number): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60000);
  if (diffMin < 0) {
    const abs = -diffMin;
    if (abs < 1) return "just now";
    if (abs < 60) return `${abs} min ago`;
    if (abs < 60 * 24) return `${Math.round(abs / 60)}h ago`;
    return `${Math.round(abs / (60 * 24))}d ago`;
  }
  if (diffMin < 60) return `in ${diffMin} min`;
  if (diffMin < 60 * 24) return `in ${Math.round(diffMin / 60)}h`;
  return `in ${Math.round(diffMin / (60 * 24))}d`;
}
