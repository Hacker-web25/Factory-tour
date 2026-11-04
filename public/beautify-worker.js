/*
 * beautify-worker.js — the engine behind "Beautify scene".
 *
 * A classic Web Worker, so the editor never freezes. Two jobs:
 *
 *   heal      Quick repair with OpenCV (TELEA inpainting). Fast, soft on big areas.
 *   heal-ai   Neural repair with LaMa (ONNX Runtime Web). Invents plausible
 *             texture. The ~208 MB model is downloaded once, with live
 *             progress, and kept in the browser's cache storage afterwards.
 *
 * Everything runs from myvpv.com (/vendor/beautify-v1/…), except the model,
 * which comes from Hugging Face (the site's connect-src allows exactly that).
 *
 * Messages in   { type: "heal" | "heal-ai", id, radius, width, height, srcBuffer, maskBuffer, modelUrls? }
 * Messages out  { type: "ready" }                                   OpenCV is ready
 *               { type: "progress", scope: "tools", stage }        OpenCV: loading | compiling
 *               { type: "progress", scope: "ai", phase, loaded, total, fraction, speed, eta, detail, note }
 *               { type: "healed", id, width, height, buffer }
 *               { type: "error", id?, scope?, message }
 *
 * ORIENTATION: pixels go in and come out in the same order as they were sent
 * (row 0 = top, left to right, RGBA). Nothing here flips or mirrors; the only
 * channel reorder is RGBA <-> planar RGB for the model, and it is symmetric.
 */
"use strict";

var VERSION = "7";
var VENDOR = "/vendor/beautify-v1/";
var DEFAULT_MODEL_URLS = ["https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"];
var MODEL_CACHE = "vpv-beautify-models-v1";
var MODEL_MIN_BYTES = 150 * 1024 * 1024; // the real file is ~208 MB; anything much smaller is an error page
var MODEL_SIZE = 512; // LaMa (Carve export) takes a fixed 512 x 512 window
var STALL_MS = 25000; // no bytes for this long => drop the connection and resume
var MAX_ATTEMPTS = 6;

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}
function errText(e) {
  return (e && e.message) || String(e);
}
function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

/* ───────────────────────── OpenCV (quick heal) ───────────────────────── */

var cvPromise = null;

function loadOpenCV() {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise(function (resolve, reject) {
    try {
      post({ type: "progress", scope: "tools", stage: "loading" });
      importScripts(VENDOR + "opencv.js?v=" + VERSION);
    } catch (e) {
      reject(new Error("The quick-heal tools could not be loaded (" + errText(e) + ")."));
      return;
    }
    post({ type: "progress", scope: "tools", stage: "compiling" });
    var cvObj = self.cv;
    if (!cvObj) {
      reject(new Error("The quick-heal tools loaded but did not start."));
      return;
    }
    var done = false;
    function ok(mod) {
      if (done) return;
      done = true;
      self.cv = mod && mod.Mat ? mod : cvObj;
      // Resolve with a plain value, never with `cv` itself: the OpenCV module is
      // a "thenable", and resolving a promise with a thenable that resolves to
      // itself never finishes (the quick-heal tools would sit on "loading").
      resolve(true);
    }
    if (typeof cvObj.then === "function") {
      // Newer builds expose a promise that resolves to the module.
      cvObj.then(function (m) {
        ok(m);
      }, reject);
    } else if (cvObj.Mat) {
      ok(cvObj);
    } else {
      cvObj.onRuntimeInitialized = function () {
        ok(cvObj);
      };
    }
    setTimeout(function () {
      if (!done) reject(new Error("The quick-heal tools did not start within 60 seconds."));
    }, 60000);
  });
  cvPromise.then(
    function () {
      post({ type: "ready" });
    },
    function (e) {
      post({ type: "error", scope: "tools", message: errText(e) });
    }
  );
  return cvPromise;
}

/* ───────────────────────── pixel helpers (no OpenCV) ───────────────────────── */

