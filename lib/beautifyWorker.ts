/**
 * Typed client wrapper around the Beautify Web Worker.
 *
 * All OpenCV work runs in `public/beautify-worker.js` — the main thread
 * only posts pixel buffers and awaits results. Zero freeze even during
 * the 8 MB WASM compile, and headroom for future heavy operations
 * (large-area heals, whole walls, LaMa via worker, etc.)
 *
 * Usage:
 *   preloadBeautifyWorker();          // fire once when the modal opens
 *   const healed: ImageData =
 *     await healCrop({ srcImageData, maskImageData, radius: 8 });
 */

type HealArgs = {
  srcImageData: ImageData;
  maskImageData: ImageData;
  radius: number;
};

type Pending = {
  resolve: (imageData: ImageData) => void;
  reject: (err: Error) => void;
};

let sharedWorker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
const pending = new Map<string, Pending>();

// Track lifecycle so consumers can render "Downloading tools…" vs
// "Compiling…" vs "Downloading AI model…" vs "Ready".
type Stage =
  | "idle"
  | "loading"
  | "compiling"
  | "ready"
  | "error"
  | "downloading-model"
  | "compiling-model"
  | "model-ready"
  | "running-inference";
let stage: Stage = "idle";
let modelProgress = 0;
const stageListeners = new Set<(s: Stage, progress: number) => void>();
function setStage(s: Stage, progress = 0) {
  stage = s;
  modelProgress = progress;
  for (const fn of stageListeners) fn(s, progress);
}
export function onBeautifyWorkerStage(
  fn: (s: Stage, progress: number) => void
): () => void {
  stageListeners.add(fn);
  fn(stage, modelProgress);
  return () => {
    stageListeners.delete(fn);
  };
}
export function currentBeautifyWorkerStage(): Stage {
  return stage;
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Fresh version tag every module load. In dev, Fast Refresh reloads
// this module whenever it changes, so we always get a new worker and
// never end up running stale worker code from a previous session.
// In prod this is set once at page load, so the worker is cached
// across the session (the browser HTTP-cache handles that).
const WORKER_VERSION =
  typeof process !== "undefined" && process.env.NODE_ENV === "development"
    ? String(Date.now())
    : "6";

let sharedWorkerVersion: string | null = null;

function getWorker(): Worker {
  if (typeof window === "undefined") {
    throw new Error("Beautify worker only available in the browser");
  }
  // Reuse if we already have a worker AT THIS VERSION.
  if (sharedWorker && sharedWorkerVersion === WORKER_VERSION) {
    return sharedWorker;
  }
  // Otherwise tear down the stale worker + its bookkeeping.
  if (sharedWorker) {
    try {
      sharedWorker.terminate();
    } catch {
      /* noop */
    }
    sharedWorker = null;
    readyPromise = null;
    stage = "idle";
    pending.clear();
  }
  console.log("[beautify] spinning up worker version", WORKER_VERSION);
  const w = new Worker(`/beautify-worker.js?v=${WORKER_VERSION}`);
  sharedWorkerVersion = WORKER_VERSION;

  w.onmessage = (e: MessageEvent) => {
    const d = e.data as any;
    if (!d || typeof d !== "object") return;
    switch (d.type) {
      case "progress":
        // OpenCV lifecycle
        if (d.stage === "loading") setStage("loading");
        else if (d.stage === "compiling") setStage("compiling");
        // LaMa model lifecycle (piggybacks on same stage stream so the
        // UI can render one unified progress area).
        else if (d.stage === "downloading-model")
          setStage("downloading-model", d.progress ?? 0);
        else if (d.stage === "compiling-model")
          setStage("compiling-model", 1);
        else if (d.stage === "model-ready") setStage("model-ready", 1);
        else if (d.stage === "running-inference")
          setStage("running-inference", 1);
        return;
      case "ready":
        setStage("ready");
        return;
      case "healed": {
        const p = pending.get(d.id);
        if (!p) return;
        pending.delete(d.id);
        const arr = new Uint8ClampedArray(d.buffer);
        p.resolve(new ImageData(arr, d.width, d.height));
        return;
      }
      case "error": {
        // If the error has an id, reject the matching request; otherwise
        // it's a fatal setup error and everything in flight should fail.
        if (d.id && pending.has(d.id)) {
          const p = pending.get(d.id)!;
          pending.delete(d.id);
          p.reject(new Error(d.message ?? "Worker error"));
        } else {
          setStage("error");
          for (const p of pending.values()) {
            p.reject(new Error(d.message ?? "Worker fatal error"));
          }
          pending.clear();
        }
        return;
      }
    }
  };

  w.onerror = (e) => {
    console.error("[beautify worker] uncaught error", e);
    setStage("error");
    for (const p of pending.values()) p.reject(new Error("Worker crashed"));
    pending.clear();
  };

  sharedWorker = w;
  return w;
}

/**
 * Spin up the worker (which starts downloading + compiling OpenCV.js
 * on its own thread). Safe to call multiple times — returns the same
 * promise. Ideal to call the moment the Beautify modal opens.
 */
export function preloadBeautifyWorker(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    try {
      const w = getWorker();
      if (stage === "ready") return resolve();
      const onMsg = (e: MessageEvent) => {
        const d = e.data as any;
        if (d?.type === "ready") {
          w.removeEventListener("message", onMsg);
          resolve();
        } else if (d?.type === "error" && !d.id) {
          w.removeEventListener("message", onMsg);
          reject(new Error(d.message ?? "Worker init error"));
        }
      };
      w.addEventListener("message", onMsg);

      // Safety net — worker really shouldn't take >90s.
      setTimeout(() => {
        if (stage !== "ready") {
          reject(new Error("Beautify worker didn't become ready within 90s"));
        }
      }, 90_000);
    } catch (e: any) {
      reject(e);
    }
  });
  return readyPromise;
}

