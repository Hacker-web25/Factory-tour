"use client";

/**
 * Floating pill toolbar shown while a hotspot is selected. Gives the
 * user three actions in one place:
 *   • Toggle auto-inherit-style (global, remembered across every tour)
 *   • Copy this hotspot's style to the clipboard
 *   • Paste style from the clipboard (opens the group picker)
 *
 * The RightPanel is where users tweak numeric fields; this toolbar is
 * where they act on the hotspot as a whole. Keeping it separate means
 * no changes to RightPanel and no risk of regressing the settings UI.
 */

import { Copy, ClipboardPaste, Sparkles } from "lucide-react";

type Props = {
  stickyEnabled: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  onToggleSticky: () => void;
  onCopyStyle: () => void;
  onOpenPaste: () => void;
};

export default function HotspotStyleToolbar({
  stickyEnabled,
  hasSelection,
  hasClipboard,
  onToggleSticky,
  onCopyStyle,
  onOpenPaste,
}: Props) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-full pl-1 pr-1 py-1 flex items-center gap-1 shadow-panel">
        {/* Auto-match toggle */}
        <button
          onClick={onToggleSticky}
          title={
            stickyEnabled
              ? "Auto-match style is ON — new hotspots inherit your last-used look. Click to turn off."
              : "Auto-match style is OFF — new hotspots use factory defaults. Click to turn on."
          }
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
            stickyEnabled
              ? "bg-accent/20 text-accent hover:bg-accent/30"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Sparkles size={12} />
          Auto-match
          <span
            className={`ml-0.5 w-6 h-3 rounded-full flex items-center transition-colors ${
              stickyEnabled ? "bg-accent" : "bg-white/20"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full bg-white shadow transform transition-transform ${
                stickyEnabled ? "translate-x-3" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        {/* Copy style */}
        <button
          onClick={onCopyStyle}
          disabled={!hasSelection}
          title="Copy this hotspot's style"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Copy size={12} />
          Copy style
        </button>

        {/* Paste style */}
        <button
          onClick={onOpenPaste}
          disabled={!hasSelection || !hasClipboard}
          title={
            !hasClipboard
              ? "Clipboard is empty — copy a style from another hotspot first"
              : "Paste style — pick which properties to apply"
          }
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ClipboardPaste size={12} />
          Paste style
        </button>
      </div>
    </div>
  );
}
