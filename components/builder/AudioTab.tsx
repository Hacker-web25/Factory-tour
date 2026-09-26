"use client";

/**
 * AudioTab — voice-over / ambient audio for the active scene AND for the
 * whole tour. Upload a file, or record from the microphone, or capture
 * system audio (e.g. Zoom / Google Meet) and confirm/redo before saving.
 * A simple start/end trim + volume + auto-loop live-preview is included.
 */

import { useEffect, useRef, useState } from "react";
import type { Scene, Tour } from "@/lib/types";
import {
  startMicRecording,
  startSystemRecording,
  uploadAudioBlob,
  type ActiveAudioRecorder,
} from "@/lib/audioCapture";
import {
  Mic,
  MonitorSpeaker,
  Upload,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Check,
  Volume2,
} from "lucide-react";

type Scope = "scene" | "tour";

export default function AudioTab({
  tour,
  scene,
  onSceneChange,
  onPatchTour,
}: {
  tour: Tour;
  scene: Scene | null;
  onSceneChange: (s: Scene) => void;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
}) {
  const [scope, setScope] = useState<Scope>("scene");

  if (scope === "scene" && !scene) {
    return (
      <div className="pt-4 text-xs text-neutral-500">
        Select a scene first to attach per-scene audio.
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-4">
      {/* Scope switch */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-panelSoft border border-border rounded-lg">
        <button
          onClick={() => setScope("scene")}
          className={`py-1.5 rounded-md text-[11px] font-medium ${
            scope === "scene"
              ? "bg-accent text-black"
              : "text-neutral-300 hover:text-white"
          }`}
        >
          This scene
        </button>
        <button
          onClick={() => setScope("tour")}
          className={`py-1.5 rounded-md text-[11px] font-medium ${
            scope === "tour"
              ? "bg-accent text-black"
              : "text-neutral-300 hover:text-white"
          }`}
        >
          Entire tour
        </button>
      </div>

      {scope === "tour" && (
        <div className="text-[11px] text-neutral-500 leading-relaxed">
          Tour-wide audio plays continuously across every scene and
          overrides any per-scene clip. Use it for a single voice-over that
          spans the whole tour.
        </div>
      )}
      {scope === "scene" && (
        <div className="text-[11px] text-neutral-500 leading-relaxed">
          Per-scene audio loops while this scene is on screen. The presenter
          will see an audio icon on scenes that have a clip.
        </div>
      )}

      {scope === "scene" && scene ? (
        <SceneAudioPanel
          tour={tour}
          scene={scene}
          onSceneChange={onSceneChange}
        />
      ) : (
        <TourAudioPanel tour={tour} onPatchTour={onPatchTour} />
      )}
    </div>
  );
}

/* --------------------------- Scene-scope panel ------------------------- */

function SceneAudioPanel({
  tour,
  scene,
  onSceneChange,
}: {
  tour: Tour;
  scene: Scene;
  onSceneChange: (s: Scene) => void;
}) {
  const url = scene.ambient_audio_url ?? null;
  const volume = scene.ambient_audio_volume ?? 0.5;
  const trimStart = scene.ambient_audio_trim_start ?? 0;
  const trimEnd = scene.ambient_audio_trim_end ?? null;

  async function commitUrl(nextUrl: string | null) {
    onSceneChange({
      ...scene,
      ambient_audio_url: nextUrl,
      // Reset trim when the clip changes so the old trim doesn't carry
      // over into a completely different recording.
      ambient_audio_trim_start: null,
      ambient_audio_trim_end: null,
    });
  }

  return (
    <>
      <AudioCaptureBlock
        onCommit={async (blob, name) => {
          const publicUrl = await uploadAudioBlob(
            tour.id,
            "scene",
            scene.id,
            blob,
            name
          );
          await commitUrl(publicUrl);
        }}
      />

      {url && (
        <ExistingClipBlock
          url={url}
          volume={volume}
          trimStart={trimStart}
          trimEnd={trimEnd}
          onVolumeChange={(v) =>
            onSceneChange({ ...scene, ambient_audio_volume: v })
          }
          onTrimChange={(s, e) =>
            onSceneChange({
              ...scene,
              ambient_audio_trim_start: s,
              ambient_audio_trim_end: e,
            })
          }
          onRemove={() => commitUrl(null)}
        />
      )}
    </>
  );
}

/* --------------------------- Tour-scope panel -------------------------- */

function TourAudioPanel({
  tour,
  onPatchTour,
}: {
  tour: Tour;
  onPatchTour: (fields: Partial<Tour>) => Promise<void>;
}) {
  const url = tour.ambient_audio_url ?? null;
  const volume = tour.ambient_audio_volume ?? 0.5;
  const trimStart = tour.ambient_audio_trim_start ?? 0;
  const trimEnd = tour.ambient_audio_trim_end ?? null;

  return (
    <>
      <AudioCaptureBlock
        onCommit={async (blob, name) => {
          const publicUrl = await uploadAudioBlob(
            tour.id,
            "tour",
            tour.id,
            blob,
            name
          );
          await onPatchTour({
            ambient_audio_url: publicUrl,
            ambient_audio_trim_start: null,
            ambient_audio_trim_end: null,
          });
        }}
      />

      {url && (
        <ExistingClipBlock
          url={url}
          volume={volume}
          trimStart={trimStart}
          trimEnd={trimEnd}
          onVolumeChange={(v) => onPatchTour({ ambient_audio_volume: v })}
          onTrimChange={(s, e) =>
            onPatchTour({
              ambient_audio_trim_start: s,
              ambient_audio_trim_end: e,
            })
          }
          onRemove={() => onPatchTour({ ambient_audio_url: null })}
        />
      )}
    </>
  );
}

/* --------------------------- Capture block ----------------------------- */

function AudioCaptureBlock({
  onCommit,
}: {
  onCommit: (blob: Blob, name?: string) => Promise<void>;
}) {
  const [source, setSource] = useState<"mic" | "system" | null>(null);
  const [rec, setRec] = useState<ActiveAudioRecorder | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<{
    blob: Blob;
    url: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Timer while recording.
  useEffect(() => {
    if (!rec) return;
    const iv = window.setInterval(() => setElapsed(rec.durationSec()), 250);
    return () => window.clearInterval(iv);
  }, [rec]);

  async function begin(kind: "mic" | "system") {
    setErr(null);
    try {
      const r =
        kind === "mic" ? await startMicRecording() : await startSystemRecording();
      setSource(kind);
      setRec(r);
      setElapsed(0);
    } catch (e: any) {
      setErr(e?.message || "Couldn't start recording");
    }
  }

  async function stop() {
    if (!rec) return;
    const blob = await rec.stop();
    setRec(null);
    setSource(null);
    setPending({ blob, url: URL.createObjectURL(blob) });
  }

  function cancelPending() {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  }

  async function confirmPending() {
    if (!pending) return;
    setSaving(true);
    setErr(null);
    try {
      await onCommit(pending.blob);
      URL.revokeObjectURL(pending.url);
      setPending(null);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setSaving(true);
    try {
      await onCommit(f, f.name);
    } catch (er: any) {
      setErr(er?.message || "Upload failed");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const busy = !!rec || saving;

  return (
    <div className="rounded-lg border border-border bg-panelSoft p-3 space-y-3">
      {/* State: pending review (recorded, not yet saved) */}
      {pending ? (
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400">
            Review recording
          </div>
          <audio
            src={pending.url}
            controls
            className="w-full h-10"
            // eslint-disable-next-line jsx-a11y/media-has-caption
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={cancelPending}
              disabled={saving}
              className="py-2 rounded-md border border-border bg-panelSoft hover:border-neutral-500 text-[12px] text-neutral-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw size={12} /> Redo
            </button>
            <button
              onClick={confirmPending}
              disabled={saving}
              className="py-2 rounded-md bg-accent hover:bg-accentHover text-black text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check size={13} /> {saving ? "Saving…" : "Confirm & add"}
            </button>
          </div>
        </div>
      ) : rec ? (
        /* State: recording in progress */
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            Recording {source === "system" ? "system audio" : "microphone"}
            <span className="ml-auto tabular-nums text-neutral-300">
              {fmt(elapsed)}
            </span>
          </div>
          <button
            onClick={stop}
            className="w-full py-2 rounded-md bg-rose-500 hover:bg-rose-400 text-white text-[12px] font-semibold"
          >
            Stop
          </button>
        </div>
      ) : (
        /* State: idle */
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400">
            Add audio
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => begin("mic")}
              disabled={busy}
              className="py-2 rounded-md border border-border bg-panel hover:border-accent text-[11.5px] text-neutral-200 flex flex-col items-center gap-1"
              title="Record from microphone"
            >
              <Mic size={14} className="text-accent" />
              Microphone
            </button>
            <button
              onClick={() => begin("system")}
              disabled={busy}
              className="py-2 rounded-md border border-border bg-panel hover:border-accent text-[11.5px] text-neutral-200 flex flex-col items-center gap-1"
              title="Capture system / tab audio (Zoom, Meet…)"
            >
              <MonitorSpeaker size={14} className="text-accent" />
              System audio
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="py-2 rounded-md border border-border bg-panel hover:border-accent text-[11.5px] text-neutral-200 flex flex-col items-center gap-1"
              title="Upload an audio file"
            >
              <Upload size={14} className="text-accent" />
              Upload
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={onPickFile}
          />
          <div className="text-[10.5px] text-neutral-500 leading-snug">
            System audio captures a Zoom / Google Meet call. In the browser
            picker, choose the tab you're on and tick <b>Share tab audio</b>{" "}
            — needs Chrome or Edge on desktop.
          </div>
        </div>
      )}

      {err && (
        <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-md px-2.5 py-1.5">
          {err}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Existing clip block ----------------------- */

function ExistingClipBlock({
  url,
  volume,
  trimStart,
  trimEnd,
  onVolumeChange,
  onTrimChange,
  onRemove,
}: {
  url: string;
  volume: number;
  trimStart: number;
  trimEnd: number | null;
  onVolumeChange: (v: number) => void;
  onTrimChange: (start: number, end: number | null) => void;
  onRemove: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Local trim state so the sliders feel responsive; committed on release.
  const [start, setStart] = useState(trimStart);
  const [end, setEnd] = useState<number | null>(trimEnd);

  useEffect(() => {
    setStart(trimStart);
    setEnd(trimEnd);
  }, [trimStart, trimEnd, url]);

  function onLoaded(e: React.SyntheticEvent<HTMLAudioElement>) {
    const d = Math.floor(e.currentTarget.duration || 0);
    setDuration(d);
    if (end == null) setEnd(d);
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.currentTime = start;
      el.play();
    } else {
      el.pause();
    }
  }

  function onTimeUpdate() {
    const el = audioRef.current;
    if (!el) return;
    if (end != null && el.currentTime >= end) {
      el.pause();
      el.currentTime = end;
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panelSoft p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400 flex-1">
          Current clip
          {duration > 0 && (
            <span className="text-neutral-500 normal-case tracking-normal ml-1.5">
              · {fmt(duration)}
            </span>
          )}
        </div>
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-md border border-border bg-panel hover:border-accent grid place-items-center text-accent"
          title={playing ? "Pause preview" : "Preview from trim start"}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={onRemove}
          className="w-8 h-8 rounded-md border border-border bg-panel hover:border-rose-400 grid place-items-center text-rose-300"
          title="Remove clip"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        className="hidden"
      />

      {/* Trim */}
      {duration > 0 && (
        <div className="space-y-2">
          <TrimRow
            label="Trim start"
            value={start}
            min={0}
            max={Math.max(0, (end ?? duration) - 0.5)}
            onChange={setStart}
            onCommit={(v) => onTrimChange(v, end)}
          />
          <TrimRow
            label="Trim end"
            value={end ?? duration}
            min={Math.min(duration, start + 0.5)}
            max={duration}
            onChange={(v) => setEnd(v)}
            onCommit={(v) => onTrimChange(start, v === duration ? null : v)}
          />
          <div className="text-[10.5px] text-neutral-500">
            Playback will run from {fmt(start)} to {fmt(end ?? duration)} —{" "}
            {fmt(Math.max(0, (end ?? duration) - start))} of usable audio.
          </div>
        </div>
      )}

      {/* Volume */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-400">
          <Volume2 size={11} /> Volume{" "}
          <span className="text-neutral-500 normal-case tracking-normal ml-auto">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
    </div>
  );
}

function TrimRow({
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-200">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={Math.max(min, Math.min(max, value))}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onMouseUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
