/**
 * Typed client for the Beautify Web Worker (public/beautify-worker.js).
 *
 * The worker does the heavy lifting off the main thread: quick heal with
 * OpenCV, and AI repair with LaMa. This wrapper
 *   - starts it, and restarts it if it died (a missing or blocked worker file
 *     must show an error, never an endless "Preparing…"),
 *   - turns its messages into one status object the editor can render
 *     (download percentage, speed, time left, errors),
 *   - sends crops in and gives the repaired crops back.
 *
 * Pixels keep their order end to end: nothing here flips or mirrors.
 */

import { INITIAL_AI, type AiPhase, type AiStatus, type ToolsStage } from "@/lib/beautifyProgress";

export type { AiStatus, ToolsStage } from "@/lib/beautifyProgress";

type HealArgs = {
  srcImageData: ImageData;
  maskImageData: ImageData;
  radius: number;
};

export type BeautifyStatus = {
  tools: ToolsStage;
  toolsError: string | null;
  ai: AiStatus;
};

type Pending = {
  kind: "heal" | "ai";
  resolve: (imageData: ImageData) => void;
  reject: (err: Error) => void;
};

/** Bump when public/beautify-worker.js or the vendor folder changes. */
const WORKER_VERSION = "7";
/** The worker must say something this soon after it starts, or its file is missing/blocked. */
const FIRST_SIGN_OF_LIFE_MS = 12_000;

export class BeautifyCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "BeautifyCancelled";
  }
}

let worker: Worker | null = null;
let heardFromWorker = false;
let watchdog: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, Pending>();
let toolsWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];

let status: BeautifyStatus = { tools: "idle", toolsError: null, ai: { ...INITIAL_AI } };
const listeners = new Set<(s: BeautifyStatus) => void>();

function setStatus(patch: { tools?: ToolsStage; toolsError?: string | null; ai?: Partial<AiStatus> }) {
  status = {
    tools: patch.tools ?? status.tools,
    toolsError: patch.toolsError === undefined ? status.toolsError : patch.toolsError,
    ai: patch.ai ? { ...status.ai, ...patch.ai } : status.ai,
  };
  for (const fn of listeners) fn(status);
}

export function getBeautifyStatus(): BeautifyStatus {
  return status;
}