/**
 * Send one crop to the worker and wait for the healed result.
 *
 * `srcImageData` and `maskImageData` must be the same width/height.
 * The mask channel: any pixel with non-zero red is treated as painted.
 *
 * Note: internally we copy the pixel buffers before transfer so the
 * caller's ImageData objects remain usable after the call.
 */
export async function healCrop(args: HealArgs): Promise<ImageData> {
  await preloadBeautifyWorker();
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const id = newId();
    pending.set(id, { resolve, reject });
    // Copy so caller's buffers aren't detached by the transfer.
    const src = new Uint8ClampedArray(args.srcImageData.data);
    const mask = new Uint8ClampedArray(args.maskImageData.data);
    w.postMessage(
      {
        type: "heal",
        id,
        radius: args.radius,
        width: args.srcImageData.width,
        height: args.srcImageData.height,
        srcBuffer: src.buffer,
        maskBuffer: mask.buffer,
      },
      [src.buffer, mask.buffer]
    );
  });
}

/**
 * AI Repair — runs LaMa in the worker. Downloads the ~200MB model on
 * first use, then caches it forever. Way better texture continuity
 * than TELEA (`healCrop`), especially on larger areas.
 *
 * Same input/output shape as healCrop, different message type.
 */
export async function healCropAI(args: HealArgs): Promise<ImageData> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const id = newId();
    pending.set(id, { resolve, reject });
    const src = new Uint8ClampedArray(args.srcImageData.data);
    const mask = new Uint8ClampedArray(args.maskImageData.data);
    w.postMessage(
      {
        type: "heal-ai",
        id,
        radius: args.radius,
        width: args.srcImageData.width,
        height: args.srcImageData.height,
        srcBuffer: src.buffer,
        maskBuffer: mask.buffer,
      },
      [src.buffer, mask.buffer]
    );
  });
}

/** Optional — free the worker (e.g. on page unload). */
export function terminateBeautifyWorker() {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
    readyPromise = null;
    stage = "idle";
    pending.clear();
  }
}
