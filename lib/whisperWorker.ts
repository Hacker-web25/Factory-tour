/**
 * Typed client wrapper for the Whisper transcription worker.
 *
 * The worker is a MODULE worker so it can `import` @xenova/transformers
 * directly from a CDN — no bundling needed. Main-thread stays smooth
 * even during the ~50 MB model download and the CPU-heavy inference.
 */

import { prepareAudioForWhisper, sha1OfUrl } from "@/lib/audioPrep";
import { supabase } from "@/lib/supabase";

export type Segment = { start: number; end: number; text: string };

export type TranscribeStage =
  | "idle"
  | "preparing-audio"
  | "loading-model"
  | "downloading-model"
  | "transcribing"
  | "decoding"
  | "saving"
  | "done"
  | "error";

let worker: Worker | null = null;
const pending = new Map<
  string,
  {
    resolve: (r: { segments: Segment[]; language: string }) => void;
    reject: (e: Error) => void;
    onStage?: (s: TranscribeStage, progress?: number) => void;
  }
>();

// Bump when whisper-worker.js changes so browsers refetch instead of
// running a stale cached copy.
const WHISPER_WORKER_VERSION = "3";

function getWorker(): Worker {
  if (worker) return worker;
  // MODULE worker — required because whisper-worker.js uses `import`.
  worker = new Worker(
    `/whisper-worker.js?v=${WHISPER_WORKER_VERSION}`,
    { type: "module" }
  );
  worker.onmessage = (e: MessageEvent) => {
    const d = e.data as any;
    if (!d || !d.id) return;
    const p = pending.get(d.id);
    if (!p) return;
    if (d.type === "progress") {
      const stageMap: Record<string, TranscribeStage> = {
        "loading-model": "loading-model",
        "downloading-model": "downloading-model",
        "transcribing": "transcribing",
        "decoding": "decoding",
      };
      const s = stageMap[d.stage] ?? "transcribing";
      p.onStage?.(s, d.progress);
    } else if (d.type === "transcribed") {
      pending.delete(d.id);
      p.resolve({ segments: d.segments as Segment[], language: d.language });
    } else if (d.type === "error") {
      pending.delete(d.id);
      p.reject(new Error(d.message ?? "Whisper failed"));
    }
  };
  worker.onerror = (e) => {
    console.error("[whisper worker] fatal", e);
    for (const p of pending.values()) p.reject(new Error("Worker crashed"));
    pending.clear();
  };
  return worker;
}

function newId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Transcribe an audio URL. Returns cached segments if we've done this
 * URL before (from the audio_transcripts table); otherwise runs Whisper,
 * upserts the result, and returns it.
 *
 * `onStage` reports progress so the editor can render "Downloading model
 * 47%" → "Transcribing…" → "Saving…" → done.
 */
export async function transcribeAudio(opts: {
  audioUrl: string;
  tourId?: string;
  model?: "tiny" | "base" | "small";
  language?: "auto" | string;
  onStage?: (s: TranscribeStage, progress?: number) => void;
}): Promise<{ segments: Segment[]; language: string; cached: boolean }> {
  const {
    audioUrl,
    tourId,
    model = "tiny",
    language = "auto",
    onStage,
  } = opts;

  const hash = await sha1OfUrl(audioUrl);

  // Cache lookup — skip the whole pipeline if we've already transcribed
  // this exact URL. New audio at a different URL gets its own row.
  const { data: existing } = await supabase
    .from("audio_transcripts")
    .select("segments, source_lang")
    .eq("audio_url_hash", hash)
    .maybeSingle();
  if (existing && (existing as any).segments) {
    return {
      segments: (existing as any).segments as Segment[],
      language: (existing as any).source_lang ?? "en",
      cached: true,
    };
  }

  // Prepare audio (fetch + decode + resample to 16 kHz mono).
  onStage?.("preparing-audio");
  const prep = await prepareAudioForWhisper(audioUrl);

  // Send to worker.
  const w = getWorker();
  const id = newId();
  const result = await new Promise<{ segments: Segment[]; language: string }>(
    (resolve, reject) => {
      pending.set(id, { resolve, reject, onStage });
      // Transferable Float32Array — zero-copy.
      w.postMessage(
        {
          type: "transcribe",
          id,
          samples: prep.samples,
          language,
          model,
        },
        [prep.samples.buffer]
      );
    }
  );

  // Save to cache. Normalize source_lang — Whisper occasionally returns
  // "auto" or an unexpected value; MyMemory rejects anything not a
  // valid ISO 639-1 code, so default to "en" when in doubt.
  const validCode = /^[a-z]{2}(-[A-Z]{2})?$/i.test(String(result.language ?? ""));
  const cleanLang = validCode ? String(result.language) : "en";
  onStage?.("saving");
  await supabase.from("audio_transcripts").upsert(
    [
      {
        audio_url_hash: hash,
        audio_url: audioUrl,
        source_lang: cleanLang,
        segments: result.segments,
        duration_sec: prep.duration,
        tour_id: tourId ?? null,
      },
    ],
    { onConflict: "audio_url_hash" }
  );

  onStage?.("done");
  return { ...result, cached: false };
}

/** Fetch cached transcript for an audio URL, or null if none exists. */
export async function getCachedTranscript(
  audioUrl: string
): Promise<{ segments: Segment[]; language: string } | null> {
  const hash = await sha1OfUrl(audioUrl);
  const { data } = await supabase
    .from("audio_transcripts")
    .select("segments, source_lang")
    .eq("audio_url_hash", hash)
    .maybeSingle();
  if (!data) return null;
  return {
    segments: (data as any).segments as Segment[],
    language: (data as any).source_lang ?? "en",
  };
}
