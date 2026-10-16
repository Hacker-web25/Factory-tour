import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findStopRequest,
  normalise,
  windowTranscriptTail,
  wordCount,
  MIN_WORDS_FOR_ABSENCE,
} from "@/lib/stopPhrases";

/**
 * The matcher behind a recording-stop verdict.
 *
 * A false positive here clears a rep who should have been asked about it.
 * A false NEGATIVE is far worse: it can put an honest rep in front of
 * their MD as "no client request heard". So the bias throughout is
 * under-claiming, and these tests pin that bias in place.
 */
describe("stop-request detection", () => {
  describe("normalise", () => {
    it("lower-cases, drops punctuation and collapses whitespace", () => {
      const { text } = normalise("  STOP,   the\n\nRecording!!  ");
      assert.equal(text, "stop the recording");
    });

    it("strips Latin diacritics but leaves Devanagari intact", () => {
      assert.equal(normalise("Café").text, "cafe");
      assert.equal(normalise("रिकॉर्डिंग बंद").text, "रिकॉर्डिंग बंद");
    });

    it("maps every normalised index back into the original string", () => {
      const src = "Please,  STOP recording.";
      const { text, map } = normalise(src);
      assert.equal(text.length, map.length);
      const at = text.indexOf("stop");
      assert.equal(src.slice(map[at], map[at] + 4), "STOP");
    });
  });

  describe("strong matches — these can clear a rep", () => {
    const strong = [
      "Sure, let me just stop recording now.",
      "Can you stop the recording please?",
      "Please stop recording before we discuss price.",
      "Actually, turn off the recording.",
      "Let's keep this off the record.",
      "No recording please, this part is confidential.",
      "Do not record this bit.",
      "Sir recording band kar do please",
      "Ek minute, recording bandh karo",
      "Bhai recording rok do abhi",
      "Yeh wala part record mat karo",
      "रिकॉर्डिंग बंद करो",
      "कृपया रिकॉर्डिंग बंद कर दो",
      "रिकॉर्ड मत करो इसे",
    ];
    for (const line of strong) {
      it(`fires strong on: ${line}`, () => {
        const r = findStopRequest(line);
        assert.ok(r.match, "expected a match");
        assert.equal(r.match!.tier, "strong", `tier for: ${line}`);
        assert.ok(r.match!.quote.length > 0, "quote should be non-empty");
      });
    }

    it("quotes the speaker's own casing and punctuation back", () => {
      const r = findStopRequest("Hold on — STOP RECORDING, please.");
      assert.ok(r.match);
      assert.match(r.match!.quote, /STOP RECORDING/);
    });

    it("prefers a strong match even when weak verbs also appear", () => {
      const r = findStopRequest(
        "band karo that machine, and also please stop the recording"
      );
      assert.equal(r.match!.tier, "strong");
    });
  });

  describe("weak matches — these point the MD at the audio, nothing more", () => {
    it("a bare stop verb near a recording word is weak, never strong", () => {
      const r = findStopRequest("The recording — haan, band kar do.");
      assert.ok(r.match);
      assert.equal(r.match!.tier, "weak");
    });

    it("a stop verb far from any recording word does not match", () => {
      const far =
        "we are recording the output of line two " +
        "x".repeat(200) +
        " band kar do";
      const r = findStopRequest(far);
      assert.equal(r.match, null);
    });
  });

  describe("false-positive guards — the factory-floor problem", () => {
    const innocent = [
      "Band kar do woh machine, awaaz bahut aa rahi hai.",
      "Please stop the conveyor, we will show the next bay.",
      "बंद करो वो मशीन",
      "Rok do forklift ko, hum yahin se dekh lenge.",
      "We stopped production on that line last quarter.",
      "Turn off the lights in bay two.",
      "Don't worry about the noise.",
    ];
    for (const line of innocent) {
      it(`does NOT fire on: ${line}`, () => {
        const r = findStopRequest(line);
        assert.equal(r.match, null, `should not match: ${line}`);
        assert.equal(r.mentionsRecording, false);
      });
    }

    it("respects word boundaries — 'bandwidth' is not 'band'", () => {
      const r = findStopRequest(
        "the recording needs bandwidth on the uplink here"
      );
      assert.equal(r.match, null);
    });

    it("respects word boundaries — 'direct' is not 'rec'", () => {
      const r = findStopRequest("a direct feed from the line, no issues");
      assert.equal(r.match, null);
      assert.equal(r.mentionsRecording, false);
    });

    it("empty, whitespace and null-ish input is simply no match", () => {
      for (const v of ["", "   ", "\n\t"]) {
        const r = findStopRequest(v);
        assert.equal(r.match, null);
        assert.equal(r.mentionsRecording, false);
      }
    });
  });

  describe("mentionsRecording gate", () => {
    it("is false when the window never mentions recording", () => {
      assert.equal(
        findStopRequest("let us move to the packaging area now")
          .mentionsRecording,
        false
      );
    });
    it("is true when it does, even with no stop request", () => {
      const r = findStopRequest("this recording will go to our MD later");
      assert.equal(r.mentionsRecording, true);
      assert.equal(r.match, null);
    });
  });

  describe("windowTranscriptTail", () => {
    it("returns the whole transcript when it is shorter than the window", () => {
      assert.equal(windowTranscriptTail("a b c", 80), "a b c");
    });

    it("keeps only the last N words", () => {
      const text = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
      const out = windowTranscriptTail(text, 80);
      assert.equal(wordCount(out), 80);
      assert.ok(out.endsWith("w199"), "keeps the END, not the start");
      assert.ok(!out.includes("w0 "), "drops the beginning");
    });

    it("handles null and undefined", () => {
      assert.equal(windowTranscriptTail(null), "");
      assert.equal(windowTranscriptTail(undefined), "");
    });

    it("a stop request in the last seconds survives the windowing", () => {
      const filler = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
      const full = `${filler} sir recording band kar do please`;
      const win = windowTranscriptTail(full, 80);
      const r = findStopRequest(win);
      assert.ok(r.match, "the request must survive windowing");
      assert.equal(r.match!.tier, "strong");
    });
  });

  describe("wordCount / absence threshold", () => {
    it("counts words, not characters", () => {
      assert.equal(wordCount("one two three"), 3);
      assert.equal(wordCount("   "), 0);
      assert.equal(wordCount(""), 0);
    });

    it("the absence threshold is high enough that a quiet room proves nothing", () => {
      // Below this many words we must never conclude 'no request was made'.
      assert.ok(
        MIN_WORDS_FOR_ABSENCE >= 20,
        "threshold too low to be fair to the rep"
      );
    });
  });
});
