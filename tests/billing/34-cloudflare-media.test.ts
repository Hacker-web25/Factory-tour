/**
 * Cloudflare media: the permission slip for an upload, the Worker that serves
 * and stores the files, and the address rules.
 *
 * The Worker is plain JavaScript that runs on Cloudflare, so it is tested here
 * with a pretend R2 bucket. What matters is checked end to end: only someone
 * the website approved can write, only that one file, never a bigger file than
 * announced, never over an existing name by accident, and a file that is still
 * only in Supabase is fetched from there and kept.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { signMediaToken, verifyMediaToken } from "@/lib/mediaToken";
import {
  encodeObjectPath,
  isMediaBucket,
  isSafeObjectPath,
  mediaEnabled,
  mediaPublicUrl,
  rewriteSupabaseUrl,
} from "@/lib/mediaUrl";
import { __setAuthenticatorForTests, type AuthedRequest } from "@/lib/server/requestAuth";
import { POST as signRoute } from "@/app/api/media/sign/route";
// @ts-expect-error plain JavaScript Worker, not type-checked
import worker, { verifyToken as workerVerify } from "../../cloudflare/media-worker.js";

const SECRET = "test-secret-at-least-32-characters-long";
const BASE = "https://vpv-media.example.workers.dev";

/* ── addresses ──────────────────────────────────────────────────────────── */

describe("media addresses", () => {
  it("builds the Worker address and keeps slashes", () => {
    assert.equal(mediaPublicUrl("panoramas", "tour-1/abc def.jpg", BASE), `${BASE}/panoramas/tour-1/abc%20def.jpg`);
    assert.equal(encodeObjectPath("a/b c/d.png"), "a/b%20c/d.png");
  });

  it("is off unless a base address is set, and only for the public buckets", () => {
    assert.equal(mediaEnabled("panoramas", ""), false);
    assert.equal(mediaEnabled("panoramas", BASE), true);
    assert.equal(mediaEnabled("tours", BASE), true);
    assert.equal(mediaEnabled("recordings", BASE), false, "private audio stays in Supabase");
    assert.equal(mediaEnabled("voice-samples", BASE), false);
    assert.equal(isMediaBucket("panoramas"), true);
  });

  it("points an address saved in the database before the move at the Worker", () => {
    const sb = "https://abc.supabase.co";
    assert.equal(
      rewriteSupabaseUrl(`${sb}/storage/v1/object/public/panoramas/t1/x.jpg?t=1`, sb, BASE),
      `${BASE}/panoramas/t1/x.jpg`
    );
    assert.equal(rewriteSupabaseUrl(`${sb}/storage/v1/object/public/recordings/x.mp3`, sb, BASE), null);
    assert.equal(rewriteSupabaseUrl("https://elsewhere.com/storage/v1/object/public/panoramas/x.jpg", sb, BASE), null);
    assert.equal(rewriteSupabaseUrl(`${sb}/storage/v1/object/public/panoramas/x.jpg`, sb, ""), null, "off means untouched");
  });

  it("accepts the paths the app makes and refuses anything that could escape", () => {
    for (const ok of [
      "7f3c2a9e-41d0/0b8f6d2a.jpg",
      "thumbnails/scene-12-0f8a5c.png",
      "company-logos/t1-1730000000000.png",
      "tour-audio/t1/scene-5-1730000000000.webm",
      "docs/9d2e.pdf",
    ]) {
      assert.equal(isSafeObjectPath(ok), true, ok);
    }
    for (const bad of ["", "../x", "a/../b", "a//b", "/a", "a/", "a b.jpg", "a\\b", "a?b", "x".repeat(301), 42, null]) {
      assert.equal(isSafeObjectPath(bad as never), false, String(bad));
    }
  });
});

/* ── the permission slip ────────────────────────────────────────────────── */

