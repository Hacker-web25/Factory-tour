/**
 * The words the Beautify tool shows while the AI model downloads and runs.
 * Pure functions, no browser needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_AI,
  describeAi,
  describeTools,
  formatBytes,
  formatDuration,
  formatSpeed,
  type AiStatus,
} from "@/lib/beautifyProgress";

const MB = 1024 * 1024;
const ai = (patch: Partial<AiStatus>): AiStatus => ({ ...INITIAL_AI, ...patch });

describe("formatBytes", () => {
  it("uses MB with sensible precision", () => {
    assert.equal(formatBytes(208_044_816), "198 MB");
    assert.equal(formatBytes(5.5 * MB), "5.5 MB");
    assert.equal(formatBytes(300 * 1024), "300 KB");
    assert.equal(formatBytes(0), "0 MB");
    assert.equal(formatBytes(NaN), "0 MB");
  });
});

describe("formatSpeed", () => {
  it("hides a speed that is not yet known", () => {
    assert.equal(formatSpeed(0), "");
    assert.equal(formatSpeed(500), "");
    assert.equal(formatSpeed(4.2 * MB), "4.2 MB/s");
  });
});

describe("formatDuration", () => {
  it("reads naturally", () => {
    assert.equal(formatDuration(2), "a few seconds");
    assert.equal(formatDuration(42), "42 s");
    assert.equal(formatDuration(80), "1 min 20 s");
    assert.equal(formatDuration(120), "2 min");
    assert.equal(formatDuration(7500), "2 h 5 min");
    assert.equal(formatDuration(null), "");
    assert.equal(formatDuration(-3), "");
  });
});

describe("describeAi", () => {
  it("shows percent, size, speed and time left while downloading", () => {
    const v = describeAi(
      ai({ phase: "downloading", loaded: 77 * MB, total: 198 * MB, fraction: 0.39, speed: 4.2 * MB, eta: 31 })
    );
    assert.equal(v.button, "Downloading AI 39%");
    assert.match(v.title, /39%/);
    assert.match(v.subtitle, /77\.0 MB of 198 MB/);
    assert.match(v.subtitle, /4\.2 MB\/s/);
    assert.match(v.subtitle, /31 s left/);
    assert.equal(Math.round(v.percent ?? -1), 39);
    assert.equal(v.cancellable, true);
  });

  it("never shows 100% before the file is complete", () => {
    const v = describeAi(ai({ phase: "downloading", loaded: 197.9 * MB, total: 198 * MB, fraction: 0.9995, eta: 0 }));
    assert.equal(v.button, "Downloading AI 99%");
  });

  it("says so when the time left cannot be told yet", () => {
    const v = describeAi(ai({ phase: "downloading", loaded: 1 * MB, total: 198 * MB, fraction: 0.005, eta: null }));
    assert.match(v.subtitle, /working out the time left/);
  });

  it("passes a connection problem on to the person", () => {
    const v = describeAi(
      ai({
        phase: "downloading",
        loaded: 50 * MB,
        total: 198 * MB,
        fraction: 0.25,
        note: "Connection problem. Resuming in 4 s (try 2 of 6)",
      })
    );
    assert.match(v.subtitle, /Resuming in 4 s/);
  });

  it("does not claim a size before the server has said it", () => {
    const v = describeAi(ai({ phase: "downloading", total: 0 }));
    assert.equal(v.percent, null);
    assert.match(v.subtitle, /Connecting/);
  });

  it("covers the other phases, and cannot be cancelled once repairing", () => {
    assert.equal(describeAi(ai({ phase: "checking" })).cancellable, true);
    assert.equal(describeAi(ai({ phase: "loading" })).button, "Loading AI…");
    const w = describeAi(ai({ phase: "working", detail: "Repairing part 1 of 2" }));
    assert.equal(w.subtitle, "Repairing part 1 of 2");
    assert.equal(w.cancellable, false);
    const e = describeAi(ai({ phase: "error", error: "No internet" }));
    assert.equal(e.subtitle, "No internet");
  });
});

describe("describeTools", () => {
  it("names the stage", () => {
    assert.equal(describeTools("loading"), "Downloading tools…");
    assert.equal(describeTools("compiling"), "Starting tools…");
    assert.equal(describeTools("idle"), "Preparing tools…");
  });
});
