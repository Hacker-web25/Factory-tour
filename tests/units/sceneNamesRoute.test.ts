/**
 * /api/scene-names: what each caller is told.
 * Pretend databases stand in for Supabase; the rule under test is privacy:
 * a company's own names go only to that company, and only names that three
 * or more different customers use are shared with everyone.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __setAuthenticatorForTests, type AuthedRequest } from "@/lib/server/requestAuth";
import { __setSupabaseAdminForTests } from "@/lib/server/supabaseAdmin";
import { __resetSceneNameCacheForTests, countNames, COMMON_MIN_OWNERS } from "@/lib/server/sceneNamesData";
import { GET } from "@/app/api/scene-names/route";

type Row = Record<string, unknown>;

/** Just enough of the query builder: select(...).order(...).range(a, b) over fixed rows. */
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      return {
        select() {
          return {
            order() {
              return {
                range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const tours = [
  { id: "t-a1", org_id: "acme" },
  { id: "t-b1", org_id: "beta" },
  { id: "t-c1", org_id: "gamma" },
  { id: "t-d1", org_id: "delta" },
  { id: "t-k1", org_id: "kilitch" },
  { id: "t-p1", org_id: null },
  { id: "t-p2", org_id: null },
  { id: "t-p3", org_id: null },
];
const scenes = [
  { name: "Packing Hall", tour_id: "t-a1" },
  { name: "Packing Hall", tour_id: "t-b1" },
  { name: "Packing Hall 2", tour_id: "t-c1" },
  { name: "Kilitch Reception", tour_id: "t-k1" },
  { name: "Kilitch Reception", tour_id: "t-d1" },
  // Three of our own tours are still one owner.
  { name: "Sifting Area", tour_id: "t-p1" },
  { name: "Sifting Area", tour_id: "t-p2" },
  { name: "Sifting Area", tour_id: "t-p3" },
];

function asUser(id: string, visible: Row[]): AuthedRequest {
  return { user: { id }, sb: fakeDb({ scenes: visible }), profile: { id, email: "", full_name: null, role: "user", org_id: null } } as unknown as AuthedRequest;
}

const call = async () => {
  const res = await GET(new Request("http://x/api/scene-names", { headers: { authorization: "Bearer t" } }));
  return { status: res.status, body: await res.json() };
};

describe("/api/scene-names", () => {
  beforeEach(() => {
    __resetSceneNameCacheForTests();
    __setSupabaseAdminForTests(fakeDb({ tours, scenes }));
  });

  it("refuses a caller who is not signed in", async () => {
    __setAuthenticatorForTests(async () => null);
    const r = await call();
    assert.equal(r.status, 401);
  });

  it("gives a caller their own names with how often each is used", async () => {
    __setAuthenticatorForTests(async () => asUser("u1", [{ name: "Lab" }, { name: " lab " }, { name: "Store" }, { name: null }, { name: "" }]));
    const r = await call();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.mine, [
      { n: "Lab", uses: 2 },
      { n: "Store", uses: 1 },
    ]);
  });

  it("shares a name with everyone only when enough different customers use it", async () => {
    __setAuthenticatorForTests(async () => asUser("u9", []));
    const r = await call();
    assert.equal(COMMON_MIN_OWNERS, 3);
    assert.deepEqual(r.body.common.phrases.map((p: { n: string }) => p.n), ["Packing Hall"]);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes("Kilitch"), "two customers using a name is not enough");
    assert.ok(!text.includes("Sifting"), "our own tours count as one owner");
  });

  it("does not hand one customer's names to another", async () => {
    __setAuthenticatorForTests(async () => asUser("u9", [{ name: "Own Room" }]));
    const r = await call();
    assert.deepEqual(r.body.mine.map((m: { n: string }) => m.n), ["Own Room"]);
    assert.ok(!JSON.stringify(r.body).includes("Kilitch"));
  });

  it("still works for the caller's own names when the shared list cannot be read", async () => {
    __setSupabaseAdminForTests(null);
    const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      __setAuthenticatorForTests(async () => asUser("u2", [{ name: "Lab" }]));
      const r = await call();
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.common, { phrases: [], words: [] });
      assert.equal(r.body.mine.length, 1);
    } finally {
      if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
    }
  });

  it("counts names ignoring capitals and spacing, most used first", () => {
    assert.deepEqual(countNames(["A  b", "a b", "Zed", "zed", "zed", null, "x".repeat(81)]), [
      { n: "Zed", uses: 3 },
      { n: "A b", uses: 2 },
    ]);
  });
});
