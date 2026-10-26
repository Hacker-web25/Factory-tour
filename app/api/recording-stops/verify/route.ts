/**
 * POST /api/recording-stops/verify   { stopId }
 *
 * Decides the verdict on one recording stop and writes it.
 *
 * Runs with the service-role client on purpose. The guard triggers in
 * supabase/recording_stops.sql force verdict='unverified' on any insert
 * or update made by a signed-in user, precisely so a rep cannot clear
 * themselves from the browser console. The service role (auth.uid() is
 * null) is the only path allowed to set a real verdict, so this route is
 * it.
 *
 * Two layers, in this order:
 *
 *   1. lib/stopPhrases  — a deterministic phrase bank (English, Hinglish,
 *      Devanagari). Free, offline, pinned by tests. Decides WHETHER a
 *      stop request was spoken.
 *
 *   2. The AI pass below — asks the configured provider WHO it reads as.
 *      This is a hint, not proof: the transcript comes from one
 *      microphone with no speaker labels, so attribution is inference
 *      from the words alone. lib/stopVerdict treats it accordingly and
 *      defaults to 'unverified' whenever it is missing or unsure.
 *
 * What this route deliberately does NOT do: acoustic speaker
 * identification against the rep's stored voice sample. That needs a
 * diarization engine, which this stack does not have wired up. The
 * sample is captured and kept for when one is.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { decideVerdict, WINDOW_WORDS, type Attribution } from "@/lib/stopVerdict";
import { windowTranscriptTail } from "@/lib/stopPhrases";
import { nvidiaConfigured, nvidiaJson } from "@/lib/ai/nvidia";
import { geminiConfigured, geminiJson } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ─────────────────────────── the AI pass ─────────────────────────── */

const SYSTEM = `You read a short extract from the end of a recorded sales meeting at a factory, in English, Hindi, or a mix of both.

A sales representative stopped the recording at roughly this point. Your only job is to say whether the words show SOMEONE OTHER THAN THE REPRESENTATIVE asking for the recording to be stopped.

Rules:
- The transcript comes from one microphone and has NO speaker labels. You are inferring, not knowing. Say "unclear" whenever the words do not settle it.
- The representative is the person giving the tour and pitching. A client is the person being pitched to, usually asking questions or raising objections.
- A representative saying something like "sure, I'll stop the recording" is them AGREEING to a request. If the request itself is not in the text, answer "unclear", not "presenter".
- Answer "other" only when the words genuinely read as a client or third party asking.
- Never guess to be helpful. "unclear" is a correct and expected answer.

Reply with JSON only: {"by":"presenter"|"other"|"unclear","reason":"one short sentence"}`;

const SCHEMA = {
  type: "object",
  properties: {
    by: { type: "string", enum: ["presenter", "other", "unclear"] },
    reason: { type: "string" },
  },
  required: ["by"],
} as const;

type AiAnswer = { by?: string; reason?: string };

function coerce(raw: AiAnswer | null): Attribution | null {
  if (!raw) return null;
  const by =
    raw.by === "presenter" || raw.by === "other" || raw.by === "unclear"
      ? raw.by
      : "unclear";
  const reason =
    typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim().slice(0, 300)
      : null;
  return { by, reason };
}

/** Ask whichever provider is configured. Returns null when none is, or
 *  when the call fails — the verdict layer handles that as uncertainty. */
async function attribute(windowText: string): Promise<Attribution | null> {
  const user = `Extract from the end of the meeting:\n\n"""\n${windowText}\n"""`;
  if (nvidiaConfigured()) {
    try {
      return coerce(
        await nvidiaJson<AiAnswer>({
          system: SYSTEM,
          user,
          maxOutputTokens: 300,
          temperature: 0,
        })
      );
    } catch {
      /* fall through to the next provider */
    }
  }
  if (geminiConfigured()) {
    try {
      return coerce(
        await geminiJson<AiAnswer>({
          system: SYSTEM,
          user,
          schema: SCHEMA as unknown as Record<string, unknown>,
          maxOutputTokens: 300,
          temperature: 0,
        })
      );
    } catch {
      /* no attribution available */
    }
  }
  return null;
}

/* ───────────────────────────── handler ───────────────────────────── */

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let stopId: string | undefined;
  try {
    stopId = (await req.json())?.stopId;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!stopId || !UUID.test(stopId)) {
    return NextResponse.json({ ok: false, error: "bad_stop_id" }, { status: 400 });
  }

  const { data: stopRow, error: stopErr } = await sb
    .from("recording_stops")
    .select("id, session_id, trailing_captured, verdict, md_review")
    .eq("id", stopId)
    .maybeSingle();
  if (stopErr || !stopRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const stop = stopRow as {
    id: string;
    session_id: string;
    trailing_captured: boolean;
    verdict: string;
    md_review: string | null;
  };

  // Never overwrite a decision a human already made, and never redo a
  // verdict we have already written.
  if (stop.md_review) {
    return NextResponse.json({ ok: true, skipped: "already_reviewed" });
  }
  if (stop.verdict !== "unverified") {
    return NextResponse.json({ ok: true, skipped: "already_decided" });
  }

  const { data: sessionRow } = await sb
    .from("presentation_sessions")
    .select("transcript")
    .eq("session_id", stop.session_id)
    .maybeSingle();
  const transcript =
    (sessionRow as { transcript: string | null } | null)?.transcript ?? null;

  // Only spend an AI call when there is something worth asking about.
  const windowText = windowTranscriptTail(transcript, WINDOW_WORDS);
  const attribution = windowText.trim() ? await attribute(windowText) : null;

  const out = decideVerdict({
    transcript,
    attribution,
    trailingCaptured: stop.trailing_captured,
  });

  const detail = out.quote
    ? `${out.detail}\n\nHeard: “${out.quote}”`
    : out.detail;

  const { error: upErr } = await sb
    .from("recording_stops")
    .update({ verdict: out.verdict, verdict_detail: detail })
    .eq("id", stopId)
    // Belt and braces: only move a row that is still undecided.
    .eq("verdict", "unverified")
    .is("md_review", null);
  if (upErr) {
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    verdict: out.verdict,
    words: out.windowWords,
    attributed: attribution?.by ?? null,
  });
}
