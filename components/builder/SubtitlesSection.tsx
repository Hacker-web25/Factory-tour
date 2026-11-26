"use client";

/**
 * SubtitlesSection — editor panel in the Photo tab.
 *
 * Lists every sound in the tour (tour and scene audio, audio hotspots, uploaded
 * video hotspots). For each one the owner can:
 *   - generate subtitles (the recording is decoded here, cut at quiet moments and sent
 *     to speech-to-text piece by piece; the lines are saved to the language service),
 *   - read and correct the lines (a corrected transcript is never replaced by an
 *     automatic run),
 *   - redo or remove them.
 * New subtitle lines are translated at once into every language the tour offers.
 * The look of the subtitles (position, size, colours) is saved for the whole tour.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, publicUrl } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import { SUPPORTED_LANGUAGES, langMeta } from "@/lib/i18n";
import { AudioPrepError, prepareAudioForWhisper } from "@/lib/audioPrep";
import { LanguageApiError, languageApi, type StoredTranscriptView, type TranscriptMetaView } from "@/lib/language/client";
import { audioKey, canonicalAudioRef } from "@/lib/language/audioKey";
import { TranscribeError, transcribeSamples, vocabularyPrompt } from "@/lib/language/pipeline";
import { normalizeEdited, type Segment } from "@/lib/language/segments";
import { DEFAULT_SUBTITLE_SETTINGS, backgroundCss, colorToHex, resolveSettings, type SubtitleSettings } from "@/lib/language/settings";
import { describeRun, translateEverything } from "@/lib/language/translateAll";
import { canPinLanguage, toWhisperCode } from "@/lib/language/whisperLangs";
import { useT } from "@/lib/TranslationContext";

type Source = {
  kind: "ambient" | "audio-hotspot" | "video-hotspot";
  url: string;
  label: string;
  key: string;
  ref: string;
};

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim();
const fileName = (url: string) => decodeURIComponent(url.split("?")[0].split("/").pop() ?? url);

function messageOf(e: unknown): string {
  if (e instanceof AudioPrepError || e instanceof LanguageApiError || e instanceof TranscribeError) return e.message;
  return (e as Error)?.message || "Something went wrong. Try again.";
}

const minutes = (s: number | null) => (s ? (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`) : "");

export default function SubtitlesSection({ tour }: { tour: Tour & { ambient_audio_url?: string | null } }) {
  const { reload } = useT();
  const [sources, setSources] = useState<Source[]>([]);
  const [items, setItems] = useState<Map<string, TranscriptMetaView>>(new Map());
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [settings, setSettings] = useState<SubtitleSettings>(DEFAULT_SUBTITLE_SETTINGS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pinned, setPinned] = useState<string>("auto");
  const [editKey, setEditKey] = useState<string | null>(null);

  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const loadToken = useRef(0);
  const ambientUrl = tour.ambient_audio_url ?? null;
  const tourTitle = tour.title;
  const tourId = tour.id;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Every sound in the tour, the subtitles saved for them, and the tour's language settings. */
  const refresh = useCallback(async () => {
    const token = ++loadToken.current;
    try {
      const list: Omit<Source, "key" | "ref">[] = [];
      const words: string[] = [tourTitle];
      if (ambientUrl) list.push({ kind: "ambient", url: ambientUrl, label: `Tour audio — ${fileName(ambientUrl)}` });

      const scenesRes = await supabase.from("scenes").select("id, name, ambient_audio_url").eq("tour_id", tourId);
      if (scenesRes.error) throw new Error("Could not read the tour's scenes. Try again.");
      const scenes = (scenesRes.data ?? []) as { id: string; name: string; ambient_audio_url: string | null }[];
      const nameById = new Map(scenes.map((s) => [s.id, s.name]));
      for (const s of scenes) {
        if (s.name) words.push(s.name);
        if (s.ambient_audio_url) list.push({ kind: "ambient", url: s.ambient_audio_url, label: `Scene audio (${s.name}) — ${fileName(s.ambient_audio_url)}` });
      }
      if (scenes.length > 0) {
        const hsRes = await supabase
          .from("hotspots")
          .select("scene_id, type, audio_url, video_url, video_source, label, info_title")
          .in(
            "scene_id",
            scenes.map((s) => s.id)
          );
        if (hsRes.error) throw new Error("Could not read the tour's hotspots. Try again.");
        for (const h of (hsRes.data ?? []) as {
          scene_id: string;
          type: string;
          audio_url: string | null;
          video_url: string | null;
          video_source: string | null;
          label: string | null;
          info_title: string | null;
        }[]) {
          const where = nameById.get(h.scene_id) ?? "Scene";
          const name = h.label || h.info_title || `${h.type} hotspot`;
          if (h.label) words.push(h.label);
          if (h.info_title) words.push(h.info_title);
          if (h.audio_url) list.push({ kind: "audio-hotspot", url: h.audio_url, label: `Audio hotspot in ${where} — ${name}` });
          if (h.video_url && h.video_source === "upload") list.push({ kind: "video-hotspot", url: h.video_url, label: `Video hotspot in ${where} — ${name}` });
        }
      }

      // The same file used twice (or reachable by two addresses) is one entry.
      const seen = new Set<string>();
      const found: Source[] = [];
      for (const s of list) {
        const key = audioKey(s.url, { mediaBase: MEDIA_BASE });
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ ...s, key, ref: canonicalAudioRef(s.url, { mediaBase: MEDIA_BASE }) });
      }

      const [cfg, metas] = await Promise.all([languageApi.config(tourId), languageApi.transcripts(tourId)]);
      if (!mounted.current || token !== loadToken.current) return;
      setSources(found);
      setVocabulary(words);
      setItems(new Map(metas.map((m) => [m.key, m])));
      setSettings(resolveSettings(cfg.config.subtitle_settings));
      setLoadError(null);
      setLoaded(true);
    } catch (e) {
      if (!mounted.current || token !== loadToken.current) return;
      setLoadError(messageOf(e));
    }
  }, [tourId, tourTitle, ambientUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Tell the rest of the editor (viewer preview, translations panel) that subtitles changed. */
  const announce = useCallback(() => {
    reload();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("factour:language-changed"));
  }, [reload]);

  /** Translate the lines of one transcript into every language the tour offers (except the one spoken). */
  async function translateLines(key: string, spokenLanguage: string, signal: AbortSignal): Promise<string> {
    // The languages may have been changed in the Translations panel since this panel loaded.
    const { config } = await languageApi.config(tourId, signal);
    const offeredNow = Array.from(new Set([config.default_language, ...config.available_languages]));
    const targets = offeredNow.filter((l) => l !== spokenLanguage);
    if (targets.length === 0) return "";
    const notes: string[] = [];
    for (const lang of targets) {
      setStage(`Translating the subtitles into ${langMeta(lang).name}…`);
      setProgress({ done: 0, total: 0 });
      const result = await translateEverything({
        tourId,
        lang,
        sourceLang: config.default_language,
        labels: [],
        transcripts: [{ key, language: spokenLanguage }],
        tourTitle,
        mode: "missing",
        api: languageApi,
        signal,
        onProgress: (done, total) => mounted.current && setProgress({ done, total }),
      });
      if (result.subtitles.failed.length > 0 || result.subtitles.quotaHit) notes.push(describeRun(langMeta(lang).name, result));
      if (result.subtitles.quotaHit && result.subtitles.translated === 0) break;
    }
    return notes.join(" ");
  }

  async function job(key: string, work: (signal: AbortSignal) => Promise<string>) {
    if (busyKey) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusyKey(key);
    setStage("Starting…");
    setProgress(null);
    setMsg(null);
    try {
      const text = await work(ctrl.signal);
      if (mounted.current) setMsg({ text });
    } catch (e) {
      const stopped = (e as Error)?.name === "AbortError" || (e instanceof AudioPrepError && e.code === "cancelled");
      if (mounted.current) setMsg(stopped ? { text: "Stopped." } : { text: messageOf(e), bad: true });
    } finally {
      abortRef.current = null;
      if (mounted.current) {
        setBusyKey(null);
        setProgress(null);
        setStage("");
        await refresh();
        announce();
      }
    }
  }

  function generate(src: Source, force: boolean) {
    return job(src.key, async (signal) => {
      setStage("Reading the audio…");
      const audio = await prepareAudioForWhisper(publicUrl(src.url), { signal });
      const language = pinned !== "auto" ? (toWhisperCode(pinned) ?? undefined) : undefined;
      setStage("Turning speech into text…");
      const result = await transcribeSamples({
        tourId,
        samples: audio.samples,
        language,
        prompt: vocabularyPrompt(vocabulary),
        api: languageApi,
        signal,
        onProgress: (p) => mounted.current && setProgress({ done: p.done, total: p.total }),
      });
      if (result.segments.length === 0) {
        return result.silentPieces > 0
          ? "No speech was found — this recording seems to be silent or music only, so no subtitles were made."
          : "No speech was found in this recording, so no subtitles were made.";
      }
      const spoken = pinned !== "auto" ? pinned : result.language || "en";
      setStage("Saving…");
      setProgress(null);
      const saved = await languageApi.saveTranscript(tourId, { key: src.key, ref: src.ref, language: spoken, duration: result.duration, segments: result.segments, force });
      if (!saved.written) return "These subtitles were corrected by you earlier, so the new automatic ones were not saved. Use “Redo” to replace them.";
      const note = await translateLines(src.key, spoken, signal);
      return `${result.segments.length} subtitle lines made in ${langMeta(spoken).name} (${minutes(result.duration)}).${note ? " " + note : ""}`;
    });
  }

  function redo(src: Source) {
    const existing = items.get(src.key);
    if (existing?.reviewed && !window.confirm("You corrected these subtitles by hand. Making them again will replace your corrections. Continue?")) return;
    return generate(src, true);
  }

  function removeTranscript(src: Source) {
    if (!window.confirm(`Delete the subtitles of “${fileName(src.url)}”? The audio itself is not touched.`)) return;
    if (editKey === src.key) setEditKey(null);
    return job(src.key, async () => {
      await languageApi.deleteTranscript(tourId, src.key);
      return "Subtitles deleted.";
    });
  }

  /* ───────── look of the subtitles: saved a moment after the last change ───────── */

  const pending = useRef<Partial<SubtitleSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (Object.keys(patch).length === 0) return;
    try {
      await languageApi.saveConfig(tourId, { subtitle_settings_patch: patch });
      if (mounted.current) {
        setSaveError(null);
        reload();
      }
    } catch (e) {
      pending.current = { ...patch, ...pending.current }; // keep it for the next try
      if (mounted.current) setSaveError(messageOf(e));
    }
  }, [tourId, reload]);

  function change(next: Partial<SubtitleSettings>) {
    setSettings((s) => ({ ...s, ...next }));
    pending.current = { ...pending.current, ...next };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }

  // Leaving the panel never loses the last change.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const patch = pending.current;
      pending.current = {};
      if (Object.keys(patch).length > 0) void languageApi.saveConfig(tourId, { subtitle_settings_patch: patch }).catch(() => {});
    };
  }, [tourId]);

  const kindIcon = (k: Source["kind"]) => (k === "ambient" ? "🔊" : k === "audio-hotspot" ? "🎧" : "🎬");
  const pinnable = useMemo(() => SUPPORTED_LANGUAGES.filter((l) => canPinLanguage(l.code)), []);

  if (loadError && !loaded) {
    return (
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">Subtitles</div>
        <div className="text-[11px] text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded p-2">{loadError}</div>
        <button onClick={refresh} className="mt-2 text-[11px] text-neutral-400 hover:text-neutral-200">
          ↻ Try again
        </button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div>
        <div className="text-xs uppercase text-neutral-400 mb-2">Subtitles</div>
        <div className="text-[11px] text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs uppercase text-neutral-400 mb-2">Subtitles</div>

      <label className="flex items-center gap-2 text-xs mb-2">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
        <span>Show subtitles in the viewer</span>
      </label>

      <label className="block text-[11px] text-neutral-400 mb-2">
        Language spoken in the recordings
        <select
          value={pinned}
          onChange={(e) => setPinned(e.target.value)}
          disabled={!!busyKey}
          className="w-full bg-panelSoft border border-border rounded px-1.5 py-1 text-xs mt-0.5 disabled:opacity-50"
        >
          <option value="auto">Detect automatically</option>
          {pinnable.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName} ({l.name})
            </option>
          ))}
        </select>
        <span className="block text-[10px] text-neutral-500 mt-0.5">Choose the language if automatic detection gets it wrong, or if the recording is short or noisy.</span>
      </label>

      {sources.length === 0 ? (
        <div className="text-[11px] text-neutral-500 border border-dashed border-border rounded p-3 text-center mb-2">
          No audio or video in this tour yet. Add tour audio, an audio hotspot, or upload a video hotspot to make subtitles.
        </div>
      ) : (
        <div className="space-y-1.5 mb-2">
          {sources.map((src) => {
            const item = items.get(src.key);
            const busy = busyKey === src.key;
            return (
              <div key={src.key} className="border border-border rounded bg-panelSoft p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-neutral-300 truncate" title={src.label}>
                      <span className="mr-1">{kindIcon(src.kind)}</span>
                      {src.label}
                    </div>
                    {item && !busy && (
                      <div className="text-[10px] text-emerald-400 mt-0.5">
                        ✓ {item.lines} lines · {langMeta(item.language).name}
                        {item.duration ? ` · ${minutes(item.duration)}` : ""}
                        {item.reviewed && <span className="text-neutral-400"> · corrected by you</span>}
                      </div>
                    )}
                    {busy && <div className="text-[10px] text-neutral-400 mt-0.5">{stage}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {busy ? (
                      <button onClick={() => abortRef.current?.abort()} className="text-[10px] bg-panel border border-border rounded px-2 py-1">
                        Stop
                      </button>
                    ) : item ? (
                      <>
                        <button onClick={() => setEditKey(editKey === src.key ? null : src.key)} disabled={!!busyKey} className="text-[10px] bg-panel border border-border rounded px-2 py-1 disabled:opacity-40">
                          {editKey === src.key ? "Close" : "Edit"}
                        </button>
                        <button onClick={() => redo(src)} disabled={!!busyKey} className="text-[10px] bg-panel border border-border rounded px-2 py-1 disabled:opacity-40" title="Make the subtitles again from the audio">
                          Redo
                        </button>
                        <button onClick={() => removeTranscript(src)} disabled={!!busyKey} className="text-[10px] text-red-400 px-1 disabled:opacity-40" title="Delete the subtitles">
                          ×
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => generate(src, false)}
                        disabled={!!busyKey}
                        className="text-[10px] bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded px-2 py-1 disabled:opacity-40"
                      >
                        🎙 Generate
                      </button>
                    )}
                  </div>
                </div>
                {busy && progress && progress.total > 0 && (
                  <div className="w-full h-1 bg-panel rounded overflow-hidden mt-1.5">
                    <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </div>
                )}
                {editKey === src.key && item && (
                  <LineEditor
                    tourId={tourId}
                    source={src}
                    onSaved={async (spoken) => {
                      await job(src.key, async (signal) => {
                        const note = await translateLines(src.key, spoken, signal);
                        return `Saved.${note ? " " + note : ""}`;
                      });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={refresh} disabled={!!busyKey} className="w-full text-[10px] text-neutral-400 hover:text-neutral-200 mb-2 disabled:opacity-40">
        ↻ Refresh list
      </button>

      {msg && !busyKey && <div className={`text-[11px] mb-2 leading-relaxed ${msg.bad ? "text-amber-300" : "text-neutral-300"}`}>{msg.text}</div>}

      {/* Look */}
      {settings.enabled && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="text-[11px] uppercase text-neutral-400">Style</div>

          <div className="rounded bg-neutral-700/60 p-3 flex items-center justify-center min-h-[56px]">
            <span
              style={{
                background: backgroundCss(settings),
                color: settings.textColor,
                fontSize: Math.min(settings.fontSize, 22),
                padding: `${Math.round(Math.min(settings.fontSize, 22) * 0.35)}px ${Math.round(Math.min(settings.fontSize, 22) * 0.7)}px`,
                borderRadius: 8,
                fontWeight: 500,
                lineHeight: 1.4,
                maxWidth: `${settings.maxWidthPct}%`,
              }}
            >
              Welcome to our factory
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-400">
              Position
              <select
                value={settings.position}
                onChange={(e) => change({ position: e.target.value as SubtitleSettings["position"] })}
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
              <input type="range" min={12} max={40} value={settings.fontSize} onChange={(e) => change({ fontSize: Number(e.target.value) })} className="w-full mt-1.5" />
            </label>
          </div>

          <label className="block text-[11px] text-neutral-400">
            Background opacity ({Math.round(settings.opacity * 100)}%)
            <input type="range" min={0} max={100} value={Math.round(settings.opacity * 100)} onChange={(e) => change({ opacity: Number(e.target.value) / 100 })} className="w-full mt-1.5" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-400">
              Text color
              <input type="color" value={colorToHex(settings.textColor)} onChange={(e) => change({ textColor: e.target.value })} className="w-full h-7 bg-panelSoft border border-border rounded mt-0.5" />
            </label>
            <label className="text-[11px] text-neutral-400">
              Background
              <input type="color" value={colorToHex(settings.bgColor)} onChange={(e) => change({ bgColor: e.target.value })} className="w-full h-7 bg-panelSoft border border-border rounded mt-0.5" />
            </label>
          </div>

          <label className="block text-[11px] text-neutral-400">
            Max width ({settings.maxWidthPct}%)
            <input type="range" min={30} max={100} value={settings.maxWidthPct} onChange={(e) => change({ maxWidthPct: Number(e.target.value) })} className="w-full mt-1.5" />
          </label>
          {saveError && <div className="text-[11px] text-amber-300">{saveError} The change will be tried again with your next edit.</div>}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── line editor ───────────────────────────── */

function stamp(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

function LineEditor({
  tourId,
  source,
  onSaved,
}: {
  tourId: string;
  source: Source;
  onSaved: (spokenLanguage: string) => Promise<void> | void;
}) {
  const [tr, setTr] = useState<StoredTranscriptView | null>(null);
  const [lines, setLines] = useState<Segment[]>([]);
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [shown, setShown] = useState(30);

  useEffect(() => {
    let alive = true;
    languageApi
      .transcript(tourId, source.key)
      .then((t) => {
        if (!alive) return;
        if (!t) {
          setError("These subtitles no longer exist.");
          return;
        }
        setTr(t);
        setLines(t.segments);
        setLanguage(t.language);
      })
      .catch((e) => alive && setError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [tourId, source.key]);

  function edit(i: number, patch: Partial<Segment>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  async function save() {
    if (!tr) return;
    const clean = normalizeEdited(lines);
    if (clean.length === 0) {
      setError("Subtitles need at least one line. Use × on the audio to delete them instead.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await languageApi.saveTranscript(tourId, { key: source.key, ref: source.ref, language, duration: tr.duration, segments: clean, reviewed: true });
      setLines(clean);
      setDirty(false);
      await onSaved(language);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  if (error && !tr) return <div className="mt-2 text-[11px] text-amber-300">{error}</div>;
  if (!tr) return <div className="mt-2 text-[11px] text-neutral-500">Loading lines…</div>;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <label className="block text-[10px] text-neutral-400 mb-1.5">
        Language spoken
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            setDirty(true);
          }}
          className="w-full bg-panel border border-border rounded px-1.5 py-1 text-[11px] mt-0.5"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName} ({l.name})
            </option>
          ))}
        </select>
      </label>
      <div className="text-[10px] text-neutral-500 mb-1.5">After saving, any changed line is translated again for visitors.</div>
      {error && <div className="text-[11px] text-amber-300 mb-1">{error}</div>}
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} className="bg-panel border border-border rounded p-1.5">
            <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1">
              <input
                type="number"
                step={0.1}
                min={0}
                value={Number(l.start.toFixed(2))}
                onChange={(e) => edit(i, { start: Number(e.target.value) })}
                className="w-14 bg-panelSoft border border-border rounded px-1 py-0.5 text-[10px] text-neutral-200"
                aria-label="Start (seconds)"
              />
              <span>→</span>
              <input
                type="number"
                step={0.1}
                min={0}
                value={Number(l.end.toFixed(2))}
                onChange={(e) => edit(i, { end: Number(e.target.value) })}
                className="w-14 bg-panelSoft border border-border rounded px-1 py-0.5 text-[10px] text-neutral-200"
                aria-label="End (seconds)"
              />
              <span className="ml-1">{stamp(l.start)}</span>
              <button
                onClick={() => {
                  setLines((ls) => ls.filter((_, j) => j !== i));
                  setDirty(true);
                }}
                className="ml-auto text-red-400 hover:text-red-300 px-1"
                title="Delete this line"
              >
                ×
              </button>
            </div>
            <textarea
              value={l.text}
              onChange={(e) => edit(i, { text: e.target.value })}
              rows={Math.min(4, Math.max(1, Math.ceil(l.text.length / 36)))}
              className="w-full bg-panelSoft border border-border rounded px-1.5 py-1 text-xs outline-none resize-y"
              dir="auto"
            />
          </div>
        ))}
      </div>
      {lines.length > shown && (
        <button onClick={() => setShown((n) => n + 30)} className="w-full text-[10px] text-neutral-400 hover:text-neutral-200 mt-1.5">
          Show more ({lines.length - shown} left)
        </button>
      )}
      <div className="flex justify-end gap-1.5 mt-2">
        <button
          onClick={() => {
            if (tr) {
              setLines(tr.segments);
              setLanguage(tr.language);
              setDirty(false);
              setError(null);
            }
          }}
          disabled={!dirty || saving}
          className="text-[10px] bg-panel border border-border rounded px-2 py-1 disabled:opacity-40"
        >
          Undo changes
        </button>
        <button onClick={save} disabled={!dirty || saving} className="text-[10px] bg-accent text-black font-medium rounded px-2 py-1 disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
