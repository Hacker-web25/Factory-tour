/**
 * GET /api/language/selftest[?whisper=1]
 *   Platform owner only. Checks, in plain words, that the whole language feature
 *   is wired up: the two Vercel settings, the Worker, the database (a real
 *   write-read-delete), each translation engine on a real sentence, and (with
 *   ?whisper=1) speech-to-text on one second of silence.
 *   Reports setting NAMES and results, never any secret value.
 */

import { fail, json } from "@/lib/server/billingGuard";
import { translateTexts, defaultProviders } from "@/lib/language/engine";
import { languageConfigured, store } from "@/lib/language/store";
import { encodeWav } from "@/lib/language/wav";
import { authenticateRequest } from "@/lib/server/requestAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Check = { name: string; ok: boolean; detail: string };

const SCRATCH_TOUR = "selftest-vpv-language-0000";

async function run(name: string, fn: () => Promise<string>): Promise<Check> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e) {
    const err = e as { code?: string; detail?: string; message?: string };
    return { name, ok: false, detail: [err.code, err.detail, err.message].filter(Boolean).join(": ").slice(0, 300) || "failed" };
  }
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) return fail(401, "unauthorized");
  if (auth.profile.role !== "owner") return fail(403, "forbidden", "Platform owner only.");

  const checks: Check[] = [];
  const hasUrl = Boolean((process.env.LANGUAGE_API_URL ?? "").trim());
  const hasSecret = Boolean(process.env.LANGUAGE_API_SECRET);
  checks.push({ name: "Vercel setting LANGUAGE_API_URL", ok: hasUrl, detail: hasUrl ? "set" : "missing" });
  checks.push({ name: "Vercel setting LANGUAGE_API_SECRET", ok: hasSecret, detail: hasSecret ? "set" : "missing" });

  if (languageConfigured()) {
    checks.push(
      await run("Worker answers and has its database and AI", async () => {
        const h = await store.health();
        if (!h.d1) throw new Error(`database tables missing (found: ${h.tables.join(", ") || "none"}). Run cloudflare/language-schema.sql.`);
        if (!h.ai) throw new Error("no Workers AI binding named AI");
        return `version ${h.version}; tables ${h.tables.join(", ")}; whisper ${h.whisper_model}; chat ${h.llm_model}`;
      })
    );
    checks.push(
      await run("Database write, read and delete", async () => {
        await store.setConfig(SCRATCH_TOUR, { add_languages: ["es"] });
        const c = await store.getConfig(SCRATCH_TOUR);
        if (!c.available_languages.includes("es")) throw new Error("wrote a language but did not read it back");
        await store.purge(SCRATCH_TOUR);
        const after = await store.getConfig(SCRATCH_TOUR);
        if (after.available_languages.length) throw new Error("scratch data was not removed");
        return "ok";
      })
    );
    checks.push(
      await run("Storage used", async () => {
        const s = await store.stats();
        return `${s.tours} tours, ${s.translations} translations (${Math.round(s.translations_bytes / 1024)} KB), ${s.transcripts} transcripts (${Math.round(s.transcripts_bytes / 1024)} KB)`;
      })
    );

    const providers = defaultProviders();
    for (const p of providers) {
      if (!p.configured()) {
        checks.push({ name: `Translation engine: ${p.name}`, ok: false, detail: "not configured" });
        continue;
      }
      checks.push(
        await run(`Translation engine: ${p.name}`, async () => {
          const t0 = Date.now();
          const out = await translateTexts({ texts: ["Welcome to our factory. Please wear a helmet."], source: "en", target: "es" }, [p]);
          const r = [...out.done.values()][0];
          if (!r) throw new Error(out.failed[0]?.reason ?? "no answer");
          return `“${r.text}” in ${Date.now() - t0} ms`;
        })
      );
    }
    if (!providers.some((p) => p.configured())) checks.push({ name: "Any translation engine", ok: false, detail: "none configured" });

    if (new URL(req.url).searchParams.get("whisper") === "1") {
      checks.push(
        await run("Speech to text (one second of silence)", async () => {
          const piece = await store.transcribe(encodeWav(new Float32Array(16000)), { language: "en" });
          return `answered; ${piece.segments.length} lines (none expected for silence)`;
        })
      );
    }
  }

  return json({ ok: checks.every((c) => c.ok), checks });
}
