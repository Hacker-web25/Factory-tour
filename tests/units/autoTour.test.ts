/** How long the auto-tour stays on a scene, and on a unit's divider card. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Scene, Tour } from "../../lib/types";
import { DIVIDER_SECONDS, sceneDuration } from "../../lib/useAutoTour";

const tour = (interval: number | null) => ({ auto_tour_interval: interval }) as unknown as Tour;
const scene = (extra: Partial<Scene>) => ({ auto_tour_duration: null, ...extra }) as unknown as Scene;

describe("auto-tour time per scene", () => {
  it("uses the scene's own time first, then the tour's, then 6 seconds", () => {
    assert.equal(sceneDuration(scene({ auto_tour_duration: 12 }), tour(8)), 12);
    assert.equal(sceneDuration(scene({}), tour(8)), 8);
    assert.equal(sceneDuration(scene({}), tour(null)), 6);
    assert.equal(sceneDuration(null, tour(null)), 6);
  });

  it("keeps a divider card up for only a few seconds unless it was given a time", () => {
    assert.equal(sceneDuration(scene({ is_divider: true }), tour(10)), DIVIDER_SECONDS);
    assert.equal(sceneDuration(scene({ is_divider: true }), tour(2)), 2);
    assert.equal(sceneDuration(scene({ is_divider: true, auto_tour_duration: 9 }), tour(10)), 9);
  });
});