describe("upload permission slip", () => {
  const slipFor = (o: Partial<Parameters<typeof signMediaToken>[1]> = {}, now = 1_000_000) =>
    signMediaToken(SECRET, { bucket: "panoramas", path: "t1/a.jpg", maxBytes: 5_000, upsert: false, now, ...o });

  it("is good for the file, the size and the ten minutes it was made for", async () => {
    const p = await verifyMediaToken(SECRET, await slipFor(), 1_000_100);
    assert.deepEqual(p, { b: "panoramas", p: "t1/a.jpg", e: 1_000_600, m: 5_000, u: 0, a: "put" });
  });

  it("expires", async () => {
    assert.equal(await verifyMediaToken(SECRET, await slipFor(), 1_000_601), null);
  });

  it("is refused when changed or signed with another secret", async () => {
    const t = await slipFor();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ b: "panoramas", p: "other.jpg", e: 9_999_999, m: 5_000, u: 1, a: "put" })).toString("base64url");
    assert.equal(await verifyMediaToken(SECRET, `${forged}.${sig}`, 1_000_100), null);
    assert.equal(await verifyMediaToken("another-secret-another-secret-123456", t, 1_000_100), null);
    assert.equal(await verifyMediaToken(SECRET, `${body}.`, 1_000_100), null);
    assert.equal(await verifyMediaToken(SECRET, "garbage", 1_000_100), null);
    assert.equal(await verifyMediaToken("", t, 1_000_100), null);
  });

  it("is read the same way by the website and by the Worker", async () => {
    const put = await slipFor({ upsert: true });
    const del = await slipFor({ action: "del", maxBytes: 0 });
    assert.deepEqual(await workerVerify(SECRET, put, 1_000_100), await verifyMediaToken(SECRET, put, 1_000_100));
    assert.deepEqual(await workerVerify(SECRET, del, 1_000_100), await verifyMediaToken(SECRET, del, 1_000_100));
    assert.equal((await workerVerify(SECRET, del, 1_000_100)).a, "del");
    assert.equal(await workerVerify(SECRET, put, 1_000_601), null);
    assert.equal(await workerVerify("nope", put, 1_000_100), null);
  });
});

/* ── the sign route ─────────────────────────────────────────────────────── */

describe("POST /api/media/sign", () => {
  const as = (role: string | null) => {
    __setAuthenticatorForTests(async () =>
      role === null
        ? null
        : ({ sb: {} as never, user: { id: "u1" } as never, profile: { id: "u1", email: "a@x.com", full_name: null, role, org_id: "o1" } } as AuthedRequest)
    );
  };
  const call = async (body: unknown) => {
    const res = await signRoute(
      new Request("http://localhost/api/media/sign", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer t" },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const envBefore = { base: process.env.NEXT_PUBLIC_MEDIA_BASE_URL, secret: process.env.MEDIA_UPLOAD_SECRET };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = `${BASE}/`;
    process.env.MEDIA_UPLOAD_SECRET = SECRET;
    as("org_admin");
  });
  afterEach(() => {
    __setAuthenticatorForTests(null);
    if (envBefore.base === undefined) delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    else process.env.NEXT_PUBLIC_MEDIA_BASE_URL = envBefore.base;
    if (envBefore.secret === undefined) delete process.env.MEDIA_UPLOAD_SECRET;
    else process.env.MEDIA_UPLOAD_SECRET = envBefore.secret;
  });

  it("refuses someone who is not signed in, and anyone who is not an admin", async () => {
    as(null);
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 10 })).status, 401);
    as("sales");
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 10 })).status, 403);
    as("viewer");
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 10 })).status, 403);
  });

  it("is off (503) until the address and secret are set", async () => {
    delete process.env.MEDIA_UPLOAD_SECRET;
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 10 })).status, 503);
    process.env.MEDIA_UPLOAD_SECRET = SECRET;
    delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 10 })).status, 503);
  });

  it("refuses private buckets, unsafe paths and bad sizes", async () => {
    assert.equal((await call({ bucket: "recordings", path: "a.mp3", size: 10 })).status, 400);
    assert.equal((await call({ bucket: "panoramas", path: "../etc/passwd", size: 10 })).status, 400);
    assert.equal((await call({ bucket: "panoramas", path: "a//b.jpg", size: 10 })).status, 400);
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 0 })).status, 400);
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: "big" })).status, 400);
    assert.equal((await call({ bucket: "panoramas", path: "a/b.jpg", size: 101 * 1024 * 1024 })).status, 413);
  });

  it("hands an admin a slip for exactly that file and size", async () => {
    const r = await call({ bucket: "panoramas", path: "t1/a.jpg", size: 2048, upsert: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.uploadUrl, `${BASE}/panoramas/t1/a.jpg`);
    const p = await verifyMediaToken(SECRET, String(r.body.token));
    assert.ok(p);
    assert.deepEqual([p.b, p.p, p.m, p.u, p.a], ["panoramas", "t1/a.jpg", 2048, 1, "put"]);
  });

  it("lets only the platform owner delete", async () => {
    const body = { bucket: "panoramas", path: "t1/a.jpg", action: "delete" };
    as("org_admin");
    assert.equal((await call(body)).status, 403);
    as("owner");
    const r = await call(body);
    assert.equal(r.status, 200);
    assert.equal((await verifyMediaToken(SECRET, String(r.body.token)))?.a, "del");
  });
});

