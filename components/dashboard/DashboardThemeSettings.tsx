"use client";

/**
 * DashboardThemeSettings — the panel that lets an org_admin customise
 * their dashboard: colours, buttons, background gradient, font,
 * translucency. Writes to `orgs.theme` (jsonb) so it applies to every
 * signed-in member of the same org, and to no other org.
 *
 * Two entry points:
 *   - <DashboardThemeButton orgId={me.org_id} />  — a small pill that
 *     opens the modal. Meant to sit near the header's user menu.
 *   - <DashboardThemeModal /> renders full-screen when open.
 *
 * Persistence:
 *   Save writes the whole theme jsonb. Cancel/close reverts to what's
 *   in the DB. A "Reset to stock" wipes back to defaults.
 *
 * Live preview:
 *   As controls change, the modal writes CSS variables to <html> under
 *   a `.vpv-preview-theme` class, so the dashboard behind the modal
 *   already reflects the change before Save is pressed. On close /
 *   cancel those preview vars are cleared.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  DASHBOARD_FONTS,
  resolveTheme,
  themeToStyle,
  themeClassNames,
  THEME_DEFAULTS,
  type OrgTheme,
  type ThemeGradientDirection,
  type ThemeGradientStop,
} from "@/lib/orgTheme";
import { Palette, X, Plus, Trash2, Check } from "lucide-react";

/* -------- Small pill trigger. ---------------------------------------- */

