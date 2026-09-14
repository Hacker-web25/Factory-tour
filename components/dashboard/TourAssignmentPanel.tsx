"use client";

/**
 * TourAssignmentPanel — matrix view where the org_admin ticks a checkbox
 * to give each presenter access to each tour. Updates persist immediately.
 *
 * Rendered from the Team page. Replaces the old "sales team sees every
 * tour" behavior. Existing tours are grandfathered until the admin opens
 * this panel and makes explicit choices.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  assignTour,
  unassignTour,
  loadAssignmentsForOrg,
  type TourAssignment,
} from "@/lib/tourAssignments";
import type { Tour } from "@/lib/types";
import type { TeamMember } from "@/lib/salesAnalytics";

type Props = {
  orgId: string;
  currentUserId: string;
  presenters: TeamMember[];
};

export default function TourAssignmentPanel({
  orgId,
  currentUserId,
  presenters,
}: Props) {
  const [tours, setTours] = useState<Tour[]>([]);
  const [assignments, setAssignments] = useState<TourAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // "tourId::userId"
  const [q, setQ] = useState("");

  async function reload() {
    setLoading(true);
    const [{ data: tourRows }] = await Promise.all([
      supabase
        .from("tours")
        .select("id, title, updated_at, org_id")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false }),
    ]);
    const t = (tourRows ?? []) as Tour[];
    setTours(t);
    const a = await loadAssignmentsForOrg(t.map((r) => r.id));
    setAssignments(a);
    setLoading(false);
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const hasAssignment = useMemo(() => {
    const s = new Set<string>();
    for (const a of assignments) s.add(`${a.tour_id}::${a.user_id}`);
    return s;
  }, [assignments]);

  async function toggle(tourId: string, userId: string) {
    const key = `${tourId}::${userId}`;
    setSaving(key);
    if (hasAssignment.has(key)) {
      await unassignTour(tourId, userId);
      setAssignments((list) =>
        list.filter((a) => !(a.tour_id === tourId && a.user_id === userId))
      );
    } else {
      await assignTour(tourId, userId, currentUserId);
      setAssignments((list) => [
        ...list,
        {
          tour_id: tourId,
          user_id: userId,
          assigned_by: currentUserId,
          assigned_at: new Date().toISOString(),
        },
      ]);
    }
    setSaving(null);
  }

  const filteredTours = useMemo(
    () =>
      tours.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase())),
    [tours, q]
  );

  if (presenters.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 text-center">
        <div className="text-[13px] text-white/70 mb-1">No presenters yet</div>
        <div className="text-[11px] text-white/40">
          Invite sales-team members first, then you can assign tours to them.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">Tour access</div>
          <div className="text-[10.5px] text-white/40">
            Tick which presenters can present each tour. Empty tour rows are
            visible to everyone (backward-compatible).
          </div>
        </div>
        <div className="relative">
          <Search
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter tours…"
            className="bg-white/[0.04] border border-white/10 rounded-md pl-7 pr-2 py-1 text-[11.5px] outline-none focus:border-accent/60 w-40"
          />
        </div>
      </div>
      {loading ? (
        <div className="grid place-items-center py-8">
          <Loader2 size={16} className="animate-spin text-white/40" />
        </div>
      ) : (
        <div className="overflow-auto max-h-[400px] panel-scroll">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-neutral-950/95 backdrop-blur">
              <tr>
                <th className="text-left px-4 py-2 text-[10.5px] uppercase tracking-wider text-white/50 font-semibold">
                  Tour
                </th>
                {presenters.map((p) => (
                  <th
                    key={p.id}
                    className="px-2 py-2 text-[10.5px] uppercase tracking-wider text-white/50 font-semibold text-center"
                  >
                    {(p.full_name ?? p.email.split("@")[0]).slice(0, 12)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTours.length === 0 && (
                <tr>
                  <td
                    colSpan={1 + presenters.length}
                    className="py-8 text-center text-white/40"
                  >
                    No tours in your library yet.
                  </td>
                </tr>
              )}
              {filteredTours.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-white/[0.04] hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-2 text-white/85 truncate max-w-[240px]">
                    {t.title}
                  </td>
                  {presenters.map((p) => {
                    const key = `${t.id}::${p.id}`;
                    const on = hasAssignment.has(key);
                    const busy = saving === key;
                    return (
                      <td key={p.id} className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => toggle(t.id, p.id)}
                          disabled={busy}
                          className={`w-5 h-5 rounded grid place-items-center border transition-colors ${
                            on
                              ? "bg-accent border-accent text-black"
                              : "border-white/20 hover:border-white/40"
                          }`}
                          title={on ? "Revoke access" : "Grant access"}
                        >
                          {busy ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : on ? (
                            <Check size={11} strokeWidth={3} />
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
