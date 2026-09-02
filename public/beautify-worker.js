/* eslint-disable */
/**
 * Beautify Worker — runs OpenCV.js inpainting off the main thread.
 *
 * Why this file exists:
 *   OpenCV.js is an ~8 MB WebAssembly bundle. Instantiating WASM is
 *   inherently synchronous — the browser blocks the main thread while
 *   it compiles. On a normal laptop that's 5–15 seconds of freeze,
 *   long enough for Chrome to pop "Page Unresponsive".
 *
 *   Running the whole thing inside a Web Worker means the WASM compile
 *   happens on the worker's thread. The main UI stays 60 fps forever,
 *   no matter how heavy the operation is or how big the panorama is —
 *   this is what lets us later heal whole walls, whole floors, etc.
 *
 * Protocol:
 *   Main → Worker:
 *     { type: "heal", id, width, height, radius,
 *       srcBuffer: ArrayBuffer(RGBA), maskBuffer: ArrayBuffer(RGBA) }
 *     Buffers are transferred (zero-copy).
 *
 *   Worker → Main:
 *     { type: "ready" }          — sent once, when OpenCV is loaded.
 *     { type: "healed", id, buffer, width, height }
 *     { type: "error",  id, message }
 *     { type: "progress", stage: "loading" | "compiling" }
 */

let cvReady = false;
const queue = [];

// OpenCV.js looks for a global `Module` and calls onRuntimeInitialized
// once the WASM has finished compiling.
self.Module = {
  onRuntimeInitialized() {
    cvReady = true;
    self.postMessage({ type: "ready" });
    while (queue.length) processMessage(queue.shift());
  },
};

self.postMessage({ type: "progress", stage: "loading" });
try {
  importScripts("https://docs.opencv.org/4.x/opencv.js");
  self.postMessage({ type: "progress", stage: "compiling" });
} catch (err) {
  self.postMessage({
    type: "error",
    id: null,
    message: "Failed to load OpenCV.js: " + (err && err.message ? err.message : err),
  });
}

// ---------------------------------------------------------------------------
// LaMa neural inpainter (Samsung, MIT license). Downloaded on first use.
//
// Why we need it:
//   TELEA (the classical OpenCV algorithm) averages nearby pixels — it can't
//   invent texture, so healed patches always look blurry on anything larger
//   than a tiny spot. LaMa is a Fourier-convolutional network trained on
//   millions of natural images; it can extend brick / concrete / paint /
//   floor patterns coherently across the mask, producing "magic fix" results.
//
// Runtime: onnxruntime-web loaded from a CDN, WASM backend. Model is
// downloaded lazily on the first Repair(AI) request and cached forever
// by the browser's HTTP cache.
// ---------------------------------------------------------------------------
// NOTE: do NOT name this `ort` — the imported onnxruntime-web bundle
// declares `const ort` in the same worker global scope, which would
// collide with our `let ort` and throw "Identifier 'ort' has already
// been declared" for EVERY candidate URL. Use a distinct name.
let ortLib = null;
let ortLoadError = null;
let lamaSession = null;
let lamaLoading = null;

// Prefer files served from our own origin — CDNs get blocked by ad
// blockers (uBlock, AdBlock Plus). The local copy is populated by
// `scripts/copy-onnx.mjs` (runs via `npm install` postinstall).
//
// Entry-point filenames have changed between onnxruntime-web versions:
//   • 1.14–1.17: dist/ort.min.js
//   • 1.18+:     dist/ort.min.js (still exists) + dist/ort.wasm.min.js
//                (WASM-only, smaller — preferred if present)
//   • 1.20+:     dist/ort.all.min.js (bundles every backend)
// We try each in order; first one that loads wins.
// CDNs kept as last-resort fallback.
const ORT_CANDIDATES = [
  "/onnx/ort.wasm.min.js",
  "/onnx/ort.min.js",
  "/onnx/ort.all.min.js",
  "/onnx/ort.js",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.min.js",
  "https://unpkg.com/onnxruntime-web@1.17.3/dist/ort.min.js",
];

for (const url of ORT_CANDIDATES) {
  try {
    console.log("[beautify worker] trying ORT from", url);
    importScripts(url);
    if (self.ort) {
      ortLib = self.ort;
      // The WASM binaries live next to the JS on the same CDN — point
      // ORT there so it doesn't try (and fail) to load them from our
      // own origin.
      const base = url.substring(0, url.lastIndexOf("/") + 1);
      ortLib.env.wasm.wasmPaths = base;
      ortLib.env.wasm.numThreads = Math.max(
        1,
        Math.min(4, (self.navigator?.hardwareConcurrency || 4) - 1)
      );
      console.log("[beautify worker] ORT loaded from", url);
      break;
    }
  } catch (e) {
    ortLoadError = e;
    console.warn("[beautify worker] ORT load failed from", url, e);
  }
}
if (!ortLib) {
  console.error(
    "[beautify worker] All ORT candidates failed. AI Repair unavailable.",
    ortLoadError
  );
}

