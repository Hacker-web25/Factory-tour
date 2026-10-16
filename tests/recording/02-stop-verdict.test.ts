import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideVerdict, type Attribution } from "@/lib/stopVerdict";
import { MIN_WORDS_FOR_ABSENCE } from "@/lib/stopPhrases";

/**
 * The decision table behind a recording-stop verdict.
 *
 * 'flagged' is the only outcome that can hurt a rep, so most of this
 * file is about the branches that must NOT reach it.
 */

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const other: Attribution = { by: "other", reason: "A second voice asks." };
const presenter: Attribution = { by: "presenter", reason: "The rep says it." };
const unclear: Attribution = { by: "unclear" };

describe("stop verdict", () => {
  describe("verified_valid — the only way to clear a rep", () => {
    it("strong phrase + AI says someone else asked", () => {
      const r = decideVerdict({
        transcript: `${filler(40)} sir please stop the recording`,
        attribution: other,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "verified_valid");
      assert.ok(r.quote, "the MD must see the words that cleared it");
      assert.match(r.detail, /someone other than the rep/i);
    });

    it("works for Hinglish and Devanagari too", () => {
      for (const line of [
        "sir recording band kar do please",
        "कृपया रिकॉर्डिंग बंद कर दो",
      ]) {
        const r = decideVerdict({
          transcript: `${filler(40)} ${line}`,
          attribution: other,
          trailingCaptured: true,
        });
        assert.equal(r.verdict, "verified_valid", line);
      }
    });

    it("a WEAK match can never reach verified_valid", () => {
      const r = decideVerdict({
        transcript: `${filler(40)} the recording, haan band kar do`,
        attribution: other, // even with the AI agreeing
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
    });
  });

  describe("unverified — every uncertainty lands here", () => {
    it("no transcript at all", () => {
      const r = decideVerdict({
        transcript: null,
        attribution: null,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
      assert.match(r.detail, /only works in some browsers/i);
    });

    it("empty transcript", () => {
      const r = decideVerdict({
        transcript: "   ",
        attribution: unclear,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
    });

    it("strong phrase but the AI could not tell who said it", () => {
      const r = decideVerdict({
        transcript: `${filler(40)} stop recording please`,
        attribution: unclear,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
      assert.match(r.detail, /could not tell who said it/i);
    });

    it("strong phrase but no AI pass ran at all", () => {
      const r = decideVerdict({
        transcript: `${filler(40)} stop recording please`,
        attribution: null,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
    });

    it("strong phrase the AI attributes to the REP is still not flagged", () => {
      const r = decideVerdict({
        transcript: `${filler(40)} ok sure, I'll stop the recording`,
        attribution: presenter,
        trailingCaptured: true,
      });
      assert.equal(
        r.verdict,
        "unverified",
        "a rep agreeing out loud must never be held against them"
      );
      assert.match(r.detail, /agreeing out loud/i);
    });

    it("trailing window never completed", () => {
      const r = decideVerdict({
        transcript: filler(120),
        attribution: unclear,
        trailingCaptured: false,
      });
      assert.equal(r.verdict, "unverified");
      assert.match(r.detail, /laptop lid/i);
    });

    it("too little speech to read anything into the silence", () => {
      const r = decideVerdict({
        transcript: filler(MIN_WORDS_FOR_ABSENCE - 5),
        attribution: unclear,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
      assert.match(r.detail, /too little to conclude/i);
    });

    it("plenty of speech, no phrase, but the AI pass did not run", () => {
      const r = decideVerdict({
        transcript: filler(120),
        attribution: null,
        trailingCaptured: true,
      });
      assert.equal(
        r.verdict,
        "unverified",
        "never flag on the phrase bank alone"
      );
    });

    it("no phrase match but the AI read a request anyway", () => {
      const r = decideVerdict({
        transcript: filler(120),
        attribution: { by: "other", reason: "Someone gestures and asks." },
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "unverified");
      assert.match(r.detail, /unresolved/i);
    });
  });

  describe("flagged — the narrowest branch in the file", () => {
    it("needs ALL of: speech, intact window, no phrase, AI agreeing", () => {
      const r = decideVerdict({
        transcript: filler(120),
        attribution: unclear,
        trailingCaptured: true,
      });
      assert.equal(r.verdict, "flagged");
    });

    it("reads as a prompt to talk, never as a conclusion", () => {
      const r = decideVerdict({
        transcript: filler(120),
        attribution: unclear,
        trailingCaptured: true,
      });
      assert.match(r.detail, /worth a conversation, not a conclusion/i);
      // It must offer the innocent explanations in the same breath.
      assert.match(r.detail, /gesture|stood up|microphone/i);
    });

    it("removing any single condition drops it back to unverified", () => {
      const full = {
        transcript: filler(120),
        attribution: unclear,
        trailingCaptured: true,
      };
      assert.equal(decideVerdict(full).verdict, "flagged");

      assert.equal(
        decideVerdict({ ...full, trailingCaptured: false }).verdict,
        "unverified"
      );
      assert.equal(
        decideVerdict({ ...full, attribution: null }).verdict,
        "unverified"
      );
      assert.equal(
        decideVerdict({ ...full, transcript: filler(5) }).verdict,
        "unverified"
      );
      assert.equal(
        decideVerdict({
          ...full,
          transcript: `${filler(120)} please stop recording`,
        }).verdict,
        "unverified"
      );
    });

    it("a factory stop order does not flag or clear — it is simply absent", () => {
      const r = decideVerdict({
        transcript: `${filler(120)} band kar do woh machine`,
        attribution: unclear,
        trailingCaptured: true,
      });
      // No recording noun anywhere, so the matcher stays silent and we
      // fall through to the flagged branch on the AI's agreement.
      assert.equal(r.verdict, "flagged");
      assert.equal(r.quote, null, "must not quote an unrelated machine order");
    });
  });

  describe("invariants", () => {
    it("every outcome carries a detail sentence for the MD", () => {
      const cases: Parameters<typeof decideVerdict>[0][] = [
        { transcript: null, attribution: null, trailingCaptured: true },
        { transcript: filler(120), attribution: unclear, trailingCaptured: true },
        {
          transcript: `${filler(40)} stop recording`,
          attribution: other,
          trailingCaptured: true,
        },
        { transcript: filler(5), attribution: unclear, trailingCaptured: false },
      ];
      for (const c of cases) {
        const r = decideVerdict(c);
        assert.ok(r.detail.length > 40, "detail must actually explain itself");
        assert.ok(
          ["verified_valid", "unverified", "flagged"].includes(r.verdict)
        );
      }
    });

    it("a quote is only ever returned alongside a real match", () => {
      const noMatch = decideVerdict({
        transcript: filler(120),
        attribution: unclear,
        trailingCaptured: true,
      });
      assert.equal(noMatch.quote, null);
    });
  });
});
