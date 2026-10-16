"use client";

/**
 * VoiceSamplePrompt — one-time voice-sample capture at a sales rep's first
 * sign-in. The sample is used only to tell the rep's voice apart from the
 * client's voice in meeting audio (for example, to verify who requested a
 * stop-recording during a presentation).
 *
 * Policy anchor: /privacy#recordings-ai  and  /terms#recording-ai.
 *
 * This component is deliberately NON-BLOCKING: the rep may close it and
 * carry on working. Without the sample we cannot run the client-stop
 * verification, so the modal re-appears at next sign-in until the rep
 * either records it, or an MD excuses them (future admin flow).
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { startMicRecording, type ActiveAudioRecorder } from "@/lib/audioCapture";

/** The sentence the rep reads out loud. Short, contains speech sounds
 *  across the frequency spectrum, and makes the purpose explicit so the
 *  recording is itself a consent record. Keep it short enough to say in
 *  ~10 seconds. */
export const VOICE_SAMPLE_PROMPT =
  "My name is {name}. I work for {company}. I am recording my voice so my employer can tell my voice apart from client voices during meetings.";

const CAPTURE_SECONDS = 10;

type Phase = "intro" | "arming" | "recording" | "uploading" | "done" | "error";

export default function VoiceSamplePrompt({
  profileId,
  repName,
  companyName,
  onDone,
  onDismiss,
}: {
  profileId: string;
  repName: string;
  companyName: string;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recorderRef = useRef<ActiveAudioRecorder | null>(null);
  const tickRef = useRef<number | undefined>(undefined);
  const stopTimerRef = useRef<number | undefined>(undefined);

  // The sentence with the rep's details substituted in.
  const sentence = VOICE_SAMPLE_PROMPT.replace("{name}", repName || "")
    .replace("{company}", companyName || "my organisation");

  async function startCapture() {
    setErrorMsg(null);
    setElapsed(0);
    setPhase("arming");
    try {
      const rec = await startMicRecording();
      recorderRef.current = rec;
      setPhase("recording");
      // Count seconds and auto-stop at CAPTURE_SECONDS.
      tickRef.current = window.setInterval(() => {
        setElapsed((v) => v + 1);
      }, 1000);
      stopTimerRef.current = window.setTimeout(() => {
        void finishCapture();
      }, CAPTURE_SECONDS * 1000);
    } catch (e) {
      recorderRef.current = null;
      setPhase("error");
      setErrorMsg(
        (e as Error)?.message?.includes("Permission")
          ? "The browser blocked microphone access. Please allow it in the address bar and try again."
          : "We couldn't open your microphone. Try again or use a different browser."
      );
    }
  }

  async function finishCapture() {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    tickRef.current = undefined;
    stopTimerRef.current = undefined;
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setPhase("uploading");
    try {
      const blob = await rec.stop();
      const ext = blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("ogg")
          ? "ogg"
          : "webm";
      // Path shape must match the RLS policy in supabase/voice_samples.sql:
      //   <rep_profile_id>/<file>
      const path = `${profileId}/sample.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("voice-samples")
        .upload(path, blob, {
          upsert: true,
          contentType: blob.type || "audio/webm",
        });
      if (upErr) throw upErr;
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          voice_sample_path: path,
          voice_sample_captured_at: new Date().toISOString(),
        })
        .eq("id", profileId);
      if (profErr) throw profErr;
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setErrorMsg(
        (e as Error)?.message ||
          "We couldn't upload the sample. Please try again."
      );
    }
  }

  // Clean up timers / recorder if the modal is torn down mid-capture.
  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      recorderRef.current?.cancel();
    };
  }, []);

  const remaining = Math.max(0, CAPTURE_SECONDS - elapsed);

  return (
    <div
      className="fixed inset-0 z-[85] grid place-items-center bg-slate-900/55 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-sample-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-vpv-tint text-vpv-blue grid place-items-center">
            <MicIcon />
          </div>
          <h2
            id="voice-sample-title"
            className="text-[18px] font-semibold text-slate-900"
          >
            One-time voice setup
          </h2>
        </div>

        {phase === "intro" && (
          <>
            <p className="text-[13.5px] leading-relaxed text-slate-600">
              Please read the sentence below out loud. We'll record about
              {" "}{CAPTURE_SECONDS}{" "}seconds so our system can tell your
              voice apart from client voices during meetings.
            </p>
            <blockquote className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-[14px] text-slate-800 leading-relaxed italic">
              "{sentence}"
            </blockquote>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600">
              <strong>Why we do this.</strong> During a client meeting, our
              system needs to tell who is speaking. If a client asks to stop
              recording, that is a valid reason to stop. If a rep stops
              recording for no valid reason, your MD will see it. Without
              this sample we cannot tell your voice from the client's.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
              The sample is encrypted at rest, used only to recognise your
              voice, is never shared with third parties, is not used to
              train AI models, and is deleted when you leave the
              organisation. Read more in our{" "}
              <a
                href="/privacy#recordings-ai"
                target="_blank"
                rel="noopener"
                className="text-vpv-blue underline underline-offset-2"
              >
                Privacy Policy
              </a>
              .
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="h-10 px-4 rounded-full border border-slate-300 text-slate-700 text-[13.5px] font-medium hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void startCapture()}
                className="h-10 px-5 rounded-full bg-vpv-grad text-white text-[13.5px] font-semibold shadow-[0_10px_26px_-10px_rgba(20,104,216,0.6)] hover:opacity-95"
              >
                Record
              </button>
            </div>
          </>
        )}

        {phase === "arming" && (
          <p className="text-[13.5px] text-slate-600">
            Waiting for microphone permission…
          </p>
        )}

        {phase === "recording" && (
          <>
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-rose-700">
                  Recording — read the sentence out loud
                </div>
                <div className="text-[12.5px] text-rose-600/80 mt-0.5">
                  Stops automatically in {remaining} second
                  {remaining === 1 ? "" : "s"}.
                </div>
              </div>
            </div>
            <blockquote className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-[14px] text-slate-800 leading-relaxed italic">
              "{sentence}"
            </blockquote>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void finishCapture()}
                className="h-10 px-5 rounded-full bg-slate-900 text-white text-[13.5px] font-semibold hover:bg-slate-800"
              >
                Stop now
              </button>
            </div>
          </>
        )}

        {phase === "uploading" && (
          <p className="text-[13.5px] text-slate-600">
            Saving your voice sample…
          </p>
        )}

        {phase === "done" && (
          <>
            <p className="text-[13.5px] text-slate-700">
              Thanks — your voice sample is saved. You will not be asked
              again.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onDone}
                className="h-10 px-5 rounded-full bg-vpv-grad text-white text-[13.5px] font-semibold shadow-[0_10px_26px_-10px_rgba(20,104,216,0.6)] hover:opacity-95"
              >
                Done
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="text-[13.5px] text-rose-600">
              {errorMsg ||
                "Something went wrong. Please try again."}
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="h-10 px-4 rounded-full border border-slate-300 text-slate-700 text-[13.5px] font-medium hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void startCapture()}
                className="h-10 px-5 rounded-full bg-vpv-grad text-white text-[13.5px] font-semibold shadow-[0_10px_26px_-10px_rgba(20,104,216,0.6)] hover:opacity-95"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
