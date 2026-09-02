"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  preloadBeautifyWorker,
  healCrop,
  healCropAI,
  onBeautifyWorkerStage,
} from "@/lib/beautifyWorker";

/**
 * BeautifyModal — full-screen 360° panorama repair.
 *
 * The user looks around a live sphere (same feel as the tour viewer),
 * switches to Paint mode, and brushes over damage / cables / stains
 * DIRECTLY IN 3D. Under the hood the mask lives on a hidden flat
 * equirect canvas that's textured onto a mask sphere overlay; when
 * the user hits Heal we crop the painted bounding box out of the
 * source panorama, run OpenCV.js `cv.inpaint` (TELEA fast-marching)
 * on the crop, and blit the healed patch back onto the panorama
 * texture. Zero backend calls.
 *
 * Two big optimizations that removed the "Page unresponsive" freeze:
 *   1. OpenCV.js is PRELOADED when the modal opens (in the background).
 *      Otherwise the 8 MB WASM download would block the main thread on
 *      the first Heal click and Chrome would kill the tab.
 *   2. We track the painted bounding box as the user strokes, so Heal
 *      never has to scan the whole 4096×2048 mask.
 */
export default function BeautifyModal({
  imageUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  onSave: (blob: Blob) => Promise<void>;
  onClose: () => void;
}) {
  // ---- Hidden source canvases (never mounted visibly) ----
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Snapshots for compare + undo.
  const originalRef = useRef<ImageData | null>(null);
  const preHealRef = useRef<ImageData | null>(null);

  // Running bounding box of every brush stamp — no more full-image
  // scan when the user clicks Heal.
  const maskBoundsRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);

  // Version counters — bump to tell R3F "re-upload this texture".
  const [imgVersion, setImgVersion] = useState(0);
  const [maskVersion, setMaskVersion] = useState(0);
  const [showBefore, setShowBefore] = useState(false);

  // UI state.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<
    "loading" | "opencv" | "healing" | "ai" | "saving" | null
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [mode, setMode] = useState<"look" | "paint">("look");
  const [hasMask, setHasMask] = useState(false);
  const [canUndoHeal, setCanUndoHeal] = useState(false);

  // ---- Beautify worker: OpenCV lives on a separate thread ----
  //
  // Spinning up the worker starts the OpenCV.js download + WASM
  // compile on the worker's thread. Main thread stays 60 fps the
  // whole time — no more "Page Unresponsive" dialogs, and there's
  // headroom to heal much larger areas (whole walls, floors, etc.)
  // without ever blocking the UI.
  const [workerStage, setWorkerStage] = useState<string>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  useEffect(() => {
    const off = onBeautifyWorkerStage((s, p) => {
      setWorkerStage(s);
      setModelProgress(p);
    });
    preloadBeautifyWorker().catch((e) =>
      console.warn("[beautify] worker preload failed", e)
    );
    return off;
  }, []);

  // ---- Create the hidden canvases + load the panorama ----
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    // Fresh canvases every mount (or after imageUrl change).
    imageCanvasRef.current = document.createElement("canvas");
    maskCanvasRef.current = document.createElement("canvas");
    originalRef.current = null;
    preHealRef.current = null;
    maskBoundsRef.current = null;
    setHasMask(false);
    setCanUndoHeal(false);
    setReady(false);
    setError(null);
    setBusy("loading");

    console.log("[beautify] loading", imageUrl);

    function drawInto(img: HTMLImageElement): boolean {
      // Cap at 2048 wide. 4096 was ~64 MB of pixel data across the
      // two hidden canvases + two GPU textures — big enough to freeze
      // a laptop during upload. 2048 is 4× less data and still very
      // high quality for a 360° panorama.
      const maxW = 2048;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const imgC = imageCanvasRef.current!;
      const maskC = maskCanvasRef.current!;
      imgC.width = maskC.width = w;
      imgC.height = maskC.height = h;

      const ictx = imgC.getContext("2d")!;
      ictx.drawImage(img, 0, 0, w, h);
      try {
        originalRef.current = ictx.getImageData(0, 0, w, h);
      } catch (e) {
        console.warn("[beautify] tainted, falling back to fetch", e);
        return false;
      }
      maskC.getContext("2d")!.clearRect(0, 0, w, h);
      setReady(true);
      setBusy(null);
      setImgVersion((v) => v + 1);
      console.log("[beautify] drew", w, "x", h);
      return true;
    }

    async function fetchFallback() {
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img2 = new Image();
        img2.onload = () => {
          if (cancelled) return;
          if (!drawInto(img2)) {
            setError("Fetched blob but canvas still tainted.");
            setBusy(null);
          }
        };
        img2.onerror = () => {
          setError("Blob decode failed.");
          setBusy(null);
        };
        img2.src = objectUrl;
      } catch (err: any) {
        if (cancelled) return;
        setError(
          `Couldn't load image (${err?.message ?? "unknown"}). ` +
            `Check Supabase CORS on the "panoramas" bucket.`
        );
        setBusy(null);
      }
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      if (!drawInto(img)) fetchFallback();
    };
    img.onerror = () => {
      if (cancelled) return;
      console.warn("[beautify] <img> onerror, trying fetch fallback");
      fetchFallback();
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // ---- Escape closes ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoHeal();
      }
      if (e.key.toLowerCase() === "b") setMode("paint");
      if (e.key.toLowerCase() === "v") setMode("look");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Paint API used by the sphere ----
  function stampBrush(x: number, y: number) {
    const maskC = maskCanvasRef.current;
    if (!maskC) return;
    const ctx = maskC.getContext("2d")!;
    const r = brushSize / 2;
    ctx.fillStyle = "rgba(255, 40, 40, 0.6)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Extend running bounds.
    const b = maskBoundsRef.current;
    if (!b) {
      maskBoundsRef.current = {
        minX: x - r,
        minY: y - r,
        maxX: x + r,
        maxY: y + r,
      };
    } else {
      b.minX = Math.min(b.minX, x - r);
      b.minY = Math.min(b.minY, y - r);
      b.maxX = Math.max(b.maxX, x + r);
      b.maxY = Math.max(b.maxY, y + r);
    }
    setHasMask(true);
  }
  function strokeLine(x0: number, y0: number, x1: number, y1: number) {
    const r = brushSize / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, r / 4);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= n; i++) {
      stampBrush(x0 + (dx * i) / n, y0 + (dy * i) / n);
    }
  }

  // ---- Mask ops ----
  function resetMask() {
    const c = maskCanvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    maskBoundsRef.current = null;
    setHasMask(false);
    setMaskVersion((v) => v + 1);
  }

  async function heal() {
    const imgC = imageCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!imgC || !maskC) return;
    if (!hasMask || !maskBoundsRef.current) {
      alert("Paint over the areas you want to heal first.");
      return;
    }
    // Two-phase busy so the button reflects reality:
    // "opencv" while the worker is still spinning up OpenCV (only
    // the very first Heal in a session), then "healing" once we're
    // actually inpainting. Main thread never blocks either way.
    setBusy(workerStage === "ready" ? "healing" : "opencv");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const ictx = imgC.getContext("2d")!;
      // Full-image snapshot for undo. One-time big copy per Heal.
      preHealRef.current = ictx.getImageData(0, 0, imgC.width, imgC.height);

      // Use tracked bounds — no full-mask scan needed.
      const b = maskBoundsRef.current;
      const pad = Math.min(Math.max(brushSize * 2, 40), 250);
      const minX = Math.max(0, Math.floor(b.minX - pad));
      const minY = Math.max(0, Math.floor(b.minY - pad));
      const maxX = Math.min(imgC.width - 1, Math.ceil(b.maxX + pad));
      const maxY = Math.min(imgC.height - 1, Math.ceil(b.maxY + pad));
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      console.log("[beautify] heal crop", cropW, "x", cropH, "at", minX, minY);

      // Extract image + mask crops as ImageData for the worker.
      const srcCrop = document.createElement("canvas");
      srcCrop.width = cropW;
      srcCrop.height = cropH;
      const scCtx = srcCrop.getContext("2d")!;
      scCtx.drawImage(imgC, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      const srcImgData = scCtx.getImageData(0, 0, cropW, cropH);

      const maskCrop = document.createElement("canvas");
      maskCrop.width = cropW;
      maskCrop.height = cropH;
      const mcCtx = maskCrop.getContext("2d")!;
      mcCtx.drawImage(maskC, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      const maskImgData = mcCtx.getImageData(0, 0, cropW, cropH);

      const radius = Math.max(4, Math.min(12, Math.round(brushSize / 4)));

      // Kick to the worker. Main thread stays responsive here — you
      // could actually rotate the sphere while this awaits.
      setBusy("healing");
      const healed = await healCrop({
        srcImageData: srcImgData,
        maskImageData: maskImgData,
        radius,
      });

      // Composite healed crop back onto the full-res image.
      scCtx.putImageData(healed, 0, 0);
      ictx.drawImage(srcCrop, minX, minY);

      resetMask();
      setCanUndoHeal(true);
      setImgVersion((v) => v + 1);
    } catch (e: any) {
      console.error("[beautify] heal error", e);
      setError(e?.message ?? "Heal failed. Try a smaller area.");
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------------
  // AI Repair — same bbox-crop pipeline, but sends the crop to LaMa in
  // the worker instead of TELEA. LaMa actually invents plausible texture
  // (bricks, concrete, paint) instead of averaging — no more "blurry
  // patch" look. First call downloads the ~200 MB model; cached forever
  // after that.
  // ---------------------------------------------------------------------
  async function healAI() {
    const imgC = imageCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!imgC || !maskC) return;
    if (!hasMask || !maskBoundsRef.current) {
      alert("Paint over the areas you want to repair first.");
      return;
    }
    setBusy("ai");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const ictx = imgC.getContext("2d")!;
      preHealRef.current = ictx.getImageData(0, 0, imgC.width, imgC.height);

      const b = maskBoundsRef.current;
      // AI can handle bigger context — give it more padding so it has
      // more texture to learn from.
      const pad = Math.min(Math.max(brushSize * 3, 60), 400);
      const minX = Math.max(0, Math.floor(b.minX - pad));
      const minY = Math.max(0, Math.floor(b.minY - pad));
      const maxX = Math.min(imgC.width - 1, Math.ceil(b.maxX + pad));
      const maxY = Math.min(imgC.height - 1, Math.ceil(b.maxY + pad));
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      console.log("[beautify] AI crop", cropW, "x", cropH, "at", minX, minY);

      const srcCrop = document.createElement("canvas");
      srcCrop.width = cropW;
      srcCrop.height = cropH;
      const scCtx = srcCrop.getContext("2d")!;
      scCtx.drawImage(imgC, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      const srcImgData = scCtx.getImageData(0, 0, cropW, cropH);

      const maskCrop = document.createElement("canvas");
      maskCrop.width = cropW;
      maskCrop.height = cropH;
      const mcCtx = maskCrop.getContext("2d")!;
      mcCtx.drawImage(maskC, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      const maskImgData = mcCtx.getImageData(0, 0, cropW, cropH);

      const healed = await healCropAI({
        srcImageData: srcImgData,
        maskImageData: maskImgData,
        radius: 8, // ignored by LaMa but keeps the type happy
      });

      scCtx.putImageData(healed, 0, 0);
      ictx.drawImage(srcCrop, minX, minY);

      resetMask();
      setCanUndoHeal(true);
      setImgVersion((v) => v + 1);
    } catch (e: any) {
      console.error("[beautify] AI repair error", e);
      setError(e?.message ?? "AI repair failed.");
    } finally {
      setBusy(null);
    }
  }

  function undoHeal() {
    if (!preHealRef.current || !imageCanvasRef.current) return;
    const imgC = imageCanvasRef.current;
    imgC.getContext("2d")!.putImageData(preHealRef.current, 0, 0);
    preHealRef.current = null;
    setCanUndoHeal(false);
    setImgVersion((v) => v + 1);
  }

  function resetToOriginal() {
    if (!originalRef.current || !imageCanvasRef.current) return;
    const imgC = imageCanvasRef.current;
    imgC.getContext("2d")!.putImageData(originalRef.current, 0, 0);
    resetMask();
    preHealRef.current = null;
    setCanUndoHeal(false);
    setImgVersion((v) => v + 1);
  }

  async function save() {
    const imgC = imageCanvasRef.current;
    if (!imgC) return;
    setBusy("saving");
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        imgC.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/jpeg",
          0.92
        )
      );
      await onSave(blob);
      onClose();
    } catch (e: any) {
      console.error("[beautify] save error", e);
      setError(e?.message ?? "Save failed.");
      setBusy(null);
    }
  }

  if (typeof document === "undefined") return null;

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0c",
        zIndex: 20000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "#111",
          borderBottom: "1px solid #222",
          color: "#eee",
          fontSize: 13,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 600, marginRight: 6 }}>Beautify</div>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: "#0a0a0c", borderRadius: 6 }}>
          <button
            onClick={() => setMode("look")}
            style={{
              ...tabStyle,
              background: mode === "look" ? "#2563eb" : "transparent",
              color: mode === "look" ? "#fff" : "#aaa",
            }}
            title="V — drag to rotate the 360°"
          >
            👁 Look
          </button>
          <button
            onClick={() => setMode("paint")}
            style={{
              ...tabStyle,
              background: mode === "paint" ? "#dc2626" : "transparent",
              color: mode === "paint" ? "#fff" : "#aaa",
            }}
            title="B — drag to paint the mask"
          >
            🖌 Paint
          </button>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Brush
          <input
            type="range"
            min={5}
            max={200}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: 100 }}
          />
          <span style={{ width: 34, textAlign: "right" }}>{brushSize}px</span>
        </label>

        <button
          onClick={resetMask}
          disabled={!hasMask || !!busy}
          style={btnStyle}
        >
          Clear mask
        </button>

        <button
          onClick={heal}
          disabled={!hasMask || !!busy}
          style={{
            ...btnStyle,
            background: "#22c55e",
            color: "#000",
            fontWeight: 600,
          }}
        >
          {busy === "opencv"
            ? workerStage === "loading"
              ? "Downloading tools…"
              : workerStage === "compiling"
              ? "Compiling tools…"
              : "Preparing tools…"
            : busy === "healing"
            ? "Healing…"
            : "Heal"}
        </button>

        <button
          onClick={healAI}
          disabled={!hasMask || !!busy}
          style={{
            ...btnStyle,
            background: "linear-gradient(90deg, #a855f7, #ec4899)",
            color: "#fff",
            fontWeight: 600,
            border: "none",
          }}
          title="Neural inpainting (LaMa). First use downloads a ~200 MB model."
        >
          {busy === "ai"
            ? workerStage === "downloading-model"
              ? `Downloading AI ${Math.round(modelProgress * 100)}%…`
              : workerStage === "compiling-model"
              ? "Loading AI model…"
              : workerStage === "running-inference"
              ? "AI working…"
              : "Preparing AI…"
            : "✨ Repair (AI)"}
        </button>

        <button
          onClick={undoHeal}
          disabled={!canUndoHeal || !!busy}
          style={btnStyle}
          title="Ctrl+Z"
        >
          Undo heal
        </button>

        <button
          onMouseDown={() => setShowBefore(true)}
          onMouseUp={() => setShowBefore(false)}
          onMouseLeave={() => setShowBefore(false)}
          disabled={!ready || !!busy}
          style={btnStyle}
        >
          Hold: original
        </button>

        <button
          onClick={resetToOriginal}
          disabled={!ready || !!busy}
          style={btnStyle}
        >
          Reset all
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy === "saving"} style={btnStyle}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!ready || !!busy}
            style={{
              ...btnStyle,
              background: "#0ea5e9",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            {busy === "saving" ? "Saving…" : "Save & Replace"}
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div style={{ flex: 1, position: "relative", background: "#000" }}>
        {busy === "loading" && (
          <div style={loaderStyle}>Loading panorama…</div>
        )}
        {error && <div style={errorStyle}>{error}</div>}
        {ready && imageCanvasRef.current && maskCanvasRef.current && (
          <Canvas
            camera={{ position: [0, 0, 0.01], fov: 75, near: 0.01, far: 2000 }}
            style={{ width: "100%", height: "100%" }}
          >
            <PanoSphere
              imageCanvas={imageCanvasRef.current}
              maskCanvas={maskCanvasRef.current}
              imgVersion={imgVersion}
              maskVersion={maskVersion}
              mode={mode}
              showBefore={showBefore}
              originalImageData={originalRef.current}
              onStroke={(x, y, lastX, lastY) => {
                if (lastX != null && lastY != null) strokeLine(lastX, lastY, x, y);
                else stampBrush(x, y);
                setMaskVersion((v) => v + 1);
              }}
            />
          </Canvas>
        )}
      </div>

      <div
        style={{
          padding: "6px 16px",
          background: "#0b0b0d",
          borderTop: "1px solid #222",
          color: "#888",
          fontSize: 11,
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <span>
          <b>V</b> Look mode · <b>B</b> Paint mode · <b>Ctrl+Z</b> undo heal ·{" "}
          <b>Esc</b> close
        </span>
        <span>
          <b style={{ color: "#22c55e" }}>Heal</b> — fast, blurry on large
          areas · <b style={{ color: "#ec4899" }}>Repair (AI)</b> — slower,
          preserves texture. First AI use downloads a ~200 MB model.
        </span>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/* ------------------------------------------------------------------------ */
/*  PanoSphere — the actual 3D view (image sphere + mask sphere overlay)   */
/* ------------------------------------------------------------------------ */

function PanoSphere({
  imageCanvas,
  maskCanvas,
  imgVersion,
  maskVersion,
  mode,
  showBefore,
  originalImageData,
  onStroke,
}: {
  imageCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  imgVersion: number;
  maskVersion: number;
  mode: "look" | "paint";
  showBefore: boolean;
  originalImageData: ImageData | null;
  onStroke: (x: number, y: number, lastX: number | null, lastY: number | null) => void;
}) {
  const imgTex = useMemo(() => {
    const t = new THREE.CanvasTexture(imageCanvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, [imageCanvas]);
  const maskTex = useMemo(() => {
    const t = new THREE.CanvasTexture(maskCanvas);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, [maskCanvas]);

  // Secondary "before" texture — allocated LAZILY the first time the
  // user actually holds the compare button. Creating a second 4 MB
  // canvas + GPU texture on mount is a waste of time / memory if
  // they never use it (most people don't).
  const [beforeTex, setBeforeTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    if (!showBefore || beforeTex || !originalImageData) return;
    const c = document.createElement("canvas");
    c.width = originalImageData.width;
    c.height = originalImageData.height;
    c.getContext("2d")!.putImageData(originalImageData, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    setBeforeTex(t);
  }, [showBefore, beforeTex, originalImageData]);

  // Re-upload textures when versions change.
  useEffect(() => {
    imgTex.needsUpdate = true;
  }, [imgVersion, imgTex]);
  useEffect(() => {
    maskTex.needsUpdate = true;
  }, [maskVersion, maskTex]);

  const paintingRef = useRef(false);
  const lastUVRef = useRef<{ x: number; y: number } | null>(null);
  const { gl } = useThree();

  useEffect(() => {
    // Update cursor style on the canvas depending on mode.
    gl.domElement.style.cursor = mode === "paint" ? "crosshair" : "grab";
  }, [mode, gl.domElement]);

  function uvToPixels(u: number, v: number) {
    return {
      x: u * maskCanvas.width,
      // Three.js UV origin is bottom-left; canvas origin is top-left.
      y: (1 - v) * maskCanvas.height,
    };
  }

  function onPointerDown(e: ThreeEvent<PointerEvent>) {
    if (mode !== "paint" || !e.uv) return;
    e.stopPropagation();
    (e.target as any).setPointerCapture?.(e.pointerId);
    paintingRef.current = true;
    const { x, y } = uvToPixels(e.uv.x, e.uv.y);
    onStroke(x, y, null, null);
    lastUVRef.current = { x, y };
  }
  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    if (!paintingRef.current || mode !== "paint" || !e.uv) return;
    const { x, y } = uvToPixels(e.uv.x, e.uv.y);
    const last = lastUVRef.current;
    onStroke(x, y, last?.x ?? null, last?.y ?? null);
    lastUVRef.current = { x, y };
  }
  function endStroke() {
    paintingRef.current = false;
    lastUVRef.current = null;
  }

  const activeTex = showBefore && beforeTex ? beforeTex : imgTex;

  return (
    <>
      {/* Image sphere — the panorama itself. DoubleSide so the R3F
          raycaster reliably hits it from inside (BackSide can miss
          intersections in some three.js builds). Camera is at origin
          so only the inside surface is visible anyway. */}
      <mesh
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
      >
        <sphereGeometry args={[500, 64, 32]} />
        <meshBasicMaterial
          map={activeTex}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Mask overlay sphere — slightly inside the image sphere. The
          `raycast={noRaycast}` disables intersection so it doesn't
          swallow paint pointer events destined for the image sphere. */}
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[499, 96, 64]} />
        <meshBasicMaterial
          map={maskTex}
          side={THREE.DoubleSide}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* OrbitControls — fully disabled in Paint mode so it can't hijack
          pointer events. `enabled=false` stops all interactions, not just
          rotate. Zoom is off to keep the camera at the sphere's origin. */}
      <OrbitControls
        target={[0.001, 0, 0]}
        enablePan={false}
        enableZoom={false}
        enableRotate
        enabled={mode === "look"}
        rotateSpeed={-0.35}
      />
    </>
  );
}

// no-op raycast so a mesh renders but never intercepts pointer events
const noRaycast = () => {};

const tabStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "none",
  fontSize: 12,
  cursor: "pointer",
  borderRadius: 6,
};
const btnStyle: React.CSSProperties = {
  background: "#1f1f22",
  border: "1px solid #333",
  color: "#eee",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};
const loaderStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#eee",
  background: "#1f1f22",
  padding: "12px 20px",
  borderRadius: 6,
  border: "1px solid #333",
  fontSize: 14,
};
const errorStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: "50%",
  transform: "translateX(-50%)",
  color: "#fff",
  background: "#7f1d1d",
  padding: "10px 16px",
  borderRadius: 4,
  fontSize: 13,
  maxWidth: "80%",
  textAlign: "center",
  zIndex: 10,
};
