"use client";

/**
 * EditSceneTab — Photoshop/Lightroom-style colour grading for the active
 * scene. Every change updates the scene's `image_adjustments` and the
 * panorama re-grades live (the editor's PanoramaViewer reads the same
 * field). Presets give one-click looks; the sliders fine-tune.
 */

import { useMemo, useState } from "react";
import type { Scene } from "@/lib/types";
import {
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustments,
  PRESETS,
  type ImageAdjustments,
} from "@/lib/imageAdjustments";
import { Sparkles, RotateCcw, Sun, Contrast, Droplets, Copy, Check } from "lucide-react";

export default function EditSceneTab({
  scene,
  sceneCount = 1,
  onSceneChange,
  onApplyToAll,
}: {
  scene: Scene;
  /** Total number of scenes in the tour — used to label "Apply to all". */
  sceneCount?: number;
  onSceneChange: (s: Scene) => void;
  /** Push the current scene's grade to every scene in the tour. */
  onApplyToAll?: (adj: ImageAdjustments) => void;
}) {
  const [appliedAll, setAppliedAll] = useState(false);

  const adj = useMemo(
    () => normalizeAdjustments((scene as any).image_adjustments),
    [scene]
  );

  function patch(next: Partial<ImageAdjustments>) {
    const merged = { ...adj, ...next };
    onSceneChange({
      ...scene,
      // stored as jsonb — cast through any to satisfy the Scene type
      ...({ image_adjustments: merged } as any),
    });
  }

  function applyPreset(values: Partial<ImageAdjustments>) {
    // Presets start from defaults so switching presets doesn't compound.
    onSceneChange({
      ...scene,
      ...({
        image_adjustments: { ...DEFAULT_ADJUSTMENTS, ...values },
      } as any),
    });
  }

  function resetAll() {
    onSceneChange({
      ...scene,
      ...({ image_adjustments: { ...DEFAULT_ADJUSTMENTS } } as any),
    });
  }

  function applyToAll() {
    onApplyToAll?.(adj);
    setAppliedAll(true);
    setTimeout(() => setAppliedAll(false), 2000);
  }

  return (
    <div className="pt-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" />
          <div className="text-xs uppercase tracking-wider text-neutral-300 font-medium">
            Enhance scene
          </div>
        </div>
        <button
          onClick={resetAll}
          className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
          title="Reset all adjustments to original"
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* Apply this scene's grade to every scene in the tour */}
      {onApplyToAll && sceneCount > 1 && (
        <button
          onClick={applyToAll}
          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-md border text-[11.5px] font-medium transition-colors ${
            appliedAll
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
              : "border-accent/60 bg-accent/10 text-accent hover:bg-accent/20"
          }`}
          title="Copy these exact settings to every other scene"
        >
          {appliedAll ? (
            <>
              <Check size={13} /> Applied to all {sceneCount} scenes
            </>
          ) : (
            <>
              <Copy size={13} /> Apply this look to all {sceneCount} scenes
            </>
          )}
        </button>
      )}

      {/* Presets */}
      <div>
        <div className="eyebrow mb-1.5">Presets</div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.values)}
              className="px-2 py-2 rounded-md border border-border bg-panelSoft hover:border-accent hover:bg-accent/5 text-[11px] text-neutral-200 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="text-[10.5px] text-neutral-500 mt-1.5">
          Tap a look, then fine-tune below.
        </div>
      </div>

      {/* Light */}
      <Section title="Light" icon={<Sun size={11} />}>
        <Slider
          label="Exposure"
          value={adj.exposure}
          min={0.3}
          max={1.8}
          step={0.01}
          neutral={1}
          format={(v) => `${Math.round((v - 1) * 100)}`}
          onChange={(v) => patch({ exposure: v })}
        />
        <Slider
          label="Contrast"
          value={adj.contrast}
          min={0.5}
          max={1.6}
          step={0.01}
          neutral={1}
          format={(v) => `${Math.round((v - 1) * 100)}`}
          onChange={(v) => patch({ contrast: v })}
        />
      </Section>

      {/* Colour */}
      <Section title="Colour" icon={<Droplets size={11} />}>
        <Slider
          label="Saturation"
          value={adj.saturation}
          min={0}
          max={2}
          step={0.01}
          neutral={1}
          format={(v) => `${Math.round((v - 1) * 100)}`}
          onChange={(v) => patch({ saturation: v })}
        />
        <Slider
          label="Warmth"
          value={adj.warmth}
          min={-100}
          max={100}
          step={1}
          neutral={0}
          format={(v) => `${Math.round(v)}`}
          trackGradient="linear-gradient(90deg,#3b82f6,#94a3b8,#f59e0b)"
          onChange={(v) => patch({ warmth: v })}
        />
        <Slider
          label="Tint"
          value={adj.tint}
          min={-100}
          max={100}
          step={1}
          neutral={0}
          format={(v) => `${Math.round(v)}`}
          trackGradient="linear-gradient(90deg,#22c55e,#94a3b8,#d946ef)"
          onChange={(v) => patch({ tint: v })}
        />
      </Section>

      {/* Effects */}
      <Section title="Effects" icon={<Contrast size={11} />}>
        <Slider
          label="Vignette"
          value={adj.vignette}
          min={0}
          max={100}
          step={1}
          neutral={0}
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => patch({ vignette: v })}
        />
        <Slider
          label="Soften (blur)"
          value={adj.blur}
          min={0}
          max={8}
          step={0.1}
          neutral={0}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patch({ blur: v })}
        />
      </Section>

      {/* Graduated wash */}
      <Section title="Graduated wash">
        <label className="flex items-center gap-2 text-[12px] cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={adj.gradientEnabled}
            onChange={(e) => patch({ gradientEnabled: e.target.checked })}
            className="accent-accent"
          />
          Enable colour gradient overlay
        </label>
        {adj.gradientEnabled && (
          <div className="space-y-3 pl-1">
            <div className="flex items-center gap-2">
              <div className="eyebrow flex-1">Colour</div>
              <input
                type="color"
                value={adj.gradientColor}
                onChange={(e) => patch({ gradientColor: e.target.value })}
                className="w-8 h-8 rounded border border-border bg-transparent cursor-pointer"
              />
            </div>
            <Slider
              label="Strength"
              value={adj.gradientOpacity}
              min={0}
              max={1}
              step={0.01}
              neutral={0}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(v) => patch({ gradientOpacity: v })}
            />
            <Slider
              label="Angle"
              value={adj.gradientAngle}
              min={0}
              max={360}
              step={1}
              neutral={180}
              format={(v) => `${Math.round(v)}°`}
              onChange={(v) => patch({ gradientAngle: v })}
            />
            <div className="text-[10.5px] text-neutral-500">
              Great for deepening a washed-out sky or adding mood to a floor.
            </div>
          </div>
        )}
      </Section>

      <div className="text-[10.5px] text-neutral-500 border-t border-border pt-3">
        Adjustments are non-destructive — they never alter your original
        photo, apply live in the viewer, and can be reset anytime.
      </div>
    </div>
  );
}

/* ------------------------------ atoms --------------------------------- */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-400">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  neutral,
  format,
  trackGradient,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  neutral: number;
  format: (v: number) => string;
  trackGradient?: string;
  onChange: (v: number) => void;
}) {
  const isNeutral = Math.abs(value - neutral) < step / 2;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-neutral-300">{label}</span>
        <button
          onClick={() => onChange(neutral)}
          className={`text-[11px] tabular-nums ${
            isNeutral ? "text-neutral-500" : "text-accent"
          } hover:underline`}
          title="Double-click value to reset"
        >
          {format(value)}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(neutral)}
        className="w-full accent-accent"
        style={
          trackGradient
            ? {
                background: trackGradient,
                borderRadius: 4,
                height: 4,
              }
            : undefined
        }
      />
    </div>
  );
}
