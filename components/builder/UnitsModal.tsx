"use client";

/**
 * UnitsModal — group a tour's scenes into units (Nutra unit, Head Office, R&D…),
 * give each a white divider card, and number its scenes (HO15, HO14 … HO1).
 *
 * The grouping is worked out in the background (lib/units.ts): dividers already
 * in the tour first, then the codes in the names, then the time each photo was
 * taken. The person only names each unit and presses Apply. Nothing is saved
 * until then, and the last Apply can be undone.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Layers, Loader2, Undo2, X } from "lucide-react";
import type { Scene } from "@/lib/types";
import { capturedMs, planUnitRenames, proposeUnits, suggestCode, type Sensitivity } from "@/lib/units";
import { buildUnitsPlan, unitIsReady, type PlanOptions, type PlanUnit } from "@/lib/unitsPlan";

type Edit = { title?: string; code?: string; addDivider?: boolean; redraw?: boolean };

type Props = {
  scenes: Scene[];
  /** False when supabase/scene_units.sql has not been run yet. */
  columnsReady: boolean;
  canUndo: boolean;
  onClose: () => void;
  onApply: (units: PlanUnit[], opts: PlanOptions) => Promise<void>;
  onUndo: () => Promise<void>;
  /** Reads the capture time of every stored photo. Returns how many it found. */
  onReadTimes: () => Promise<number>;
};

const INPUT =
  "bg-black/30 border border-border rounded px-2 py-1 text-[12.5px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-accent";

