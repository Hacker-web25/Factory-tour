/**
 * The language Worker (cloudflare/language-worker.js) against a real SQLite
 * database that has the real schema applied, and a pretend Workers AI.
 *
 * What matters: only the website (with the secret) can use it; a person's
 * corrected text is never overwritten by an automatic run; two people changing
 * the language list at once cannot undo each other; bad input is refused before
 * it reaches the database; and a failure never leaks a database message.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { newLanguageDb, type D1Shim } from "../helpers/d1Shim";
// @ts-expect-error plain JavaScript Worker, not type-checked
import worker, { chatText, normalizeWhisper } from "../../cloudflare/language-worker.js";

const SECRET = "test-language-secret-at-least-24-chars";
const TOUR = "11111111-2222-4333-8444-555555555555";
const H1 = "a".repeat(40);
const H2 = "b".repeat(40);
const KEY = "c".repeat(40);

type AiCall = { model: string; input: any };
let db: D1Shim;
let aiCalls: AiCall[];
let aiImpl: (model: string, input: any) => Promise<unknown>;
let env: any;

beforeEach(() => {
  db = newLanguageDb();
  aiCalls = [];
  aiImpl = async () => ({});
  env = {
    DB: db,
    LANG_API_SECRET: SECRET,
    AI: {
      run: async (model: string, input: any) => {
        aiCalls.push({ model, input });
        return aiImpl(model, input);
      },
    },
  };
});

async function call(method: string, path: string, body?: unknown, opts: { auth?: string | null; raw?: string; e?: any } = {}) {
  const headers: Record<string, string> = {};
  const auth = opts.auth === undefined ? SECRET : opts.auth;
  if (auth) headers.authorization = `Bearer ${auth}`;
  let payload: string | undefined;
  if (opts.raw !== undefined) payload = opts.raw;
  else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const res = await worker.fetch(new Request(`https://lang.example.workers.dev${path}`, { method, headers, body: payload }), opts.e ?? env);
  return { status: res.status, body: (await res.json().catch(() => null)) as any, res };
}

/* ── who may call ───────────────────────────────────────────────────────── */

describe("access", () => {
  it("answers a plain greeting to anyone at / and nothing else", async () => {
    const res = await worker.fetch(new Request("https://lang.example.workers.dev/"), env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "VPV language");
  });

  it("refuses every other call without the secret", async () => {
    for (const [m, p] of [["GET", "/health"], ["GET", `/config?tour=${TOUR}`], ["POST", "/purge"], ["POST", "/transcribe"], ["POST", "/llm"]]) {
      const r = await call(m, p, m === "POST" ? {} : undefined, { auth: null });
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.body.error, "unauthorized");
    }
    assert.equal((await call("GET", "/health", undefined, { auth: "wrong-secret-wrong-secret-wrong" })).status, 401);
    assert.equal(aiCalls.length, 0, "no neurons spent on a refused call");
  });

  it("never opens up when the secret is missing or short", async () => {
    for (const secret of [undefined, "", "short"]) {
      const r = await call("GET", "/health", undefined, { e: { ...env, LANG_API_SECRET: secret }, auth: secret || "x" });
      assert.equal(r.status, 503);
      assert.equal(r.body.error, "not_configured");
    }
  });

  it("does not leak a database message when something breaks inside", async () => {
    const broken = { ...env, DB: { prepare: () => { throw new Error("D1_ERROR: no such table: secret_internal_name"); } } };
    const r = await call("GET", `/config?tour=${TOUR}`, undefined, { e: broken });
    assert.equal(r.status, 500);
    assert.equal(r.body.error, "internal");
    assert.ok(!JSON.stringify(r.body).includes("secret_internal_name"));
  });

  it("404s unknown paths and 405s other methods", async () => {
    assert.equal((await call("GET", "/nope")).status, 404);
    assert.equal((await call("POST", "/nope", {})).status, 404);
    assert.equal((await call("DELETE", "/config")).status, 405);
  });
});

