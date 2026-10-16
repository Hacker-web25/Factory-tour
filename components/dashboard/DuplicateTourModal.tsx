"use client";

/**
 * DuplicateTourModal — the MD picks a subset of a tour's scenes and
 * creates a brand-new tour (a per-client variant) from it. See the SQL
 * side at supabase/tour_duplicate.sql for how the copy is actually
 * done (SECURITY DEFINER function duplicate_tour_for_md).
 *
 * UX is deliberately plain and light-themed to match the rest of the
 * MD dashboard. MDs are not technical users; this is one input and a
 * checklist.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase, publicUrl } from "@/lib/supabase";
import { Loader2, X, Check, CheckCircle2, AlertCircle } from "lucide-react";

type Scene = {
  id: string;
  name: string;
  order_index: number;
  thumbnail_path: string | null;
  image_path: string;
};

export default function DuplicateTourModal({
  sourceTourId,
  sourceTitle,
  onClose,
  onCreated,
}: {
  sourceTourId: string;
  sourceTitle: string;
  onClose: () => void;
  onCreated: (newTourId: string) => void;
}) {
  const [title, setTitle] = useState<string>(`${sourceTitle} — Copy`);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("scenes")
        .select("id, name, order_index, thumbnail_path, image_path")
        .eq("tour_id", sourceTourId)
        .order("order_index");
      if (cancelled) return;
      if (error || !data) {
        setErr("Couldn't load the tour's scenes.");
        setScenes([]);
        return;
      }
      setScenes(data as Scene[]);
      // Default: every scene selected.
      setPicked(new Set((data as Scene[]).map((s) => s.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceTourId]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!scenes) return;
    setPicked(new Set(scenes.map((s) => s.id)));
  };
  const selectNone = () => setPicked(new Set());

  const canSubmit = useMemo(
    () => !busy && title.trim().length > 0 && picked.size > 0,
    [busy, title, picked]
  );

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    const sceneIds = Array.from(picked);
    const { data, error } = await supabase.rpc("duplicate_tour_for_md", {
      p_source: sourceTourId,
      p_new_title: title.trim(),
      p_scene_ids: sceneIds,
    });
    setBusy(false);
    if (error || !data) {
      const code = error?.message || "";
      setErr(
        code.includes("workspace_locked")
          ? "Your workspace is locked for a lapsed support renewal. Renew it from the Billing tab and try again."
          : code.includes("forbidden")
            ? "You can only duplicate a tour from your own organisation."
            : code.includes("title_required")
              ? "Please enter a name for the copy."
              : code.includes("no_scenes")
                ? "Pick at least one scene for the copy."
                : "Something went wrong creating the copy. Please try again."
      );
      return;
    }
    onCreated(data as string);
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-slate-100">
          <div>
            <h2
              id="dup-title"
              className="text-[17px] font-semibold text-slate-900"
            >
              Duplicate for a client
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-1">
              Make a copy of <span className="font-medium">{sourceTitle}</span>
              . Pick which scenes the sales team will show this client; edit
              the text later from the dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <label className="block">
            <div className="text-[12px] font-medium text-slate-700 mb-1.5">
              Name for the copy
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. ABC Industries — pitch tour"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:border-vpv-blue focus:ring-2 focus:ring-vpv-blue/20 outline-none text-[14px]"
              disabled={busy}
            />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[12px] font-medium text-slate-700">
                Scenes to include{" "}
                <span className="text-slate-400 font-normal">
                  ({picked.size}
                  {scenes ? ` / ${scenes.length}` : ""} selected)
                </span>
              </div>
              <div className="flex gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-vpv-blue hover:underline"
                  disabled={busy}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-slate-500 hover:underline"
                  disabled={busy}
                >
                  None
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 max-h-64 overflow-auto">
              {scenes === null ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : scenes.length === 0 ? (
                <div className="px-4 py-6 text-[12.5px] text-slate-500">
                  This tour has no scenes.
                </div>
              ) : (
                scenes.map((s) => {
                  const sel = picked.has(s.id);
                  const thumb = s.thumbnail_path ?? s.image_path;
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 cursor-pointer ${
                        sel ? "bg-vpv-tint/40" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 accent-vpv-blue"
                        disabled={busy}
                      />
                      <div className="w-10 h-10 rounded-md bg-slate-200 overflow-hidden shrink-0">
                        {thumb && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={publicUrl(thumb) ?? ""}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-slate-800 truncate">
                          {s.name || "Untitled scene"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Scene #{s.order_index + 1}
                        </div>
                      </div>
                      {sel && (
                        <CheckCircle2
                          size={16}
                          className="text-vpv-blue shrink-0"
                        />
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {err && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-full border border-slate-300 text-slate-700 text-[13.5px] font-medium hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="h-10 px-5 rounded-full bg-vpv-grad text-white text-[13.5px] font-semibold shadow-[0_10px_26px_-10px_rgba(20,104,216,0.6)] hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Check size={14} />
                Create copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
