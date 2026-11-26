/**
 * The whole language feature end to end, in one process:
 *   browser-side request → Next route → permission check → translation engine /
 *   store → the REAL Worker code → a REAL SQLite database (with the real schema).
 * Only three things are pretend: who is signed in, the Supabase permission
 * answers, and Workers AI.
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { newLanguageDb, type D1Shim } from "../helpers/d1Shim";
import { __setAuthenticatorForTests, type AuthedRequest } from "@/lib/server/requestAuth";
import { __resetBillingRateLimitMemory } from "@/lib/server/billingGuard";
import { __setTourReaderForTests } from "@/lib/language/access";
import { __setWorkerFetchForTests } from "@/lib/language/store";
import { hashText } from "@/lib/language/hash";
import { audioKey } from "@/lib/language/audioKey";
import { SAMPLE_RATE, encodeWav } from "@/lib/language/wav";
import { GET as configGet, PUT as configPut } from "@/app/api/language/config/route";
import { GET as transGet, PUT as transPut, DELETE as transDelete } from "@/app/api/language/translations/route";
import { POST as translatePost } from "@/app/api/language/translate/route";
import { POST as transcribePost } from "@/app/api/language/transcribe/route";
import { GET as transcriptGet, PUT as transcriptPut, DELETE as transcriptDelete } from "@/app/api/language/transcript/route";
import { POST as purgePost } from "@/app/api/language/purge/route";
import { GET as selftestGet } from "@/app/api/language/selftest/route";
// @ts-expect-error plain JavaScript Worker, not type-checked
import worker from "../../cloudflare/language-worker.js";

const SECRET = "test-language-secret-at-least-24-chars";
const TOUR = "11111111-2222-4333-8444-555555555555";
const OTHER = "22222222-3333-4444-8555-666666666666";
const HIDDEN = "33333333-4444-4555-8666-777777777777";

let db: D1Shim;
let aiCalls: { model: string; input: any }[];
let aiImpl: (model: string, input: any) => Promise<unknown>;
let editable: Set<string>;
let locked: Set<string>;
const saved: Record<string, string | undefined> = {};

/** An engine that "translates" by wrapping text, and fails on request. */
function chatEngine(wrap: (t: string) => string = (t) => `ES(${t})`) {
  return async (_model: string, input: any) => {
    const user = JSON.parse(input.messages[input.messages.length - 1].content);
    return { response: JSON.stringify({ translations: user.items.map((i: any) => ({ id: i.id, text: wrap(i.text) })) }) };
  };
}

function fakeAuth(role: string): AuthedRequest {
  return {
    user: { id: `user-${role}` } as any,
    profile: { id: `user-${role}`, email: `${role}@x.test`, full_name: null, role, org_id: "org-1" },
    sb: {
      rpc: async (name: string, args: any) => {
        if (name === "vpv_can_edit_tour") return { data: editable.has(args.p_tour), error: null };
        if (name === "tour_workspace_open") return { data: !locked.has(args.p_tour), error: null };
        return { data: null, error: { message: "no rpc" } }; // rate limiter falls back to memory
      },
    } as any,
  };
}

beforeEach(() => {
  for (const k of ["LANGUAGE_API_URL", "LANGUAGE_API_SECRET", "TRANSLATE_PROVIDERS", "GEMINI_API_KEY", "NVIDIA_API_KEY"]) saved[k] = process.env[k];
  process.env.LANGUAGE_API_URL = "https://lang.example.workers.dev";
  process.env.LANGUAGE_API_SECRET = SECRET;
  process.env.TRANSLATE_PROVIDERS = "workers-ai";
  delete process.env.GEMINI_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  __resetBillingRateLimitMemory();

  db = newLanguageDb();
  aiCalls = [];
  aiImpl = chatEngine();
  const env = {
    DB: db,
    LANG_API_SECRET: SECRET,
    AI: { run: async (model: string, input: any) => { aiCalls.push({ model, input }); return aiImpl(model, input); } },
  };
  __setWorkerFetchForTests((url, init) => worker.fetch(new Request(url, init), env));

  editable = new Set([TOUR, OTHER]);
  locked = new Set();
  __setAuthenticatorForTests(async (req) => {
    const role = req.headers.get("x-test-role");
    return role ? fakeAuth(role) : null;
  });
  // A viewer may read a tour when they hold its id (an unlisted link) — like the real rule.
  __setTourReaderForTests(async (req, tour) => req.headers.get("x-view-tour") === tour || req.headers.get("x-test-role") === "owner");
});