/** RGBA mask -> 0/1 bytes. The editor paints red at 60% alpha, so alpha is the signal. */
function maskFromRGBA(buf, w, h) {
  var m = new Uint8Array(w * h);
  var any = false;
  for (var i = 0, p = 3; i < m.length; i++, p += 4) {
    if (buf[p] >= 20) {
      m[i] = 1;
      any = true;
    }
  }
  return any ? m : null;
}

/** Grow a 0/1 mask by r pixels (square), separable max filter. */
function dilate(mask, w, h, r) {
  if (r <= 0) return mask;
  var tmp = new Uint8Array(w * h);
  var out = new Uint8Array(w * h);
  var x, y, k, base, a, b;
  for (y = 0; y < h; y++) {
    base = y * w;
    for (x = 0; x < w; x++) {
      a = Math.max(0, x - r);
      b = Math.min(w - 1, x + r);
      var v = 0;
      for (k = a; k <= b; k++) {
        if (mask[base + k]) {
          v = 1;
          break;
        }
      }
      tmp[base + x] = v;
    }
  }
  for (x = 0; x < w; x++) {
    for (y = 0; y < h; y++) {
      a = Math.max(0, y - r);
      b = Math.min(h - 1, y + r);
      var v2 = 0;
      for (k = a; k <= b; k++) {
        if (tmp[k * w + x]) {
          v2 = 1;
          break;
        }
      }
      out[y * w + x] = v2;
    }
  }
  return out;
}

/** 0/1 mask -> 0..1 floats with a soft edge (two box-blur passes of radius r). */
function feather(mask, w, h, r) {
  var a = new Float32Array(w * h);
  for (var i = 0; i < a.length; i++) a[i] = mask[i];
  if (r <= 0) return a;
  var tmp = new Float32Array(w * h);
  for (var pass = 0; pass < 2; pass++) {
    var x, y, sum, cnt;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        sum = 0;
        cnt = 0;
        for (var k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
          sum += a[y * w + k];
          cnt++;
        }
        tmp[y * w + x] = sum / cnt;
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        sum = 0;
        cnt = 0;
        for (var j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) {
          sum += tmp[j * w + x];
          cnt++;
        }
        a[y * w + x] = sum / cnt;
      }
    }
  }
  return a;
}

/**
 * Resize a packed image (channels = 1, 3 or 4, values 0..255) with the same
 * orientation: box average when shrinking, bilinear when enlarging.
 */
function resize(src, sw, sh, dw, dh, ch) {
  if (sw === dw && sh === dh) return src;
  var dst = new Float32Array(dw * dh * ch);
  var c;
  if (dw <= sw && dh <= sh) {
    for (var y = 0; y < dh; y++) {
      var y0 = Math.floor((y * sh) / dh);
      var y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
      for (var x = 0; x < dw; x++) {
        var x0 = Math.floor((x * sw) / dw);
        var x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
        var n = (y1 - y0) * (x1 - x0);
        for (c = 0; c < ch; c++) {
          var s = 0;
          for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) s += src[(yy * sw + xx) * ch + c];
          dst[(y * dw + x) * ch + c] = s / n;
        }
      }
    }
    return dst;
  }
  for (var oy = 0; oy < dh; oy++) {
    var fy = Math.min(sh - 1, Math.max(0, ((oy + 0.5) * sh) / dh - 0.5));
    var iy = Math.floor(fy);
    var iy2 = Math.min(sh - 1, iy + 1);
    var wy = fy - iy;
    for (var ox = 0; ox < dw; ox++) {
      var fx = Math.min(sw - 1, Math.max(0, ((ox + 0.5) * sw) / dw - 0.5));
      var ix = Math.floor(fx);
      var ix2 = Math.min(sw - 1, ix + 1);
      var wx = fx - ix;
      for (c = 0; c < ch; c++) {
        var top = src[(iy * sw + ix) * ch + c] * (1 - wx) + src[(iy * sw + ix2) * ch + c] * wx;
        var bot = src[(iy2 * sw + ix) * ch + c] * (1 - wx) + src[(iy2 * sw + ix2) * ch + c] * wx;
        dst[(oy * dw + ox) * ch + c] = top * (1 - wy) + bot * wy;
      }
    }
  }
  return dst;
}

