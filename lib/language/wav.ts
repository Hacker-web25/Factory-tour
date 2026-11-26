/**
 * Getting long audio ready for speech-to-text, in the owner's browser.
 *
 * The browser decodes the file (any format it can play) to 16 kHz mono samples.
 * Those samples are cut into pieces of about 30 seconds — always at a quiet moment,
 * never in the middle of a word — and each piece is written as a small WAV file the
 * Worker can send to Whisper. Pure functions, so they are tested without a browser.
 */

export const SAMPLE_RATE = 16000;

/** 16-bit PCM mono WAV file bytes. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export type Piece = { start: number; end: number };

export type PlanOptions = {
  sampleRate?: number;
  /** Aim for pieces about this long (seconds). */
  target?: number;
  /** Never longer than this. */
  max?: number;
  /** Never shorter than this, except the last. */
  min?: number;
};

/** Average loudness (RMS) of each 20 ms frame. */
function frameLevels(samples: Float32Array, frame: number): Float32Array {
  const n = Math.ceil(samples.length / frame);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const from = f * frame;
    const to = Math.min(samples.length, from + frame);
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, to - from));
  }
  return out;
}

/**
 * Cut the recording into pieces. Each cut is placed in the quietest stretch (about
 * 0.3 s long) between `min` and `max` seconds after the previous cut, preferring
 * the one nearest `target`. The pieces touch end to end: nothing is lost or repeated.
 */
export function planPieces(samples: Float32Array, opts: PlanOptions = {}): Piece[] {
  const sr = opts.sampleRate ?? SAMPLE_RATE;
  const target = opts.target ?? 30;
  const max = opts.max ?? 45;
  const min = Math.min(opts.min ?? 12, target);
  const total = samples.length;
  if (total === 0) return [];
  if (total <= max * sr) return [{ start: 0, end: total }];

  const frame = Math.round(sr * 0.02);
  const levels = frameLevels(samples, frame);
  const span = 15; // 15 frames = 0.3 s of quiet
  const prefix = new Float64Array(levels.length + 1);
  for (let i = 0; i < levels.length; i++) prefix[i + 1] = prefix[i] + levels[i];
  /** Average level of the 0.3 s starting at frame f. */
  const quiet = (f: number) => (prefix[f + span] - prefix[f]) / span;

  const pieces: Piece[] = [];
  let pos = 0;
  while (total - pos > max * sr) {
    const lo = Math.floor((pos + min * sr) / frame);
    const hi = Math.min(levels.length - span, Math.floor((pos + max * sr) / frame) - span);
    const want = (pos + target * sr) / frame;
    let best = -1;
    let bestScore = Infinity;
    for (let f = lo; f <= hi; f++) {
      // quiet wins; closeness to the target breaks near-ties
      const score = quiet(f) + 0.0000005 * Math.abs(f - want);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    // cut in the middle of the quiet stretch
    let cut = best === -1 ? pos + target * sr : Math.round((best + span / 2) * frame);
    cut = Math.min(Math.max(cut, pos + Math.floor(min * sr)), pos + Math.floor(max * sr));
    pieces.push({ start: pos, end: cut });
    pos = cut;
  }
  pieces.push({ start: pos, end: total });
  return pieces;
}

/** True when a piece is so quiet that it holds no speech, so there is no need to pay to transcribe it. */
export function isSilent(samples: Float32Array, from = 0, to = samples.length, threshold = 0.003): boolean {
  let sum = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / n) < threshold;
}

export type WavInfo = { sampleRate: number; channels: number; bits: number; dataBytes: number; seconds: number };

/** Reads the header of a WAV file written by encodeWav (or any plain PCM WAV). Null if it is not one. */
export function readWavInfo(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // walk the chunks to find "fmt " and "data"
  let fmt: { channels: number; sampleRate: number; bits: number; format: number } | null = null;
  let dataBytes = -1;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    if (id === "fmt " && at + 8 + 16 <= bytes.length) {
      fmt = {
        format: v.getUint16(at + 8, true),
        channels: v.getUint16(at + 10, true),
        sampleRate: v.getUint32(at + 12, true),
        bits: v.getUint16(at + 22, true),
      };
    } else if (id === "data") {
      dataBytes = Math.min(size, bytes.length - (at + 8));
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (!fmt || dataBytes < 0 || fmt.format !== 1 || fmt.channels < 1 || fmt.sampleRate < 8000 || fmt.bits !== 16) return null;
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bits: fmt.bits,
    dataBytes,
    seconds: dataBytes / (fmt.sampleRate * fmt.channels * 2),
  };
}
