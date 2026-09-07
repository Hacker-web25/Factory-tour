"use client";

/**
 * PasteStyleModal — user picks which style groups from the clipboard
 * they want applied to the currently-selected hotspot(s). Everything
 * OUTSIDE the picked groups is left untouched on the target.
 */

import { useMemo, useState } from "react";
import type { Hotspot } from "@/lib/types";
import {
  STYLE_GROUPS,
  type StickyStyle,
  applyClipboardToHotspot,
} from "@/lib/hotspotStyleMemory";
import { Clipboard, Check, X } from "lucide-react";

type Props = {
  clipboard: StickyStyle;
  /** The hotspot(s) that will receive the paste. Multi-select is
   *  supported — a paste applies to every hotspot in this array. */
  targets: Hotspot[];
  onApply: (updated: Hotspot[]) => void;
  onCancel: () => void;
};

export default function PasteStyleModal({
  clipboard,
  targets,
  onApply,
  onCancel,
}: Props) {
  // Only show groups that actually have at least one value in the
  // clipboard — a Color-copy from an all-defaults hotspot shouldn't
  // offer "Polygon fill" as a checkbox.
  const availableGroups = useMemo(
    () =>
      STYLE_GROUPS.filter((g) =>
        g.keys.some((k) => clipboard[k] !== undefined)
      ),
    [clipboard]
  );

  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(availableGroups.map((g) => g.key)) // default: everything on
  );

  function toggle(key: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setPicked(new Set(availableGroups.map((g) => g.key)));
  }
  function selectNone() {
    setPicked(new Set());
  }

  function handleApply() {
    const updated = targets.map((t) =>
      applyClipboardToHotspot(t, clipboard, picked)
    );
    onApply(updated);
  }

  const targetLabel =
    targets.length === 1
      ? "this hotspot"
      : `${targets.length} selected hotspots`;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[440px] max-w-full shadow-panel max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Clipboard size={14} className="text-accent" />
            <h3 className="text-[14px] font-semibold">Paste style</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Sub-header */}
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between text-[11px] text-neutral-400">
          <span>
            Applying to <span className="text-white">{targetLabel}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-accent hover:underline"
              type="button"
            >
              Select all
            </button>
            <span className="text-neutral-700">·</span>
            <button
              onClick={selectNone}
              className="text-neutral-400 hover:text-white"
              type="button"
            >
              None
            </button>
          </div>
        </div>

        {/* Group checklist */}
        <div className="flex-1 overflow-auto panel-scroll p-4 space-y-2">
          {availableGroups.length === 0 && (
            <div className="text-[12px] text-neutral-500 py-4 text-center">
              Nothing to paste — the copied hotspot had no distinct style.
            </div>
          )}
          {availableGroups.map((g) => {
            const on = picked.has(g.key);
            return (
              <label
                key={g.key}
                className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  on
                    ? "border-accent/60 bg-accent/5"
                    : "border-border hover:border-white/20"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded shrink-0 mt-0.5 grid place-items-center border ${
                    on
                      ? "bg-accent border-accent text-black"
                      : "border-white/25"
                  }`}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => toggle(g.key)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{g.label}</div>
                  <div className="text-[11px] text-neutral-500 leading-snug">
                    {g.hint}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={onCancel}
            className="text-[12px] text-neutral-400 hover:text-white px-3 py-1.5 flex items-center gap-1"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={picked.size === 0 || availableGroups.length === 0}
            className="bg-accent hover:bg-accentHover text-black text-[12px] font-semibold px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check size={12} /> Paste{" "}
            {picked.size > 0 &&
              `(${picked.size} group${picked.size === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>
    </div>
  );
}
