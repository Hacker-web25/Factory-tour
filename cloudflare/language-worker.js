/**
 * VPV language Worker — stores subtitles and translations in Cloudflare D1 and
 * runs speech-to-text and translation on Workers AI.
 *
 * Paste this whole file into a Cloudflare Worker (see cloudflare/LANGUAGE-README.md).
 *
 * Bindings and settings it expects:
 *   DB              D1 database binding (the "vpv-language" database)
 *   AI              Workers AI binding
 *   LANG_API_SECRET secret text, 32+ characters. The SAME value as
 *                   LANGUAGE_API_SECRET on Vercel
 *   LLM_MODEL       optional text. The Workers AI chat model used as a
 *                   translation fallback. Default: @cf/google/gemma-4-26b-a4b-it
 *
 * This Worker is PRIVATE: every call except "GET /" needs
 *   Authorization: Bearer <LANG_API_SECRET>
 * Only the website (Vercel) knows that secret. The website decides who may read
 * or change which tour; this Worker never sees a visitor and never trusts one.
 *
 * Every route below answers JSON { ok: true, ... } or { ok: false, error }.
 * tests/language/01-worker.test.ts runs this file against a real SQLite database.
 */

export const VERSION = "1";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const DEFAULT_LLM = "@cf/google/gemma-4-26b-a4b-it";

const MAX_JSON_BYTES = 1_000_000;
const MAX_AUDIO_BASE64_CHARS = 4_800_000; // about 3.5 MB of audio
const MAX_ROWS_PER_PUT = 60;
const MAX_TEXT_CHARS = 8000;
const MAX_SEGMENTS = 5000;
const MAX_SEGMENT_CHARS = 1000;
const MAX_TRANSCRIPT_JSON = 900_000;

const TOUR_RE = /^[A-Za-z0-9_-]{8,64}$/;
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const HASH_RE = /^[0-9a-f]{40}$/;
const WHISPER_CODE_ALIASES = { jw: "jv", iw: "he" };

class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/* ───────────────────────────── the secret ──────────────────────────── */

const enc = new TextEncoder();

/** Constant-time comparison that does not leak the length either: both sides
 *  are hashed with a throw-away key first, then the two equal-length digests
 *  are compared byte by byte. */
