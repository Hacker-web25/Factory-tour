/**
 * Audio preprocessing for Whisper.
 *
 * Whisper expects a Float32Array of mono PCM samples at 16 kHz. Browser
 * audio comes in every conceivable format (mp3, m4a, wav, ogg), stereo,
 * arbitrary sample rate. This helper downloads any URL, decodes it via
 * the Web Audio API, downmixes to mono, and resamples to 16 kHz.
 *
 * Runs on the main thread (short-lived, uses OfflineAudioContext which
 * is off-thread internally). Yields a Float32Array ready to post to the
 * Whisper worker.
 */

const WHISPER_SR = 16000;

export type PreparedAudio = {
  samples: Float32Array; // 16 kHz mono
  duration: number;      // seconds
};

export async function prepareAudioForWhisper(
  audioUrl: string
): Promise<PreparedAudio> {
  // 1. Fetch bytes.
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Audio fetch failed: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  // 2. Decode into an AudioBuffer using an AudioContext.
  //    (Some browsers only support decodeAudioData on a real AudioContext,
  //     not OfflineAudioContext, so we use one throw-away AudioContext.)
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const decodeCtx = new AC();
  const decoded: AudioBuffer = await new Promise((resolve, reject) =>
    decodeCtx.decodeAudioData(arrayBuffer, resolve, reject)
  );
  decodeCtx.close();

  // 3. Downmix + resample via OfflineAudioContext at 16 kHz.
  const durationSec = decoded.duration;
  const targetLen = Math.max(1, Math.ceil(durationSec * WHISPER_SR));
  const offline = new OfflineAudioContext(1, targetLen, WHISPER_SR);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();

  // Channel 0 is mono after OfflineAudioContext(1, ...).
  return {
    samples: rendered.getChannelData(0).slice(),
    duration: durationSec,
  };
}

/** SHA-1 hex of a URL — used as cache key for the transcript row. */
export async function sha1OfUrl(url: string): Promise<string> {
  const buf = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
