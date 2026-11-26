/**
 * The small pure pieces: the key a text is stored under, the key an audio file
 * is found by, the subtitle cleaner, and the audio chunk planner.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { hashText, sha1Hex } from "@/lib/language/hash";
import { audioKey, canonicalAudioRef } from "@/lib/language/audioKey";
import { activeIndex, assemble, breakText, cleanChunk, cleanLanguage, dropRepeatLoops, isNonSpeech, parseVtt, splitLong, type Segment } from "@/lib/language/segments";
import { SAMPLE_RATE, encodeWav, isSilent, planPieces } from "@/lib/language/wav";

describe("text key", () => {
  it("matches the standard SHA-1 for every length around the block edges", () => {
    for (const n of [0, 1, 3, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 5000]) {
      const s = "a".repeat(n);
      assert.equal(sha1Hex(s), crypto.createHash("sha1").update(s).digest("hex"), `length ${n}`);
    }
  });
  it("matches for non-English text and emoji", () => {
    for (const s of ["नमस्ते दुनिया", "你好，世界", "Привет мир", "مرحبا بالعالم", "ñandú 🌍", "Straße"]) {
      assert.equal(sha1Hex(s), crypto.createHash("sha1").update(s).digest("hex"));
    }
  });
  it("treats the same word typed two ways as one key", () => {
    assert.equal(hashText("café"), hashText("café"));
    assert.notEqual(hashText("cafe"), hashText("café"));
  });
  it("is 40 hex characters and stable", () => {
    assert.match(hashText("Hello"), /^[0-9a-f]{40}$/);
    assert.equal(hashText("Hello"), hashText("Hello"));
    assert.equal(hashText("Hello"), crypto.createHash("sha1").update("Hello").digest("hex"));
  });
});

describe("audio key", () => {
  const SB = "https://didezxkaqkenbjqooagj.supabase.co";
  const CF = "https://vpv-media.example.workers.dev";
  const ctx = { mediaBase: CF };

  it("finds the same recording at its Supabase address and its Cloudflare address", () => {
    const a = `${SB}/storage/v1/object/public/panoramas/tour-1/voice%20note.mp3`;
    const b = `${CF}/panoramas/tour-1/voice%20note.mp3`;
    const c = `${CF}/panoramas/tour-1/voice%20note.mp3?t=signed-slip-123`;
    assert.equal(canonicalAudioRef(a, ctx), "panoramas/tour-1/voice note.mp3");
    assert.equal(audioKey(a, ctx), audioKey(b, ctx));
    assert.equal(audioKey(b, ctx), audioKey(c, ctx));
  });
  it("tells different files and different tours apart", () => {
    assert.notEqual(audioKey(`${CF}/panoramas/t1/a.mp3`, ctx), audioKey(`${CF}/panoramas/t1/b.mp3`, ctx));
    assert.notEqual(audioKey(`${CF}/panoramas/t1/a.mp3`, ctx), audioKey(`${CF}/tours/t1/a.mp3`, ctx));
  });
  it("copes with bare paths, site paths and other hosts", () => {
    assert.equal(canonicalAudioRef("panoramas/t/a.mp3"), "panoramas/t/a.mp3");
    assert.equal(canonicalAudioRef("/demo/a.mp3?x=1#y"), "demo/a.mp3");
    assert.equal(canonicalAudioRef("https://Example.COM/a/b.mp3?sig=1"), "example.com/a/b.mp3");
    assert.equal(canonicalAudioRef("//cdn.example.com/x.mp3"), "cdn.example.com/x.mp3");
    assert.equal(canonicalAudioRef(""), "");
    assert.match(audioKey("x"), /^[0-9a-f]{40}$/);
  });
  it("is not fooled by a lookalike host", () => {
    assert.notEqual(audioKey("https://evil.example.workers.dev/panoramas/t/a.mp3", ctx), audioKey(`${CF}/panoramas/t/a.mp3`, ctx));
  });
});

/* ── subtitle lines ─────────────────────────────────────────────────────── */

