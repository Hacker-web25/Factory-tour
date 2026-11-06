/**
 * Renaming a tour on the dashboard: what gets saved, and when nothing does.
 * Pure function, no browser or database needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_TOUR_TITLE, nextTourTitle } from "@/lib/tourTitle";

describe("nextTourTitle", () => {
  it("returns the new name when it is different", () => {
    assert.equal(nextTourTitle("Kilitch Drugs Ltd.", "Untitled tour"), "Kilitch Drugs Ltd.");
  });

  it("trims spaces at both ends and collapses runs of spaces and tabs", () => {
    assert.equal(nextTourTitle("  SAA   Vishnu \t Group  ", "x"), "SAA Vishnu Group");
  });

  it("turns line breaks (from a paste) into single spaces", () => {
    assert.equal(nextTourTitle("Param\nDairy\r\nPlant 2", "x"), "Param Dairy Plant 2");
  });

  it("keeps the old name when the box is empty or only spaces", () => {
    assert.equal(nextTourTitle("", "GRKC"), null);
    assert.equal(nextTourTitle("   \n  ", "GRKC"), null);
  });

  it("saves nothing when the name did not really change", () => {
    assert.equal(nextTourTitle("GRKC", "GRKC"), null);
    assert.equal(nextTourTitle("  GRKC  ", "GRKC"), null);
    assert.equal(nextTourTitle("GRKC", " GRKC "), null);
  });

  it("treats a change of letter case as a change", () => {
    assert.equal(nextTourTitle("Grkc", "GRKC"), "Grkc");
  });

  it("cuts a very long name to the limit without leaving a trailing space", () => {
    const long = "a".repeat(MAX_TOUR_TITLE - 1) + " " + "b".repeat(50);
    const out = nextTourTitle(long, "x");
    assert.ok(out);
    assert.ok(out.length <= MAX_TOUR_TITLE);
    assert.equal(out, out.trim());
  });

  it("keeps non-English names intact", () => {
    assert.equal(nextTourTitle("  श्री गणेश फैक्ट्री ", "x"), "श्री गणेश फैक्ट्री");
  });
});