describe("health", () => {
  it("reports the three tables and the AI binding", async () => {
    const r = await call("GET", "/health");
    assert.equal(r.body.d1, true);
    assert.deepEqual(r.body.tables, ["transcripts", "translations", "tour_language"].sort());
    assert.equal(r.body.ai, true);
  });
  it("says so when the schema was never run", async () => {
    const r = await call("GET", "/health", undefined, { e: { ...env, DB: new (db.constructor as any)() } });
    assert.equal(r.body.d1, false);
  });
});

/* ── tour settings ──────────────────────────────────────────────────────── */

describe("tour settings", () => {
  it("returns sensible defaults for a tour that has none", async () => {
    const r = await call("GET", `/config?tour=${TOUR}`);
    assert.deepEqual(r.body.config.available_languages, []);
    assert.equal(r.body.config.default_language, "en");
    assert.deepEqual(r.body.config.subtitle_settings, {});
  });

  it("adds languages once each, keeping order", async () => {
    await call("POST", "/config", { tour: TOUR, add_languages: ["es", "fr"] });
    await call("POST", "/config", { tour: TOUR, add_languages: ["es", "hi"] });
    const r = await call("GET", `/config?tour=${TOUR}`);
    assert.deepEqual(r.body.config.available_languages, ["fr", "es", "hi"]);
  });

  it("removes a language", async () => {
    await call("POST", "/config", { tour: TOUR, add_languages: ["es", "fr", "hi"] });
    const r = await call("POST", "/config", { tour: TOUR, remove_languages: ["fr"] });
    assert.deepEqual(r.body.config.available_languages, ["es", "hi"]);
    const last = await call("POST", "/config", { tour: TOUR, remove_languages: ["es", "hi"] });
    assert.deepEqual(last.body.config.available_languages, []);
  });

  it("never lists the tour's own language as an extra one", async () => {
    await call("POST", "/config", { tour: TOUR, add_languages: ["es", "hi"] });
    const r = await call("POST", "/config", { tour: TOUR, default_language: "es" });
    assert.equal(r.body.config.default_language, "es");
    assert.deepEqual(r.body.config.available_languages, ["hi"]);
    const again = await call("POST", "/config", { tour: TOUR, add_languages: ["es"], default_language: "es" });
    assert.deepEqual(again.body.config.available_languages, ["hi"]);
  });

  it("merges subtitle settings and removes a key set to null", async () => {
    await call("POST", "/config", { tour: TOUR, subtitle_settings_patch: { enabled: true, fontSize: 18 } });
    let r = await call("POST", "/config", { tour: TOUR, subtitle_settings_patch: { fontSize: 22, position: "top" } });
    assert.deepEqual(r.body.config.subtitle_settings, { enabled: true, fontSize: 22, position: "top" });
    r = await call("POST", "/config", { tour: TOUR, subtitle_settings_patch: { position: null } });
    assert.deepEqual(r.body.config.subtitle_settings, { enabled: true, fontSize: 22 });
  });

  it("two editors changing the list at the same moment lose nothing", async () => {
    const langs = ["es", "fr", "de", "it", "pt", "hi", "ja", "ko", "ar", "ru"];
    await Promise.all(langs.map((l) => call("POST", "/config", { tour: TOUR, add_languages: [l] })));
    const r = await call("GET", `/config?tour=${TOUR}`);
    assert.deepEqual([...r.body.config.available_languages].sort(), [...langs].sort());
  });

  it("keeps tours apart", async () => {
    const OTHER = "99999999-2222-4333-8444-555555555555";
    await call("POST", "/config", { tour: TOUR, add_languages: ["es"] });
    assert.deepEqual((await call("GET", `/config?tour=${OTHER}`)).body.config.available_languages, []);
  });

  it("refuses bad ids, codes and settings", async () => {
    assert.equal((await call("GET", "/config?tour=x")).body.error, "bad_tour");
    assert.equal((await call("GET", "/config?tour=a'; DROP TABLE tour_language;--")).body.error, "bad_tour");
    assert.equal((await call("POST", "/config", { tour: TOUR, add_languages: ["es; DROP"] })).body.error, "bad_lang");
    assert.equal((await call("POST", "/config", { tour: TOUR, default_language: 5 })).body.error, "bad_lang");
    assert.equal((await call("POST", "/config", { tour: TOUR, subtitle_settings_patch: [1] })).body.error, "bad_settings");
    assert.equal((await call("POST", "/config", { tour: TOUR, subtitle_settings_patch: { x: "y".repeat(5000) } })).body.error, "settings_too_large");
    assert.equal((await call("POST", "/config", undefined, { raw: "{not json" })).body.error, "bad_json");
    assert.equal((await call("POST", "/config", undefined, { raw: "[1,2]" })).body.error, "bad_json");
  });
});