const seg = (start: number, end: number, text: string, extra: Record<string, unknown> = {}) => ({ start, end, text, ...extra });

describe("what Whisper makes up on silence", () => {
  it("drops music notes, sound notes and empty lines", () => {
    for (const t of ["", "  ", "♪", "♪♪ ♪", "[Music]", "(applause)", "[ Silence ]", "...", "[BLANK_AUDIO]"]) {
      assert.equal(isNonSpeech(seg(0, 2, t)), true, JSON.stringify(t));
    }
    assert.equal(isNonSpeech(seg(0, 2, "Welcome to the plant.")), false);
  });
  it("drops lines Whisper itself marks as no-speech, but keeps a hesitant real one", () => {
    assert.equal(isNonSpeech(seg(0, 2, "Thanks for watching!", { nsp: 0.95, lp: -1.2 })), true);
    assert.equal(isNonSpeech(seg(0, 2, "Mind the step.", { nsp: 0.2, lp: -0.9 })), false);
    assert.equal(isNonSpeech(seg(0, 2, "Quiet but real", { nsp: 0.9, lp: -0.2 })), false);
  });
  it("drops a runaway repeated line", () => {
    const loop = Array.from({ length: 8 }, (_, i) => ({ start: i * 3, end: i * 3 + 3, text: "Thank you for your attention." }));
    const out = dropRepeatLoops([{ start: -3, end: 0, text: "Hello" }, ...loop, { start: 24, end: 27, text: "Bye" }]);
    assert.deepEqual(out.map((s) => s.text), ["Hello", "Thank you for your attention.", "Bye"]);
  });
  it("keeps a line said twice on purpose", () => {
    const out = dropRepeatLoops([seg(0, 1, "No."), seg(1, 2, "No."), seg(2, 3, "Next")]);
    assert.equal(out.length, 3);
  });
  it("drops an over-compressed (looping) line", () => {
    assert.equal(isNonSpeech(seg(0, 20, "la la la la la la la la la la la la", { cr: 4 })), true);
  });
});

describe("splitting long lines", () => {
  it("leaves a short line alone", () => {
    assert.deepEqual(splitLong(seg(1, 3, "Short line.")), [{ start: 1, end: 3, text: "Short line." }]);
  });

  it("splits a long sentence at sentence ends, in order, covering the whole time", () => {
    const text = "This is the first sentence of the tour and it is rather long. Here comes the second one, which is also quite long indeed. And a third.";
    const parts = splitLong(seg(10, 24, text), { maxChars: 70, maxSeconds: 7 });
    assert.ok(parts.length >= 2);
    assert.equal(parts.map((p) => p.text).join(" "), text);
    assert.equal(parts[0].start, 10);
    assert.equal(parts[parts.length - 1].end, 24);
    for (const p of parts) assert.ok(p.text.length <= 70, p.text);
    for (let i = 1; i < parts.length; i++) assert.equal(parts[i].start, parts[i - 1].end, "no gap, no overlap");
  });

  it("times the parts by the real words when they are given", () => {
    const words = [
      { w: " Alpha", s: 0, e: 1 }, { w: " beta.", s: 1, e: 2 },
      { w: " Gamma", s: 8, e: 9 }, { w: " delta.", s: 9, e: 10 },
    ];
    const parts = splitLong(seg(0, 10, "Alpha beta. Gamma delta.", { words }), { maxChars: 12, maxSeconds: 99 });
    assert.deepEqual(parts.map((p) => p.text), ["Alpha beta.", "Gamma delta."]);
    assert.equal(parts[0].start, 0);
    assert.equal(parts[0].end, 2, "first part ends when its last word ends");
    assert.equal(parts[1].start, 8, "second part starts when its first word starts");
    assert.equal(parts[1].end, 10);
  });

  it("falls back to length-based timing when the words do not add up to the text", () => {
    const parts = splitLong(seg(0, 10, "aaaa bbbb. cccc dddd.", { words: [{ w: "zzz", s: 0, e: 1 }] }), { maxChars: 11, maxSeconds: 99 });
    assert.equal(parts.length, 2);
    assert.ok(Math.abs(parts[0].end - 5) < 0.6);
  });

  it("also splits a line that stays on screen too long", () => {
    const parts = splitLong(seg(0, 30, "One sentence here. Another sentence there. And a last one."), { maxChars: 84, maxSeconds: 7 });
    assert.ok(parts.length >= 3);
    for (const p of parts) assert.ok(p.end - p.start <= 14, `${p.end - p.start}`);
  });

  it("splits Chinese/Japanese text that has no spaces", () => {
    const text = "欢迎来到我们的工厂。".repeat(12);
    const parts = breakText(text, 30);
    assert.ok(parts.length > 1);
    for (const p of parts) assert.ok(p.length <= 30);
    assert.equal(parts.join(""), text);
  });

  it("hard-cuts one enormous word instead of looping forever", () => {
    const parts = breakText("x".repeat(500), 80);
    assert.equal(parts.join(""), "x".repeat(500));
    for (const p of parts) assert.ok(p.length <= 80);
  });

  it("never produces an empty or backwards line", () => {
    for (const text of ["a", "a. b. c. d. e. f. g. h.", "…", "Hello,,,, world;;;; again"]) {
      for (const p of splitLong(seg(0, 0.2, text), { maxChars: 4, maxSeconds: 1 })) {
        assert.ok(p.text.length > 0);
        assert.ok(p.end > p.start);
      }
    }
  });
});