export default function UnitsModal({ scenes, columnsReady, canUndo, onClose, onApply, onUndo, onReadTimes }: Props) {
  const [sensitivity, setSensitivity] = useState<Sensitivity>(3);
  const [direction, setDirection] = useState<PlanOptions["direction"]>("down");
  const [space, setSpace] = useState(false);
  const [keepRoom, setKeepRoom] = useState(true);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"apply" | "undo" | "times" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const withTimes = useMemo(() => scenes.filter((s) => capturedMs(s) != null).length, [scenes]);
  const proposal = useMemo(() => proposeUnits(scenes, sensitivity), [scenes, sensitivity]);

  // Changing how finely to split starts the grouping again.
  useEffect(() => {
    setEdits({});
    setJoined(new Set());
  }, [sensitivity]);

  /** The proposal with the person's joins and edits applied. */
  const units: PlanUnit[] = useMemo(() => {
    const out: PlanUnit[] = [];
    for (const u of proposal.units) {
      const prev = out[out.length - 1];
      if (prev && joined.has(u.key) && !u.dividerId && !prev.dividerId) {
        prev.memberIds = [...prev.memberIds, ...u.memberIds];
        continue;
      }
      const e = edits[u.key] ?? {};
      const title = e.title ?? u.title;
      out.push({
        ...u,
        title,
        code: e.code ?? (u.code || suggestCode(title)),
        addDivider: e.addDivider ?? true,
        redraw: e.redraw ?? false,
        memberIds: [...u.memberIds],
      });
    }
    return out;
  }, [proposal, edits, joined]);

  const opts: PlanOptions = { direction, space, keepRoom };
  const plan = useMemo(() => buildUnitsPlan(scenes, units, opts), [scenes, units, direction, space, keepRoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = units.filter(unitIsReady).length;

  const setEdit = (key: string, patch: Edit) => setEdits((m) => ({ ...m, [key]: { ...m[key], ...patch } }));

  async function run(kind: "apply" | "undo" | "times", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  const basisText =
    proposal.basis === "dividers"
      ? `Found ${proposal.units.length} unit${proposal.units.length === 1 ? "" : "s"} from the dividers already in this tour.`
      : proposal.basis === "names"
        ? `Found ${proposal.units.length} groups from the codes in the scene names.`
        : proposal.basis === "time"
          ? `Found ${proposal.units.length} groups from the time the photos were taken.`
          : "No clear groups found, so everything is one group. Name it below, or ask for more groups.";

  const canReadTimes = proposal.basis !== "dividers" && withTimes / Math.max(1, scenes.length) < 0.6;

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-full max-w-[780px] max-h-[92vh] flex flex-col shadow-panel min-w-0"
        role="dialog"
        aria-label="Units"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Layers size={14} className="text-accent shrink-0" />
            <h3 className="text-[14px] font-semibold">Units</h3>
            <span className="hidden sm:block text-[11px] text-neutral-500 truncate">
              Group scenes into units, add a divider card to each and number the scenes.
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto panel-scroll p-4 space-y-4">
          {!columnsReady && (
            <div className="flex items-start gap-2 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Units need a one-time database update before they can be saved. Ask the site owner to run{" "}
                <code className="text-amber-100">supabase/scene_units.sql</code>. You can still look at how your scenes would be grouped.
              </span>
            </div>
          )}

          <div className="text-[12.5px] text-neutral-300">{basisText}</div>

          {(proposal.basis !== "dividers" || canReadTimes) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
            {proposal.basis !== "dividers" && (
              <label className="flex items-center gap-2 text-neutral-400">
                Groups
                <span className="text-neutral-600">fewer</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value) as Sensitivity)}
                  className="w-28 accent-accent"
                  aria-label="How many groups"
                />
                <span className="text-neutral-600">more</span>
              </label>
            )}
            {canReadTimes && (
              <button
                disabled={busy !== null}
                onClick={() =>
                  run("times", async () => {
                    const found = await onReadTimes();
                    setNote(found ? `Read the time of ${found} photos.` : "These photos carry no time, so grouping relies on the names and order.");
                  })
                }
                className="chip"
                title="Look inside the stored photos for the time each was taken"
              >
                {busy === "times" ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />} Read photo times
              </button>
            )}
          </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-neutral-300">
            <div className="flex items-center gap-1" role="group" aria-label="Numbering">
              <span className="text-neutral-500 mr-1">Numbers</span>
              <button className={`chip ${direction === "down" ? "active" : ""}`} onClick={() => setDirection("down")}>
                Count down (HO15 … HO1)
              </button>
              <button className={`chip ${direction === "up" ? "active" : ""}`} onClick={() => setDirection("up")}>
                Count up (HO1 … HO15)
              </button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={space} onChange={(e) => setSpace(e.target.checked)} className="accent-accent" />
              Space after the code
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={keepRoom} onChange={(e) => setKeepRoom(e.target.checked)} className="accent-accent" />
              Keep room names after the number
            </label>
          </div>

          <ul className="space-y-2">
            {units.map((u, i) => {
              const members = u.memberIds.map((id) => byId.get(id)).filter((s): s is Scene => !!s);
              const steps = planUnitRenames(members, { ...opts, code: u.code });
              const incomplete = !unitIsReady(u);
              const first = members[0]?.name;
              const last = members[members.length - 1]?.name;
              return (
                <li key={u.key} className={`rounded border px-3 py-2.5 ${incomplete ? "border-border bg-panelSoft/30" : "border-accent/40 bg-accent/5"}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-black/40 border border-border text-[10.5px] grid place-items-center text-neutral-300">
                      {i + 1}
                    </span>
                    <input
                      value={u.title}
                      onChange={(e) => setEdit(u.key, { title: e.target.value })}
                      placeholder="Unit name, e.g. Head Office"
                      className={`${INPUT} flex-1 min-w-0 font-semibold`}
                      aria-label={`Name of unit ${i + 1}`}
                    />
                    <input
                      value={u.code}
                      onChange={(e) => setEdit(u.key, { code: e.target.value.slice(0, 8) })}
                      placeholder="Code"
                      className={`${INPUT} w-20 text-center`}
                      aria-label={`Code for unit ${i + 1}`}
                    />
                    <span className="hidden sm:block text-[11px] text-neutral-500 w-16 text-right shrink-0">{members.length} scenes</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-7 text-[11.5px] text-neutral-400">
                    {first && (
                      <span className="truncate max-w-[260px]">
                        {first} <span className="text-neutral-600">to</span> {last}
                      </span>
                    )}
                    {u.dividerId ? (
                      <>
                        <span className="text-emerald-300 flex items-center gap-1">
                          <Check size={11} /> {u.legacyDivider ? "Existing divider scene" : "Divider card"}
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={u.redraw} onChange={(e) => setEdit(u.key, { redraw: e.target.checked })} className="accent-accent" />
                          Draw the card again
                        </label>
                      </>
                    ) : (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={u.addDivider} onChange={(e) => setEdit(u.key, { addDivider: e.target.checked })} className="accent-accent" />
                        Add a divider card
                      </label>
                    )}
                    {i > 0 && !u.dividerId && !units[i - 1].dividerId && proposal.basis !== "dividers" && (
                      <button
                        className="text-accent hover:underline"
                        onClick={() => setJoined((j) => new Set(j).add(u.key))}
                      >
                        Join with the unit above
                      </button>
                    )}
                  </div>

                  {!incomplete && steps.length > 0 && (
                    <div className="mt-1.5 pl-7 text-[11px] text-neutral-500 truncate">
                      {steps.slice(0, 3).map((s, k) => (
                        <span key={s.id}>
                          {k > 0 && " · "}
                          {s.from} <span className="text-neutral-600">→</span> <span className="text-neutral-300">{s.to}</span>
                        </span>
                      ))}
                      {steps.length > 3 && <span> · and {steps.length - 3} more</span>}
                    </div>
                  )}
                  {incomplete && <div className="mt-1.5 pl-7 text-[11px] text-neutral-600">Give it a name to include it.</div>}
                </li>
              );
            })}
            {units.length === 0 && <li className="text-[12px] text-neutral-500">This tour has no scenes yet.</li>}
          </ul>

          {note && <div className="text-[12px] text-neutral-400">{note}</div>}
          {error && (
            <div className="flex items-start gap-2 text-[12px] text-red-300" role="alert">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-t border-border">
          <div className="text-[11.5px] text-neutral-400 flex-1 min-w-[180px]">
            {ready === 0
              ? "Name a unit to set it up."
              : `${ready} unit${ready === 1 ? "" : "s"} · ${plan.summary.renamed} scene${plan.summary.renamed === 1 ? "" : "s"} renamed` +
                (plan.summary.dividersAdded ? ` · ${plan.summary.dividersAdded} divider card${plan.summary.dividersAdded === 1 ? "" : "s"} added` : "") +
                (plan.summary.dividersConverted ? ` · ${plan.summary.dividersConverted} existing divider${plan.summary.dividersConverted === 1 ? "" : "s"} marked` : "")}
          </div>
          {canUndo && (
            <button disabled={busy !== null} onClick={() => run("undo", onUndo)} className="chip" title="Put the tour back as it was before the last Apply">
              {busy === "undo" ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />} Undo last
            </button>
          )}
          <button onClick={onClose} className="chip">
            Close
          </button>
          <button
            disabled={busy !== null || ready === 0 || !columnsReady}
            onClick={() =>
              run("apply", async () => {
                await onApply(units, opts);
                onClose();
              })
            }
            className="px-3.5 py-1.5 rounded bg-accent text-black text-[12.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {busy === "apply" && <Loader2 size={12} className="animate-spin" />} Apply
          </button>
        </div>
      </div>
    </div>
  );
}
