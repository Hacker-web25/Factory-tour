/* eslint-disable */
/**
 * Whisper Worker — runs OpenAI Whisper (small, in-browser variant) via
 * @xenova/transformers on its own thread so long transcriptions don't
 * freeze the tab.
 *
 * Loaded as a MODULE worker so we can `import` transformers' ESM build
 * directly from jsdelivr (no npm install / bundling needed on our side).
 *
 * Protocol
 *   Main → Worker:
 *     { type: "transcribe", id, samples: Float32Array (16 kHz mono),
 *       language?: 'en'|'auto', model?: 'tiny'|'base' }
 *
 *   Worker → Main:
 *     { type: "progress", id, stage, progress? }        // loading, chunk N/M
 *     { type: "transcribed", id, segments, language }   // done
 *     { type: "error", id, message }
 */

import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm";

// Don't look for models on the same origin — always fetch from HF.
env.allowLocalModels = false;
// Cache model weights in the browser's OPFS so subsequent transcriptions
// don't re-download.
env.useBrowserCache = true;

let transcriberPromise = null;
let currentModelKey = null;

async function loadTranscriber(model, id) {
  const modelKey = `Xenova/whisper-${model || "tiny"}`;
  if (transcriberPromise && currentModelKey === modelKey) return transcriberPromise;

  currentModelKey = modelKey;
  transcriberPromise = (async () => {
    self.postMessage({ type: "progress", id, stage: "loading-model" });
    return await pipeline("automatic-speech-recognition", modelKey, {
      progress_callback: (p) => {
        // p = { status, name, file, progress?, loaded?, total? }
        if (p && typeof p.progress === "number") {
          self.postMessage({
            type: "progress",
            id,
            stage: "downloading-model",
            progress: p.progress / 100,
            file: p.file,
          });
        }
      },
    });
  })();
  return transcriberPromise;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || msg.type !== "transcribe") return;
  const { id, samples, language, model } = msg;

  try {
    const transcriber = await loadTranscriber(model, id);

    self.postMessage({ type: "progress", id, stage: "transcribing" });

    // Sentence-level timestamps. Word-level produced a hallucination
    // loop ("for for for for") on many audio samples with base/tiny
    // models — a known Whisper failure mode when word-timing is
    // combined with padded chunks. Sentence-level is what the model
    // was actually trained on and is dramatically more reliable.
    //
    // If a chunk ends up too long for a readable subtitle, we split
    // it in post-processing below by punctuation + word count.
    const result = await transcriber(samples, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: language && language !== "auto" ? language : "en",
      task: "transcribe",
      // Deterministic output — helps prevent the repeating-word
      // hallucination that "for for for for" comes from.
      temperature: 0,
      no_repeat_ngram_size: 3,
      callback_function: () => {
        self.postMessage({ type: "progress", id, stage: "decoding" });
      },
    });

    // Each chunk is a sentence with its own timestamp range. Split
    // any chunk that's still too long into sub-segments at sentence
    // boundaries so no subtitle line stays on screen for >6 seconds.
    const rawChunks = (result.chunks || [])
      .map((c) => ({
        start: c.timestamp?.[0] ?? 0,
        end: c.timestamp?.[1] ?? 0,
        text: (c.text || "").trim(),
      }))
      .filter((c) => c.text);

    const MAX_CHARS = 90;
    const segments = [];
    for (const chunk of rawChunks) {
      // Split at sentence-ending punctuation. If a sub-sentence is
      // still too long, fall back to a hard character cutoff.
      const sentences = chunk.text
        .split(/(?<=[.!?])\s+/)
        .flatMap((s) => (s.length > MAX_CHARS ? chunkString(s, MAX_CHARS) : [s]))
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length <= 1) {
        segments.push(chunk);
        continue;
      }
      // Distribute the chunk's time range evenly across its sentences
      // by character length — good enough approximation without
      // per-word timestamps.
      const totalChars = sentences.reduce((n, s) => n + s.length, 0);
      const duration = chunk.end - chunk.start;
      let t = chunk.start;
      for (const s of sentences) {
        const share = duration * (s.length / totalChars);
        segments.push({ start: t, end: t + share, text: s });
        t += share;
      }
    }
    function chunkString(s, size) {
      const out = [];
      let i = 0;
      while (i < s.length) {
        // Prefer to cut at the last space before `size`.
        let end = Math.min(i + size, s.length);
        if (end < s.length) {
          const sp = s.lastIndexOf(" ", end);
          if (sp > i + Math.floor(size / 2)) end = sp;
        }
        out.push(s.slice(i, end));
        i = end;
      }
      return out;
    }

    self.postMessage({
      type: "transcribed",
      id,
      segments,
      language: result.language || language || "en",
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      message: err && err.message ? err.message : String(err),
    });
  }
};