describe("assembling pieces into one transcript", () => {
  it("adds each piece's start time and keeps everything in order", () => {
    const out = assemble([
      { offset: 30, segments: [{ start: 1, end: 3, text: "second piece" }] },
      { offset: 0, segments: [{ start: 2, end: 4, text: "first piece" }] },
    ]);
    assert.deepEqual(out, [{ start: 2, end: 4, text: "first piece" }, { start: 31, end: 33, text: "second piece" }]);
  });
  it("never lets two lines overlap", () => {
    const out = assemble([{ offset: 0, segments: [{ start: 0, end: 5, text: "long one" }, { start: 3, end: 6, text: "next" }] }]);
    assert.equal(out[0].end, 3);
    assert.equal(out[1].start, 3);
  });
  it("drops the same line heard twice at a seam", () => {
    const out = assemble([
      { offset: 0, segments: [{ start: 28, end: 30, text: "End of piece one." }] },
      { offset: 28, segments: [{ start: 0.05, end: 2, text: "End of piece one." }] },
    ]);
    assert.equal(out.length, 1);
  });
  it("returns nothing for nothing", () => {
    assert.deepEqual(assemble([]), []);
    assert.deepEqual(assemble([{ offset: 5, segments: [] }]), []);
  });
  it("a chunk cleaned then assembled keeps real speech and loses the made-up lines", () => {
    const cleaned = cleanChunk([seg(0, 3, "Welcome."), seg(3, 6, "♪"), seg(6, 9, "This is the press line.", { nsp: 0.01, lp: -0.3 })]);
    const out = assemble([{ offset: 0, segments: cleaned }]);
    assert.deepEqual(out.map((s) => s.text), ["Welcome.", "This is the press line."]);
  });
});

