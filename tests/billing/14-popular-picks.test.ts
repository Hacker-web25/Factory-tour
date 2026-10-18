/**
 * The gold stars on step 2 must never claim more than is true.
 *
 * Until POPULAR_MIN_FILLS different companies have answered, the stars are
 * our recommendations ("Must-show"). After that they are what companies
 * actually picked ("Popular pick"). These tests pin the switch-over and the
 * counting rules.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CURATED_AREA_PICKS,
  CURATED_PROCESS_PICKS,
  POPULAR_MIN_FILLS,
  STAR_COPY,
  rankPopular,
} from "@/lib/factoryAreas";

const row = (email: string, areas: string[], processes: string[] = []) => ({ email, areas, processes });

describe("gold stars on the area and process tiles", () => {
  it("shows our recommendations, labelled as such, until enough companies have answered", () => {
    const rows = Array.from({ length: POPULAR_MIN_FILLS - 1 }, (_, i) => row(`c${i}@x.com`, ["Canteen"]));
    const r = rankPopular(rows);
    assert.equal(r.phase, "curated");
    assert.deepEqual(r.areaIds, CURATED_AREA_PICKS);
    assert.deepEqual(r.processIds, CURATED_PROCESS_PICKS);
    assert.equal(STAR_COPY.curated.badge, "Must-show");
  });

  it("counts one company once, however many times it fills the page", () => {
    const rows = Array.from({ length: 25 }, () => row("same@x.com", ["Canteen"]));
    assert.equal(rankPopular(rows).phase, "curated");
    assert.equal(rankPopular(rows).fills, 1);
  });

  it("switches to real picks once enough companies have answered", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(
        `c${i}@x.com`,
        [
          ...(i < 8 ? ["Laboratory"] : []),
          ...(i < 5 ? ["Canteen"] : []),
          ...(i < 2 ? ["Tool Room"] : []), // 20%: below the bar, never starred
          "Our special furnace", // typed in by the buyer: not a tile
        ],
        i < 6 ? ["CNC Machining"] : []
      )
    );
    const r = rankPopular(rows);
    assert.equal(r.phase, "popular");
    assert.equal(STAR_COPY.popular.badge, "Popular pick");
    assert.deepEqual(r.areaIds, ["laboratory", "canteen"]);
    assert.deepEqual(r.processIds, ["cnc-machining"]);
  });

  it("ignores rows that never reached the area question", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row(`c${i}@x.com`, ["Laboratory"])),
      { email: "late@x.com", areas: null, processes: null },
      { email: "empty@x.com", areas: [], processes: [] },
    ];
    assert.equal(rankPopular(rows).phase, "curated");
  });
});