// Public LaMa ONNX (fp32, ~200MB). One-time browser HTTP-cached download.
// If you prefer a smaller model, swap to a fp16 or MI-GAN URL here.
const LAMA_URL =
  "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";

async function loadLaMa(id) {
  if (lamaSession) return lamaSession;
  if (lamaLoading) return lamaLoading;
  if (!ortLib) {
    throw new Error(
      "AI runtime (onnxruntime-web) couldn't load. " +
        "Run `npm install` in the project folder to install it locally, " +
        "then restart the dev server. If you already ran install, " +
        "check that public/onnx/ort.min.js exists — the postinstall " +
        "script should have populated it. Console has details."
    );
  }

  lamaLoading = (async () => {
    self.postMessage({
      type: "progress",
      stage: "downloading-model",
      id,
      progress: 0,
    });
    // Fetch with progress reporting.
    const resp = await fetch(LAMA_URL);
    if (!resp.ok) throw new Error("LaMa download failed: HTTP " + resp.status);
    const total = parseInt(resp.headers.get("content-length") || "0", 10);
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        self.postMessage({
          type: "progress",
          stage: "downloading-model",
          id,
          progress: received / total,
        });
      }
    }
    const bytes = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }

    self.postMessage({ type: "progress", stage: "compiling-model", id });
    lamaSession = await ortLib.InferenceSession.create(bytes.buffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    self.postMessage({ type: "progress", stage: "model-ready", id });
    return lamaSession;
  })();

  return lamaLoading;
}

/**
 * Run LaMa on one crop. Everything happens in the worker so the main
 * thread is untouched.
 *
 * Input protocol (from main):
 *   { type: "heal-ai", id, width, height, srcBuffer, maskBuffer }
 * Output:
 *   { type: "healed", id, buffer, width, height }
 */
async function processLaMa(msg) {
  const { id, width, height, srcBuffer, maskBuffer } = msg;
  try {
    const session = await loadLaMa(id);
    self.postMessage({ type: "progress", stage: "running-inference", id });

    const srcArr = new Uint8ClampedArray(srcBuffer);
    const maskArr = new Uint8ClampedArray(maskBuffer);

    // The Carve/LaMa-ONNX model has FIXED 512×512 input tensors — it
    // was traced with a static shape, not exported with dynamic axes.
    // We resize every crop (regardless of its true aspect) to 512×512,
    // run inference, then scale the healed pixels back to the caller's
    // requested dimensions on the way out. Slight aspect stretch during
    // inpainting doesn't matter — LaMa's generated content flows into
    // whatever shape it's given, and the surrounding real texture is
    // what disguises any distortion after the resize-back.
    const INPUT = 512;

    // Nearest-neighbor sample the crop into a 512×512 planar tensor (NCHW).
    const rgbData = new Float32Array(3 * INPUT * INPUT);
    const maskData = new Float32Array(INPUT * INPUT);
    for (let y = 0; y < INPUT; y++) {
      const srcY = Math.min(height - 1, Math.round((y / INPUT) * height));
      for (let x = 0; x < INPUT; x++) {
        const srcX = Math.min(width - 1, Math.round((x / INPUT) * width));
        const sIdx = (srcY * width + srcX) * 4;
        const dIdx = y * INPUT + x;
        rgbData[dIdx] = srcArr[sIdx] / 255;
        rgbData[INPUT * INPUT + dIdx] = srcArr[sIdx + 1] / 255;
        rgbData[2 * INPUT * INPUT + dIdx] = srcArr[sIdx + 2] / 255;
        // Mask: painted (red channel > threshold) → 1
        maskData[dIdx] = maskArr[sIdx] > 10 ? 1 : 0;
      }
    }

    const imgTensor = new ortLib.Tensor(
      "float32",
      rgbData,
      [1, 3, INPUT, INPUT]
    );
    const maskTensor = new ortLib.Tensor(
      "float32",
      maskData,
      [1, 1, INPUT, INPUT]
    );

    // Input node names for Carve/LaMa-ONNX are "image" and "mask".
    const results = await session.run({
      image: imgTensor,
      mask: maskTensor,
    });

    // Output: NCHW, values in [0, 255] (or [0,1] on some variants — clamp).
    const outKey = Object.keys(results)[0];
    const outTensor = results[outKey];
    const outArr = outTensor.data; // Float32Array, [1, 3, 512, 512]
    const [_, __, outH, outW] = outTensor.dims;

    // Detect output value range once — some LaMa exports emit [0,1],
    // others [0,255]. Peek at max R over a few samples.
    let peak = 0;
    for (let i = 0; i < 32; i++) peak = Math.max(peak, outArr[i]);
    const scaleOut = peak <= 2 ? 255 : 1;

    // Resample the 512×512 output back down to the caller's crop
    // dimensions (nearest-neighbor is fine — the healed content is
    // low-frequency; the surrounding real texture makes any softness
    // invisible).
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const oy = Math.min(outH - 1, Math.round((y / height) * outH));
      for (let x = 0; x < width; x++) {
        const ox = Math.min(outW - 1, Math.round((x / width) * outW));
        const oIdx = oy * outW + ox;
        const dIdx = (y * width + x) * 4;
        rgba[dIdx] = clamp255(outArr[oIdx] * scaleOut);
        rgba[dIdx + 1] = clamp255(outArr[outH * outW + oIdx] * scaleOut);
        rgba[dIdx + 2] = clamp255(outArr[2 * outH * outW + oIdx] * scaleOut);
        rgba[dIdx + 3] = 255;
      }
    }

    self.postMessage(
      { type: "healed", id, buffer: rgba.buffer, width, height },
      [rgba.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      message:
        "AI Repair failed: " + (err && err.message ? err.message : String(err)),
    });
  }
}