export async function safeEqual(a, b) {
  const key = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([crypto.subtle.sign("HMAC", key, enc.encode(a)), crypto.subtle.sign("HMAC", key, enc.encode(b))]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

async function authorize(request, env) {
  const secret = typeof env.LANG_API_SECRET === "string" ? env.LANG_API_SECRET : "";
  // A missing or weak secret must never mean "open to everyone".
  if (secret.length < 24) throw new HttpError(503, "not_configured", "LANG_API_SECRET is missing or shorter than 24 characters.");
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !(await safeEqual(token, secret))) throw new HttpError(401, "unauthorized");
}

/* ───────────────────────────── validation ──────────────────────────── */

function needTour(v) {
  if (typeof v !== "string" || !TOUR_RE.test(v)) throw new HttpError(400, "bad_tour");
  return v;
}

function needLang(v) {
  if (typeof v !== "string" || !LANG_RE.test(v)) throw new HttpError(400, "bad_lang");
  return v;
}

function needHash(v, code = "bad_hash") {
  if (typeof v !== "string" || !HASH_RE.test(v)) throw new HttpError(400, code);
  return v;
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large");
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v;
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

function parseJsonColumn(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === typeof fallback ? v : fallback;
  } catch {
    return fallback;
  }
}

/* ───────────────────────────── tour settings ───────────────────────── */

const DEFAULT_CONFIG = { default_language: "en", available_languages: [], subtitle_settings: {} };

async function readConfig(env, tour) {
  const row = await env.DB.prepare(
    "SELECT default_language, available_languages, subtitle_settings, updated_at FROM tour_language WHERE tour_id = ?1"
  )
    .bind(tour)
    .first();
  if (!row) return { ...DEFAULT_CONFIG, available_languages: [], subtitle_settings: {}, updated_at: 0 };
  const langs = parseJsonColumn(row.available_languages, []);
  return {
    default_language: row.default_language || "en",
    available_languages: Array.isArray(langs) ? langs.filter((l) => typeof l === "string") : [],
    subtitle_settings: parseJsonColumn(row.subtitle_settings, {}),
    updated_at: row.updated_at,
  };
}

/**
 * Change a tour's settings. Every part is optional, and every change is done
 * INSIDE the database in one transaction, so two editors saving at the same
 * moment cannot undo each other's language list.
 *   default_language          the language the author wrote the tour in
 *   add_languages[]           languages to offer to visitors
 *   remove_languages[]        languages to stop offering
 *   subtitle_settings_patch   merged into the subtitle settings (null removes a key)
 */
async function writeConfig(env, body) {
  const tour = needTour(body.tour);
  const at = Date.now();
  const stmts = [
    env.DB.prepare("INSERT OR IGNORE INTO tour_language (tour_id, updated_at) VALUES (?1, ?2)").bind(tour, at),
  ];

  const adds = Array.isArray(body.add_languages) ? body.add_languages.map(needLang) : [];
  const removes = Array.isArray(body.remove_languages) ? body.remove_languages.map(needLang) : [];
  if (adds.length > 80 || removes.length > 80) throw new HttpError(400, "too_many_languages");

  if (body.default_language !== undefined) {
    const def = needLang(body.default_language);
    stmts.push(env.DB.prepare("UPDATE tour_language SET default_language = ?1, updated_at = ?2 WHERE tour_id = ?3").bind(def, at, tour));
    // The language the tour is written in is never an extra language.
    removes.push(def);
  }

  for (const lang of removes) {
    stmts.push(
      env.DB.prepare(
        "UPDATE tour_language SET available_languages = (SELECT json_group_array(value) FROM json_each(tour_language.available_languages) WHERE value <> ?1), updated_at = ?2 WHERE tour_id = ?3"
      ).bind(lang, at, tour)
    );
  }
  for (const lang of adds) {
    if (removes.includes(lang)) continue;
    stmts.push(
      env.DB.prepare(
        "UPDATE tour_language SET available_languages = (SELECT json_group_array(v) FROM (SELECT value AS v FROM json_each(tour_language.available_languages) WHERE value <> ?1 UNION ALL SELECT ?1)), updated_at = ?2 WHERE tour_id = ?3"
      ).bind(lang, at, tour)
    );
  }

  if (body.subtitle_settings_patch !== undefined) {
    const patch = body.subtitle_settings_patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new HttpError(400, "bad_settings");
    const text = JSON.stringify(patch);
    if (text.length > 4000) throw new HttpError(413, "settings_too_large");
    stmts.push(
      env.DB.prepare("UPDATE tour_language SET subtitle_settings = json_patch(subtitle_settings, ?1), updated_at = ?2 WHERE tour_id = ?3").bind(text, at, tour)
    );
  }

  await env.DB.batch(stmts);
  return readConfig(env, tour);
}

/* ───────────────────────────── translations ────────────────────────── */

function cleanText(v, code) {
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_TEXT_CHARS) throw new HttpError(400, code);
  return v;
}

async function listTranslations(env, tour, lang, full) {
  const sql = full
    ? "SELECT src_hash, source_text, translated_text, engine, reviewed, updated_at FROM translations WHERE tour_id = ?1 AND lang = ?2"
    : "SELECT src_hash, translated_text FROM translations WHERE tour_id = ?1 AND lang = ?2";
  const { results } = await env.DB.prepare(sql).bind(tour, lang).all();
  if (!full) {
    const map = {};
    for (const r of results || []) map[r.src_hash] = r.translated_text;
    return { map };
  }
  return {
    rows: (results || []).map((r) => ({
      h: r.src_hash,
      source: r.source_text,
      text: r.translated_text,
      engine: r.engine,
      reviewed: r.reviewed === 1,
      updated_at: r.updated_at,
    })),
  };
}

