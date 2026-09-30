"use client";

/**
 * VisitorsTab — sales-side "Visitors" pane. The salesperson picks a
 * tour and shares it via ShareTourModal (link or QR, with expiry +
 * one-time controls).
 *
 * Kept intentionally lean — one row per tour with a Share button and
 * a quick "recent links" count. All the heavy configuration lives in
 * the modal.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import { listShareLinks, revokeLink, type ShareLink } from "@/lib/shareLinks";
import ShareTourModal from "./ShareTourModal";
import {
  Share2,
  Link2,
  QrCode,
  Clock,
  Zap,
  Copy,
  Check,
  Ban,
  Loader2,
  Users,
  Eye,
} from "lucide-react";

export default function VisitorsTab({
  tours,
  presenterId,
}: {
  tours: Array<Pick<Tour, "id" | "title">>;
  presenterId: string;
}) {
  const [sharing, setSharing] = useState<null | {
    id: string;
    title: string;
  }>(null);
  const [linksByTour, setLinksByTour] = useState<Map<string, ShareLink[]>>(
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
    } finally {
      setLoading(false);
    }
  }, [tours]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="bg-white border border-vpv-line rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-vpv-line">
        <h2 className="text-[16px] font-semibold text-vpv-ink flex items-center gap-2">
          <Users size={14} className="text-vpv-muted" />
          Visitors
        </h2>
        <p className="text-xs text-vpv-muted mt-0.5">
          Share any tour with visitors via a secure link or QR code. Set an
          expiry, make it one-time, or leave it open.
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
            ).length;
            const isExpanded = expanded === t.id;
            return (
              <li
                key={t.id}
                className="vpv-fade-up"
                style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
              >
                <div className="px-5 py-3 flex items-center gap-3 hover:bg-vpv-canvas/40 vpv-table-row">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-vpv-ink truncate">
                      {t.title}
                    </div>
                    <div className="text-[11px] text-vpv-muted mt-0.5 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        {active} active {active === 1 ? "link" : "links"}
                      </span>
                      {links.length > active && (
                        <span className="text-slate-400">
                          {links.length - active} expired
                        </span>
                      )}
                    </div>
                  </div>
                  {links.length > 0 && (
                    <button
                      onClick={() =>
                        setExpanded(isExpanded ? null : t.id)
                      }
                      className="text-[11px] text-vpv-muted hover:text-vpv-ink px-2 py-1"
                    >
                      {isExpanded ? "Hide" : "History"}
                    </button>
                  )}
                  <button
                    onClick={() => setSharing({ id: t.id, title: t.title })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-vpv-grad hover:opacity-90 text-white text-[12px] font-medium shadow-[0_8px_20px_-10px_rgba(20,104,216,0.6)]"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                </div>

                {/* Expanded — history of links for this tour */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-1 vpv-fade-up">
                    <LinkHistory
                      links={links}
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

/* ---------- Link history table --------------------------------------- */

function LinkHistory({
  links,
  onRevoke,
}: {
  links: ShareLink[];
  onRevoke: (id: string) => void | Promise<void>;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const now = Date.now();

  const copy = async (token: string, id: string) => {
    const url = `${window.location.origin}/v/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  if (links.length === 0) return null;

  return (
    <div className="rounded-lg border border-vpv-line overflow-hidden bg-vpv-canvas/30">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-vpv-muted bg-vpv-canvas/60">
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">Kind</th>
            <th className="text-left px-3 py-2 font-medium">Expiry</th>
            <th className="text-left px-3 py-2 font-medium">Views</th>
            <th className="text-left px-3 py-2 font-medium">Created</th>
            <th className="text-right px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const expired = !!l.expires_at && new Date(l.expires_at).getTime() < now;
            const oneTime = l.view_limit === 1;
            const hitLimit =
              l.view_limit != null && l.view_count >= l.view_limit;
            const revoked = !!l.revoked_at;
            const dead = expired || hitLimit || revoked;

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

            return (
              <tr
                key={l.id}
                className="border-t border-vpv-line hover:bg-white"
              >
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
                    {statusText}
                  </span>
                </td>
                <td className="px-3 py-2 text-vpv-ink">
                  <span className="inline-flex items-center gap-1">
                    {oneTime ? (
                      <Zap className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Link2 className="w-3 h-3 text-vpv-muted" />
                    )}
                    {oneTime ? "One-time" : "Link"}
                  </span>
                </td>
                <td className="px-3 py-2 text-vpv-muted">
                  {l.expires_at ? relative(l.expires_at, now) : "Never"}
                </td>
                <td className="px-3 py-2 tabular-nums text-vpv-ink">
                  {l.view_count}
                  {l.view_limit != null && (
                    <span className="text-vpv-muted"> / {l.view_limit}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-vpv-muted">
                  {shortDate(l.created_at)}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => copy(l.token, l.id)}
                      disabled={dead}
                      className="p-1 rounded hover:bg-vpv-tint text-vpv-muted hover:text-vpv-ink disabled:opacity-30"
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
                        className="p-1 rounded hover:bg-rose-50 text-vpv-muted hover:text-rose-600"
                        title="Revoke — kill this link now"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- helpers -------------------------------------------------- */

function relative(iso: string, now: number): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60000);
  if (diffMin < 0) {
    const abs = -diffMin;
    if (abs < 60) return `${abs} min ago`;
    if (abs < 60 * 24) return `${Math.round(abs / 60)}h ago`;
    return `${Math.round(abs / (60 * 24))}d ago`;
  }
  if (diffMin < 60) return `in ${diffMin} min`;
  if (diffMin < 60 * 24) return `in ${Math.round(diffMin / 60)}h`;
  return `in ${Math.round(diffMin / (60 * 24))}d`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
}
