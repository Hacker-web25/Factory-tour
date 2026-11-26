/**
 * POST /api/language/transcribe?tour=<id>[&language=<code>][&prompt=<words>]
 *   Body: one WAV piece (16-bit PCM, up to 50 seconds), as raw bytes.
 *   Returns the spoken lines of that piece, already cleaned (made-up lines dropped,
 *   long lines split, each timed from the start of the piece):
 *     { ok, language, duration, segments: [{ start, end, text }] }
 *
 * The editor cuts a long recording into pieces in the browser, sends each one here,
 * puts the lines back together and saves the whole transcript (PUT /api/language/transcript).
 */

import { fail, json } from "@/lib/server/billingGuard";
import { guardWrite, readBytes, validLang, workerFail } from "@/lib/language/access";
import { cleanChunk, cleanLanguage, parseVtt } from "@/lib/language/segments";
import { store } from "@/lib/language/store";
import { readWavInfo } from "@/lib/language/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 50 s of 16 kHz mono 16-bit audio is 1.6 MB; Vercel's request limit is 4.5 MB. */
const MAX_BYTES = 2_600_000;
const MAX_SECONDS = 50;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const g = await guardWrite(req, url.searchParams.get("tour"), { key: "lang-transcribe", max: 200, windowSeconds: 600 });
  if (!g.ok) return g.res;

  const language = url.searchParams.get("language");
  if (language && language !== "auto" && !validLang(language)) return fail(400, "bad_lang");
  const prompt = (url.searchParams.get("prompt") ?? "").replace(/\s+/g, " ").trim().slice(0, 400);

  const body = await readBytes(req, MAX_BYTES);
  if (!body.ok) return fail(body.status, body.error);
  const info = readWavInfo(body.bytes);
  if (!info) return fail(400, "not_wav", "Send a 16-bit PCM WAV file.");
  if (info.seconds < 0.3) return fail(400, "too_short");
  if (info.seconds > MAX_SECONDS) return fail(413, "too_long", `Each piece must be ${MAX_SECONDS} seconds or less.`);

  try {
    const piece = await store.transcribe(body.bytes, { language: language && language !== "auto" ? language : undefined, prompt: prompt || undefined });

    let raw = piece.segments;
    if (raw.length === 0 && piece.vtt) raw = parseVtt(piece.vtt);
    // Whisper gave text but no timing: one line for the whole piece is better than nothing.
    if (raw.length === 0 && piece.text.trim()) raw = [{ start: 0, end: info.seconds, text: piece.text }];

    const segments = cleanChunk(raw)
      .map((s) => ({ start: Math.max(0, s.start), end: Math.min(s.end, info.seconds + 0.5), text: s.text }))
      .filter((s) => s.end > s.start);

    return json({
      ok: true,
      language: piece.language ? cleanLanguage(piece.language, "") || null : null,
      duration: info.seconds,
      segments,
    });
  } catch (e) {
    return workerFail(e);
  }
}