afterEach(() => {
  __setWorkerFetchForTests(null);
  __setAuthenticatorForTests(null);
  __setTourReaderForTests(null);
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const OWNER = { "x-test-role": "owner" };
const VIEWER = { "x-view-tour": TOUR };
const r = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => new Request(`http://localhost/api/language${path}`, init);
const put = (path: string, body: unknown, headers: Record<string, string> = OWNER) =>
  r(path, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (path: string, body: unknown, headers: Record<string, string> = OWNER) =>
  r(path, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
const out = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

/* ── who may do what ────────────────────────────────────────────────────── */

describe("permissions", () => {
  it("a visitor with the link can read settings; a stranger cannot even tell the tour exists", async () => {
    const ok = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.config.available_languages, []);
    const stranger = await out(await configGet(r(`/config?tour=${TOUR}`)));
    assert.equal(stranger.status, 404);
    assert.equal(stranger.body.error, "not_found");
    assert.equal((await out(await configGet(r(`/config?tour=${OTHER}`, { headers: VIEWER })))).status, 404, "a link to one tour opens only that tour");
    assert.equal((await out(await configGet(r(`/config?tour=nope`, { headers: VIEWER })))).status, 400);
  });

  it("nobody can change anything without signing in", async () => {
    assert.equal((await configPut(put("/config", { tour: TOUR, add_languages: ["es"] }, {}))).status, 401);
    assert.equal((await translatePost(post("/translate", { tour: TOUR, lang: "es", texts: ["Hello"] }, {}))).status, 401);
    assert.equal((await transcribePost(r(`/transcribe?tour=${TOUR}`, { method: "POST", body: encodeWav(new Float32Array(16000)) }))).status, 401);
    assert.equal((await purgePost(post("/purge", { tour: TOUR }, {}))).status, 401);
  });

  it("customers cannot use it while it is hidden; only the platform owner", async () => {
    for (const role of ["org_admin", "member", "presenter"]) {
      const res = await out(await configPut(put("/config", { tour: TOUR, add_languages: ["es"] }, { "x-test-role": role })));
      assert.ok([403].includes(res.status), role);
    }
    const org = await out(await configPut(put("/config", { tour: TOUR, add_languages: ["es"] }, { "x-test-role": "org_admin" })));
    assert.equal(org.body.error, "not_available");
    assert.equal((await out(await configPut(put("/config", { tour: TOUR, add_languages: ["es"] })))).status, 200);
  });

  it("the owner still cannot touch a tour the database says they cannot edit, or a locked workspace", async () => {
    const no = await out(await configPut(put("/config", { tour: HIDDEN, add_languages: ["es"] })));
    assert.equal(no.status, 403);
    locked.add(TOUR);
    const lock = await out(await configPut(put("/config", { tour: TOUR, add_languages: ["es"] })));
    assert.equal(lock.body.error, "workspace_locked");
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM tour_language").get()!.n, 0, "nothing was written");
  });

  it("every write route refuses a tour you cannot edit", async () => {
    const seg = [{ start: 0, end: 1, text: "hi" }];
    const key = "a".repeat(40);
    const attempts = [
      () => translatePost(post("/translate", { tour: HIDDEN, lang: "es", texts: ["Hello"] })),
      () => transPut(put("/translations", { tour: HIDDEN, lang: "es", rows: [{ source: "a", text: "b" }] })),
      () => transDelete(r(`/translations?tour=${HIDDEN}&lang=es`, { method: "DELETE", headers: OWNER })),
      () => transcriptPut(put("/transcript", { tour: HIDDEN, key, language: "en", segments: seg })),
      () => transcriptDelete(r(`/transcript?tour=${HIDDEN}&key=${key}`, { method: "DELETE", headers: OWNER })),
      () => transcriptGet(r(`/transcript?tour=${HIDDEN}`, { headers: OWNER })),
      () => transGet(r(`/translations?tour=${HIDDEN}&lang=es&full=1`, { headers: OWNER })),
      () => purgePost(post("/purge", { tour: HIDDEN })),
      () => transcribePost(r(`/transcribe?tour=${HIDDEN}`, { method: "POST", headers: OWNER, body: encodeWav(new Float32Array(16000)) })),
    ];
    for (const a of attempts) assert.equal((await a()).status, 403);
    assert.equal(aiCalls.length, 0, "no AI spent");
  });

  it("says plainly when the Worker is not set up", async () => {
    delete process.env.LANGUAGE_API_URL;
    const res = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "not_configured");
  });

  it("explains a wrong secret and an unreachable Worker", async () => {
    process.env.LANGUAGE_API_SECRET = "a-different-secret-of-sufficient-length";
    const bad = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.equal(bad.status, 502);
    assert.equal(bad.body.error, "worker_secret_mismatch");
    __setWorkerFetchForTests(async () => { throw new Error("connect ECONNREFUSED"); });
    process.env.LANGUAGE_API_SECRET = SECRET;
    const down = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.equal(down.status, 504);
    assert.equal(down.body.error, "worker_unreachable");
  });
});

/* ── settings ───────────────────────────────────────────────────────────── */

describe("settings", () => {
  it("saves languages and subtitle look, and the viewer reads them back", async () => {
    const res = await out(await configPut(put("/config", { tour: TOUR, default_language: "en", add_languages: ["es", "hi"], subtitle_settings_patch: { fontSize: 24, position: "top-center" } })));
    assert.equal(res.status, 200);
    const v = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.deepEqual(v.body.config.available_languages, ["es", "hi"]);
    assert.equal(v.body.config.subtitle_settings.fontSize, 24);
    assert.deepEqual(v.body.transcripts, []);
  });

  it("refuses unknown languages and settings that are not settings", async () => {
    const bad: any[] = [
      { add_languages: ["xx"] }, { add_languages: "es" }, { default_language: "klingon" },
      { subtitle_settings_patch: { fontSize: 500 } }, { subtitle_settings_patch: { hacked: true } },
      { subtitle_settings_patch: { bgColor: "url(javascript:alert(1))" } }, { subtitle_settings_patch: {} }, {},
    ];
    for (const b of bad) assert.equal((await configPut(put("/config", { tour: TOUR, ...b }))).status, 400, JSON.stringify(b));
  });
});

/* ── translating ────────────────────────────────────────────────────────── */

describe("translate", () => {
  const T = (extra: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    translatePost(post("/translate", { tour: TOUR, lang: "es", texts: ["Entrance hall", "Press line", "Exit"], ...extra }, headers));

  it("translates, saves, and the viewer finds each string by its hash", async () => {
    const res = await out(await T({ tour_title: "Acme Plant" }));
    assert.equal(res.status, 200);
    assert.equal(res.body.translated, 3);
    assert.deepEqual(res.body.failed, []);
    const map = (await out(await transGet(r(`/translations?tour=${TOUR}&lang=es`, { headers: VIEWER })))).body.map;
    assert.equal(map[hashText("Press line")], "ES(Press line)");
    assert.equal(Object.keys(map).length, 3);
    assert.match(aiCalls[0].input.messages[1].content, /Acme Plant/);
  });

  it("does not translate again what is already translated, and saves tokens", async () => {
    await T();
    aiCalls.length = 0;
    const again = await out(await T());
    assert.equal(again.body.translated, 0);
    assert.equal(again.body.skipped, 3);
    assert.equal(aiCalls.length, 0);
    const some = await out(await T({ texts: ["Entrance hall", "A brand new label"] }));
    assert.equal(some.body.translated, 1);
  });

  it("a person's edit survives re-translating everything", async () => {
    await T();
    const edit = await out(await transPut(put("/translations", { tour: TOUR, lang: "es", rows: [{ source: "Press line", text: "Línea de prensas" }] })));
    assert.equal(edit.body.written, 1);
    aiCalls.length = 0;
    aiImpl = chatEngine((t) => `NEW(${t})`);
    const redo = await out(await T({ mode: "all" }));
    assert.equal(redo.body.translated, 2);
    assert.equal(redo.body.skipped_reviewed, 1);
    const rows = (await out(await transGet(r(`/translations?tour=${TOUR}&lang=es&full=1`, { headers: OWNER })))).body.rows;
    const press = rows.find((x: any) => x.source === "Press line");
    assert.equal(press.text, "Línea de prensas");
    assert.equal(press.reviewed, true);
    assert.equal(press.engine, "manual");
    assert.equal(rows.find((x: any) => x.source === "Exit").text, "NEW(Exit)");
  });

  it("never saves an answer that failed the checks, and says why", async () => {
    aiImpl = chatEngine(() => "Welcome to the assembly line"); // English for a Hindi request
    const res = await out(await translatePost(post("/translate", { tour: TOUR, lang: "hi", texts: ["Entrance hall"] })));
    assert.equal(res.status, 200);
    assert.equal(res.body.translated, 0);
    assert.match(res.body.failed[0].reason, /wrong_script/);
    assert.deepEqual((await out(await transGet(r(`/translations?tour=${TOUR}&lang=hi`, { headers: VIEWER })))).body.map, {});
  });

  it("reports a Cloudflare AI quota stop clearly", async () => {
    aiImpl = async () => { throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); };
    const res = await out(await T());
    assert.equal(res.status, 200);
    assert.equal(res.body.translated, 0);
    assert.equal(res.body.failed.length, 3);
  });

  it("translates subtitles from the audio's own language, not the tour's", async () => {
    await configPut(put("/config", { tour: TOUR, default_language: "en" }));
    const res = await out(await translatePost(post("/translate", { tour: TOUR, lang: "en", source_lang: "hi", kind: "subtitle", texts: ["नमस्ते, फैक्ट्री में आपका स्वागत है।"] })));
    assert.equal(res.status, 200);
    assert.match(aiCalls[0].input.messages[1].content, /"source_language":"Hindi"/);
    assert.match(aiCalls[0].input.messages[0].content, /subtitle lines/);
  });

  it("refuses the tour's own language, bad input and oversize requests", async () => {
    assert.equal((await out(await T({ lang: "en" }))).body.error, "same_language");
    assert.equal((await T({ lang: "xx" })).status, 400);
    assert.equal((await T({ texts: [] })).status, 400);
    assert.equal((await T({ texts: [5] })).status, 400);
    assert.equal((await T({ texts: Array.from({ length: 26 }, (_, i) => `t${i}`) })).status, 400);
    assert.equal((await T({ texts: ["x".repeat(7001)] })).status, 400);
    assert.equal((await T({ texts: Array.from({ length: 10 }, () => "y".repeat(5000)) })).status, 413);
  });

  it("a flood from one account is slowed down", async () => {
    let limited = 0;
    for (let i = 0; i < 95; i++) {
      const res = await translatePost(post("/translate", { tour: TOUR, lang: "es", texts: [`label ${i} here`] }));
      if (res.status === 429) limited++;
    }
    assert.ok(limited >= 4, `limited ${limited}`);
  });
});

describe("removing a language", () => {
  it("stops offering it and deletes its strings", async () => {
    await configPut(put("/config", { tour: TOUR, add_languages: ["es", "fr"] }));
    await translatePost(post("/translate", { tour: TOUR, lang: "es", texts: ["Hello there"] }));
    const res = await out(await transDelete(r(`/translations?tour=${TOUR}&lang=es`, { method: "DELETE", headers: OWNER })));
    assert.equal(res.body.deleted, 1);
    const cfg = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.deepEqual(cfg.body.config.available_languages, ["fr"]);
    assert.deepEqual((await out(await transGet(r(`/translations?tour=${TOUR}&lang=es`, { headers: VIEWER })))).body.map, {});
  });
});

/* ── subtitles ──────────────────────────────────────────────────────────── */

const noise = (seconds: number) => {
  const a = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  for (let i = 0; i < a.length; i++) a[i] = 0.3 * Math.sin(i / 20);
  return a;
};
const wavReq = (bytes: Uint8Array, qs = "", headers = OWNER) => r(`/transcribe?tour=${TOUR}${qs}`, { method: "POST", headers, body: bytes as any });

describe("transcribe", () => {
  const whisper = (segments: any[], extra: Record<string, unknown> = {}) => async () => ({ transcription_info: { language: "en", duration: 6 }, text: "x", segments, ...extra });

  it("cleans Whisper's answer: made-up lines dropped, long lines split, times kept", async () => {
    aiImpl = whisper([
      { start: 0, end: 2, text: " Welcome to the factory." },
      { start: 2, end: 4, text: " ♪" },
      { start: 4, end: 16, text: " This is the press line where we make every part for the new model. And over here is the paint shop with its robots." },
    ]);
    const res = await out(await transcribePost(wavReq(encodeWav(noise(20)), "&language=en")));
    assert.equal(res.status, 200);
    assert.equal(res.body.language, "en");
    const texts = res.body.segments.map((s: any) => s.text);
    assert.equal(texts[0], "Welcome to the factory.");
    assert.ok(!texts.includes("♪"));
    assert.ok(texts.length >= 3, "the long sentence was split");
    for (const s of res.body.segments) assert.ok(s.end > s.start && s.text.length <= 84);
    assert.equal(aiCalls[0].input.language, "en");
    assert.equal(typeof aiCalls[0].input.audio, "string");
  });

  it("falls back to the VTT, then to the plain text, when there are no segments", async () => {
    aiImpl = async () => ({ transcription_info: { language: "en" }, vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nFrom the vtt", segments: [] });
    let res = await out(await transcribePost(wavReq(encodeWav(noise(4)))));
    assert.deepEqual(res.body.segments, [{ start: 1, end: 2.5, text: "From the vtt" }]);
    aiImpl = async () => ({ text: "Only plain text here", segments: [] });
    res = await out(await transcribePost(wavReq(encodeWav(noise(4)))));
    assert.equal(res.body.segments[0].text, "Only plain text here");
    assert.equal(res.body.segments[0].start, 0);
  });

  it("returns no lines for a piece with no speech", async () => {
    aiImpl = whisper([{ start: 0, end: 5, text: "[Music]" }]);
    assert.deepEqual((await out(await transcribePost(wavReq(encodeWav(noise(5)))))).body.segments, []);
  });

  it("refuses what is not a short WAV, before any AI is spent", async () => {
    assert.equal((await transcribePost(wavReq(new Uint8Array(500)))).status, 400);
    assert.equal((await transcribePost(wavReq(new TextEncoder().encode("not audio at all, just text padding".repeat(5))))).status, 400);
    assert.equal((await transcribePost(wavReq(encodeWav(noise(0.1))))).status, 400);
    assert.equal((await transcribePost(wavReq(encodeWav(noise(51))))).status, 413);
    assert.equal((await transcribePost(wavReq(new Uint8Array(3_000_000)))).status, 413);
    assert.equal((await transcribePost(wavReq(encodeWav(noise(2)), "&language=xx"))).status, 400);
    assert.equal(aiCalls.length, 0);
  });

  it("explains running out of the free daily speech allowance", async () => {
    aiImpl = async () => { throw new Error("AiError: 4006: daily free allocation exhausted (neurons)"); };
    const res = await out(await transcribePost(wavReq(encodeWav(noise(3)))));
    assert.equal(res.status, 429);
    assert.equal(res.body.error, "quota");
    assert.match(res.body.message, /allowance/);
  });
});

describe("saving subtitles", () => {
  const KEY = audioKey("https://cdn.example/panoramas/t/a.mp3");
  const segs = [{ start: 0, end: 2, text: "Welcome." }, { start: 2, end: 5, text: "This is the line." }];
  const body = (extra: Record<string, unknown> = {}) => ({ tour: TOUR, key: KEY, ref: "panoramas/t/a.mp3", language: "en", duration: 5, segments: segs, ...extra });

  it("saves; the visitor reads the lines and the config lists which audio has subtitles", async () => {
    assert.equal((await out(await transcriptPut(put("/transcript", body())))).body.written, true);
    const t = await out(await transcriptGet(r(`/transcript?tour=${TOUR}&key=${KEY}`, { headers: VIEWER })));
    assert.deepEqual(t.body.transcript.segments, segs);
    assert.equal(t.body.transcript.language, "en");
    const cfg = await out(await configGet(r(`/config?tour=${TOUR}`, { headers: VIEWER })));
    assert.deepEqual(cfg.body.transcripts, [{ key: KEY, language: "en", lines: 2, duration: 5 }]);
    assert.equal((await out(await transcriptGet(r(`/transcript?tour=${TOUR}&key=${KEY}`)))).status, 404, "a stranger cannot read it");
  });

  it("the editor sees a list of every transcript of the tour; a visitor cannot", async () => {
    await transcriptPut(put("/transcript", body()));
    const list = await out(await transcriptGet(r(`/transcript?tour=${TOUR}`, { headers: OWNER })));
    assert.equal(list.body.items.length, 1);
    assert.equal((await transcriptGet(r(`/transcript?tour=${TOUR}`, { headers: VIEWER }))).status, 401);
  });

  it("an automatic re-run cannot overwrite corrections; 'redo' (force) can", async () => {
    await transcriptPut(put("/transcript", body({ reviewed: true, segments: [{ start: 0, end: 2, text: "Corrected." }] })));
    const auto = await out(await transcriptPut(put("/transcript", body())));
    assert.equal(auto.body.written, false);
    assert.equal(auto.body.reason, "reviewed_transcript_protected");
    assert.equal((await out(await transcriptPut(put("/transcript", body({ force: true }))))).body.written, true);
  });

  it("refuses bad input", async () => {
    assert.equal((await transcriptPut(put("/transcript", body({ key: "short" })))).status, 400);
    assert.equal((await transcriptPut(put("/transcript", body({ language: "xx" })))).status, 400);
    assert.equal((await transcriptPut(put("/transcript", body({ segments: [] })))).status, 400);
    assert.equal((await transcriptPut(put("/transcript", body({ segments: [{ start: 3, end: 1, text: "backwards" }] })))).status, 400);
    assert.equal((await transcriptGet(r(`/transcript?tour=${TOUR}&key=zzz`, { headers: VIEWER }))).status, 400);
  });

  it("deletes", async () => {
    await transcriptPut(put("/transcript", body()));
    assert.equal((await out(await transcriptDelete(r(`/transcript?tour=${TOUR}&key=${KEY}`, { method: "DELETE", headers: OWNER })))).body.deleted, 1);
    assert.equal((await out(await transcriptGet(r(`/transcript?tour=${TOUR}&key=${KEY}`, { headers: VIEWER })))).body.transcript, null);
  });
});

describe("purge and self-test", () => {
  it("purge leaves nothing of a tour in Cloudflare, and nothing of other tours is touched", async () => {
    for (const t of [TOUR, OTHER]) {
      await configPut(put("/config", { tour: t, add_languages: ["es"] }));
      await translatePost(post("/translate", { tour: t, lang: "es", texts: ["Hello there"] }));
      await transcriptPut(put("/transcript", { tour: t, key: "b".repeat(40), language: "en", segments: [{ start: 0, end: 1, text: "hi" }] }));
    }
    assert.equal((await out(await purgePost(post("/purge", { tour: TOUR })))).body.deleted, 3);
    for (const table of ["tour_language", "translations", "transcripts"]) {
      assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tour_id = ?`).get(TOUR)!.n, 0, table);
      assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tour_id = ?`).get(OTHER)!.n, 1, table);
    }
  });

  it("self-test is for the platform owner and reports every check", async () => {
    assert.equal((await selftestGet(r("/selftest", { headers: { "x-test-role": "org_admin" } }))).status, 403);
    assert.equal((await selftestGet(r("/selftest"))).status, 401);
    aiImpl = async (model: string, input: any) => (input.audio ? { segments: [] } : chatEngine()(model, input));
    const res = await out(await selftestGet(r("/selftest?whisper=1", { headers: OWNER })));
    assert.equal(res.status, 200);
    const names = res.body.checks.map((c: any) => c.name);
    assert.ok(names.includes("Database write, read and delete"));
    assert.ok(names.includes("Translation engine: workers-ai"));
    assert.ok(names.includes("Speech to text (one second of silence)"));
    for (const c of res.body.checks.filter((c: any) => /Vercel|Worker|Database|workers-ai|Speech/.test(c.name))) assert.equal(c.ok, true, `${c.name}: ${c.detail}`);
    assert.ok(!JSON.stringify(res.body).includes(SECRET), "never prints the secret");
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM tour_language").get()!.n, 0, "scratch data removed");
  });

  it("self-test pinpoints a missing setting", async () => {
    delete process.env.LANGUAGE_API_SECRET;
    const res = await out(await selftestGet(r("/selftest", { headers: OWNER })));
    assert.equal(res.body.ok, false);
    assert.equal(res.body.checks.find((c: any) => c.name.includes("LANGUAGE_API_SECRET")).ok, false);
  });
});