/* ── translations ───────────────────────────────────────────────────────── */

const row = (h: string, text: string, extra: Record<string, unknown> = {}) => ({ h, source: `src-${h[0]}`, text, engine: "gemini", ...extra });

describe("translations", () => {
  it("saves and reads back as a lookup map", async () => {
    const put = await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "Hola"), row(H2, "Adiós")] });
    assert.deepEqual([put.body.written, put.body.total], [2, 2]);
    const r = await call("GET", `/translations?tour=${TOUR}&lang=es`);
    assert.deepEqual(r.body.map, { [H1]: "Hola", [H2]: "Adiós" });
    assert.deepEqual((await call("GET", `/translations?tour=${TOUR}&lang=fr`)).body.map, {});
  });

  it("returns full rows for the review table", async () => {
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "Hola")] });
    const r = await call("GET", `/translations?tour=${TOUR}&lang=es&full=1`);
    assert.equal(r.body.rows.length, 1);
    assert.deepEqual({ ...r.body.rows[0], updated_at: 0 }, { h: H1, source: "src-a", text: "Hola", engine: "gemini", reviewed: false, updated_at: 0 });
  });

  it("'none' never replaces an existing row", async () => {
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "Hola")] });
    const r = await call("POST", "/translations/put", { tour: TOUR, lang: "es", overwrite: "none", rows: [row(H1, "OTRO"), row(H2, "Nuevo")] });
    assert.equal(r.body.written, 1);
    assert.equal((await call("GET", `/translations?tour=${TOUR}&lang=es`)).body.map[H1], "Hola");
  });

  it("an automatic re-translate replaces machine text but never a person's edit", async () => {
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "machine v1"), row(H2, "mine", { reviewed: true, engine: "manual" })] });
    const r = await call("POST", "/translations/put", { tour: TOUR, lang: "es", overwrite: "unreviewed", rows: [row(H1, "machine v2"), row(H2, "machine overwrote me")] });
    assert.equal(r.body.written, 1);
    const map = (await call("GET", `/translations?tour=${TOUR}&lang=es`)).body.map;
    assert.equal(map[H1], "machine v2");
    assert.equal(map[H2], "mine");
  });

  it("a person's own save always wins, and is then protected", async () => {
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "machine")] });
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", overwrite: "all", rows: [row(H1, "human", { reviewed: true, engine: "manual" })] });
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "machine again")] });
    const full = (await call("GET", `/translations?tour=${TOUR}&lang=es&full=1`)).body.rows[0];
    assert.equal(full.text, "human");
    assert.equal(full.reviewed, true);
  });

  it("keeps languages and tours apart", async () => {
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "Hola")] });
    await call("POST", "/translations/put", { tour: TOUR, lang: "fr", rows: [row(H1, "Salut")] });
    assert.equal((await call("GET", `/translations?tour=${TOUR}&lang=fr`)).body.map[H1], "Salut");
    assert.deepEqual((await call("GET", `/translations?tour=99999999-2222-4333-8444-555555555555&lang=es`)).body.map, {});
  });

  it("stores accents, scripts and emoji exactly", async () => {
    const text = "你好 — नमस्ते 🌍 ñandú\nline 2";
    await call("POST", "/translations/put", { tour: TOUR, lang: "zh", rows: [row(H1, text)] });
    assert.equal((await call("GET", `/translations?tour=${TOUR}&lang=zh`)).body.map[H1], text);
  });

  it("refuses bad rows without saving any of the others", async () => {
    const bad = [
      [{ ...row(H1, "ok") }, { h: "nothex", source: "s", text: "t" }],
      [{ ...row(H1, "ok") }, row(H2, "")],
      [{ ...row(H1, "ok") }, { ...row(H2, "x"), source: "" }],
      [{ ...row(H1, "ok") }, row(H2, "x".repeat(8001))],
    ];
    for (const rows of bad) assert.equal((await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows })).status, 400);
    assert.deepEqual((await call("GET", `/translations?tour=${TOUR}&lang=es`)).body.map, {});
    assert.equal((await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [] })).body.error, "no_rows");
    assert.equal((await call("POST", "/translations/put", { tour: TOUR, lang: "es", overwrite: "x", rows: [row(H1, "a")] })).body.error, "bad_overwrite");
    const many = Array.from({ length: 61 }, (_, i) => row(i.toString(16).padStart(40, "0"), "t"));
    assert.equal((await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: many })).status, 413);
  });

  it("deletes one language, or every language of a tour", async () => {
    await call("POST", "/translations/put", { tour: TOUR, lang: "es", rows: [row(H1, "Hola")] });
    await call("POST", "/translations/put", { tour: TOUR, lang: "fr", rows: [row(H1, "Salut")] });
    assert.equal((await call("POST", "/translations/delete", { tour: TOUR, lang: "es" })).body.deleted, 1);
    assert.deepEqual((await call("GET", `/translations?tour=${TOUR}&lang=es`)).body.map, {});
    assert.equal((await call("GET", `/translations?tour=${TOUR}&lang=fr`)).body.map[H1], "Salut");
    assert.equal((await call("POST", "/translations/delete", { tour: TOUR })).body.deleted, 1);
  });
});