/**
 * Save translated strings.
 *   overwrite "none"        only add rows that do not exist yet
 *   overwrite "unreviewed"  also replace machine-made rows, never a human-edited one (default)
 *   overwrite "all"         replace everything (used when a person saves their own edit)
 */
async function putTranslations(env, body) {
  const tour = needTour(body.tour);
  const lang = needLang(body.lang);
  const overwrite = body.overwrite === undefined ? "unreviewed" : body.overwrite;
  if (overwrite !== "none" && overwrite !== "unreviewed" && overwrite !== "all") throw new HttpError(400, "bad_overwrite");
  if (!Array.isArray(body.rows) || body.rows.length === 0) throw new HttpError(400, "no_rows");
  if (body.rows.length > MAX_ROWS_PER_PUT) throw new HttpError(413, "too_many_rows");

  const at = Date.now();
  const tail =
    overwrite === "none"
      ? " ON CONFLICT(tour_id, lang, src_hash) DO NOTHING"
      : " ON CONFLICT(tour_id, lang, src_hash) DO UPDATE SET source_text = excluded.source_text, translated_text = excluded.translated_text, engine = excluded.engine, reviewed = excluded.reviewed, updated_at = excluded.updated_at" +
        (overwrite === "unreviewed" ? " WHERE translations.reviewed = 0 OR excluded.reviewed = 1" : "");
  const sql =
    "INSERT INTO translations (tour_id, lang, src_hash, source_text, translated_text, engine, reviewed, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)" + tail;

  const stmts = body.rows.map((r) => {
    if (!r || typeof r !== "object") throw new HttpError(400, "bad_row");
    const engine = typeof r.engine === "string" ? r.engine.slice(0, 40) : "";
    return env.DB.prepare(sql).bind(
      tour,
      lang,
      needHash(r.h),
      cleanText(r.source, "bad_source"),
      cleanText(r.text, "bad_text"),
      engine,
      r.reviewed === true ? 1 : 0,
      at
    );
  });
  const results = await env.DB.batch(stmts);
  let written = 0;
  for (const r of results) written += r?.meta?.changes ?? 0;
  return { written, total: stmts.length };
}

async function deleteTranslations(env, body) {
  const tour = needTour(body.tour);
  const stmts = [];
  if (body.lang !== undefined) {
    const lang = needLang(body.lang);
    stmts.push(env.DB.prepare("DELETE FROM translations WHERE tour_id = ?1 AND lang = ?2").bind(tour, lang));
  } else {
    stmts.push(env.DB.prepare("DELETE FROM translations WHERE tour_id = ?1").bind(tour));
  }
  const [res] = await env.DB.batch(stmts);
  return { deleted: res?.meta?.changes ?? 0 };
}

/* ───────────────────────────── transcripts ─────────────────────────── */

function cleanSegments(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SEGMENTS) throw new HttpError(400, "bad_segments");
  const out = [];
  let last = -1;
  for (const s of raw) {
    if (!s || typeof s !== "object") throw new HttpError(400, "bad_segments");
    const start = Number(s.start);
    const end = Number(s.end);
    const text = typeof s.text === "string" ? s.text.trim() : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 86400) throw new HttpError(400, "bad_segments");
    if (!text || text.length > MAX_SEGMENT_CHARS) throw new HttpError(400, "bad_segments");
    if (start < last - 0.001) throw new HttpError(400, "segments_not_in_order");
    last = start;
    out.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text });
  }
  return out;
}

async function listTranscripts(env, tour) {
  const { results } = await env.DB.prepare(
    "SELECT audio_key, audio_ref, source_lang, duration_sec, engine, reviewed, updated_at, json_array_length(segments) AS lines FROM transcripts WHERE tour_id = ?1"
  )
    .bind(tour)
    .all();
  return {
    items: (results || []).map((r) => ({
      key: r.audio_key,
      ref: r.audio_ref,
      language: r.source_lang,
      duration: r.duration_sec,
      engine: r.engine,
      reviewed: r.reviewed === 1,
      updated_at: r.updated_at,
      lines: r.lines,
    })),
  };
}