/* ───────────────────────── quick heal ───────────────────────── */

async function healWithOpenCV(d) {
  await loadOpenCV();
  var cv = self.cv; // do not `await` it: see loadOpenCV
  var w = d.width;
  var h = d.height;
  var rgba = new Uint8ClampedArray(d.srcBuffer);
  var m = maskFromRGBA(new Uint8ClampedArray(d.maskBuffer), w, h);
  if (!m) return rgba; // nothing painted

  // A little growth so the stroke's soft edge and any halo are repaired too.
  m = dilate(m, w, h, 2);

  var src = null,
    rgb = null,
    mask = null,
    dst = null,
    out = null;
  try {
    src = cv.matFromImageData({ data: rgba, width: w, height: h });
    rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    mask = new cv.Mat(h, w, cv.CV_8UC1);
    var md = mask.data;
    for (var i = 0; i < md.length; i++) md[i] = m[i] ? 255 : 0;
    dst = new cv.Mat();
    cv.inpaint(rgb, mask, dst, Math.max(2, d.radius | 0), cv.INPAINT_TELEA);
    out = new cv.Mat();
    cv.cvtColor(dst, out, cv.COLOR_RGB2RGBA);
    var res = new Uint8ClampedArray(out.data.length);
    res.set(out.data);
    for (var p = 3; p < res.length; p += 4) res[p] = 255;
    return res;
  } finally {
    if (src) src.delete();
    if (rgb) rgb.delete();
    if (mask) mask.delete();
    if (dst) dst.delete();
    if (out) out.delete();
  }
}

/* ───────────────────────── AI: model download ───────────────────────── */

var aiState = { phase: "idle", loaded: 0, total: 0, fraction: 0, speed: 0, eta: null, detail: "", note: "" };

function aiProgress(patch) {
  for (var k in patch) aiState[k] = patch[k];
  post({
    type: "progress",
    scope: "ai",
    phase: aiState.phase,
    loaded: aiState.loaded,
    total: aiState.total,
    fraction: aiState.fraction,
    speed: aiState.speed,
    eta: aiState.eta,
    detail: aiState.detail,
    note: aiState.note,
  });
}

async function openCache() {
  try {
    if (typeof caches !== "undefined") return await caches.open(MODEL_CACHE);
  } catch (e) {
    /* private mode etc. — just no caching */
  }
  return null;
}

async function modelFromCache(urls) {
  var cache = await openCache();
  if (!cache) return null;
  for (var i = 0; i < urls.length; i++) {
    try {
      var hit = await cache.match(urls[i]);
      if (!hit) continue;
      var buf = await hit.arrayBuffer();
      if (buf.byteLength >= MODEL_MIN_BYTES) return buf;
      await cache.delete(urls[i]); // truncated copy: drop it
    } catch (e) {
      /* unreadable entry: ignore */
    }
  }
  return null;
}

/**
 * Download with live progress. If the connection drops or stalls, resume from
 * the byte we reached (Range request) instead of starting over.
 */
