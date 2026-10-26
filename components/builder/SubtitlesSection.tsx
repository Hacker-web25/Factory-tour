"use client";

/**
 * SubtitlesSection — editor UI in the Photo tab.
 *
 * Enumerates EVERY audio/video source in the tour (tour ambient audio,
 * audio hotspots, uploaded video hotspots) and lets the owner generate
 * subtitles for each one. The tour-level subtitle_settings JSON controls
 * how they render in the viewer (font, position, opacity, colours).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import {
  getCachedTranscript,
  transcribeAudio,
  type TranscribeStage,
} from "@/lib/whisperWorker";
import { sha1OfUrl } from "@/lib/audioPrep";

type SubtitleSettings = {
  enabled: boolean;
  position: "bottom-center" | "top-center" | "bottom-left" | "bottom-right";
  fontSize: number;
  opacity: number;
  bgColor: string;
  textColor: string;
  maxWidthPct: number;
};

const DEFAULT_SETTINGS: SubtitleSettings = {
  enabled: true,
  position: "bottom-center",
  fontSize: 20,
  opacity: 0.85,
  bgColor: "rgba(0,0,0,0.7)",
  textColor: "#ffffff",
  maxWidthPct: 80,
};

type Source = {
  kind: "ambient" | "audio-hotspot" | "video-hotspot";
  url: string;
  label: string;
};

type ModelChoice = "tiny" | "base" | "small";
const MODEL_META: Record<
  ModelChoice,
  { label: string; size: string; note: string }
> = {
  tiny: {
    label: "Tiny",
    size: "~40 MB",
    note: "Fast. Misses quiet or noisy speech.",
  },
  base: {
    label: "Base",
    size: "~145 MB",
    note: "Recommended. Good balance.",
  },
  small: {
    label: "Small",
    size: "~490 MB",
    note: "Slowest, most accurate.",
  },
};

export default function SubtitlesSection({
  tour,
  onPatchTour,
}: {
  tour: Tour & {
    subtitle_settings?: Partial<SubtitleSettings> | null;
    ambient_audio_url?: string | null;
  };
  onPatchTour: (patch: Partial<Tour>) => void;
}) {
  const settings: SubtitleSettings = {
    ...DEFAULT_SETTINGS,
    ...(tour.subtitle_settings ?? {}),
  };

  const [sources, setSources] = useState<Source[]>([]);
  const [transcripts, setTranscripts] = useState<Map<string, number>>(
    new Map()
  );
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<TranscribeStage | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [model, setModel] = useState<ModelChoice>("base");

  // Fetch all audio + video sources across the tour.
  const refreshSources = useCallback(async () => {
    const list: Source[] = [];
    if (tour.ambient_audio_url) {
      list.push({
        kind: "ambient",
        url: tour.ambient_audio_url,
        label: `Ambient audio — ${tour.ambient_audio_url.split("/").pop()}`,
      });
    }
    const { data: scenes } = await supabase
      .from("scenes")
      .select("id, name")
      .eq("tour_id", tour.id);
    const sceneIds = (scenes ?? []).map((s: any) => s.id);
    const nameById = new Map<string, string>(
      (scenes ?? []).map((s: any) => [s.id, s.name])
    );

    // Include per-scene ambient audio too so those can be transcribed.
    const { data: sceneAudios } = await supabase
      .from("scenes")
      .select("id, name, ambient_audio_url")
      .eq("tour_id", tour.id)
      .not("ambient_audio_url", "is", null);
    for (const s of sceneAudios ?? []) {
      if ((s as any).ambient_audio_url) {
        list.push({
          kind: "ambient",
          url: (s as any).ambient_audio_url,
          label: `Scene audio (${(s as any).name}) — ${(s as any).ambient_audio_url.split("/").pop()}`,
        });
      }
    }

    if (sceneIds.length > 0) {
      const { data: hotspots } = await supabase
        .from("hotspots")
        .select("scene_id, type, audio_url, video_url, video_source, label, info_title")
        .in("scene_id", sceneIds);

      for (const h of hotspots ?? []) {
        const hh = h as any;
        const sceneName = nameById.get(hh.scene_id) ?? "Scene";
        const hotspotName =
          hh.label || hh.info_title || `${hh.type} hotspot`;
        if (hh.audio_url) {
          list.push({
            kind: "audio-hotspot",
            url: hh.audio_url,
            label: `Audio hotspot in ${sceneName} — ${hotspotName}`,
          });
        }
        if (hh.video_url && hh.video_source === "upload") {
          list.push({
            kind: "video-hotspot",
            url: hh.video_url,
            label: `Video hotspot in ${sceneName} — ${hotspotName}`,
          });
        }
      }
    }

    // Dedupe by URL — same file used twice = one entry.
    const seen = new Set<string>();
    const deduped = list.filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });
    setSources(deduped);
  }, [tour.id, tour.ambient_audio_url]);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  // Check which sources already have transcripts (segment counts).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = new Map<string, number>();
      for (const s of sources) {
        const r = await getCachedTranscript(s.url).catch(() => null);
        if (r) results.set(s.url, r.segments.length);
      }
      if (!cancelled) setTranscripts(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [sources]);

  async function generateFor(src: Source) {
    setBusyUrl(src.url);
    setStage(null);
    setProgress(null);
    setMsg(null);
    try {
      const result = await transcribeAudio({
        audioUrl: src.url,
        tourId: tour.id,
        model,
        onStage: (s, p) => {
          setStage(s);
          setProgress(typeof p === "number" ? p : null);
        },
      });
      setTranscripts((m) => {
        const next = new Map(m);
        next.set(src.url, result.segments.length);
        return next;
      });
      setMsg(
        result.cached
          ? `${src.label}: loaded from cache.`
          : `${src.label}: ${result.segments.length} segments (detected ${result.language.toUpperCase()}).`
      );
    } catch (e: any) {
      console.error("[subtitles] generate failed", e);
      setMsg(`Failed: ${e?.message ?? "unknown"}`);
    } finally {
      setBusyUrl(null);
      setStage(null);
      setProgress(null);
    }
  }

  async function regenerateFor(src: Source) {
    const hash = await sha1OfUrl(src.url);
    await supabase
      .from("audio_transcripts")
      .delete()
      .eq("audio_url_hash", hash);
    await generateFor(src);
  }

  function patch(next: Partial<SubtitleSettings>) {
    const merged = { ...settings, ...next };
    onPatchTour({ subtitle_settings: merged } as unknown as Partial<Tour>);
  }

  const stageLabel = (() => {
    switch (stage) {
      case "preparing-audio": return "Preparing audio…";
      case "loading-model":   return "Loading model…";
      case "downloading-model":
        return progress != null
          ? `Downloading Whisper ${Math.round(progress * 100)}%…`
          : "Downloading Whisper model…";
      case "transcribing":    return "Transcribing…";
      case "decoding":        return "Decoding…";
      case "saving":          return "Saving…";
      default:                return "Working…";
    }
  })();

  const kindIcon = (k: Source["kind"]) =>
    k === "ambient" ? "🔊" : k === "audio-hotspot" ? "🎧" : "🎬";

  return (
    <div>
      <div className="text-xs uppercase text-neutral-400 mb-2">
        Subtitles
      </div>

      {/* Enable toggle */}
      <label className="flex items-center gap-2 text-xs mb-2">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        <span>Show subtitles in the viewer</span>
      </label>

      {/* Model quality selector — bigger models catch quieter speech
          and misheard words but download slower on first use. */}
      <div className="mb-2">
        <div className="text-[11px] uppercase text-neutral-400 mb-1">
          Model quality
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(MODEL_META) as ModelChoice[]).map((k) => (
            <button
              key={k}
              onClick={() => setModel(k)}
              className={`text-[11px] rounded py-1.5 border ${
                model === k
                  ? "bg-accent text-black font-medium border-accent"
                  : "bg-panelSoft text-neutral-300 border-border hover:border-neutral-500"
              }`}
              title={MODEL_META[k].note}
            >
              {MODEL_META[k].label}
              <div className="text-[9px] opacity-70">
                {MODEL_META[k].size}
              </div>
            </button>
          ))}
        </div>
        <div className="text-[10px] text-neutral-500 mt-1">
          {MODEL_META[model].note}
        </div>
      </div>

      {/* Source list */}
      {sources.length === 0 ? (
        <div className="text-[11px] text-neutral-500 border border-dashed border-border rounded p-3 text-center mb-2">
          No audio or video sources in this tour yet. Add ambient audio,
          an audio hotspot, or upload a video hotspot to enable subtitles.
        </div>
      ) : (
        <div className="space-y-1.5 mb-2">
          {sources.map((src) => {
            const cached = transcripts.has(src.url);
            const busy = busyUrl === src.url;
            return (
              <div
                key={src.url}
                className="border border-border rounded bg-panelSoft p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-neutral-300 truncate">
                      <span className="mr-1">{kindIcon(src.kind)}</span>
                      {src.label}
                    </div>
                    {cached && (
                      <div className="text-[10px] text-emerald-400 mt-0.5">
                        ✓ {transcripts.get(src.url)} segments cached
                      </div>
                    )}
                    {busy && (
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {stageLabel}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {cached ? (
                      <button
                        onClick={() => regenerateFor(src)}
                        disabled={!!busyUrl}
                        className="text-[10px] bg-panel border border-border rounded px-2 py-1 disabled:opacity-40"
                        title="Delete cache and re-transcribe"
                      >
                        Redo
                      </button>
                    ) : (
                      <button
                        onClick={() => generateFor(src)}
                        disabled={!!busyUrl}
                        className="text-[10px] bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded px-2 py-1 disabled:opacity-40"
                      >
                        {busy ? "…" : "🎙 Generate"}
                      </button>
                    )}
                  </div>
                </div>
                {busy && progress != null && (
                  <div className="w-full h-1 bg-panel rounded overflow-hidden mt-1">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={refreshSources}
        className="w-full text-[10px] text-neutral-400 hover:text-neutral-200 mb-2"
      >
        ↻ Refresh sources
      </button>

      {msg && !busyUrl && (
        <div className="text-[11px] text-neutral-400 mb-2">{msg}</div>
      )}

      {/* Style settings */}
      {settings.enabled && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="text-[11px] uppercase text-neutral-400">Style</div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-400">
              Position
              <select
                value={settings.position}
                onChange={(e) =>
                  patch({ position: e.target.value as SubtitleSettings["position"] })
                }
                className="w-full bg-panelSoft border border-border rounded px-1.5 py-1 text-xs mt-0.5"
              >
                <option value="bottom-center">Bottom center</option>
                <option value="top-center">Top center</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </label>

            <label className="text-[11px] text-neutral-400">
              Font size ({settings.fontSize}px)
              <input
                type="range"
                min={12}
                max={40}
                value={settings.fontSize}
                onChange={(e) =>
                  patch({ fontSize: Number(e.target.value) })
                }
                className="w-full mt-1.5"
              />
            </label>
          </div>

          <label className="block text-[11px] text-neutral-400">
            Background opacity ({Math.round(settings.opacity * 100)}%)
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.opacity * 100)}
              onChange={(e) =>
                patch({ opacity: Number(e.target.value) / 100 })
              }
              className="w-full mt-1.5"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-400">
              Text color
              <input
                type="color"
                value={settings.textColor}
                onChange={(e) => patch({ textColor: e.target.value })}
                className="w-full h-7 bg-panelSoft border border-border rounded mt-0.5"
              />
            </label>
            <label className="text-[11px] text-neutral-400">
              Background
              <input
                type="color"
                value={rgbaToHex(settings.bgColor)}
                onChange={(e) =>
                  patch({
                    bgColor: hexToRgba(e.target.value, settings.opacity),
                  })
                }
                className="w-full h-7 bg-panelSoft border border-border rounded mt-0.5"
              />
            </label>
          </div>

          <label className="block text-[11px] text-neutral-400">
            Max width ({settings.maxWidthPct}%)
            <input
              type="range"
              min={30}
              max={100}
              value={settings.maxWidthPct}
              onChange={(e) =>
                patch({ maxWidthPct: Number(e.target.value) })
              }
              className="w-full mt-1.5"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function rgbaToHex(rgba: string): string {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 10));
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
      .join("")
  );
}
function hexToRgba(hex: string, alpha = 0.7): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