/* ── the Worker, with a pretend bucket ──────────────────────────────────── */

type Stored = { bytes: Uint8Array; contentType: string; cacheControl: string };

function fakeBucket() {
  const files = new Map<string, Stored>();
  let etag = 0;
  const bucket = {
    files,
    async get(key: string, opts?: { range?: Headers }) {
      const f = files.get(key);
      if (!f) return null;
      let bytes = f.bytes;
      let range: { offset: number; length: number } | undefined;
      const m = /bytes=(\d+)-(\d*)/.exec(opts?.range?.get("range") ?? "");
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : f.bytes.length - 1;
        bytes = f.bytes.slice(start, end + 1);
        range = { offset: start, length: bytes.length };
      }
      return {
        body: new Response(bytes).body,
        size: f.bytes.length,
        httpEtag: `"e${++etag}"`,
        range,
        httpMetadata: { contentType: f.contentType, cacheControl: f.cacheControl },
        writeHttpMetadata(h: Headers) {
          h.set("content-type", f.contentType);
          h.set("cache-control", f.cacheControl);
        },
      };
    },
    async put(key: string, body: ReadableStream | ArrayBuffer, o: { httpMetadata: { contentType: string; cacheControl: string }; onlyIf?: unknown }) {
      if (o.onlyIf && files.has(key)) return null;
      const bytes = new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
      files.set(key, { bytes, contentType: o.httpMetadata.contentType, cacheControl: o.httpMetadata.cacheControl });
      return { key };
    },
    async delete(key: string) {
      files.delete(key);
    },
  };
  return bucket;
}