async function readTranscript(env, tour, key) {
  const r = await env.DB.prepare(
    "SELECT audio_ref, source_lang, duration_sec, segments, engine, reviewed, updated_at FROM transcripts WHERE tour_id = ?1 AND audio_key = ?2"
  )
    .bind(tour, key)
    .first();
  if (!r) return { transcript: null };
  return {
    transcript: {
      key,
      ref: r.audio_ref,
      language: r.source_lang,
      duration: r.duration_sec,
      segments: parseJsonColumn(r.segments, []),
      engine: r.engine,
      reviewed: r.reviewed === 1,
      updated_at: r.updated_at,
    },
  };
}

/** Save a transcript. A person-corrected one (reviewed) is only replaced by another
 *  human edit or with force: true, never by an automatic run. */
async function putTranscript(env, body) {
  const tour = needTour(body.tour);
  const key = needHash(body.key, "bad_key");
  const language = needLang(body.language);
  const segments = cleanSegments(body.segments);
  const text = JSON.stringify(segments);
  if (text.length > MAX_TRANSCRIPT_JSON) throw new HttpError(413, "transcript_too_large");
  const ref = typeof body.ref === "string" ? body.ref.slice(0, 500) : "";
  const engine = typeof body.engine === "string" ? body.engine.slice(0, 40) : "";
  const duration = Number.isFinite(Number(body.duration)) && Number(body.duration) > 0 ? Number(body.duration) : null;
  const reviewed = body.reviewed === true ? 1 : 0;
  const force = body.force === true ? 1 : 0;

  const res = await env.DB.prepare(
    "INSERT INTO transcripts (tour_id, audio_key, audio_ref, source_lang, duration_sec, segments, engine, reviewed, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) " +
      "ON CONFLICT(tour_id, audio_key) DO UPDATE SET audio_ref = excluded.audio_ref, source_lang = excluded.source_lang, duration_sec = excluded.duration_sec, segments = excluded.segments, engine = excluded.engine, reviewed = excluded.reviewed, updated_at = excluded.updated_at " +
      "WHERE excluded.reviewed = 1 OR transcripts.reviewed = 0 OR ?10 = 1"
  )
    .bind(tour, key, ref, language, duration, text, engine, reviewed, Date.now(), force)
    .run();
  const written = (res?.meta?.changes ?? 0) > 0;
  return { written, ...(written ? {} : { reason: "reviewed_transcript_protected" }) };
}

async function deleteTranscript(env, body) {
  const tour = needTour(body.tour);
  const key = needHash(body.key, "bad_key");
  const res = await env.DB.prepare("DELETE FROM transcripts WHERE tour_id = ?1 AND audio_key = ?2").bind(tour, key).run();
  return { deleted: res?.meta?.changes ?? 0 };
}

async function purgeTour(env, body) {
  const tour = needTour(body.tour);
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM translations WHERE tour_id = ?1").bind(tour),
    env.DB.prepare("DELETE FROM transcripts WHERE tour_id = ?1").bind(tour),
    env.DB.prepare("DELETE FROM tour_language WHERE tour_id = ?1").bind(tour),
  ]);
  return { deleted: results.reduce((n, r) => n + (r?.meta?.changes ?? 0), 0) };
}

/* ───────────────────────────── Workers AI ──────────────────────────── */

/** "Out of free neurons" is a different problem from "the model failed". */
function aiError(e) {
  const message = String((e && e.message) || e || "").slice(0, 300);
  if (/4006|daily free allocation|neurons|quota|rate limit/i.test(message)) return new HttpError(429, "quota", message);
  return new HttpError(502, "ai_failed", message);
}