/* ── transcripts ────────────────────────────────────────────────────────── */

const segs = [
  { start: 0, end: 2.5, text: "Welcome to the factory." },
  { start: 2.5, end: 6, text: "This is the press line." },
];
const putT = (extra: Record<string, unknown> = {}) =>
  call("POST", "/transcript/put", { tour: TOUR, key: KEY, ref: "panoramas/t/a.mp3", language: "en", duration: 6, segments: segs, engine: "whisper", ...extra });

describe("transcripts", () => {
  it("saves, reads and lists", async () => {
    assert.equal((await putT()).body.written, true);
    const r = await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`);
    assert.equal(r.body.transcript.language, "en");
    assert.deepEqual(r.body.transcript.segments, segs);
    assert.equal(r.body.transcript.reviewed, false);
    const list = await call("GET", `/transcripts?tour=${TOUR}`);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].lines, 2);
    assert.equal(list.body.items[0].segments, undefined, "the list is light: no text");
  });

  it("returns null for audio that has no transcript yet", async () => {
    assert.equal((await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`)).body.transcript, null);
  });

  it("an automatic run does not overwrite a corrected transcript; a person or force does", async () => {
    await putT({ reviewed: true, segments: [{ start: 0, end: 2, text: "Corrected by a person." }] });
    const auto = await putT();
    assert.equal(auto.body.written, false);
    assert.equal(auto.body.reason, "reviewed_transcript_protected");
    assert.equal((await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`)).body.transcript.segments[0].text, "Corrected by a person.");
    assert.equal((await putT({ force: true })).body.written, true);
    assert.equal((await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`)).body.transcript.segments[0].text, "Welcome to the factory.");
    await putT({ reviewed: true, segments: [{ start: 0, end: 1, text: "Edited again." }] });
    assert.equal((await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`)).body.transcript.segments[0].text, "Edited again.");
  });

  it("deletes one transcript", async () => {
    await putT();
    assert.equal((await call("POST", "/transcript/delete", { tour: TOUR, key: KEY })).body.deleted, 1);
    assert.equal((await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`)).body.transcript, null);
  });

  it("refuses broken timing and empty lines", async () => {
    const cases: any[] = [
      [],
      [{ start: 0, end: 0, text: "zero length" }],
      [{ start: 3, end: 2, text: "backwards" }],
      [{ start: -1, end: 2, text: "negative" }],
      [{ start: 0, end: 2, text: "   " }],
      [{ start: 2, end: 4, text: "ok" }, { start: 1, end: 3, text: "starts before the previous one" }],
      [{ start: 0, end: 2, text: "x".repeat(1001) }],
      [{ start: "a", end: 2, text: "nan" }],
      "not an array",
    ];
    for (const segments of cases) assert.equal((await putT({ segments })).status, 400, JSON.stringify(segments).slice(0, 60));
    assert.equal((await putT({ key: "short" })).body.error, "bad_key");
    assert.equal((await putT({ language: "english!" })).body.error, "bad_lang");
  });

  it("accepts lines that touch or overlap slightly at the edge", async () => {
    assert.equal((await putT({ segments: [{ start: 0, end: 2, text: "a" }, { start: 2, end: 4, text: "b" }] })).body.written, true);
  });

  it("trims text and rounds times to hundredths", async () => {
    await putT({ segments: [{ start: 0.123456, end: 2.98765, text: "  hi  " }] });
    const s = (await call("GET", `/transcript?tour=${TOUR}&key=${KEY}`)).body.transcript.segments[0];
    assert.deepEqual(s, { start: 0.12, end: 2.99, text: "hi" });
  });
});

