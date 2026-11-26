/**
 * POST /api/language/translate
 *   { tour, lang, source_lang?, texts: string[], mode?: "missing" | "all", kind?: "label" | "subtitle", tour_title? }
 *
 * Translates up to 25 strings into one language, checks every answer, saves the
 * good ones and reports the rest. The editor calls it in a loop for a whole tour.
 *
 *   mode "missing" (default): only strings that have no translation yet
 *   mode "all":               also redo machine translations — never one a person edited
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { guardWrite, validLang, workerFail } from "@/lib/language/access";
import { translateTexts } from "@/lib/language/engine";
import { hashText } from "@/lib/language/hash";
import { store } from "@/lib/language/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEXTS = 25;
const MAX_TEXT = 7000;
const MAX_TOTAL = 40_000;

export async function POST(req: Request) {
  const read = await readJson(req, 300 * 1024);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;
  const g = await guardWrite(req, b.tour, { key: "lang-translate", max: 90, windowSeconds: 600 });
  if (!g.ok) return g.res;

  if (!validLang(b.lang)) return fail(400, "bad_lang");
  if (b.source_lang !== undefined && !validLang(b.source_lang)) return fail(400, "bad_lang");
  if (!Array.isArray(b.texts) || b.texts.length === 0 || b.texts.length > MAX_TEXTS) return fail(400, "bad_texts");
  let total = 0;
  for (const t of b.texts) {
    if (typeof t !== "string" || t.length > MAX_TEXT) return fail(400, "bad_texts");
    total += t.length;
  }
  if (total > MAX_TOTAL) return fail(413, "payload_too_large");
  const mode = b.mode === "all" ? "all" : "missing";
  const kind = b.kind === "subtitle" ? "subtitle" : "label";
  const tourTitle = typeof b.tour_title === "string" ? b.tour_title.replace(/\s+/g, " ").trim().slice(0, 120) : undefined;

  try {
    const source = (b.source_lang as string | undefined) ?? (await store.getConfig(g.tour)).default_language;
    if (source === b.lang) return fail(400, "same_language", "That is the language the tour is written in.");

    // keep order, drop blanks and repeats
    const seen = new Set<string>();
    const texts: string[] = [];
    for (const t of b.texts as string[]) {
      if (!t.trim()) continue;
      const h = hashText(t);
      if (!seen.has(h)) {
        seen.add(h);
        texts.push(t);
      }
    }

    const existing = new Map((await store.getTranslationRows(g.tour, b.lang)).map((r) => [r.h, r.reviewed]));
    let skipped = 0;
    let skippedReviewed = 0;
    const todo: string[] = [];
    for (const t of texts) {
      const reviewed = existing.get(hashText(t));
      if (reviewed === undefined) todo.push(t);
      else if (reviewed) skippedReviewed++;
      else if (mode === "all") todo.push(t);
      else skipped++;
    }

    if (todo.length === 0) return json({ ok: true, translated: 0, skipped, skipped_reviewed: skippedReviewed, failed: [], engines: {} });

    const out = await translateTexts({ texts: todo, source, target: b.lang, tourTitle, kind });
    const rows = Array.from(out.done, ([text, r]) => ({ h: hashText(text), source: text, text: r.text, engine: r.engine, reviewed: false }));
    const engines: Record<string, number> = {};
    for (const [, r] of out.done) engines[r.engine] = (engines[r.engine] ?? 0) + 1;
    if (rows.length > 0) await store.putTranslations(g.tour, b.lang, rows, mode === "all" ? "unreviewed" : "none");

    return json({
      ok: true,
      translated: rows.length,
      skipped,
      skipped_reviewed: skippedReviewed,
      failed: out.failed.map((f) => ({ text: f.text.slice(0, 200), reason: f.reason })),
      engines,
      // Every engine that was tried said "out of allowance": the editor tells the person to wait or upgrade.
      quota_hit: out.failed.length > 0 && out.failed.some((f) => /quota|429/i.test(f.reason)),
    });
  } catch (e) {
    return workerFail(e);
  }
}