async function downloadModel(urls) {
  var chunks = [];
  var loaded = 0;
  var total = 0;
  var samples = []; // [time, loaded] for a 6 s moving speed
  var lastEmit = 0;
  var lastErr = null;

  function emit(note, force) {
    var now = Date.now();
    if (!force && now - lastEmit < 150) return;
    lastEmit = now;
    samples.push([now, loaded]);
    while (samples.length > 2 && now - samples[0][0] > 6000) samples.shift();
    var speed = 0;
    if (samples.length >= 2) {
      var a = samples[0];
      var b = samples[samples.length - 1];
      if (b[0] > a[0]) speed = ((b[1] - a[1]) * 1000) / (b[0] - a[0]);
    }
    aiProgress({
      phase: "downloading",
      loaded: loaded,
      total: total,
      fraction: total ? Math.min(1, loaded / total) : 0,
      speed: speed,
      eta: total && speed > 1024 ? (total - loaded) / speed : null,
      note: note || "",
    });
  }

  for (var u = 0; u < urls.length; u++) {
    var url = urls[u];
    for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      var ctrl = new AbortController();
      var stall = null;
      var arm = function () {
        clearTimeout(stall);
        stall = setTimeout(function () {
          ctrl.abort();
        }, STALL_MS);
      };
      try {
        arm();
        var res = await fetch(url, {
          mode: "cors",
          credentials: "omit",
          signal: ctrl.signal,
          headers: loaded > 0 ? { Range: "bytes=" + loaded + "-" } : {},
        });
        if (loaded > 0 && res.status !== 206) {
          // The server ignored the range: start again from zero.
          loaded = 0;
          chunks = [];
          samples = [];
        }
        if (!res.ok) {
          var he = new Error("the server answered " + res.status);
          // 4xx (other than "slow down") will not get better by asking again.
          he.permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
          throw he;
        }
        if (res.status === 206) {
          var cr = /\/(\d+)\s*$/.exec(res.headers.get("content-range") || "");
          if (cr) total = Number(cr[1]);
        } else {
          total = Number(res.headers.get("content-length")) || total;
        }
        if (!res.body) throw new Error("this browser cannot stream downloads");
        var reader = res.body.getReader();
        emit("", true);
        for (;;) {
          var r = await reader.read();
          if (r.done) break;
          arm();
          chunks.push(r.value);
          loaded += r.value.byteLength;
          emit("");
        }
        clearTimeout(stall);
        if (total && loaded !== total) throw new Error("the download ended early (" + loaded + " of " + total + " bytes)");
        if (loaded < MODEL_MIN_BYTES) throw new Error("the file is too small to be the model (" + loaded + " bytes)");
        emit("", true);
        var blob = new Blob(chunks);
        chunks = null;
        return { blob: blob, url: url };
      } catch (e) {
        clearTimeout(stall);
        lastErr = e;
        var aborted = e && e.name === "AbortError";
        if (e && e.permanent) break; // go straight to the next source
        if (attempt < MAX_ATTEMPTS) {
          var wait = Math.min(8000, 800 * attempt);
          emit(
            (aborted ? "Connection stalled" : "Connection problem: " + errText(e)) +
              ". Resuming in " +
              Math.ceil(wait / 1000) +
              " s (try " +
              (attempt + 1) +
              " of " +
              MAX_ATTEMPTS +
              ")",
            true
          );
          await sleep(wait);
        }
      }
    }
    // This source is exhausted; try the next one from scratch.
    loaded = 0;
    chunks = [];
    samples = [];
  }
  throw new Error(
    "The AI model could not be downloaded (" +
      errText(lastErr) +
      "). Check the internet connection and try again."
  );
}

/* ───────────────────────── AI: runtime + session ───────────────────────── */

var ortPromise = null;
function loadOrt() {
  if (ortPromise) return ortPromise;
  ortPromise = new Promise(function (resolve, reject) {
    try {
      importScripts(VENDOR + "ort.wasm.min.js?v=" + VERSION);
    } catch (e) {
      reject(new Error("The AI engine could not be loaded (" + errText(e) + ")."));
      return;
    }
    var ort = self.ort;
    if (!ort) {
      reject(new Error("The AI engine loaded but did not start."));
      return;
    }
    ort.env.wasm.wasmPaths = VENDOR; // ort-wasm-simd.wasm lives here, on our own origin
    ort.env.wasm.numThreads = 1; // multi-threading needs a cross-origin-isolated page
    ort.env.wasm.proxy = false;
    resolve(ort);
  });
  ortPromise.catch(function () {
    ortPromise = null;
  });
  return ortPromise;
}

var sessionPromise = null;

