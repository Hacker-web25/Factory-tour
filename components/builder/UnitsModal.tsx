"use client";

/**
 * UnitsModal — group a tour's scenes into units (Nutra unit, Head Office, R&D…),
 * give each a white divider card, and number its scenes (HO15, HO14 … HO1).
 *
 * The grouping is worked out in the background (lib/units.ts): dividers already
 * in the tour first, then the codes in the names, then the time each photo was
 * taken. That is only a first guess: the person decides the groups themselves by
 * splitting between any two scenes, typing how many scenes go in each unit
 * ("3, 2, 4"), or asking for equal groups. Then they name each unit and press
 * Apply. Nothing is saved until then, and the last Apply can be undone.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Layers, Loader2, Scissors, Undo2, X } from "lucide-react";
import type { Scene } from "@/lib/types";
import ScenePreviewImg from "@/components/ScenePreviewImg";
import {
  capturedMs,
  contentScenes,
  cutsEqual,
  cutsEvery,
  cutsFromSizes,
  parseSizes,
  planUnitRenames,
  proposeCuts,
  suggestCode,
  unitsFromCuts,
  type Sensitivity,
} from "@/lib/units";
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
  // null = the automatic grouping; otherwise the scenes the person has chosen to start a unit.
  const [cuts, setCuts] = useState<string[] | null>(null);
  const [showScenes, setShowScenes] = useState(scenes.length <= 80);
  const [equalN, setEqualN] = useState("2");
  const [everyN, setEveryN] = useState("5");
  const [sizesText, setSizesText] = useState("");
  const [busy, setBusy] = useState<"apply" | "undo" | "times" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const withTimes = useMemo(() => scenes.filter((s) => capturedMs(s) != null).length, [scenes]);
  const proposal = useMemo(() => proposeCuts(scenes, sensitivity), [scenes, sensitivity]);
  const hasDividers = proposal.basis === "dividers";
  const content = useMemo(() => contentScenes(scenes), [scenes]);
  const position = useMemo(() => new Map(content.map((s, i) => [s.id, i + 1])), [content]);
  const byHand = cuts !== null;
  const cutIds = cuts ?? proposal.cutIds;

  // Changing how finely to split starts the grouping again.
  useEffect(() => {
    setEdits({});
    setCuts(null);
  }, [sensitivity]);

  /** The units that follow from the starting points, with the person's names and choices applied. */
  const units: PlanUnit[] = useMemo(
    () =>
      unitsFromCuts(scenes, cutIds).map((u) => {
        const e = edits[u.key] ?? {};
        const title = e.title ?? u.title;
        return {
          ...u,
          title,
          code: e.code ?? (u.code || suggestCode(title)),
          addDivider: e.addDivider ?? true,
          redraw: e.redraw ?? false,
          memberIds: [...u.memberIds],
        };
      }),
    [scenes, cutIds, edits]
  );

  const opts: PlanOptions = { direction, space, keepRoom };
  const plan = useMemo(() => buildUnitsPlan(scenes, units, opts), [scenes, units, direction, space, keepRoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = units.filter(unitIsReady).length;

  const setEdit = (key: string, patch: Edit) => setEdits((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
  /** Start a new unit at this scene, or stop it starting one. */
  const toggleCut = (id: string) => setCuts((c) => ((c ?? cutIds).includes(id) ? (c ?? cutIds).filter((x) => x !== id) : [...(c ?? cutIds), id]));

  const equalCount = Math.floor(Number(equalN));
  const everyCount = Math.floor(Number(everyN));
  const sizes = parseSizes(sizesText);
  const sizesTotal = sizes ? sizes.reduce((a, b) => a + b, 0) : 0;
  const sizesHint = !sizesText.trim()
    ? "e.g. 3, 2, 4: the first 3 scenes, then the next 2, then the next 4"
    : !sizes
      ? "Type whole numbers, like 3, 2, 4"
      : sizesTotal > content.length
        ? `That is ${sizesTotal} scenes and there are ${content.length}; the extra is ignored`
        : sizesTotal < content.length
          ? `${sizesTotal} scenes, and the other ${content.length - sizesTotal} make one more unit`
          : `${sizesTotal} scenes: all of them`;

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

  const n = units.length;
  const basisText = byHand
    ? `${n} unit${n === 1 ? "" : "s"}, grouped by you. Change them with the tools and Split here buttons below.`
    : proposal.basis === "dividers"
      ? `Found ${n} unit${n === 1 ? "" : "s"} from the dividers already in this tour. You can still split any of them further.`
      : proposal.basis === "names"
        ? `Guessed ${n} groups from the codes in the scene names. Check them, and change them if they are wrong.`
        : proposal.basis === "time"
          ? `Guessed ${n} groups from the time the photos were taken. Check them, and change them if they are wrong.`
          : "No groups could be guessed, so everything is one group. Divide the scenes yourself with the tools below.";

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
            {proposal.basis !== "dividers" && withTimes / Math.max(1, scenes.length) >= 0.6 && (
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

          {!hasDividers && content.length > 1 && (
            <div className="rounded border border-border bg-panelSoft/30 px-3 py-2.5 space-y-2 text-[12px] text-neutral-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-neutral-200">Divide the scenes yourself</span>
                <span className="flex items-center gap-1.5">
                  <button className="chip" onClick={() => setCuts([])} title="Put every scene in one unit, then split it where you want">
                    One unit
                  </button>
                  {byHand && proposal.basis !== "none" && (
                    <button className="chip" onClick={() => setCuts(null)} title="Go back to the groups that were guessed">
                      Back to the guess
                    </button>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <label htmlFor="units-sizes" className="text-neutral-400 w-full sm:w-auto sm:min-w-[7.5rem]">
                  Scenes in each unit
                </label>
                <input
                  id="units-sizes"
                  value={sizesText}
                  onChange={(e) => setSizesText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sizes) setCuts(cutsFromSizes(scenes, sizes));
                  }}
                  inputMode="numeric"
                  placeholder="3, 2, 4"
                  className={`${INPUT} w-36`}
                />
                <button className="chip" disabled={!sizes} onClick={() => sizes && setCuts(cutsFromSizes(scenes, sizes))}>
                  Set
                </button>
                <span className="text-[11px] text-neutral-500 min-w-0 basis-full sm:basis-auto sm:flex-1">{sizesHint}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-neutral-400 w-full sm:w-auto sm:min-w-[7.5rem]">Or split</span>
                <label className="flex items-center gap-1.5">
                  into
                  <input
                    value={equalN}
                    onChange={(e) => setEqualN(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    inputMode="numeric"
                    aria-label="Number of equal groups"
                    className={`${INPUT} w-12 text-center`}
                  />
                  equal groups
                </label>
                <button className="chip" disabled={!(equalCount >= 1)} onClick={() => setCuts(cutsEqual(scenes, equalCount))}>
                  Set
                </button>
                <span className="text-neutral-600 mx-1">·</span>
                <label className="flex items-center gap-1.5">
                  a new unit every
                  <input
                    value={everyN}
                    onChange={(e) => setEveryN(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    inputMode="numeric"
                    aria-label="Scenes per unit"
                    className={`${INPUT} w-12 text-center`}
                  />
                  scenes
                </label>
                <button className="chip" disabled={!(everyCount >= 1)} onClick={() => setCuts(cutsEvery(scenes, everyCount))}>
                  Set
                </button>
              </div>
              <div className="text-[11px] text-neutral-500">
                Or press <Scissors size={10} className="inline -mt-0.5" /> Split here beside any scene below to start a new unit there. Nothing changes in the tour until you press Apply.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11.5px] text-neutral-500">
            <span>
              {n} unit{n === 1 ? "" : "s"} · {content.length} scene{content.length === 1 ? "" : "s"}
            </span>
            <button className="text-accent hover:underline" onClick={() => setShowScenes((v) => !v)} aria-pressed={showScenes}>
              {showScenes ? "Hide the scenes" : "Show the scenes"}
            </button>
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
                    {i > 0 && !u.dividerId && (
                      <button className="text-accent hover:underline" onClick={() => toggleCut(u.memberIds[0])}>
                        Join with the unit above
                      </button>
                    )}
                  </div>

                  {showScenes && members.length > 0 && (
                    <ol className="mt-2 ml-7 border-l border-border/70 pl-2.5 space-y-0.5">
                      {members.map((m, k) => (
                        <li key={m.id} className="flex items-center gap-2 text-[11.5px] min-h-[24px]">
                          <span className="w-6 shrink-0 text-right tabular-nums text-neutral-600">{position.get(m.id)}</span>
                          <span className="w-10 h-5 shrink-0 rounded-sm overflow-hidden bg-black/40">
                            <ScenePreviewImg imagePath={m.image_path} thumbnailPath={m.thumbnail_path} alt="" className="w-full h-full object-cover" />
                          </span>
                          <span className="flex-1 min-w-0 truncate text-neutral-300">{m.name}</span>
                          {k > 0 && (
                            <button
                              onClick={() => toggleCut(m.id)}
                              className="shrink-0 flex items-center gap-1 text-accent hover:underline"
                              aria-label={`Start a new unit at ${m.name}`}
                              title="Start a new unit at this scene"
                            >
                              <Scissors size={11} /> Split here
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

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