describe("the media Worker", () => {
  let bucket: ReturnType<typeof fakeBucket>;
  let pending: Promise<unknown>[];
  const realFetch = globalThis.fetch;
  const g = globalThis as Record<string, unknown>;
  const env = () => ({ BUCKET: bucket, UPLOAD_SECRET: SECRET, FALLBACK_BASE: "https://sb.example/storage/v1/object/public" });
  const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void pending.push(p) });
  const run = async (req: Request, e: Record<string, unknown> = env()) => {
    const res = await worker.fetch(req, e, ctx());
    await Promise.all(pending);
    return res as Response;
  };
  const slip = (o: Partial<Parameters<typeof signMediaToken>[1]> = {}) =>
    signMediaToken(SECRET, { bucket: "panoramas", path: "t1/a.jpg", maxBytes: 100, upsert: false, ...o });
  const put = async (token: string | null, o: { path?: string; len?: number; type?: string; body?: Uint8Array } = {}) => {
    const body = o.body ?? new Uint8Array(50).fill(7);
    const headers: Record<string, string> = {
      "content-length": String(o.len ?? body.length),
      "content-type": o.type ?? "image/jpeg",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    return run(new Request(`${BASE}/panoramas/${o.path ?? "t1/a.jpg"}`, { method: "PUT", headers, body }));
  };

  beforeEach(() => {
    bucket = fakeBucket();
    pending = [];
    g.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => true } };
    g.FixedLengthStream = class {
      readable: ReadableStream;
      writable: WritableStream;
      constructor() {
        const t = new TransformStream();
        this.readable = t.readable;
        this.writable = t.writable;
      }
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete g.caches;
    delete g.FixedLengthStream;
  });

  it("stores a file for a good slip and serves it publicly", async () => {
    const res = await put(await slip());
    assert.equal(res.status, 200);
    assert.deepEqual([...bucket.files.get("panoramas/t1/a.jpg")!.bytes.slice(0, 3)], [7, 7, 7]);

    const got = await run(new Request(`${BASE}/panoramas/t1/a.jpg`));
    assert.equal(got.status, 200);
    assert.equal(got.headers.get("access-control-allow-origin"), "*", "the 360 viewer needs this");
    assert.equal(got.headers.get("x-content-type-options"), "nosniff");
    assert.equal(got.headers.get("content-type"), "image/jpeg");
    assert.equal((await got.arrayBuffer()).byteLength, 50);
  });

  it("refuses a write with no slip, a bad slip, or a slip for another file", async () => {
    assert.equal((await put(null)).status, 401);
    assert.equal((await put("not.a.token")).status, 401);
    assert.equal((await put(await slip(), { path: "t1/other.jpg" })).status, 403);
    assert.equal((await put(await slip({ bucket: "tours" }))).status, 403);
    assert.equal(bucket.files.size, 0);
  });

  it("refuses a file bigger than the upload was approved for, or with no stated size", async () => {
    assert.equal((await put(await slip({ maxBytes: 10 }))).status, 413);
    assert.equal((await put(await slip(), { len: 0 })).status, 411);
    assert.equal(bucket.files.size, 0);
  });

  it("will not host web pages or scripts", async () => {
    assert.equal((await put(await slip(), { type: "text/html" })).status, 415);
    assert.equal((await put(await slip(), { type: "application/javascript" })).status, 415);
  });

  it("will not overwrite an existing name unless the slip allows it", async () => {
    assert.equal((await put(await slip())).status, 200);
    const again = await put(await slip(), { body: new Uint8Array(50).fill(9) });
    assert.equal(again.status, 409);
    assert.equal(bucket.files.get("panoramas/t1/a.jpg")!.bytes[0], 7);
    const replaced = await put(await slip({ upsert: true }), { body: new Uint8Array(50).fill(9) });
    assert.equal(replaced.status, 200);
    assert.equal(bucket.files.get("panoramas/t1/a.jpg")!.bytes[0], 9);
  });

  it("deletes only with a delete slip", async () => {
    await put(await slip());
    const withPut = await run(new Request(`${BASE}/panoramas/t1/a.jpg`, { method: "DELETE", headers: { authorization: `Bearer ${await slip()}` } }));
    assert.equal(withPut.status, 401);
    assert.equal(bucket.files.size, 1);
    const withDel = await run(
      new Request(`${BASE}/panoramas/t1/a.jpg`, { method: "DELETE", headers: { authorization: `Bearer ${await slip({ action: "del", maxBytes: 0 })}` } })
    );
    assert.equal(withDel.status, 200);
    assert.equal(bucket.files.size, 0);
  });

  it("fetches a file that is only in Supabase, serves it, and keeps a copy", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png", "content-length": "4" } });
    }) as typeof fetch;

    const res = await run(new Request(`${BASE}/panoramas/old/pic one.png`));
    assert.equal(res.status, 200);
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(calls[0], "https://sb.example/storage/v1/object/public/panoramas/old/pic%20one.png");
    assert.deepEqual([...bucket.files.get("panoramas/old/pic one.png")!.bytes], [1, 2, 3, 4], "copied into R2 on first view");

    calls.length = 0;
    const second = await run(new Request(`${BASE}/panoramas/old/pic one.png`));
    assert.equal(second.status, 200);
    assert.equal(calls.length, 0, "the second view never touches Supabase");
  });

  it("answers 404 when the file is nowhere, and never fetches for a path it does not serve", async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched++;
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    assert.equal((await run(new Request(`${BASE}/panoramas/missing.jpg`))).status, 404);
    const before = fetched;
    for (const path of ["/recordings/a.mp3", "/panoramas/%2e%2e/x", "/panoramas/", "/panoramas", "/secret/x.jpg"]) {
      assert.equal((await run(new Request(`${BASE}${path}`))).status, 404, path);
    }
    assert.equal(fetched, before, "no upstream request for a path outside the two public buckets");
  });

  it("serves byte ranges, which Safari needs to play a video", async () => {
    bucket.files.set("panoramas/videos/v.mp4", { bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), contentType: "video/mp4", cacheControl: "public, max-age=3600" });
    const res = await run(new Request(`${BASE}/panoramas/videos/v.mp4`, { headers: { range: "bytes=2-5" } }));
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 2-5/10");
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4, 5]);
  });

  it("answers the browser's pre-flight check for uploads", async () => {
    const res = await run(
      new Request(`${BASE}/panoramas/t1/a.jpg`, {
        method: "OPTIONS",
        headers: { origin: "https://myvpv.com", "access-control-request-method": "PUT", "access-control-request-headers": "authorization,content-type" },
      })
    );
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://myvpv.com");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /PUT/);
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /authorization/);
  });

  it("refuses everything when no secret is configured", async () => {
    const res = await run(
      new Request(`${BASE}/panoramas/t1/a.jpg`, { method: "PUT", headers: { authorization: `Bearer ${await slip()}`, "content-length": "5", "content-type": "image/png" }, body: new Uint8Array(5) }),
      { BUCKET: bucket }
    );
    assert.equal(res.status, 401);
  });
});