/** Whisper's answer in one fixed shape, whatever optional fields it left out. */
export function normalizeWhisper(out) {
  const o = out && typeof out === "object" ? (out.result && typeof out.result === "object" ? out.result : out) : {};
  const info = o.transcription_info && typeof o.transcription_info === "object" ? o.transcription_info : {};
  let language = typeof info.language === "string" && LANG_RE.test(info.language.toLowerCase()) ? info.language.toLowerCase() : null;
  // Whisper's older codes for Javanese and Hebrew; the rest of the site uses the current ones.
  if (language && WHISPER_CODE_ALIASES[language]) language = WHISPER_CODE_ALIASES[language];
  const segments = (Array.isArray(o.segments) ? o.segments : [])
    .map((s) => {
      const seg = {
        start: Number(s && s.start),
        end: Number(s && s.end),
        text: String((s && s.text) || ""),
      };
      if (s && Array.isArray(s.words)) {
        seg.words = s.words
          .map((w) => ({ w: String((w && (w.word ?? w.w)) || ""), s: Number(w && (w.start ?? w.s)), e: Number(w && (w.end ?? w.e)) }))
          .filter((w) => w.w && Number.isFinite(w.s) && Number.isFinite(w.e));
      }
      if (s && Number.isFinite(Number(s.no_speech_prob))) seg.nsp = Number(s.no_speech_prob);
      if (s && Number.isFinite(Number(s.avg_logprob))) seg.lp = Number(s.avg_logprob);
      if (s && Number.isFinite(Number(s.compression_ratio))) seg.cr = Number(s.compression_ratio);
      return seg;
    })
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end));
  return {
    language,
    duration: Number.isFinite(Number(info.duration)) ? Number(info.duration) : null,
    text: typeof o.text === "string" ? o.text : "",
    vtt: typeof o.vtt === "string" ? o.vtt : "",
    segments,
  };
}

function needBase64Audio(text) {
  // The website sends the audio already base64-encoded as the plain request
  // body, so this Worker does no per-byte work (Workers Free allows only 10 ms
  // of CPU per request). Reject anything that is not base64 before spending
  // neurons on it.
  if (text.length === 0) throw new HttpError(400, "no_audio");
  if (text.length > MAX_AUDIO_BASE64_CHARS) throw new HttpError(413, "audio_too_large");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text.slice(0, 4096)) || text.length % 4 !== 0) throw new HttpError(400, "audio_not_base64");
  return text;
}

async function transcribe(request, env, url) {
  if (!env.AI) throw new HttpError(503, "ai_not_bound", "Add the Workers AI binding named AI.");
  const audio = needBase64Audio((await request.text()).trim());
  const language = url.searchParams.get("language");
  const prompt = (url.searchParams.get("prompt") || "").slice(0, 400);
  const input = {
    audio,
    task: "transcribe",
    vad_filter: true,
    // Without this Whisper can repeat one sentence for minutes after a silence.
    condition_on_previous_text: false,
  };
  if (language && language !== "auto") input.language = needLang(language);
  if (prompt) input.initial_prompt = prompt;
  let out;
  try {
    out = await env.AI.run(WHISPER_MODEL, input);
  } catch (e) {
    throw aiError(e);
  }
  return normalizeWhisper(out);
}

/** The text of a chat answer, whichever shape the model returned. */
export function chatText(out) {
  if (typeof out === "string") return out;
  if (!out || typeof out !== "object") return "";
  const o = out.result && typeof out.result === "object" ? out.result : out;
  const choice = Array.isArray(o.choices) ? o.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c && c.text) || "")).join("");
  const r = o.response;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") return JSON.stringify(r);
  return "";
}

