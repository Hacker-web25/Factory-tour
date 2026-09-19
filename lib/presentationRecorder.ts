"use client";

/**
 * PresentationRecorder — free, browser-native voice capture for a
 * presentation.
 *
 *   • Audio  → MediaRecorder (webm/opus or mp4 on Safari). Stored as a blob.
 *   • Text   → Web Speech API live transcription (Chrome/Edge). Free, no key.
 *              Falls back gracefully to audio-only where unsupported.
 *
 * The presenter's mic is the source, so the transcript is the presenter's
 * speech — exactly what the topic-insight layer analyses. (True two-speaker
 * separation needs a paid diarization engine; the data model leaves room
 * for it later.)
 */

type StopResult = {
  blob: Blob;
  transcript: string;
  durationSec: number;
};

export type ActiveRecorder = {
  stop: () => Promise<StopResult>;
  cancel: () => void;
  /** Current audio + transcript WITHOUT stopping — used for periodic
   *  autosave so a hard tab-close still leaves a recent copy on the server. */
  snapshot: () => StopResult;
  supported: boolean;
};

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window as any).MediaRecorder !== "undefined"
  );
}

/** Begin recording. Returns a handle with stop()/cancel(). Rejects if mic
 *  permission is denied (caller should treat that as "no recording"). */
export async function startRecording(
  lang = "en-IN"
): Promise<ActiveRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const mimeType = pickMime();
  const rec = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined
  );
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.start(1000); // gather in 1s slices so a crash still yields audio
  const startedAt = Date.now();

  // --- Live transcription (best-effort) ---
  let transcript = "";
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  let recognition: any = null;
  let wantTranscribe = false;
  if (SR) {
    try {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = lang;
      wantTranscribe = true;
      recognition.onresult = (ev: any) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) transcript += res[0].transcript.trim() + " ";
        }
      };
      // The engine stops itself periodically — restart while we still want it.
      recognition.onend = () => {
        if (wantTranscribe) {
          try {
            recognition.start();
          } catch {
            /* already started / not allowed — ignore */
          }
        }
      };
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  function cleanupStream() {
    stream.getTracks().forEach((t) => t.stop());
  }

  return {
    supported: true,
    snapshot() {
      // chunks accumulate continuously (start(1000)), so a blob built now
      // contains everything captured so far.
      return {
        blob: new Blob(chunks, { type: mimeType || "audio/webm" }),
        transcript: transcript.trim(),
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      };
    },
    cancel() {
      wantTranscribe = false;
      try {
        recognition?.stop();
      } catch {}
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {}
      cleanupStream();
    },
    stop() {
      return new Promise<StopResult>((resolve) => {
        wantTranscribe = false;
        try {
          recognition?.stop();
        } catch {}
        const finish = () => {
          const blob = new Blob(chunks, {
            type: mimeType || "audio/webm",
          });
          cleanupStream();
          resolve({
            blob,
            transcript: transcript.trim(),
            durationSec: Math.round((Date.now() - startedAt) / 1000),
          });
        };
        if (rec.state === "inactive") {
          finish();
        } else {
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

function pickMime(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  const MR = (window as any).MediaRecorder;
  if (!MR?.isTypeSupported) return undefined;
  for (const c of candidates) {
    if (MR.isTypeSupported(c)) return c;
  }
  return undefined;
}
