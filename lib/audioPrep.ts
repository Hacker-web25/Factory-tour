/**
 * Turn an audio (or video) address into what speech-to-text needs: 16 kHz mono samples.
 *
 * The recording is fetched and decoded in the owner's own browser, so nothing is
 * uploaded twice and the server never has to decode anything. Browsers decode a
 * whole file at once, so very long recordings are refused up front with a clear
 * message instead of freezing the tab.
 */

export const WHISPER_SR = 16000;

/** Larger files than this are refused before downloading all of them. */
export const MAX_AUDIO_BYTES = 120 * 1024 * 1024;
/** Longer recordings than this are refused after decoding (the free speech allowance would not cover them anyway). */
export const MAX_AUDIO_SECONDS = 90 * 60;

export type PreparedAudio = {
  samples: Float32Array; // 16 kHz mono
  duration: number; // seconds
};

export type AudioPrepCode = "fetch_failed" | "too_large" | "too_long" | "undecodable" | "unsupported" | "cancelled";

export class AudioPrepError extends Error {
  constructor(
    public code: AudioPrepCode,
    message: string
  ) {
    super(message);
  }
}

function abortIf(signal?: AbortSignal) {
  if (signal?.aborted) throw new AudioPrepError("cancelled", "Cancelled");
}

/** Average the channels into one. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice();
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  const k = 1 / channels.length;
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] * k;
  return out;
}

export async function prepareAudioForWhisper(audioUrl: string, opts: { signal?: AbortSignal } = {}): Promise<PreparedAudio> {
  const { signal } = opts;

  // 1. Fetch the bytes.
  let res: Response;
  try {
    res = await fetch(audioUrl, { signal });
  } catch (e) {
    abortIf(signal);
    throw new AudioPrepError("fetch_failed", "The audio file could not be downloaded. Check your connection and try again.");
  }
  if (!res.ok) throw new AudioPrepError("fetch_failed", `The audio file could not be downloaded (error ${res.status}).`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    throw new AudioPrepError("too_large", `This file is ${Math.round(declared / 1048576)} MB. Subtitles work on files up to ${Math.round(MAX_AUDIO_BYTES / 1048576)} MB — upload a shorter or lighter version.`);
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await res.arrayBuffer();
  } catch {
    abortIf(signal);
    throw new AudioPrepError("fetch_failed", "The audio file stopped downloading part-way. Try again.");
  }
  abortIf(signal);
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new AudioPrepError("too_large", `This file is ${Math.round(bytes.byteLength / 1048576)} MB. Subtitles work on files up to ${Math.round(MAX_AUDIO_BYTES / 1048576)} MB.`);
  }

  // 2. Decode. Asking for a 16 kHz context makes the browser resample while decoding,
  //    which keeps a long recording small in memory; a browser that ignores the
  //    request is handled in step 3.
  const AC: typeof AudioContext | undefined = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new AudioPrepError("unsupported", "This browser cannot read audio files. Use a current Chrome, Edge, Safari or Firefox.");
  let ctx: AudioContext;
  try {
    ctx = new AC({ sampleRate: WHISPER_SR });
  } catch {
    ctx = new AC();
  }
  let decoded: AudioBuffer;
  try {
    decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      // The promise form is not available everywhere; the callback form is.
      ctx.decodeAudioData(bytes, resolve, reject);
    });
  } catch {
    throw new AudioPrepError("undecodable", "This browser could not read the sound in this file. Re-save it as MP3, M4A or WAV and upload it again.");
  } finally {
    void ctx.close().catch(() => {});
  }
  abortIf(signal);

  const duration = decoded.duration;
  if (duration > MAX_AUDIO_SECONDS) {
    throw new AudioPrepError("too_long", `This recording is ${Math.round(duration / 60)} minutes long. Subtitles work on recordings up to ${MAX_AUDIO_SECONDS / 60} minutes — split it into parts.`);
  }
  if (!(duration > 0)) throw new AudioPrepError("undecodable", "This file has no sound in it.");

  // 3. Mono at 16 kHz.
  if (decoded.sampleRate === WHISPER_SR) {
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    return { samples: downmix(channels), duration };
  }
  const length = Math.max(1, Math.ceil(duration * WHISPER_SR));
  const offline = new OfflineAudioContext(1, length, WHISPER_SR);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  abortIf(signal);
  return { samples: rendered.getChannelData(0).slice(), duration };
}