export function onBeautifyStatus(fn: (s: BeautifyStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => {
    listeners.delete(fn);
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Everything in flight fails, the worker is dropped; the next call starts a fresh one. */
function failAll(message: string, opts: { fatalForTools?: boolean } = {}) {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  const w = worker;
  worker = null;
  heardFromWorker = false;
  if (w) {
    try {
      w.terminate();
    } catch {
      /* already gone */
    }
  }
  const err = new Error(message);
  for (const p of pending.values()) p.reject(err);
  pending.clear();
  const waiters = toolsWaiters;
  toolsWaiters = [];
  for (const t of waiters) t.reject(err);
  setStatus({
    ...(opts.fatalForTools === false ? {} : { tools: "error", toolsError: message }),
    ai: { phase: "error", error: message, eta: null, speed: 0 },
  });
}

function onWorkerMessage(e: MessageEvent) {
  const d = e.data as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return;
  heardFromWorker = true;
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
  switch (d.type) {
    case "progress": {
      if (d.scope === "tools") {
        if (d.stage === "loading" || d.stage === "compiling") setStatus({ tools: d.stage, toolsError: null });
      } else if (d.scope === "ai") {
        setStatus({
          ai: {
            phase: d.phase as AiPhase,
            loaded: Number(d.loaded) || 0,
            total: Number(d.total) || 0,
            fraction: Number(d.fraction) || 0,
            speed: Number(d.speed) || 0,
            eta: typeof d.eta === "number" ? d.eta : null,
            detail: String(d.detail ?? ""),
            note: String(d.note ?? ""),
            error: null,
          },
        });
      }
      return;
    }
    case "ready": {
      setStatus({ tools: "ready", toolsError: null });
      const waiters = toolsWaiters;
      toolsWaiters = [];
      for (const t of waiters) t.resolve();
      return;
    }
    case "healed": {
      const p = pending.get(String(d.id));
      if (!p) return;
      pending.delete(String(d.id));
      p.resolve(new ImageData(new Uint8ClampedArray(d.buffer as ArrayBuffer), Number(d.width), Number(d.height)));
      return;
    }
    case "error": {
      const message = String(d.message ?? "The Beautify engine reported an error.");
      if (d.id && pending.has(String(d.id))) {
        const p = pending.get(String(d.id))!;
        pending.delete(String(d.id));
        if (p.kind === "ai") setStatus({ ai: { phase: "error", error: message, eta: null, speed: 0 } });
        p.reject(new Error(message));
      } else if (d.scope === "tools") {
        // Quick-heal tools failed to start. AI repair does not need them, so
        // this is not fatal for the AI; waiting Heal clicks are told.
        setStatus({ tools: "error", toolsError: message });
        const waiters = toolsWaiters;
        toolsWaiters = [];
        for (const t of waiters) t.reject(new Error(message));
      } else {
        console.warn("[beautify] worker notice:", message);
      }
      return;
    }
  }
}

function getWorker(): Worker {
  if (typeof window === "undefined") throw new Error("Beautify only works in the browser");
  if (worker) return worker;

  heardFromWorker = false;
  const w = new Worker(`/beautify-worker.js?v=${WORKER_VERSION}`);
  worker = w;
  w.onmessage = onWorkerMessage;
  w.onerror = (ev) => {
    console.error("[beautify worker] failed", ev);
    failAll(
      "The Beautify engine could not start. Its file is missing or was blocked by the browser. Reload the page and try again; if it keeps happening, tell VPV support."
    );
  };
  watchdog = setTimeout(() => {
    if (!heardFromWorker && worker === w) {
      failAll("The Beautify engine did not start within 12 seconds. Reload the page and try again.");
    }
  }, FIRST_SIGN_OF_LIFE_MS);
  return w;
}

/**
 * Start the worker (and with it the quick-heal tools). Safe to call many
 * times. Resolves when Heal can run; rejects with a readable message if the
 * tools cannot start (AI repair may still work).
 */
export function preloadBeautifyWorker(): Promise<void> {
  if (status.tools === "error" && !worker) setStatus({ tools: "idle", toolsError: null });
  if (status.tools === "error" && worker) {
    // The worker is alive but its tools failed: start over with a fresh one.
    failAll("Restarting the Beautify engine.", { fatalForTools: false });
    setStatus({ tools: "idle", toolsError: null, ai: { ...INITIAL_AI } });
  }
  const w = getWorker();
  void w;
  if (status.tools === "ready") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    toolsWaiters.push({ resolve, reject });
  });
}

function send(type: "heal" | "heal-ai", kind: Pending["kind"], args: HealArgs): Promise<ImageData> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const id = newId();
    pending.set(id, { kind, resolve, reject });
    // Copy, so the caller's ImageData stays usable after the transfer.
    const src = new Uint8ClampedArray(args.srcImageData.data);
    const mask = new Uint8ClampedArray(args.maskImageData.data);
    w.postMessage(
      {
        type,
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

/** Quick heal (OpenCV). */
export async function healCrop(args: HealArgs): Promise<ImageData> {
  await preloadBeautifyWorker();
  return send("heal", "heal", args);
}

/**
 * AI repair (LaMa). The first use downloads the ~208 MB model; progress is in
 * the status object. It is kept on this computer afterwards.
 */
export async function healCropAI(args: HealArgs): Promise<ImageData> {
  setStatus({ ai: { ...INITIAL_AI, phase: "checking" } });
  return send("heal-ai", "ai", args);
}

/** Stop an AI request that has not started repairing (checking, downloading, loading). */
export function cancelBeautifyAI(): void {
  const aiIds = [...pending.entries()].filter(([, p]) => p.kind === "ai");
  if (!aiIds.length) return;
  const err = new BeautifyCancelled();
  const w = worker;
  worker = null;
  heardFromWorker = false;
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  if (w) {
    try {
      w.terminate();
    } catch {
      /* already gone */
    }
  }
  for (const [id, p] of [...pending.entries()]) {
    pending.delete(id);
    p.reject(p.kind === "ai" ? err : new Error("The Beautify engine was restarted. Try again."));
  }
  const waiters = toolsWaiters;
  toolsWaiters = [];
  for (const t of waiters) t.reject(new Error("The Beautify engine was restarted. Try again."));
  setStatus({ tools: "idle", toolsError: null, ai: { ...INITIAL_AI } });
}

/** Free the worker (for example when the editor closes). */
export function terminateBeautifyWorker(): void {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* already gone */
    }
  }
  worker = null;
  heardFromWorker = false;
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  pending.clear();
  toolsWaiters = [];
  setStatus({ tools: "idle", toolsError: null, ai: { ...INITIAL_AI } });
}
