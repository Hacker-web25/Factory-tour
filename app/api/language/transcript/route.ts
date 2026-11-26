/**
 * Subtitles of ONE audio file. The file is named by its key (lib/language/audioKey.ts).
 *
 * GET    ?tour=<id>&key=<key>      the lines. Whoever can see the tour.
 *        ?tour=<id>                the list of every audio of the tour that has lines (editors).
 * PUT    { tour, key, ref, language, duration, segments, reviewed?, force? }
 *          Save. reviewed: true = a person edited it (kept safe from automatic runs).
 *          force: true = replace even a corrected transcript (the "Redo" button).
 * DELETE ?tour=<id>&key=<key>
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { guardRead, guardWrite, validLang, workerFail } from "@/lib/language/access";
import { store } from "@/lib/language/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_RE = /^[0-9a-f]{40}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const tourParam = url.searchParams.get("tour");

  if (key === null) {
    const g = await guardWrite(req, tourParam);
    if (!g.ok) return g.res;
    try {
      return json({ ok: true, items: await store.listTranscripts(g.tour) });
    } catch (e) {
      return workerFail(e);
    }
  }
  if (!KEY_RE.test(key)) return fail(400, "bad_key");
  const g = await guardRead(req, tourParam);
  if (!g.ok) return g.res;
  try {
    return json({ ok: true, transcript: await store.getTranscript(g.tour, key) });
  } catch (e) {
    return workerFail(e);
  }
}

export async function PUT(req: Request) {
  const read = await readJson(req, 1_000_000);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;
  const g = await guardWrite(req, b.tour, { key: "lang-transcript", max: 120, windowSeconds: 600 });
  if (!g.ok) return g.res;
  if (typeof b.key !== "string" || !KEY_RE.test(b.key)) return fail(400, "bad_key");
  if (!validLang(b.language)) return fail(400, "bad_lang");
  if (!Array.isArray(b.segments) || b.segments.length === 0 || b.segments.length > 5000) return fail(400, "bad_segments");
  const reviewed = b.reviewed === true;
  try {
    const res = await store.putTranscript(g.tour, {
      key: b.key,
      ref: typeof b.ref === "string" ? b.ref.slice(0, 500) : "",
      language: b.language,
      duration: typeof b.duration === "number" && b.duration > 0 ? b.duration : null,
      segments: b.segments as { start: number; end: number; text: string }[],
      engine: reviewed ? "manual" : "whisper",
      reviewed,
      force: b.force === true,
    });
    return json({ ok: true, written: res.written, ...(res.reason ? { reason: res.reason } : {}) });
  } catch (e) {
    return workerFail(e);
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const g = await guardWrite(req, url.searchParams.get("tour"));
  if (!g.ok) return g.res;
  const key = url.searchParams.get("key");
  if (!key || !KEY_RE.test(key)) return fail(400, "bad_key");
  try {
    return json({ ok: true, deleted: (await store.deleteTranscript(g.tour, key)).deleted });
  } catch (e) {
    return workerFail(e);
  }
}
