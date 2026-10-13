/**
 * Preset sound effects generated on-the-fly with the Web Audio API — no
 * bundled MP3s, no CDN roundtrip. Users can also point to their own uploaded
 * MP3 via `playCustom(url)`.
 */

import type { SoundEffect } from "./types";

export const PRESET_SOUNDS: { key: SoundEffect; label: string }[] = [
  { key: "none", label: "None" },
  { key: "click", label: "Click" },
  { key: "ding", label: "Ding" },
  { key: "pop", label: "Pop" },
  { key: "whoosh", label: "Whoosh" },
  { key: "success", label: "Success" },
  { key: "custom", label: "Custom upload" },
];

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!audioCtx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx!;
}

function beep(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25) {
  const c = ctx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

function noise(dur: number, vol = 0.2) {
  const c = ctx();
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(filt).connect(g).connect(c.destination);
  src.start();
}

export function playPreset(name: SoundEffect) {
  try {
    switch (name) {
      case "click":
        beep(1400, 0.06, "square", 0.15);
        break;
      case "ding":
        beep(1200, 0.35, "sine", 0.25);
        setTimeout(() => beep(1800, 0.25, "sine", 0.15), 20);
        break;
      case "pop": {
        const c = ctx();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.12);
        g.gain.setValueAtTime(0.3, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
        osc.connect(g).connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.16);
        break;
      }
      case "whoosh":
        noise(0.35, 0.25);
        break;
      case "success":
        beep(660, 0.12, "sine", 0.2);
        setTimeout(() => beep(880, 0.2, "sine", 0.22), 120);
        break;
      case "none":
      default:
        break;
    }
  } catch {
    /* audio may be blocked before first user gesture — ignore */
  }
}

export async function playCustom(url: string, volume = 1) {
  try {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume));
    await a.play();
  } catch {
    /* ignore */
  }
}

export function playHotspotSound(
  kind: SoundEffect,
  customUrl?: string | null
) {
  if (!kind || kind === "none") return;
  if (kind === "custom") {
    if (customUrl) playCustom(customUrl);
    return;
  }
  playPreset(kind);
}
