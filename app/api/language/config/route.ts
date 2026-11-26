/**
 * GET /api/language/config?tour=<id>
 *   What the viewer needs before it draws: the language the tour is written in,
 *   the languages on offer, the subtitle look, and which audio files have subtitles.
 *   Readable by whoever can see the tour.
 *
 * PUT /api/language/config   { tour, default_language?, add_languages?, remove_languages?, subtitle_settings_patch? }
 *   Changes them. Workspace admins who may edit the tour only.
 */

import { fail, json, readJson } from "@/lib/server/billingGuard";
import { guardRead, guardWrite, validLang, workerFail } from "@/lib/language/access";
import { sanitizePatch } from "@/lib/language/settings";
import { store } from "@/lib/language/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardRead(req, new URL(req.url).searchParams.get("tour"));
  if (!g.ok) return g.res;
  try {
    const [config, items] = await Promise.all([store.getConfig(g.tour), store.listTranscripts(g.tour)]);
    return json({
      ok: true,
      config: {
        default_language: config.default_language,
        available_languages: config.available_languages,
        subtitle_settings: config.subtitle_settings,
      },
      transcripts: items.map((t) => ({ key: t.key, language: t.language, lines: t.lines, duration: t.duration })),
    });
  } catch (e) {
    return workerFail(e);
  }
}

export async function PUT(req: Request) {
  const read = await readJson(req, 16 * 1024);
  if (!read.ok) return fail(read.status, read.error);
  const b = read.body;
  const g = await guardWrite(req, b.tour);
  if (!g.ok) return g.res;

  const change: Parameters<typeof store.setConfig>[1] = {};
  if (b.default_language !== undefined) {
    if (!validLang(b.default_language)) return fail(400, "bad_lang");
    change.default_language = b.default_language;
  }
  for (const key of ["add_languages", "remove_languages"] as const) {
    if (b[key] === undefined) continue;
    const list = b[key];
    if (!Array.isArray(list) || list.length > 80 || !list.every(validLang)) return fail(400, "bad_lang");
    change[key] = list as string[];
  }
  if (b.subtitle_settings_patch !== undefined) {
    const s = sanitizePatch(b.subtitle_settings_patch);
    if (!s.ok) return fail(400, "bad_settings");
    change.subtitle_settings_patch = s.patch;
  }
  if (Object.keys(change).length === 0) return fail(400, "nothing_to_change");

  try {
    const config = await store.setConfig(g.tour, change);
    return json({
      ok: true,
      config: {
        default_language: config.default_language,
        available_languages: config.available_languages,
        subtitle_settings: config.subtitle_settings,
      },
    });
  } catch (e) {
    return workerFail(e);
  }
}