async function llm(request, env) {
  if (!env.AI) throw new HttpError(503, "ai_not_bound", "Add the Workers AI binding named AI.");
  const body = await readJson(request);
  const system = typeof body.system === "string" ? body.system : "";
  const user = typeof body.user === "string" ? body.user : "";
  if (!user || user.length > 60_000 || system.length > 20_000) throw new HttpError(400, "bad_prompt");
  const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 2048, 64), 8192);
  const temperature = Math.min(Math.max(Number(body.temperature) || 0.1, 0), 1);
  const model = typeof env.LLM_MODEL === "string" && env.LLM_MODEL ? env.LLM_MODEL : DEFAULT_LLM;
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });
  let out;
  try {
    out = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature });
  } catch (e) {
    throw aiError(e);
  }
  const text = chatText(out);
  if (!text.trim()) throw new HttpError(502, "empty_answer");
  return { text, model };
}

/* ───────────────────────────── health ──────────────────────────────── */

async function health(env) {
  let d1 = false;
  let tables = [];
  try {
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tour_language','translations','transcripts')").all();
    tables = (results || []).map((r) => r.name).sort();
    d1 = tables.length === 3;
  } catch {
    d1 = false;
  }
  return { version: VERSION, d1, tables, ai: Boolean(env.AI), llm_model: env.LLM_MODEL || DEFAULT_LLM, whisper_model: WHISPER_MODEL };
}

async function stats(env) {
  const [a, b, c] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM tour_language"),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(source_text) + length(translated_text)), 0) AS bytes FROM translations"),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(segments)), 0) AS bytes FROM transcripts"),
  ]);
  const first = (r) => (r && r.results && r.results[0]) || { n: 0, bytes: 0 };
  return {
    tours: first(a).n,
    translations: first(b).n,
    translations_bytes: first(b).bytes,
    transcripts: first(c).n,
    transcripts_bytes: first(c).bytes,
  };
}

/* ───────────────────────────── router ──────────────────────────────── */

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/" && (method === "GET" || method === "HEAD")) {
    return new Response("VPV language", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  await authorize(request, env);

  if (method === "GET") {
    switch (pathname) {
      case "/health":
        return json({ ok: true, ...(await health(env)) });
      case "/stats":
        return json({ ok: true, ...(await stats(env)) });
      case "/config":
        return json({ ok: true, config: await readConfig(env, needTour(url.searchParams.get("tour"))) });
      case "/translations":
        return json({
          ok: true,
          ...(await listTranslations(env, needTour(url.searchParams.get("tour")), needLang(url.searchParams.get("lang")), url.searchParams.get("full") === "1")),
        });
      case "/transcripts":
        return json({ ok: true, ...(await listTranscripts(env, needTour(url.searchParams.get("tour")))) });
      case "/transcript":
        return json({
          ok: true,
          ...(await readTranscript(env, needTour(url.searchParams.get("tour")), needHash(url.searchParams.get("key"), "bad_key"))),
        });
      default:
        throw new HttpError(404, "not_found");
    }
  }

  if (method === "POST") {
    switch (pathname) {
      case "/config":
        return json({ ok: true, config: await writeConfig(env, await readJson(request)) });
      case "/translations/put":
        return json({ ok: true, ...(await putTranslations(env, await readJson(request))) });
      case "/translations/delete":
        return json({ ok: true, ...(await deleteTranslations(env, await readJson(request))) });
      case "/transcript/put":
        return json({ ok: true, ...(await putTranscript(env, await readJson(request))) });
      case "/transcript/delete":
        return json({ ok: true, ...(await deleteTranscript(env, await readJson(request))) });
      case "/purge":
        return json({ ok: true, ...(await purgeTour(env, await readJson(request))) });
      case "/transcribe":
        return json({ ok: true, ...(await transcribe(request, env, url)) });
      case "/llm":
        return json({ ok: true, ...(await llm(request, env)) });
      default:
        throw new HttpError(404, "not_found");
    }
  }

  throw new HttpError(405, "method_not_allowed");
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ ok: false, error: e.code, ...(e.detail ? { detail: e.detail } : {}) }, e.status);
      }
      // Never show the caller a database message; keep it in the Worker's own log.
      console.error("[language-worker]", e && e.stack ? e.stack : e);
      return json({ ok: false, error: "internal" }, 500);
    }
  },
};