describe("reading and finding", () => {
  it("reads WebVTT", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello there\nsecond row\n\n00:01:02.250 --> 00:01:04.000\nLater\n";
    assert.deepEqual(parseVtt(vtt), [seg(1, 3.5, "Hello there second row"), seg(62.25, 64, "Later")]);
    assert.deepEqual(parseVtt(""), []);
    assert.deepEqual(parseVtt("garbage"), []);
  });
  it("finds the line to show at a moment, or none in a gap", () => {
    const segs: Segment[] = [seg(1, 2, "a"), seg(2, 4, "b"), seg(10, 12, "c")];
    assert.equal(activeIndex(segs, 0.5), -1);
    assert.equal(activeIndex(segs, 1), 0);
    assert.equal(activeIndex(segs, 1.99), 0);
    assert.equal(activeIndex(segs, 2), 1);
    assert.equal(activeIndex(segs, 5), -1);
    assert.equal(activeIndex(segs, 11), 2);
    assert.equal(activeIndex(segs, 12), -1);
    assert.equal(activeIndex([], 1), -1);
  });
  it("only trusts a language code that looks like one", () => {
    assert.equal(cleanLanguage("hi"), "hi");
    assert.equal(cleanLanguage("zh-TW"), "zh-TW");
    assert.equal(cleanLanguage("auto"), "en");
    assert.equal(cleanLanguage(undefined), "en");
    assert.equal(cleanLanguage("x; DROP"), "en");
  });
});

/* ── audio pieces ───────────────────────────────────────────────────────── */

/** `bursts` of noise-like tone separated by silence; returns samples and the silence centres (seconds). */
function speechLike(seconds: number, silences: number[]): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const quiet = silences.some((s) => Math.abs(t - s) < 0.25);
    out[i] = quiet ? 0 : 0.4 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(t * 7));
  }
  return out;
}

describe("audio pieces", () => {
  it("leaves a short recording as one piece", () => {
    assert.deepEqual(planPieces(speechLike(20, [])), [{ start: 0, end: 20 * SAMPLE_RATE }]);
    assert.deepEqual(planPieces(new Float32Array(0)), []);
  });

  it("cuts a long recording only in the silences", () => {
    const silences = [28, 31, 55, 61, 88, 118, 149, 170];
    const samples = speechLike(180, silences);
    const pieces = planPieces(samples);
    assert.ok(pieces.length >= 4);
    for (let i = 0; i < pieces.length - 1; i++) {
      const cutSec = pieces[i].end / SAMPLE_RATE;
      assert.ok(silences.some((s) => Math.abs(cutSec - s) < 0.3), `cut at ${cutSec}s is not in a silence`);
    }
  });

  it("covers every sample once, in order, and keeps every piece within the limit", () => {
    const samples = speechLike(300, [40, 80, 120, 160, 200, 240, 280]);
    const pieces = planPieces(samples, { max: 45 });
    assert.equal(pieces[0].start, 0);
    assert.equal(pieces[pieces.length - 1].end, samples.length);
    for (let i = 0; i < pieces.length; i++) {
      assert.ok(pieces[i].end > pieces[i].start);
      assert.ok(pieces[i].end - pieces[i].start <= 45 * SAMPLE_RATE, `piece ${i}`);
      if (i > 0) assert.equal(pieces[i].start, pieces[i - 1].end);
    }
  });

  it("still makes progress when there is no silence at all", () => {
    const samples = speechLike(200, []);
    const pieces = planPieces(samples, { max: 45 });
    assert.equal(pieces[pieces.length - 1].end, samples.length);
    for (const p of pieces) assert.ok(p.end - p.start <= 45 * SAMPLE_RATE);
    assert.ok(pieces.length >= 5);
  });

  it("handles a recording of pure silence", () => {
    const pieces = planPieces(new Float32Array(200 * SAMPLE_RATE));
    assert.equal(pieces[pieces.length - 1].end, 200 * SAMPLE_RATE);
    assert.equal(isSilent(new Float32Array(1000)), true);
    assert.equal(isSilent(speechLike(2, [])), false);
  });

  it("writes a valid WAV file", () => {
    const wav = encodeWav(Float32Array.from([0, 0.5, -0.5, 1, -1, 2]));
    const v = new DataView(wav.buffer);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(v.getUint32(24, true), 16000);
    assert.equal(v.getUint32(40, true), 12);
    assert.equal(wav.length, 44 + 12);
    assert.equal(v.getInt16(44 + 6, true), 32767);
    assert.equal(v.getInt16(44 + 8, true), -32768);
    assert.equal(v.getInt16(44 + 10, true), 32767, "clipped, not wrapped");
  });
});