function clamp255(v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

self.onmessage = (e) => {
  const msg = e.data;
  // AI Repair route doesn't need OpenCV — it can run before cvReady.
  if (msg && msg.type === "heal-ai") {
    processLaMa(msg);
    return;
  }
  if (!cvReady) {
    queue.push(msg);
    return;
  }
  processMessage(msg);
};

function processMessage(msg) {
  if (!msg || msg.type !== "heal") return;
  const cv = self.cv;
  const { id, width, height, radius, srcBuffer, maskBuffer } = msg;

  let src, mRgba, mask, channels, red, src3, dst, dstRgba;
  try {
    const srcArr = new Uint8ClampedArray(srcBuffer);
    const maskArr = new Uint8ClampedArray(maskBuffer);

    // Construct RGBA Mats directly from the transferred pixel buffers.
    // `Mat.data` is a typed-array view into the underlying WASM heap;
    // `.set()` copies our pixels into it in one shot.
    src = new cv.Mat(height, width, cv.CV_8UC4);
    src.data.set(srcArr);
    mRgba = new cv.Mat(height, width, cv.CV_8UC4);
    mRgba.data.set(maskArr);

    // Build a single-channel mask from the mask's red channel.
    // Anything painted at all → 255, everything else → 0.
    mask = new cv.Mat();
    channels = new cv.MatVector();
    cv.split(mRgba, channels);
    red = channels.get(0);
    cv.threshold(red, mask, 10, 255, cv.THRESH_BINARY);

    // Feather the mask so the healed patch fades into surroundings.
    const ksize = new cv.Size(9, 9);
    cv.GaussianBlur(mask, mask, ksize, 0);
    cv.threshold(mask, mask, 30, 255, cv.THRESH_BINARY);

    // OpenCV inpaint wants 8UC1 or 8UC3 (not RGBA). Convert.
    src3 = new cv.Mat();
    cv.cvtColor(src, src3, cv.COLOR_RGBA2RGB);

    // Run TELEA fast-marching inpaint.
    dst = new cv.Mat();
    cv.inpaint(src3, mask, dst, radius, cv.INPAINT_TELEA);

    // Back to RGBA so main thread can drop it straight into a canvas.
    dstRgba = new cv.Mat();
    cv.cvtColor(dst, dstRgba, cv.COLOR_RGB2RGBA);

    // Copy healed pixels into a fresh buffer that we can transfer.
    // (Mat.data points into WASM memory — not transferable directly.)
    const out = new Uint8ClampedArray(dstRgba.data);

    self.postMessage(
      { type: "healed", id, buffer: out.buffer, width, height },
      [out.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      message: err && err.message ? err.message : String(err),
    });
  } finally {
    // Always free WASM memory even on error.
    try { src && src.delete(); } catch (_) {}
    try { src3 && src3.delete(); } catch (_) {}
    try { dst && dst.delete(); } catch (_) {}
    try { dstRgba && dstRgba.delete(); } catch (_) {}
    try { mRgba && mRgba.delete(); } catch (_) {}
    try { mask && mask.delete(); } catch (_) {}
    try { red && red.delete(); } catch (_) {}
    try { channels && channels.delete(); } catch (_) {}
  }
}
