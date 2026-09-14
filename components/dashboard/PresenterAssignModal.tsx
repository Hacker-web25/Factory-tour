"use client";

/**
 * PresenterAssignModal — the inverse of AssignTourModal. Instead of
 * "which presenters can present THIS tour," it answers "which tours
 * can THIS presenter present." Opened from the "+" button in the team
 * table's row per presenter.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  assignTour,
  unassignTour,
} from "@/lib/tourAssignments";
import type { Tour } from "@/lib/types";

type Props = {
  orgId: string;
  currentUserId: string;
  presenterId: string;
  presenterName: string;
  onClose: () => void;
  onChange?: () => void;
};

export default function PresenterAssignModal({
  orgId,
  currentUserId,
  presenterId,
  presenterName,
  onClose,
  onChange,
}: Props) {
  const [tours, setTours] = useState<Tour[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: tourRows }, { data: assigns }] = await Promise.all([
        supabase
          .from("tours")
          .select("id, title, updated_at, org_id")
          .eq("org_id", orgId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("tour_assignments")
          .select("tour_id")
          .eq("user_id", presenterId),
      ]);
      setTours((tourRows ?? []) as Tour[]);
      setAssigned(
        new Set(((assigns ?? []) as any[]).map((r) => r.tour_id))
      );
      setLoading(false);
    })();
  }, [orgId, presenterId]);

  async function toggle(tourId: string) {
    setSaving(tourId);
    if (assigned.has(tourId)) {
      await unassignTour(tourId, presenterId);
      setAssigned((s) => {
        const n = new Set(s);
        n.delete(tourId);
        return n;
      });
    } else {
      await assignTour(tourId, presenterId, currentUserId);
      setAssigned((s) => {
        const n = new Set(s);
        n.add(tourId);
        return n;
      });
    }
    setSaving(null);
    onChange?.();
  }

  async function selectAll() {
    for (const t of tours) if (!assigned.has(t.id)) await toggle(t.id);
  }
  async function selectNone() {
    for (const t of tours) if (assigned.has(t.id)) await toggle(t.id);
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-950 border border-white/10 rounded-2xl w-[460px] max-w-full max-h-[85vh] flex flex-col shadow-2xl"
      >
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck size={14} className="text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate">
                Assign tours
              </div>
              <div className="text-[11px] text-white/40 truncate">
                to {presenterName}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-2 border-b border-white/5 text-[11px] flex items-center justify-between">
          <span className="text-white/40">
            {assigned.size} of {tours.length} tour
            {tours.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-accent hover:underline">
              All
            </button>
            <span className="text-white/20">·</span>
            <button
              onClick={selectNone}
              className="text-white/50 hover:text-white"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto panel-scroll p-2">
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 size={16} className="animate-spin text-white/40" />
            </div>
          ) : tours.length === 0 ? (
            <div className="text-center py-8 text-[12px] text-white/40">
              No tours in your library yet.
            </div>
          ) : (
            <div className="space-y-1">
              {tours.map((t) => {
                const on = assigned.has(t.id);
                const busy = saving === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    disabled={busy}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left ${
                      on
                        ? "border-accent/40 bg-accent/5"
                        : "border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded grid place-items-center border shrink-0 ${
                        on
                          ? "bg-accent border-accent text-black"
                          : "border-white/20"
                      }`}
                    >
                      {busy ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : on ? (
                        <Check size={11} strokeWidth={3} />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 text-[12.5px] text-white truncate">
                      {t.title}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/5 text-[10.5px] text-white/40">
          Changes save instantly. The presenter sees updates on their
          dashboard within seconds.
        </div>
      </div>
    </div>
  );
}