/* ── the browser's security policy ──────────────────────────────────────── */

describe("content security policy", () => {
  const cspOf = (mediaBase: string | undefined) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (mediaBase === undefined) delete env.NEXT_PUBLIC_MEDIA_BASE_URL;
    else env.NEXT_PUBLIC_MEDIA_BASE_URL = mediaBase;
    const out = execFileSync(
      process.execPath,
      [
        "-e",
        `require(${JSON.stringify(path.resolve("next.config.js"))}).headers().then(h => {
           const all = h.flatMap(x => x.headers);
           console.log(JSON.stringify(all.find(x => x.key === "Content-Security-Policy").value));
         })`,
      ],
      { env, encoding: "utf8" }
    );
    return JSON.parse(out) as string;
  };
  const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("is unchanged while Cloudflare is off", () => {
    const csp = cspOf(undefined);
    assert.ok(!csp.includes("workers.dev"));
    assert.equal(cspOf(""), csp);
  });

  it("lets the browser load, play and upload to the Worker's exact address, and nothing wider", () => {
    const csp = cspOf(`${BASE}/`);
    for (const d of ["img-src", "connect-src", "media-src", "frame-src"]) {
      assert.ok(directive(csp, d).endsWith(` ${BASE}`), d);
    }
    assert.ok(!directive(csp, "script-src").includes(BASE), "pictures are not scripts");
    assert.ok(!csp.includes("*.workers.dev"), "no wildcard");
  });

  it("ignores an address that is not https", () => {
    assert.ok(!cspOf("http://vpv-media.example.workers.dev").includes("workers.dev"));
    assert.ok(!cspOf("not a url").includes("not a url"));
  });
});