function getSession(urls) {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async function () {
    aiProgress({ phase: "checking", loaded: 0, total: 0, fraction: 0, speed: 0, eta: null, note: "", detail: "" });
    var ort = await loadOrt();
    var buf = await modelFromCache(urls);
    if (!buf) {
      var got = await downloadModel(urls);
      aiProgress({ phase: "loading", fraction: 1, speed: 0, eta: null, note: "", detail: "Saving the model on this computer so it is only downloaded once" });
      try {
        var cache = await openCache();
        if (cache) await cache.put(got.url, new Response(got.blob, { headers: { "content-type": "application/octet-stream" } }));
      } catch (e) {
        /* storage full or blocked: carry on without caching */
      }
      buf = await got.blob.arrayBuffer();
    }
    aiProgress({ phase: "loading", fraction: 1, speed: 0, eta: null, note: "", detail: "Starting the AI model (this takes a moment)" });
    var session;
    try {
      session = await ort.InferenceSession.create(new Uint8Array(buf), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "basic",
      });
    } catch (e) {
      // A corrupt cached copy would fail every time: forget it.
      var c2 = await openCache();
      if (c2) for (var i = 0; i < urls.length; i++) await c2.delete(urls[i]);
      throw new Error("The AI model could not be started (" + errText(e) + "). It will be downloaded again next time.");
    }
    aiProgress({ phase: "ready", detail: "" });
    return session;
  })();
  sessionPromise.catch(function () {
    sessionPromise = null; // let the next click try again
    aiProgress({ phase: "idle", detail: "", note: "" });
  });
  return sessionPromise;
}

/* ───────────────────────── AI: repair ───────────────────────── */

/**
 * Plan square windows (side S >= 512 where the crop allows, so most repairs
 * run at native scale) over the painted area. One window when it fits,
 * otherwise a grid with overlap.
 */
function planWindows(bbox, w, h) {
  var MARGIN = 48;
  var bw = bbox.x1 - bbox.x0 + 1;
  var bh = bbox.y1 - bbox.y0 + 1;
  var cap = Math.min(w, h);
  var S = Math.min(cap, Math.max(MODEL_SIZE, Math.max(bw, bh) + 2 * MARGIN));
  function place(c, len) {
    return Math.max(0, Math.min(len - S, Math.round(c - S / 2)));
  }
  if (bw <= S && bh <= S) {
    return { S: S, windows: [{ x0: place((bbox.x0 + bbox.x1) / 2, w), y0: place((bbox.y0 + bbox.y1) / 2, h) }] };
  }
  var stride = Math.max(64, S - 2 * MARGIN);
  var xs = [];
  var ys = [];
  var x;
  var y;
  for (x = bbox.x0 - MARGIN; x < bbox.x1 + MARGIN; x += stride) xs.push(Math.max(0, Math.min(w - S, x)));
  for (y = bbox.y0 - MARGIN; y < bbox.y1 + MARGIN; y += stride) ys.push(Math.max(0, Math.min(h - S, y)));
  var wins = [];
  var seen = {};
  for (var yi = 0; yi < ys.length; yi++) {
    for (var xi = 0; xi < xs.length; xi++) {
      var key = xs[xi] + "," + ys[yi];
      if (!seen[key]) {
        seen[key] = 1;
        wins.push({ x0: xs[xi], y0: ys[yi] });
      }
    }
  }
  return { S: S, windows: wins };
}