describe("purge", () => {
  it("removes everything of one tour and leaves other tours alone", async () => {
    const OTHER = "99999999-2222-4333-8444-555555555555";
    for (const t of [TOUR, OTHER]) {
      await call("POST", "/config", { tour: t, add_languages: ["es"] });
      await call("POST", "/translations/put", { tour: t, lang: "es", rows: [row(H1, "Hola")] });
      await call("POST", "/transcript/put", { tour: t, key: KEY, language: "en", segments: segs });
    }
    const r = await call("POST", "/purge", { tour: TOUR });
    assert.equal(r.body.deleted, 3);
    assert.deepEqual((await call("GET", `/translations?tour=${TOUR}&lang=es`)).body.map, {});
    assert.equal((await call("GET", `/transcripts?tour=${TOUR}`)).body.items.length, 0);
    assert.equal((await call("GET", `/translations?tour=${OTHER}&lang=es`)).body.map[H1], "Hola");
    assert.equal((await call("GET", `/transcripts?tour=${OTHER}`)).body.items.length, 1);
    const stats = await call("GET", "/stats");
    assert.equal(stats.body.translations, 1);
    assert.equal(stats.body.transcripts, 1);
    assert.equal(stats.body.tours, 1);
  });
});

/* ── speech to text ─────────────────────────────────────────────────────── */

const B64 = Buffer.from("RIFF....WAVEfmt fake audio bytes for the test").toString("base64");

