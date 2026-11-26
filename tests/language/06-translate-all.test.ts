/**
 * Translating a whole tour (words + subtitle lines), counting what is missing,
 * and the choice of spoken language for Whisper.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addTotals, describeRun, emptyTotals, linesBySpokenLanguage, loadLinesToTranslate, missingTexts, translateEverything } from "@/lib/language/translateAll";
import { canPinLanguage, toWhisperCode } from "@/lib/language/whisperLangs";
import { hashText } from "@/lib/language/hash";
import { lineAt, normalizeEdited } from "@/lib/language/segments";
import { downmix } from "@/lib/audioPrep";
import { backgroundCss, colorToHex, parseColor, resolveSettings } from "@/lib/language/settings";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";

const noSleep = async () => {};

type Call = { lang: string; texts: string[]; source_lang?: string; kind?: string; mode?: string };

function fakeApi(opts: { transcripts?: Record<string, { language: string; lines: string[] }>; quota?: boolean } = {}) {
  const calls: Call[] = [];
  const api = {
    transcript: async (_tour: string, key: string) => {
      const t = opts.transcripts?.[key];
      return t
        ? { key, ref: key, language: t.language, duration: 10, engine: "whisper", reviewed: false, updated_at: 0, segments: t.lines.map((text, i) => ({ start: i, end: i + 1, text })) }
        : null;
    },
    translate: async (_tour: string, a: Call) => {
      calls.push(a);
      if (opts.quota) return { translated: 0, skipped: 0, skipped_reviewed: 0, failed: a.texts.map((text) => ({ text, reason: "quota" })), engines: {}, quota_hit: true };
      return { translated: a.texts.length, skipped: 0, skipped_reviewed: 0, failed: [], engines: { gemini: a.texts.length }, quota_hit: false };
    },
  };
  return { api, calls };
}

describe("grouping subtitle lines", () => {
  it("groups by the language spoken, drops blanks and repeats", () => {
    const m = linesBySpokenLanguage([
      { language: "hi", segments: [{ text: "नमस्ते" }, { text: "  " }, { text: "नमस्ते" }, { text: "धन्यवाद" }] },
      { language: "en", segments: [{ text: "Welcome" }] },
      { language: "hi", segments: [{ text: "धन्यवाद" }, { text: "फिर मिलेंगे" }] },
    ]);
    assert.deepEqual(m.get("hi"), ["नमस्ते", "धन्यवाद", "फिर मिलेंगे"]);
    assert.deepEqual(m.get("en"), ["Welcome"]);
  });
});

describe("what is still missing", () => {
  it("lists texts without a translation, once each", () => {
    const have = new Set([hashText("Hello")]);
    assert.deepEqual(missingTexts(["Hello", "World", "World", "  ", "Again"], have), ["World", "Again"]);
  });
  it("sees a text as present whichever way its accents were typed", () => {
    const have = new Set([hashText("Café")]);
    assert.deepEqual(missingTexts(["Café"], have), []);
  });
});

describe("translating everything", () => {
  it("translates the words, then the subtitle lines in the language they were spoken, skipping audio already in the target language", async () => {
    const { api, calls } = fakeApi({
      transcripts: {
        a: { language: "en", lines: ["Welcome to the plant", "Mind the step"] },
        b: { language: "es", lines: ["Hola"] },
      },
    });
    const progress: [number, number][] = [];
    const r = await translateEverything({
      tourId: "t",
      lang: "es",
      sourceLang: "en",
      labels: ["Entrance", "Kitchen"],
      transcripts: [
        { key: "a", language: "en" },
        { key: "b", language: "es" },
      ],
      api,
      sleep: noSleep,
      onProgress: (d, t) => progress.push([d, t]),
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { lang: "es", texts: ["Entrance", "Kitchen"], source_lang: "en", mode: undefined, kind: "label", tour_title: undefined });
    assert.equal(calls[1].kind, "subtitle");
    assert.equal(calls[1].source_lang, "en");
    assert.deepEqual(calls[1].texts, ["Welcome to the plant", "Mind the step"]);
    assert.equal(r.labels.translated, 2);
    assert.equal(r.subtitles.translated, 2);
    assert.equal(r.subtitleLines, 2);
    assert.deepEqual(progress[progress.length - 1], [4, 4]);
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i][0] >= progress[i - 1][0], "progress never goes backwards");
  });

  it("does not send the tour's words when the target is the language they are written in", async () => {
    const { api, calls } = fakeApi({ transcripts: { a: { language: "hi", lines: ["नमस्ते"] } } });
    const r = await translateEverything({ tourId: "t", lang: "en", sourceLang: "en", labels: ["Hello"], transcripts: [{ key: "a", language: "hi" }], api, sleep: noSleep });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "subtitle");
    assert.equal(calls[0].source_lang, "hi");
    assert.equal(r.labels.translated, 0);
    assert.equal(r.subtitles.translated, 1);
  });

  it("works for a tour with no subtitles at all", async () => {
    const { api, calls } = fakeApi();
    const r = await translateEverything({ tourId: "t", lang: "fr", sourceLang: "en", labels: ["A"], transcripts: [], api, sleep: noSleep });
    assert.equal(calls.length, 1);
    assert.equal(r.subtitleLines, 0);
    assert.equal(r.labels.translated, 1);
  });

  it("stops asking once the allowance is used up, and says which lines were not tried", async () => {
    const { api, calls } = fakeApi({ quota: true, transcripts: { a: { language: "en", lines: ["One", "Two"] } } });
    const r = await translateEverything({ tourId: "t", lang: "de", sourceLang: "en", labels: ["A", "B"], transcripts: [{ key: "a", language: "en" }], api, sleep: noSleep });
    assert.equal(calls.length, 1, "only the first request was made");
    assert.equal(r.labels.quotaHit, true);
    assert.equal(r.subtitles.quotaHit, true);
    assert.equal(r.subtitles.failed.length, 2);
    assert.match(describeRun("German", r), /allowance/i);
  });

  it("passes the mode and tour title through", async () => {
    const { api, calls } = fakeApi();
    await translateEverything({ tourId: "t", lang: "de", sourceLang: "en", labels: ["A"], transcripts: [], api, sleep: noSleep, mode: "all", tourTitle: "Acme Plant" });
    assert.equal(calls[0].mode, "all");
  });

  it("can be cancelled between audio files", async () => {
    const { api } = fakeApi({ transcripts: { a: { language: "en", lines: ["x"] }, b: { language: "en", lines: ["y"] } } });
    const ctrl = new AbortController();
    const wrapped = {
      ...api,
      transcript: async (t: string, k: string, s?: AbortSignal) => {
        ctrl.abort();
        return api.transcript(t, k);
      },
    };
    await assert.rejects(
      loadLinesToTranslate("t", "es", [{ key: "a", language: "en" }, { key: "b", language: "en" }], wrapped as never, ctrl.signal),
      (e: Error) => e.name === "AbortError"
    );
  });
});

describe("saying how it went", () => {
  const ok = { labels: { ...emptyTotals(), translated: 3 }, subtitles: emptyTotals(), subtitleLines: 0 };
  it("reports a clean run", () => {
    assert.equal(describeRun("German", ok), "Translated 3 texts into German.");
  });
  it("reports a language that was already complete", () => {
    assert.equal(describeRun("German", { labels: emptyTotals(), subtitles: emptyTotals(), subtitleLines: 0 }), "German is already up to date.");
  });
  it("mentions corrections that were kept and texts that failed", () => {
    const r = { labels: { ...emptyTotals(), translated: 1, skippedReviewed: 1, failed: [{ text: "x", reason: "bad" }] }, subtitles: emptyTotals(), subtitleLines: 0 };
    const s = describeRun("German", r);
    assert.match(s, /1 text you corrected was kept/);
    assert.match(s, /1 text could not be translated/);
  });
  it("adds totals", () => {
    const t = addTotals({ ...emptyTotals(), translated: 1, quotaHit: true }, { ...emptyTotals(), translated: 2, failed: [{ text: "a", reason: "b" }] });
    assert.equal(t.translated, 3);
    assert.equal(t.quotaHit, true);
    assert.equal(t.failed.length, 1);
  });
});

describe("choosing the spoken language", () => {
  it("passes ordinary codes through and renames the ones Whisper spells differently", () => {
    assert.equal(toWhisperCode("en"), "en");
    assert.equal(toWhisperCode("zh-TW"), "zh");
    assert.equal(toWhisperCode("jv"), "jw");
    assert.equal(toWhisperCode("pt-BR"), "pt");
  });
  it("refuses languages Whisper cannot be told to listen for", () => {
    assert.equal(toWhisperCode("zu"), null);
    assert.equal(toWhisperCode("or"), null);
    assert.equal(canPinLanguage("zu"), false);
  });
  it("covers most of the site's languages", () => {
    const ok = SUPPORTED_LANGUAGES.filter((l) => canPinLanguage(l.code));
    assert.ok(ok.length >= SUPPORTED_LANGUAGES.length - 4, `only ${ok.length} of ${SUPPORTED_LANGUAGES.length}`);
    assert.ok(ok.some((l) => l.code === "hi"));
  });
});

describe("holding a line on screen", () => {
  const segs = [
    { start: 1, end: 2, text: "a" },
    { start: 2.1, end: 3, text: "b" },
    { start: 6, end: 7, text: "c" },
  ];
  it("shows the line being spoken", () => {
    assert.equal(lineAt(segs, 1.5), 0);
    assert.equal(lineAt(segs, 2.5), 1);
  });
  it("keeps a line a moment after it ends, but not through a long gap", () => {
    assert.equal(lineAt(segs, 3.2), 1);
    assert.equal(lineAt(segs, 3.5), -1);
    assert.equal(lineAt(segs, 5), -1);
  });
  it("shows nothing before the first line or for no lines", () => {
    assert.equal(lineAt(segs, 0.5), -1);
    assert.equal(lineAt([], 1), -1);
  });
  it("lets the next line take over straight away", () => {
    assert.equal(lineAt(segs, 2.05), 0, "still within the hold after line 0");
    assert.equal(lineAt(segs, 2.1), 1);
  });
});

describe("lines after hand editing", () => {
  it("drops blank lines, orders by time, and stops lines overlapping", () => {
    const out = normalizeEdited([
      { start: 5, end: 8, text: " second " },
      { start: 1, end: 6, text: "first" },
      { start: 9, end: 10, text: "   " },
    ]);
    assert.deepEqual(out, [
      { start: 1, end: 5, text: "first" },
      { start: 5, end: 8, text: "second" },
    ]);
  });
  it("gives every line some length and survives odd numbers", () => {
    const out = normalizeEdited([
      { start: 2, end: 2, text: "a" },
      { start: 2, end: 1, text: "b" },
      { start: NaN, end: 3, text: "c" },
      { start: -4, end: -1, text: "d" },
    ]);
    assert.equal(out.length, 3);
    for (const s of out) assert.ok(s.end > s.start && s.start >= 0);
    for (let i = 1; i < out.length; i++) assert.ok(out[i].start >= out[i - 1].end - 1e-9, "no overlap");
  });
  it("keeps line breaks inside a line", () => {
    assert.equal(normalizeEdited([{ start: 0, end: 1, text: "one \n  two" }])[0].text, "one\ntwo");
  });
});

describe("mixing channels down to one", () => {
  it("averages the channels", () => {
    const m = downmix([Float32Array.from([1, 0, -1]), Float32Array.from([0, 1, -1])]);
    assert.deepEqual(Array.from(m), [0.5, 0.5, -1]);
  });
  it("copies a single channel instead of sharing it", () => {
    const a = Float32Array.from([0.1, 0.2]);
    const m = downmix([a]);
    m[0] = 9;
    assert.equal(a[0], Float32Array.from([0.1])[0]);
  });
});

describe("subtitle colours", () => {
  it("understands the colour formats the editor and old data use", () => {
    assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColor("#102030"), { r: 16, g: 32, b: 48, a: 1 });
    assert.deepEqual(parseColor("rgba(0, 0, 0, 0.7)"), { r: 0, g: 0, b: 0, a: 0.7 });
    assert.deepEqual(parseColor("rgb(300,0,0)"), { r: 255, g: 0, b: 0, a: 1 });
    assert.equal(parseColor("red"), null);
    assert.equal(parseColor("url(x)"), null);
  });
  it("gives the colour picker a plain #rrggbb", () => {
    assert.equal(colorToHex("rgba(255,0,16,0.5)"), "#ff0010");
    assert.equal(colorToHex("nonsense"), "#000000");
  });
  it("builds the box background from the colour and the opacity", () => {
    assert.equal(backgroundCss({ bgColor: "#000000", opacity: 0.75 }), "rgba(0,0,0,0.75)");
    assert.equal(backgroundCss({ bgColor: "rgba(10,20,30,0.2)", opacity: 1 }), "rgba(10,20,30,1)", "the opacity setting decides, once");
    assert.equal(backgroundCss({ bgColor: "bad", opacity: 2 }), "rgba(0,0,0,1)");
  });
  it("falls back to the defaults for settings that are not valid", () => {
    const r = resolveSettings({ fontSize: 999, textColor: "javascript:alert(1)", position: "middle" });
    assert.equal(r.fontSize, 20);
    assert.equal(r.textColor, "#ffffff");
    assert.equal(r.position, "bottom-center");
  });
});