async function healWithAI(d) {
  var w = d.width;
  var h = d.height;
  var urls = d.modelUrls && d.modelUrls.length ? d.modelUrls : DEFAULT_MODEL_URLS;
  var rgba = new Uint8ClampedArray(d.srcBuffer);
  var painted = maskFromRGBA(new Uint8ClampedArray(d.maskBuffer), w, h);
  if (!painted) return rgba;

  var session = await getSession(urls);
  var ort = self.ort;

  // Grow the mask a little (halos, soft brush edge); feather the blend.
  var mask = dilate(painted, w, h, 5);
  var alpha = feather(mask, w, h, 3);

  var x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (var yy = 0; yy < h; yy++) {
    for (var xx = 0; xx < w; xx++) {
      if (mask[yy * w + xx]) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
    }
  }
  var plan = planWindows({ x0: x0, y0: y0, x1: x1, y1: y1 }, w, h);
  var S = plan.S;
  var M = MODEL_SIZE;
  var work = new Uint8ClampedArray(rgba); // image being repaired, updated window by window
  var done = new Uint8Array(w * h);

  for (var wi = 0; wi < plan.windows.length; wi++) {
    var win = plan.windows[wi];
    aiProgress({
      phase: "working",
      fraction: wi / plan.windows.length,
      speed: 0,
      eta: null,
      note: "",
      detail: plan.windows.length > 1 ? "Repairing part " + (wi + 1) + " of " + plan.windows.length : "Repairing the painted area",
    });
    await sleep(10); // let the progress message reach the page

    // Window pixels + the mask still to be filled inside it.
    var img = new Float32Array(S * S * 3);
    var mk = new Float32Array(S * S);
    var any = false;
    for (var ry = 0; ry < S; ry++) {
      for (var rx = 0; rx < S; rx++) {
        var si = (win.y0 + ry) * w + (win.x0 + rx);
        var di = ry * S + rx;
        img[di * 3] = work[si * 4];
        img[di * 3 + 1] = work[si * 4 + 1];
        img[di * 3 + 2] = work[si * 4 + 2];
        if (mask[si] && !done[si]) {
          mk[di] = 255;
          any = true;
        }
      }
    }
    if (!any) continue;

    var img512 = resize(img, S, S, M, M, 3);
    var mk512 = resize(mk, S, S, M, M, 1);
    var N = M * M;
    var inImg = new Float32Array(3 * N);
    var inMask = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      inImg[i] = img512[i * 3] / 255;
      inImg[N + i] = img512[i * 3 + 1] / 255;
      inImg[2 * N + i] = img512[i * 3 + 2] / 255;
      inMask[i] = mk512[i] >= 64 ? 1 : 0;
    }
    var feeds = {
      image: new ort.Tensor("float32", inImg, [1, 3, M, M]),
      mask: new ort.Tensor("float32", inMask, [1, 1, M, M]),
    };
    var outputs = await session.run(feeds);
    var o = outputs[session.outputNames[0]].data; // planar RGB, 0..255

    var out512 = new Float32Array(N * 3);
    for (var j = 0; j < N; j++) {
      out512[j * 3] = o[j];
      out512[j * 3 + 1] = o[N + j];
      out512[j * 3 + 2] = o[2 * N + j];
    }
    var outS = resize(out512, M, M, S, S, 3);

    for (var py = 0; py < S; py++) {
      for (var px = 0; px < S; px++) {
        var gi = (win.y0 + py) * w + (win.x0 + px);
        var a = alpha[gi];
        if (a <= 0 || done[gi]) continue;
        var k = (py * S + px) * 3;
        var wo = gi * 4;
        for (var c = 0; c < 3; c++) {
          var v = work[wo + c] * (1 - a) + outS[k + c] * a;
          work[wo + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
        if (mask[gi]) done[gi] = 1;
      }
    }
    await sleep(0);
  }
  aiProgress({ phase: "ready", fraction: 1, detail: "", note: "" });
  for (var q = 3; q < work.length; q += 4) work[q] = 255;
  return work;
}

/* ───────────────────────── message loop ───────────────────────── */

var queue = Promise.resolve();

function handle(d) {
  var run =
    d.type === "heal" ? healWithOpenCV(d) : d.type === "heal-ai" ? healWithAI(d) : Promise.reject(new Error("Unknown request: " + d.type));
  return run.then(
    function (pixels) {
      post({ type: "healed", id: d.id, width: d.width, height: d.height, buffer: pixels.buffer }, [pixels.buffer]);
    },
    function (e) {
      post({ type: "error", id: d.id, message: errText(e) });
    }
  );
}

self.onmessage = function (e) {
  var d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "heal" || d.type === "heal-ai") {
    // One job at a time: both are heavy.
    queue = queue.then(function () {
      return handle(d);
    });
  } else if (d.type === "warm-tools") {
    loadOpenCV().catch(function () {});
  }
};

self.onunhandledrejection = function (ev) {
  post({ type: "error", message: errText(ev && ev.reason) });
};

// Start the quick-heal tools right away: the page asked for a worker because it is about to need them.
loadOpenCV().catch(function () {});
post({ type: "alive", version: VERSION });
