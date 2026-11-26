/**
 * The editor's two long jobs with a pretend network: transcribing a recording
 * piece by piece, and translating a whole tour in chunks.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TranscribeError, chunkTexts, isFatalApi, isRetryable, transcribeSamples, translateInChunks, vocabularyPrompt } from "@/lib/language/pipeline";
import { SAMPLE_RATE, planPieces } from "@/lib/language/wav";

const noSleep = async () => {};
const apiError = (status: number, code: string, message = code) => Object.assign(new Error(message), { status, code });

function speech(seconds: number, silences: number[]): Float32Array {
  const a = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  for (let i = 0; i < a.length; i++) {
    const t = i / SAMPLE_RATE;
    a[i] = silences.some((s) => Math.abs(t - s) < 0.25) ? 0 : 0.3 * Math.sin(i / 20);
  }
  return a;
}

describe("transcribing a recording", () => {
  const SIL = [40, 80, 120];
  const samples = speech(150, SIL);

  it("sends each piece, puts the lines back at the right moment, and reports progress", async () => {
    const pieces = planPieces(samples);
    const calls: { language?: string; bytes: number }[] = [];
    const progress: number[] = [];
    const res = await transcribeSamples({
      tourId: "t",
      samples,
      api: {
        transcribe: async (_t, wav, o) => {
          calls.push({ language: o.language, bytes: wav.length });
          return { language: "en", duration: 1, segments: [{ start: 1, end: 3, text: `piece ${calls.length}` }] };
        },
      },
      onProgress: (p) => progress.push(p.done),
      sleep: noSleep,
      concurrency: 1,
    });
    assert.equal(calls.length, pieces.length);
    assert.equal(res.language, "en");
    assert.equal(res.segments.length, pieces.length);
    // each line is 1 s into its own piece
    res.segments.forEach((s, i) => assert.ok(Math.abs(s.start - (pieces[i].start / SAMPLE_RATE + 1)) < 0.02, `line ${i}`));
    for (let i = 1; i < res.segments.length; i++) assert.ok(res.segments[i].start >= res.segments[i - 1].end);
    assert.equal(progress[progress.length - 1], pieces.length);
    assert.deepEqual([...progress].sort((a, b) => a - b), progress, "progress never goes backwards");
    assert.equal(res.duration, 150);
  });

  it("gives the tour's own words as a hint only once the language is known", async () => {
    const seen: { language?: string; prompt?: string }[] = [];
    const api = {
      transcribe: async (_t: string, _w: Uint8Array, o: { language?: string; prompt?: string }) => {
        seen.push({ language: o.language, prompt: o.prompt });
        return { language: "hi", duration: 1, segments: [{ start: 1, end: 2, text: "x" }] };
      },
    };
    await transcribeSamples({ tourId: "t", samples, api, prompt: "Acme, Boiler Hall", sleep: noSleep, concurrency: 1 });
    assert.equal(seen[0].prompt, undefined, "the first piece is detected without a hint");
    assert.ok(seen.length > 1);
    for (const s of seen.slice(1)) {
      assert.equal(s.language, "hi");
      assert.equal(s.prompt, "Acme, Boiler Hall");
    }
    seen.length = 0;
    await transcribeSamples({ tourId: "t", samples, api, language: "hi", prompt: "Acme", sleep: noSleep, concurrency: 1 });
    assert.ok(seen.every((s) => s.language === "hi" && s.prompt === "Acme"), "a chosen language uses the hint from the start");
  });

  it("keeps lines in order even when pieces finish out of order", async () => {
    const res = await transcribeSamples({
      tourId: "t",
      samples,
      concurrency: 3,
      sleep: noSleep,
      api: {
        transcribe: async (_t, wav) => {
          // a shorter piece answers faster
          await new Promise((r) => setTimeout(r, 200 - Math.min(190, wav.length / 20000)));
          return { language: "en", duration: 1, segments: [{ start: 0.5, end: 2, text: `len ${wav.length}` }] };
        },
      },
    });
    for (let i = 1; i < res.segments.length; i++) assert.ok(res.segments[i].start > res.segments[i - 1].start);
  });

  it("fixes the language from the first piece and uses it for the rest", async () => {
    const seen: (string | undefined)[] = [];
    await transcribeSamples({
      tourId: "t",
      samples,
      concurrency: 1,
      sleep: noSleep,
      api: { transcribe: async (_t, _w, o) => { seen.push(o.language); return { language: "hi", duration: 1, segments: [{ start: 0, end: 1, text: "नमस्ते" }] }; } },
    });
    assert.equal(seen[0], undefined, "the first piece is auto-detected");
    assert.ok(seen.slice(1).every((l) => l === "hi"));
  });

  it("uses a language the person pinned from the start", async () => {
    const seen: (string | undefined)[] = [];
    await transcribeSamples({ tourId: "t", samples: speech(10, []), language: "de", sleep: noSleep, api: { transcribe: async (_t, _w, o) => { seen.push(o.language); return { language: "de", duration: 1, segments: [] }; } } });
    assert.deepEqual(seen, ["de"]);
  });

  it("does not pay to transcribe silence", async () => {
    let calls = 0;
    const res = await transcribeSamples({
      tourId: "t",
      samples: new Float32Array(100 * SAMPLE_RATE),
      sleep: noSleep,
      api: { transcribe: async () => { calls++; return { language: "en", duration: 1, segments: [] }; } },
    });
    assert.equal(calls, 0);
    assert.ok(res.silentPieces >= 2);
    assert.deepEqual(res.segments, []);
    assert.equal(res.language, null);
  });

  it("tries a piece again after a hiccup, but not after a real error", async () => {
    let n = 0;
    const flaky = await transcribeSamples({
      tourId: "t",
      samples: speech(10, []),
      sleep: noSleep,
      api: { transcribe: async () => { if (++n < 3) throw apiError(502, "ai_failed"); return { language: "en", duration: 1, segments: [{ start: 0, end: 1, text: "ok" }] }; } },
    });
    assert.equal(n, 3);
    assert.equal(flaky.segments[0].text, "ok");

    n = 0;
    await assert.rejects(
      transcribeSamples({ tourId: "t", samples: speech(10, []), sleep: noSleep, api: { transcribe: async () => { n++; throw apiError(400, "not_wav", "bad audio"); } } }),
      (e: unknown) => e instanceof TranscribeError && /failed at 0:00/.test((e as Error).message)
    );
    assert.equal(n, 1, "a 400 is not retried");
  });

  it("gives up with a clear message after repeated hiccups, naming where it stopped", async () => {
    await assert.rejects(
      transcribeSamples({ tourId: "t", samples: speech(10, []), retries: 2, sleep: noSleep, api: { transcribe: async () => { throw apiError(504, "worker_unreachable"); } } }),
      (e: unknown) => e instanceof TranscribeError
    );
  });

  it("stops everything at once when the allowance is used up", async () => {
    let calls = 0;
    await assert.rejects(
      transcribeSamples({
        tourId: "t",
        samples,
        concurrency: 1,
        sleep: noSleep,
        api: { transcribe: async () => { calls++; throw apiError(429, "quota", "allowance used up"); } },
      }),
      (e: unknown) => (e as { code?: string }).code === "quota"
    );
    assert.equal(calls, 1);
  });

  it("can be cancelled", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    await assert.rejects(
      transcribeSamples({
        tourId: "t",
        samples,
        concurrency: 1,
        sleep: noSleep,
        signal: ctrl.signal,
        api: { transcribe: async () => { calls++; ctrl.abort(); return { language: "en", duration: 1, segments: [{ start: 0, end: 1, text: "x" }] }; } },
      }),
      (e: unknown) => (e as Error).name === "AbortError"
    );
    assert.equal(calls, 1);
  });

  it("reads the language as the one most of the audio was in", async () => {
    let n = 0;
    const res = await transcribeSamples({
      tourId: "t",
      samples,
      concurrency: 1,
      language: "auto",
      sleep: noSleep,
      api: { transcribe: async () => ({ language: ++n === 2 ? "fr" : "en", duration: 1, segments: [{ start: 0, end: 1, text: "x" }] }) },
    });
    assert.equal(res.language, "en");
  });
});

describe("error kinds", () => {
  it("knows which to retry and which to stop on", () => {
    assert.equal(isRetryable(apiError(0, "network")), true);
    assert.equal(isRetryable(apiError(502, "ai_failed")), true);
    assert.equal(isRetryable(apiError(504, "x")), true);
    assert.equal(isRetryable(apiError(400, "x")), false);
    assert.equal(isRetryable(apiError(429, "quota")), false);
    assert.equal(isRetryable(Object.assign(new Error("x"), { name: "AbortError" })), false);
    assert.equal(isFatalApi(apiError(429, "quota")), true);
    assert.equal(isFatalApi(apiError(401, "unauthorized")), true);
    assert.equal(isFatalApi(apiError(502, "ai_failed")), false);
  });
});

describe("translating a whole tour", () => {
  const ok = (n: number, extra: Record<string, unknown> = {}) => ({ translated: n, skipped: 0, skipped_reviewed: 0, failed: [], engines: {}, quota_hit: false, ...extra });
  const texts = (n: number) => Array.from({ length: n }, (_, i) => `Label ${i}`);

  it("sends 25 at a time and adds the totals up", async () => {
    const sizes: number[] = [];
    const prog: [number, number][] = [];
    const res = await translateInChunks({
      tourId: "t", lang: "es", texts: texts(60), sleep: noSleep,
      onProgress: (d, t) => prog.push([d, t]),
      api: { translate: async (_t, a) => { sizes.push(a.texts.length); return ok(a.texts.length - 1, { skipped: 1, failed: [{ text: a.texts[0], reason: "x" }] }); } },
    });
    assert.deepEqual(sizes, [25, 25, 10]);
    assert.equal(res.translated, 57);
    assert.equal(res.skipped, 3);
    assert.equal(res.failed.length, 3);
    assert.deepEqual(prog[prog.length - 1], [60, 60]);
  });

  it("passes the language, mode, kind and tour name along", async () => {
    let seen: any;
    await translateInChunks({ tourId: "t", lang: "hi", texts: ["a b"], sourceLang: "en", mode: "all", kind: "subtitle", tourTitle: "Acme", sleep: noSleep, api: { translate: async (_t, a) => { seen = a; return ok(1); } } });
    assert.deepEqual(seen, { lang: "hi", texts: ["a b"], source_lang: "en", mode: "all", kind: "subtitle", tour_title: "Acme" });
  });

  it("stops asking when every engine says the allowance is used up", async () => {
    let calls = 0;
    const res = await translateInChunks({
      tourId: "t", lang: "es", texts: texts(80), sleep: noSleep,
      api: { translate: async (_t, a) => { calls++; return ok(0, { quota_hit: true, failed: a.texts.map((text) => ({ text, reason: "quota" })) }); } },
    });
    assert.equal(calls, 1);
    assert.equal(res.quotaHit, true);
    assert.equal(res.failed.length, 80, "everything not done is reported");
  });

  it("keeps going when only some strings hit the allowance", async () => {
    let calls = 0;
    const res = await translateInChunks({ tourId: "t", lang: "es", texts: texts(60), sleep: noSleep, api: { translate: async () => { calls++; return ok(10, { quota_hit: true }); } } });
    assert.equal(calls, 3);
    assert.equal(res.translated, 30);
  });

  it("retries a hiccup once, then records the chunk as failed and carries on", async () => {
    let calls = 0;
    const res = await translateInChunks({
      tourId: "t", lang: "es", texts: texts(30), sleep: noSleep,
      api: { translate: async (_t, a) => { calls++; if (a.texts.length === 25) throw apiError(502, "language_error", "bad gateway"); return ok(a.texts.length); } },
    });
    assert.equal(calls, 3, "chunk 1 twice, chunk 2 once");
    assert.equal(res.translated, 5);
    assert.equal(res.failed.length, 25);
  });

  it("stops on a permissions or login problem instead of repeating it", async () => {
    let calls = 0;
    await assert.rejects(
      translateInChunks({ tourId: "t", lang: "es", texts: texts(60), sleep: noSleep, api: { translate: async () => { calls++; throw apiError(403, "forbidden"); } } }),
      (e: unknown) => (e as { status?: number }).status === 403
    );
    assert.equal(calls, 1);
  });

  it("makes no request for nothing", async () => {
    let calls = 0;
    const res = await translateInChunks({ tourId: "t", lang: "es", texts: ["", "  "], sleep: noSleep, api: { translate: async () => { calls++; return ok(0); } } });
    assert.equal(calls, 0);
    assert.equal(res.translated, 0);
  });

  it("chunks by size too", () => {
    const big = Array.from({ length: 5 }, () => "x".repeat(5000));
    assert.deepEqual(chunkTexts(big).map((c) => c.length), [2, 2, 1]);
  });
});

describe("words to help the speech engine", () => {
  it("lists the tour's own short names, once each, within the limit", () => {
    const p = vocabularyPrompt(["Acme Plant", "Acme plant", "Press Line 3", "x", "A very long sentence that is certainly more than forty characters long for sure", "Paint Shop"]);
    assert.equal(p, "Acme Plant, Press Line 3, Paint Shop");
    assert.ok(vocabularyPrompt(Array.from({ length: 100 }, (_, i) => `Station number ${i}`)).length <= 220);
    assert.equal(vocabularyPrompt([]), "");
  });
});
