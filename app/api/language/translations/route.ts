/**
 * GET    /api/language/translations?tour=<id>&lang=<code>[&full=1]
 *          The translated strings of one language, as { map: { <hash of source>: <translation> } }.
 *          Whoever can see the tour may read it. full=1 (the review table: source text,
 *          which engine, whether a person edited it) is for editors only.
 * PUT    { tour, lang, rows: [{ source, text }] }
 *          A person's own wording. Saved as "reviewed": a later automatic
 *          re-translation never overwrites it.
 * DELETE ?tour=<id>&lang=<code>
 *          Stop offering a language and delete its translations.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { guardRead, guardWrite, validLang, workerFail } from "@/lib/language/access";
import { hashText } from "@/lib/language/hash";
import { store } from "@/lib/language/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 8000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  if (!validLang(lang)) return fail(400, "bad_lang");
  const full = url.searchParams.get("full") === "1";
  const tourParam = url.searchParams.get("tour");

  if (full) {
    const g = await guardWrite(req, tourParam);
    if (!g.ok) return g.res;
    try {
      return json({ ok: true, rows: await store.getTranslationRows(g.tour, lang) });
    } catch (e) {
      return workerFail(e);
    }
  }

  const g = await guardRead(req, tourParam);
  if (!g.ok) return g.res;
  try {
    return json({ ok: true, map: await store.getTranslationMap(g.tour, lang) });
  } catch (e) {
    return workerFail(e);
  }
}

export async function PUT(req: Request) {
  const read = await readJson(req, 200 * 1024);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;
  const g = await guardWrite(req, b.tour, { key: "lang-edit", max: 120, windowSeconds: 600 });
  if (!g.ok) return g.res;
  if (!validLang(b.lang)) return fail(400, "bad_lang");
  if (!Array.isArray(b.rows) || b.rows.length === 0 || b.rows.length > 60) return fail(400, "bad_rows");

  const rows: { h: string; source: string; text: string; engine: string; reviewed: boolean }[] = [];
  for (const r of b.rows as unknown[]) {
    const o = r as { source?: unknown; text?: unknown } | null;
    if (!o || typeof o.source !== "string" || typeof o.text !== "string") return fail(400, "bad_rows");
    const text = o.text.replace(/\r\n/g, "\n").trim();
    if (!o.source.trim() || o.source.length > MAX_TEXT || !text || text.length > MAX_TEXT) return fail(400, "bad_rows");
    rows.push({ h: hashText(o.source), source: o.source, text, engine: "manual", reviewed: true });
  }
  try {
    const res = await store.putTranslations(g.tour, b.lang, rows, "all");
    return json({ ok: true, written: res.written });
  } catch (e) {
    return workerFail(e);
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const g = await guardWrite(req, url.searchParams.get("tour"));
  if (!g.ok) return g.res;
  if (!validLang(lang)) return fail(400, "bad_lang");
  try {
    // Stop offering it first, so a visitor never picks a language that is being emptied.
    await store.setConfig(g.tour, { remove_languages: [lang] });
    const res = await store.deleteTranslations(g.tour, lang);
    return json({ ok: true, deleted: res.deleted });
  } catch (e) {
    return workerFail(e);
  }
}