export function DashboardThemeButton({ orgId }: { orgId: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!orgId) return null;
  // Styled to fit the tour editor's dark chrome bar. Sits next to
  // Preview / Backup / Share and reads as a secondary action.
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border bg-panelSoft hover:bg-neutral-800 text-neutral-200 text-[11px] transition-colors"
        title="Customise this client's dashboard"
      >
        <Palette size={11} />
        <span>Dashboard</span>
      </button>
      {open && (
        <DashboardThemeModal orgId={orgId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/* -------- The modal itself. ------------------------------------------ */

export function DashboardThemeModal({
  orgId,
  onClose,
}: {
  orgId: string;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<OrgTheme | null>(null);
  const [draft, setDraft] = useState<OrgTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current theme.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("theme")
        .eq("id", orgId)
        .maybeSingle();
      if (cancelled) return;
      const t = (data?.theme as OrgTheme | null) ?? {};
      setSaved(t);
      setDraft(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Apply the draft as a live preview to <html> so the dashboard behind
  // the modal reflects changes before Save.
  useEffect(() => {
    if (!draft) return;
    const el = document.documentElement;
    const style = themeToStyle(draft);
    Object.entries(style).forEach(([k, v]) => {
      if (v == null) return;
      if (k.startsWith("--")) el.style.setProperty(k, String(v));
      else if (k === "backgroundImage") el.style.setProperty("--vpv-preview-gradient", String(v));
      else if (k === "fontFamily") el.style.setProperty("--vpv-preview-font", String(v));
    });
    const cls = themeClassNames(draft);
    el.classList.add("vpv-preview-theme");
    if (cls.includes("is-translucent-bg")) el.classList.add("is-translucent-bg");
    else el.classList.remove("is-translucent-bg");
    if (cls.includes("is-translucent-btn")) el.classList.add("is-translucent-btn");
    else el.classList.remove("is-translucent-btn");
    if (cls.includes("has-gradient")) el.classList.add("has-gradient");
    else el.classList.remove("has-gradient");
    return () => {
      // Cleared on unmount below.
    };
  }, [draft]);

  // Clear preview on close.
  const closeAndClean = useCallback(() => {
    const el = document.documentElement;
    [
      "--vpv-canvas","--vpv-ink","--vpv-muted","--vpv-line","--vpv-tint",
      "--vpv-accent","--vpv-button-bg","--vpv-button-text","--vpv-blur",
      "--vpv-preview-gradient","--vpv-preview-font",
    ].forEach((v) => el.style.removeProperty(v));
    el.classList.remove(
      "vpv-preview-theme","is-translucent-bg","is-translucent-btn","has-gradient"
    );
    onClose();
  }, [onClose]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ theme: draft })
      .eq("id", orgId);
    setSaving(false);
    if (error) {
      alert("Could not save theme: " + error.message);
      return;
    }
    // Trigger a soft reload so the OrgThemeProvider fetches the new
    // theme cleanly — the live preview and the persisted style then
    // agree without stacking overrides.
    window.location.reload();
  };

  const resetToStock = () => {
    setDraft({ ...THEME_DEFAULTS, enabled: false });
  };

  if (loading || !draft) {
    return (
      <ModalShell onClose={closeAndClean}>
        <div className="p-8 text-sm text-neutral-400">Loading theme…</div>
      </ModalShell>
    );
  }

  const r = resolveTheme(draft);

  return (
    <ModalShell onClose={closeAndClean}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Palette className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Customise dashboard</h2>
        </div>
        <button
          onClick={closeAndClean}
          className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-5 overflow-y-auto max-h-[70vh] space-y-6">
        {/* Master toggle */}
        <ToggleRow
          label="Custom theme"
          hint="Off keeps the stock white dashboard."
          checked={!!draft.enabled}
          onChange={(v) => setDraft({ ...draft, enabled: v })}
        />

        {/* Colours */}
        <SectionTitle>Colours</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Base background" value={r.canvas}    onChange={(v) => setDraft({ ...draft, canvas: v })} />
          <ColorField label="Accent"           value={r.accent}    onChange={(v) => setDraft({ ...draft, accent: v })} />
          <ColorField label="Text"             value={r.ink}       onChange={(v) => setDraft({ ...draft, ink: v })} />
          <ColorField label="Muted text"       value={r.muted}     onChange={(v) => setDraft({ ...draft, muted: v })} />
          <ColorField label="Borders"          value={r.line}      onChange={(v) => setDraft({ ...draft, line: v })} />
          <ColorField label="Soft surface"     value={r.tint}      onChange={(v) => setDraft({ ...draft, tint: v })} />
          <ColorField label="Button background" value={r.button_bg}  onChange={(v) => setDraft({ ...draft, button_bg: v })} />
          <ColorField label="Button text"      value={r.button_text} onChange={(v) => setDraft({ ...draft, button_text: v })} />
        </div>

        {/* Font */}
        <SectionTitle>Font</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Font family</label>
            <select
              value={r.font}
              onChange={(e) => {
                const family = e.target.value;
                const preset = DASHBOARD_FONTS.find((f) => f.family === family);
                setDraft({
                  ...draft,
                  font: family,
                  font_url: preset?.url ?? "",
                });
              }}
              className="w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-white"
            >
              {DASHBOARD_FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                  {f.family}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div
              className="w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-white"
              style={{ fontFamily: `"${r.font}", sans-serif` }}
            >
              The quick brown fox
            </div>
          </div>
        </div>

        {/* Translucency */}
        <SectionTitle>Glass effect</SectionTitle>
        <div className="space-y-2">
          <ToggleRow
            label="Translucent background panels"
            hint="Cards and surfaces get a semi-transparent, blurred glass finish."
            checked={!!draft.translucent_bg}
            onChange={(v) => setDraft({ ...draft, translucent_bg: v })}
          />
          <ToggleRow
            label="Translucent buttons"
            hint="Buttons pick up the same glass look."
            checked={!!draft.translucent_button}
            onChange={(v) => setDraft({ ...draft, translucent_button: v })}
          />
          {(draft.translucent_bg || draft.translucent_button) && (
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Blur strength — {r.blur_px}px
              </label>
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={r.blur_px}
                onChange={(e) => setDraft({ ...draft, blur_px: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>
          )}
        </div>

        {/* Gradient */}
        <SectionTitle>Background gradient</SectionTitle>
        <GradientEditor
          draft={draft}
          onChange={(g) => setDraft({ ...draft, gradient: g })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-neutral-800 bg-neutral-900/60">
        <button
          onClick={resetToStock}
          className="text-xs text-neutral-400 hover:text-white"
        >
          Reset to stock
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={closeAndClean}
            className="px-4 py-2 rounded-md text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm bg-cyan-500 text-black font-medium hover:bg-cyan-400 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            {saving ? "Saving…" : "Save & apply"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* -------- Gradient editor. ------------------------------------------- */

function GradientEditor({
  draft,
  onChange,
}: {
  draft: OrgTheme;
  onChange: (g: NonNullable<OrgTheme["gradient"]>) => void;
}) {
  // Resolve first so every field is guaranteed present — the raw
  // draft.gradient may be partial (or a fresh account may have none).
  const r = resolveTheme(draft);
  const stops = r.gradient.stops;
  const enabled = r.gradient.enabled;
  const direction = r.gradient.direction;

  const setStop = (idx: number, patch: Partial<ThemeGradientStop>) => {
    const next = stops.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ ...r.gradient, stops: next });
  };
  const addStop = () => {
    if (stops.length >= 6) return;
    const last = stops[stops.length - 1];
    onChange({
      ...r.gradient,
      stops: [...stops, { color: last?.color ?? "#ffffff", pos: 100 }],
    });
  };
  const removeStop = (idx: number) => {
    if (stops.length <= 2) return;
    onChange({ ...r.gradient, stops: stops.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <ToggleRow
        label="Enable gradient"
        hint="Draws a background gradient behind the whole dashboard. Works with translucent panels for a layered look."
        checked={enabled}
        onChange={(v) => onChange({ ...r.gradient, enabled: v })}
      />

      {enabled && (
        <>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Direction</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { k: "vertical",   label: "↓ Vertical"   },
                  { k: "horizontal", label: "→ Horizontal" },
                  { k: "diagonal",   label: "↘ Diagonal"   },
                ] as { k: ThemeGradientDirection; label: string }[]
              ).map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => onChange({ ...r.gradient, direction: k })}
                  className={`py-2 rounded-md border text-xs transition-colors ${
                    direction === k
                      ? "bg-cyan-500 text-black border-cyan-500"
                      : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-neutral-400">Colour stops</label>
              <button
                onClick={addStop}
                disabled={stops.length >= 6}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-40 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add colour
              </button>
            </div>
            <div className="space-y-2">
              {stops.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => setStop(i, { color: e.target.value })}
                    className="w-9 h-8 rounded bg-neutral-800 border border-neutral-700 cursor-pointer"
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={s.pos}
                    onChange={(e) => setStop(i, { pos: Number(e.target.value) })}
                    className="flex-1 accent-cyan-400"
                  />
                  <span className="w-10 text-right text-[11px] text-neutral-400">{s.pos}%</span>
                  <button
                    onClick={() => removeStop(i)}
                    disabled={stops.length <= 2}
                    className="p-1.5 rounded text-neutral-500 hover:text-red-400 disabled:opacity-30"
                    title="Remove stop"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Live gradient preview strip. */}
            <div
              className="mt-3 h-8 rounded-md border border-neutral-700"
              style={{
                backgroundImage: `linear-gradient(${
                  direction === "horizontal" ? 90 : direction === "diagonal" ? 135 : 180
                }deg, ${stops
                  .slice()
                  .sort((a, b) => a.pos - b.pos)
                  .map((s) => `${s.color} ${s.pos}%`)
                  .join(", ")})`,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* -------- Reusable bits ---------------------------------------------- */

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl bg-[#0b0f16] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] tracking-[2px] uppercase text-neutral-500 font-medium pt-1">
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-neutral-400 mb-1">{label}</label>
      <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-xs text-white outline-none font-mono"
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{label}</div>
        {hint && <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-cyan-500" : "bg-neutral-700"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
