"use client";

/**
 * Audio capture helpers for the tour editor's Audio tab.
 *
 *   • startMicRecording()    — records the presenter's microphone
 *   • startSystemRecording() — captures SYSTEM / TAB audio via getDisplayMedia
 *     so Zoom / Google Meet conversations can be recorded straight from the
 *     browser. Requires the user to tick "Share tab audio" (Chrome/Edge).
 *   • uploadAudioBlob()      — uploads a recorded blob to Supabase Storage
 *     and returns the public URL, ready to store on scene.ambient_audio_url.
 *
 * All best-effort; every function rejects with a plain Error the caller
 * can surface to the user.
 */

import { supabase } from "@/lib/supabase";

export type ActiveAudioRecorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  durationSec: () => number;
};

function pickMime(): string | undefined {
  const cands = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  const MR = (window as any).MediaRecorder;
  if (!MR?.isTypeSupported) return undefined;
  return cands.find((c) => MR.isTypeSupported(c));
}

function wrapRecorder(stream: MediaStream): ActiveAudioRecorder {
  const mimeType = pickMime();
  const rec = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined
  );
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.start(1000);
  const startedAt = Date.now();

  return {
    durationSec: () => Math.round((Date.now() - startedAt) / 1000),
    cancel() {
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
    },
    stop() {
      return new Promise<Blob>((resolve) => {
        const finish = () => {
          const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
          stream.getTracks().forEach((t) => t.stop());
          resolve(blob);
        };
        if (rec.state === "inactive") finish();
        else {
          rec.onstop = finish;
          try {
            rec.stop();
          } catch {
            finish();
          }
        }
      });
    },
  };
}

/** Straight microphone recording. */
export async function startMicRecording(): Promise<ActiveAudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return wrapRecorder(stream);
}

/** System / tab-audio recording via getDisplayMedia. Prompts the user to
 *  share a screen / window / tab AND tick "Share tab audio" — that's the
 *  path to capturing a Zoom or Google Meet conversation from the browser.
 *  Rejects if the user leaves the audio checkbox off. */
export async function startSystemRecording(): Promise<ActiveAudioRecorder> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      "This browser can't capture system audio. Use latest Chrome or Edge on desktop."
    );
  }
  // Request video too — the browser only exposes the "Share tab audio"
  // checkbox on the picker when video is asked for. We drop the video
  // track immediately after so nothing is recorded from the screen.
  const raw = await (navigator.mediaDevices as any).getDisplayMedia({
    audio: {
      // Ask Chrome for the highest-fidelity system audio it will give.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: true,
  });

  // Kill the video track (we only wanted audio) and confirm audio exists.
  raw.getVideoTracks().forEach((t: MediaStreamTrack) => {
    try {
      t.stop();
    } catch {}
    raw.removeTrack(t);
  });
  const audioTracks = raw.getAudioTracks();
  if (audioTracks.length === 0) {
    raw.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    throw new Error(
      "No audio was shared. In the picker, tick 'Share tab audio' and try again."
    );
  }
  return wrapRecorder(raw);
}

/** Upload a recorded / picked audio Blob and return its public URL. */
export async function uploadAudioBlob(
  tourId: string,
  scope: "tour" | "scene",
  scopeId: string,
  blob: Blob,
  originalName?: string
): Promise<string> {
  const ext = extFor(blob.type, originalName);
  const path = `tour-audio/${tourId}/${scope}-${scopeId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("tours")
    .upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: true,
    });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("tours").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Uploaded but couldn't get a URL.");
  return data.publicUrl;
}

function extFor(mime: string, originalName?: string): string {
  if (originalName?.includes(".")) {
    return originalName.split(".").pop()!.toLowerCase();
  }
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}
