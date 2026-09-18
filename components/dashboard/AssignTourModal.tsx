"use client";

/**
 * AssignTourModal — quick per-tour "who can present this?" picker.
 * Opened from the org_admin dashboard's tour cards. Ticking a name
 * grants that presenter access to the tour; unticking revokes it.
 * Saves incrementally per click.
 */

import { useEffect, useState } from "react";
import { Check, Loader2, X, UserCheck } from "lucide-react";
import {
  assignTour,
  unassignTour,
  loadAssignmentsForOrg,
} from "@/lib/tourAssignments";
import { supabase } from "@/lib/supabase";

type Presenter = {
  id: string;
  email: string;
  full_name: string | null;
};

type Props = {
  tourId: string;
  tourTitle: string;
  orgId: string;
  currentUserId: string;
  onClose: () => void;
};

export default function AssignTourModal({
  tourId,
  tourTitle,
  orgId,
  currentUserId,
  onClose,
}: Props) {
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Load presenters in this org (excluding org_admin themselves)
      // AND the current assignments for this tour.
      const [{ data: profileRows }, tourAssigns] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, role")
          .eq("org_id", orgId),
        loadAssignmentsForOrg([tourId]),
      ]);
      const ps = ((profileRows ?? []) as any[]).filter(
        (p) => p.role === "presenter"
      );
      setPresenters(ps);
      setAssigned(new Set(tourAssigns.map((a) => a.user_id)));
      setLoading(false);
    })();
  }, [orgId, tourId]);

  async function toggle(userId: string) {
    setSaving(userId);
    if (assigned.has(userId)) {
      await unassignTour(tourId, userId);
      setAssigned((s) => {
        const n = new Set(s);
        n.delete(userId);
        return n;
      });
    } else {
      await assignTour(tourId, userId, currentUserId);
      setAssigned((s) => {
        const n = new Set(s);
        n.add(userId);
        return n;
      });
    }
    setSaving(null);
  }

  async function selectAll() {
    for (const p of presenters) {
      if (!assigned.has(p.id)) await toggle(p.id);
    }
  }
  async function selectNone() {
    for (const p of presenters) {
      if (assigned.has(p.id)) await toggle(p.id);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-vpv-navy/30 backdrop-blur-sm grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-vpv-line rounded-2xl w-[440px] max-w-full max-h-[85vh] flex flex-col shadow-[0_30px_80px_-20px_rgba(11,61,145,0.4)]"
      >
        <div className="px-5 py-3 border-b border-vpv-line flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck size={14} className="text-vpv-cyan shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate text-vpv-ink">
                Who can present
              </div>
              <div className="text-[11px] text-vpv-muted truncate">
                {tourTitle}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-vpv-muted hover:text-vpv-ink">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-2 border-b border-vpv-line text-[11px] flex items-center justify-between">
          <span className="text-vpv-muted">
            {assigned.size} of {presenters.length} presenter
            {presenters.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-vpv-blue hover:underline font-medium"
            >
              All
            </button>
            <span className="text-vpv-line">·</span>
            <button
              onClick={selectNone}
              className="text-vpv-muted hover:text-vpv-ink"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto panel-scroll p-2">
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 size={16} className="animate-spin text-vpv-muted" />
            </div>
          ) : presenters.length === 0 ? (
            <div className="text-center py-8 text-[12px] text-vpv-muted">
              No presenters in your team yet.
              <br />
              Invite from the Team page first.
            </div>
          ) : (
            <div className="space-y-1">
              {presenters.map((p) => {
                const on = assigned.has(p.id);
                const busy = saving === p.id;
                const name = p.full_name ?? p.email.split("@")[0];
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    disabled={busy}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left ${
                      on
                        ? "border-vpv-blue/40 bg-vpv-tint"
                        : "border-transparent hover:bg-vpv-tint/50"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded grid place-items-center border shrink-0 ${
                        on
                          ? "bg-vpv-blue border-vpv-blue text-white"
                          : "border-vpv-line"
                      }`}
                    >
                      {busy ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : on ? (
                        <Check size={11} strokeWidth={3} />
                      ) : null}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-vpv-grad grid place-items-center text-white text-[11px] font-semibold shrink-0">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-vpv-ink truncate">
                        {name}
                      </div>
                      <div className="text-[10.5px] text-vpv-muted truncate">
                        {p.email}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-vpv-line text-[10.5px] text-vpv-muted">
          Changes save instantly. Presenters see this tour in their dashboard
          within a few seconds.
        </div>
      </div>
    </div>
  );
}