describe("transcribe", () => {
  it("sends the audio to Whisper with the quality settings and returns a fixed shape", async () => {
    aiImpl = async () => ({
      text: "Hello there",
      transcription_info: { language: "en", duration: 4.2 },
      segments: [{ start: 0.1, end: 1.9, text: " Hello there", no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.1, words: [{ word: "Hello", start: 0.1, end: 0.6 }, { word: "there", start: 0.7, end: 1.9 }] }],
    });
    const r = await call("POST", "/transcribe?language=auto&prompt=Press%20line", undefined, { raw: B64 });
    assert.equal(r.status, 200);
    assert.equal(r.body.language, "en");
    assert.equal(r.body.segments[0].text, " Hello there");
    assert.deepEqual(r.body.segments[0].words[0], { w: "Hello", s: 0.1, e: 0.6 });
    assert.equal(aiCalls[0].model, "@cf/openai/whisper-large-v3-turbo");
    assert.equal(aiCalls[0].input.audio, B64);
    assert.equal(aiCalls[0].input.vad_filter, true);
    assert.equal(aiCalls[0].input.condition_on_previous_text, false);
    assert.equal(aiCalls[0].input.language, undefined, "auto = let Whisper detect");
    assert.equal(aiCalls[0].input.initial_prompt, "Press line");
  });

  it("pins the language when asked", async () => {
    aiImpl = async () => ({ segments: [] });
    await call("POST", "/transcribe?language=hi", undefined, { raw: B64 });
    assert.equal(aiCalls[0].input.language, "hi");
  });

  it("refuses something that is not audio data before spending anything", async () => {
    for (const raw of ["", "not base64 at all!!", "abc", "A".repeat(4_800_004)]) {
      const r = await call("POST", "/transcribe", undefined, { raw });
      assert.ok([400, 413].includes(r.status), String(r.status));
    }
    assert.equal((await call("POST", "/transcribe?language=bad%20code", undefined, { raw: B64 })).status, 400);
    assert.equal(aiCalls.length, 0);
  });

  it("reports running out of the free daily allowance as 429, not as a crash", async () => {
    aiImpl = async () => { throw new Error("AiError: 4006: you have used up your daily free allocation of 10,000 neurons"); };
    const r = await call("POST", "/transcribe", undefined, { raw: B64 });
    assert.equal(r.status, 429);
    assert.equal(r.body.error, "quota");
  });

  it("reports a model failure as 502", async () => {
    aiImpl = async () => { throw new Error("model exploded"); };
    const r = await call("POST", "/transcribe", undefined, { raw: B64 });
    assert.equal(r.status, 502);
    assert.equal(r.body.error, "ai_failed");
  });

  it("says so when the AI binding is missing", async () => {
    const r = await call("POST", "/transcribe", undefined, { raw: B64, e: { ...env, AI: undefined } });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "ai_not_bound");
  });

  it("copes with the answer being wrapped, or missing fields", () => {
    assert.deepEqual(normalizeWhisper({ result: { segments: [{ start: 1, end: 2, text: "x" }] } }).segments, [{ start: 1, end: 2, text: "x" }]);
    assert.deepEqual(normalizeWhisper(null), { language: null, duration: null, text: "", vtt: "", segments: [] });
    assert.equal(normalizeWhisper({ segments: [{ start: "a", end: 2, text: "x" }, { start: 1, end: 2, text: "y" }] }).segments.length, 1);
    assert.equal(normalizeWhisper({ transcription_info: { language: "../etc" } }).language, null);
  });

  it("maps Whisper's older language codes to the ones the site uses", () => {
    assert.equal(normalizeWhisper({ transcription_info: { language: "jw" } }).language, "jv");
    assert.equal(normalizeWhisper({ transcription_info: { language: "iw" } }).language, "he");
    assert.equal(normalizeWhisper({ transcription_info: { language: "EN" } }).language, "en");
  });
});

/* ── chat fallback ──────────────────────────────────────────────────────── */

describe("llm fallback", () => {
  it("returns the text whatever shape the model answers in", async () => {
    const shapes: unknown[] = [
      { response: "plain" },
      { response: { a: 1 } },
      { choices: [{ message: { content: "openai style" } }] },
      { choices: [{ message: { content: [{ type: "text", text: "parts" }] } }] },
      { result: { response: "wrapped" } },
      "bare string",
    ];
    const expected = ["plain", '{"a":1}', "openai style", "parts", "wrapped", "bare string"];
    for (let i = 0; i < shapes.length; i++) {
      aiImpl = async () => shapes[i];
      const r = await call("POST", "/llm", { system: "s", user: "u" });
      assert.equal(r.body.text, expected[i], `shape ${i}`);
    }
    assert.equal(chatText({}), "");
  });

  it("sends system + user messages and honours LLM_MODEL", async () => {
    aiImpl = async () => ({ response: "ok" });
    await call("POST", "/llm", { system: "SYS", user: "USER", max_tokens: 999999, temperature: 5 }, { e: { ...env, LLM_MODEL: "@cf/test/model" } });
    assert.equal(aiCalls[0].model, "@cf/test/model");
    assert.deepEqual(aiCalls[0].input.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "USER" }]);
    assert.equal(aiCalls[0].input.max_tokens, 8192);
    assert.equal(aiCalls[0].input.temperature, 1);
  });

  it("treats an empty answer as a failure so the website can try another engine", async () => {
    aiImpl = async () => ({ response: "   " });
    const r = await call("POST", "/llm", { user: "u" });
    assert.equal(r.status, 502);
    assert.equal(r.body.error, "empty_answer");
  });

  it("refuses an empty or oversized prompt", async () => {
    assert.equal((await call("POST", "/llm", { system: "s" })).body.error, "bad_prompt");
    assert.equal((await call("POST", "/llm", { user: "u".repeat(60_001) })).body.error, "bad_prompt");
    assert.equal(aiCalls.length, 0);
  });
});
