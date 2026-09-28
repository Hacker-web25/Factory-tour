"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Edges } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Hotspot, HotspotAction, HotspotFx } from "@/lib/types";
import { findIcon } from "@/lib/iconLibrary";
import { useHoverCard } from "@/lib/useHoverCard";
import {
  FileText,
  Headphones,
  Info as InfoGlyph,
  Link2,
  Navigation,
  Play,
  User as UserGlyph,
} from "lucide-react";
import { useT } from "@/lib/TranslationContext";
import { fontFor } from "@/lib/fonts";
import {
  SPHERE_RADIUS,
  HOTSPOT_RADIUS,
  sphericalToVec3,
  vec3ToSpherical,
} from "./math";
import PolygonHotspot from "./PolygonHotspot";
import SceneTransition from "./SceneTransition";
import HotspotSkinFrame from "./HotspotSkin";
import HotspotHoverCard from "@/components/viewer/HotspotHoverCard";
import {
  type ImageAdjustments,
  normalizeAdjustments,
  buildFilterCSS,
  warmthOverlayStyle,
  vignetteOverlayStyle,
  gradientOverlayStyle,
} from "@/lib/imageAdjustments";

type Props = {
  imageUrl: string;
  hotspots: Hotspot[];
  editable?: boolean;
  /** Tour-wide hotspot micro-interaction flags (breathing, hover magnify,
   *  ripple, hover icon glyph, hover preview card). Undefined = all on. */
  hotspotFx?: HotspotFx;
  selectedHotspotId?: string | null;
  /** Multi-select ids — visually highlights every hotspot whose id is
   *  in this Set, in addition to `selectedHotspotId`. Populated by
   *  the editor when the user Shift/Ctrl-clicks multiple hotspots. */
  selectedHotspotIds?: Set<string> | null;
  /** When true: BackSide rendering (world appears mirror-imaged).
   *  When false: sphere is x-flipped so text/signs read correctly. Default: false. */
  mirrored?: boolean;
  /** Optional nadir patch image URL — circular overlay at the south pole. */
  nadirImageUrl?: string | null;
  /** Nadir size in percent of viewport height (default 25). */
  nadirSize?: number;
  /** Auto-rotate the camera (used by Auto-tour). */
  autoRotate?: boolean;
  /** Idle showcase spin — after a few seconds of no interaction the camera
   *  slowly rotates like a turntable, stopping the instant the viewer
   *  interacts. Viewer-only (ignored while editable). */
  idleSpin?: boolean;
  /** Auto-rotate speed (OrbitControls units — ~30/rev at 1.0). Default 1.5. */
  autoRotateSpeed?: number;
  /** Per-scene camera limits (radians). null / undefined = unlimited (up to sensible defaults). */
  pitchMin?: number | null;
  pitchMax?: number | null;
  yawMin?: number | null;
  yawMax?: number | null;
  /** Horizon roll correction — rotates the entire panorama sphere on world Z. */
  levelCorrection?: number;
  /** Zoom range (FOV degrees). smaller = zoomed in. */
  zoomMinFov?: number;   // default 30
  zoomMaxFov?: number;   // default 90
  zoomInitialFov?: number; // default 75
  zoomSensitivity?: number; // multiplier on wheel step, default 1
  /** Registered by parent to allow snapping FOV back to zoomInitialFov. */
  onProvideZoomReset?: (fn: () => void) => void;
  /** Registered by parent — returns a data URL PNG of the current view. */
  onProvideSnapshot?: (fn: () => string | null) => void;
  /** Non-panoramic image — renders as a flat plane. */
  isFlat?: boolean;
  /** Blend the equirectangular seam so the stitching line disappears. */
  hideStitching?: boolean;
  /** Cover the tripod/selfie-stick shadow at the south pole with a
   *  color-matched disc sampled from the panorama's floor. */
  hideTripod?: boolean;
  /** Diameter of the tripod cover disc, in % of viewport height (default 30). */
  tripodSize?: number;
  /** Optional lookup of scene metadata used to show a hover preview card on
   *  navigation hotspots. Keyed by scene id. */
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onRequestAim?: (getAim: () => { yaw: number; pitch: number }) => void;
  onProvideScreenToYawPitch?: (
    fn: (clientX: number, clientY: number) => { yaw: number; pitch: number } | null
  ) => void;
  onHotspotClick?: (h: Hotspot) => void;
  onHotspotDoubleClick?: (h: Hotspot) => void;
  /** Fired once when the viewer meaningfully hovers a hotspot (after a
   *  short dwell so fly-overs don't count). Used for analytics. */
  onHotspotHover?: (h: Hotspot) => void;
  /** Fired when a row or the arrow inside a hover card is clicked, so the
   *  player can open the matching viewer (video, PDF, image, audio, link)
   *  straight from the hover card. */
  onHotspotIntent?: (intent: HotspotAction, h: Hotspot) => void;
  onHotspotDrag?: (id: string, yaw: number, pitch: number) => void;
  initialYaw?: number;
  initialPitch?: number;

  /** WebGL scene transition. When set, mounts a SceneTransition alongside
   *  the main sphere that crossfades to `transitionTargetUrl`. Fire-and-
   *  forget: parent waits for onTransitionComplete before swapping the
   *  actual scene id. */
  transitionTargetUrl?: string | null;
  /** True → cinematic fly-through (dolly + FOV + late SLERP), ~1100ms.
   *  False → quick crossfade + full-duration SLERP, ~300ms. */
  transitionCinematic?: boolean;
  /** True → cinematic soft-dissolve (independent of warp). Overrides the
   *  dolly/FOV-whip path with a luminance-lifted cross-dissolve. */
  transitionDissolve?: boolean;
  /** True → overlay an animated motion blur on the canvas for the duration
   *  of the transition (warp_blur mode). Pure CSS, independent of the warp
   *  animation itself so plain warp is untouched. */
  transitionBlur?: boolean;
  /** Optional dolly direction (nav-hotspot yaw/pitch). Ignored when
   *  transitionCinematic=false. Null = dolly along camera's forward. */
  transitionDirection?: { yaw: number; pitch: number } | null;
  /** Target scene's saved initial view. Camera SLERPs to this aim so the
   *  swap lands facing the "front" of the new scene, not wherever the
   *  user was looking. */
  transitionTargetAim?: { yaw: number; pitch: number } | null;
  transitionDurationMs?: number;
  onTransitionComplete?: () => void;

  /** Per-scene colour grading (exposure/contrast/warmth/vignette/etc.).
   *  Applied as a GPU-composited CSS filter on the WebGL canvas plus
   *  blended overlay layers. Undefined/null = no grading. */
  adjustments?: Partial<ImageAdjustments> | null;
};

const DRAG_THRESHOLD_PX = 5;

/** Fallback micro-interaction flags — all ON (editor previews, callers that
 *  don't pass a resolved set). */
const DEFAULT_FX: HotspotFx = {
  breathing: true,
  hoverMagnify: true,
  ripple: true,
  hoverCard: true,
  hoverCardScale: 1,
};

export default function PanoramaViewer({
  adjustments,
  ...props
}: Props) {
  const adj = useMemo(
    () => normalizeAdjustments(adjustments),
    [adjustments]
  );
  const warmthStyle = warmthOverlayStyle(adj);
  const vignetteStyle = vignetteOverlayStyle(adj);
  const gradientStyle = gradientOverlayStyle(adj);
  const filter = buildFilterCSS(adj);

  // Motion-blur overlay (warp_blur). Runs a one-shot CSS blur animation on
  // the OUTER wrapper for exactly the transition's duration — kept separate
  // from the inner grading `filter` so the two compose (blur nests over
  // grade) and plain warp is never affected. Keyed so it re-fires per swap.
  const blurActive = !!props.transitionBlur && !!props.transitionTargetUrl;
  const blurDurMs = props.transitionDurationMs ?? 1800;

  return (
    <div
      // NOTE: never key this wrapper — it hosts the persistent <Canvas>, and
      // a key change would tear down / rebuild the WebGL context (black
      // frame). Toggling the class on/off is enough to (re)fire the CSS
      // blur animation each time a transition starts.
      className={blurActive ? "pano-warp-blur" : undefined}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        animationDuration: blurActive ? `${blurDurMs}ms` : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: filter === "none" ? undefined : filter,
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 0.01], fov: 75, near: 0.1, far: 1100 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            preserveDrawingBuffer: true,
            // Ask the OS/browser for the discrete GPU on hybrid machines
            // and skip the depth-sensitive alpha path we don't need — both
            // help hold a steady 60fps on the panorama sphere.
            powerPreference: "high-performance",
            stencil: false,
          }}
          // Adaptive quality: if the frame-rate dips (weaker device, huge
          // texture) drei scales the internal resolution down toward 0.5×
          // to protect the frame-rate, then restores it when things settle.
          performance={{ min: 0.5 }}
        >
          <Scene {...props} />
        </Canvas>
      </div>
      {/* Grading overlay layers — sit above the canvas, blended.
          pointerEvents:none so drag / hotspot clicks pass straight through. */}
      {warmthStyle && <div style={warmthStyle} />}
      {gradientStyle && <div style={gradientStyle} />}
      {vignetteStyle && <div style={vignetteStyle} />}
    </div>
  );
}

function Scene({
  imageUrl,
  hotspots,
  editable,
  hotspotFx,
  selectedHotspotId,
  selectedHotspotIds,
  mirrored = false,
  nadirImageUrl,
  nadirSize = 25,
  autoRotate = false,
  idleSpin = false,
  autoRotateSpeed = 1.5,
  pitchMin,
  pitchMax,
  yawMin,
  yawMax,
  levelCorrection = 0,
  zoomMinFov = 30,
  zoomMaxFov = 90,
  zoomInitialFov = 75,
  zoomSensitivity = 1,
  onProvideZoomReset,
  onProvideSnapshot,
  isFlat = false,
  hideStitching = false,
  hideTripod = false,
  tripodSize = 30,
  scenesLookup,
  onRequestAim,
  onProvideScreenToYawPitch,
  onHotspotClick,
  onHotspotDoubleClick,
  onHotspotHover,
  onHotspotIntent,
  onHotspotDrag,
  initialYaw = 0,
  initialPitch = 0,
  transitionTargetUrl = null,
  transitionCinematic = false,
  transitionDissolve = false,
  transitionDirection = null,
  transitionTargetAim = null,
  transitionDurationMs = 1100,
  onTransitionComplete,
}: Props) {
  // Manual texture loading (not useLoader) so scene swaps don't
  // Suspense-flash. The previous rawTexture stays in state — and rendered
  // on the sphere — until the new URL finishes loading. Then setRawTexture
  // swaps them in one frame. Zero black-frame window during scene changes.
  const [rawTexture, setRawTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(imageUrl, (t) => {
      if (cancelled) {
        t.dispose();
        return;
      }
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      setRawTexture(t);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Optional stitching-line blend — smooths the equirectangular seam.
  // Null-safe: returns null until rawTexture loads.
  const texture = useMemo(() => {
    if (!rawTexture) return null;
    if (!hideStitching) return rawTexture;
    const img = rawTexture.image as HTMLImageElement | undefined;
    if (!img?.width) return rawTexture;
    try {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) return rawTexture;
      ctx.drawImage(img, 0, 0);
      const featherPx = Math.max(6, Math.round(img.width * 0.02));
      const leftBand = ctx.getImageData(
        img.width - featherPx,
        0,
        featherPx,
        img.height
      );
      const rightBand = ctx.getImageData(0, 0, featherPx, img.height);
      const bandCanvas = document.createElement("canvas");
      bandCanvas.width = featherPx;
      bandCanvas.height = img.height;
      const bctx = bandCanvas.getContext("2d")!;
      bctx.putImageData(leftBand, 0, 0);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(bandCanvas, 0, 0);
      bctx.putImageData(rightBand, 0, 0);
      ctx.drawImage(bandCanvas, img.width - featherPx, 0);
      ctx.globalAlpha = 1;
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    } catch {
      return rawTexture;
    }
  }, [rawTexture, hideStitching]);

  // Standard mode: horizontally flip the panorama texture UVs so text reads
  // correctly (compensates for BackSide sphere's built-in flip).
  // Mirrored mode: leave texture unmodified (world stays flipped).
  useEffect(() => {
    if (!texture) return;
    if (!mirrored) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = -1;
      texture.offset.x = 1;
    } else {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.repeat.x = 1;
      texture.offset.x = 0;
    }
    texture.needsUpdate = true;
  }, [texture, mirrored]);

  const { camera, gl, raycaster, scene: threeScene } = useThree();
  const sphereRef = useRef<THREE.Mesh>(null!);
  const orbitRef = useRef<any>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Apply the scene's initial view (yaw / pitch) whenever it changes.
  //
  // Naive `camera.lookAt(...)` doesn't stick because OrbitControls runs its
  // own `update()` every frame and re-derives the camera's orientation from
  // its internal spherical state. To make the initial view actually
  // "persist", we have to move the camera to the opposite side of the
  // OrbitControls target — then OrbitControls' own lookAt naturally faces
  // the direction we want, and the internal spherical picks up correctly.
  //
  // Runs on scene switch (imageUrl) AND when the saved initial_yaw /
  // initial_pitch changes (so "Use current view" takes effect immediately).
  useEffect(() => {
    const orbit = orbitRef.current;
    // Unit direction we want the camera to face.
    const dir = sphericalToVec3(initialYaw, initialPitch, 1);
    // Camera sits at the opposite side of the orbit target, at a tiny
    // radius (matches the initial `[0, 0, 0.01]` position from <Canvas>).
    const EPS = 0.01;
    camera.position.set(-dir.x * EPS, -dir.y * EPS, -dir.z * EPS);
    if (orbit) {
      orbit.target.set(0, 0, 0);
      // Push the spherical state so subsequent drags start from here.
      orbit.update();
    } else {
      // Orbit not mounted yet on first render — fall back to lookAt so at
      // least the very first frame is aimed correctly.
      camera.lookAt(0, 0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, initialYaw, initialPitch]);

  useEffect(() => {
    if (!onRequestAim) return;
    onRequestAim(() => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const p = dir.normalize().multiplyScalar(HOTSPOT_RADIUS);
      return vec3ToSpherical(p);
    });
  }, [camera, onRequestAim]);

  // Register a helper the parent can call with a screen-space (clientX, clientY)
  // to get the corresponding yaw/pitch. Used by the drop-to-nav feature.
  useEffect(() => {
    if (!onProvideScreenToYawPitch) return;
    onProvideScreenToYawPitch((clientX, clientY) => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = raycaster.intersectObject(sphereRef.current)[0];
      if (!hit) return null;
      const p = hit.point.clone().normalize().multiplyScalar(HOTSPOT_RADIUS);
      return vec3ToSpherical(p);
    });
  }, [gl, camera, raycaster, onProvideScreenToYawPitch]);

  // Magnetic snap during 3D drag — attract yaw/pitch to any OTHER hotspot's
  // yaw/pitch when within ~1° / release with a bit more drift. Emits a
  // matching guide-line event so the parent's overlay can render dashed
  // lines across the viewport. Feels like the flat-scene magnet, but tuned
  // for spherical space where "aligned in the world" is aligned yaw or
  // aligned pitch.
  const snapStuckRef = useRef<{ yaw: number | null; pitch: number | null }>({
    yaw: null,
    pitch: null,
  });
  useEffect(() => {
    if (!dragId || !editable || !onHotspotDrag) return;
    if (orbitRef.current) orbitRef.current.enabled = false;
    snapStuckRef.current = { yaw: null, pitch: null };

    // ~0.9° attract / ~2° release. Rad.
    const SNAP = 0.016;
    const BREAK = 0.035;
    const targets = hotspots.filter((h) => h.id !== dragId);

    const canvas = gl.domElement;
    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = raycaster.intersectObject(sphereRef.current)[0];
      if (!hit) return;
      const p = hit.point.clone().normalize().multiplyScalar(HOTSPOT_RADIUS);
      let { yaw, pitch } = vec3ToSpherical(p);

      // Yaw snap (vertical alignment in the world).
      if (snapStuckRef.current.yaw != null) {
        if (Math.abs(yaw - snapStuckRef.current.yaw) > BREAK) {
          snapStuckRef.current.yaw = null;
        } else {
          yaw = snapStuckRef.current.yaw;
        }
      }
      if (snapStuckRef.current.yaw == null) {
        let best: { yaw: number; d: number } | null = null;
        for (const t of targets) {
          const d = Math.abs(yaw - t.yaw);
          if (d < SNAP && (!best || d < best.d)) best = { yaw: t.yaw, d };
        }
        if (best) {
          snapStuckRef.current.yaw = best.yaw;
          yaw = best.yaw;
        }
      }

      // Pitch snap (horizontal alignment in the world).
      if (snapStuckRef.current.pitch != null) {
        if (Math.abs(pitch - snapStuckRef.current.pitch) > BREAK) {
          snapStuckRef.current.pitch = null;
        } else {
          pitch = snapStuckRef.current.pitch;
        }
      }
      if (snapStuckRef.current.pitch == null) {
        let best: { pitch: number; d: number } | null = null;
        for (const t of targets) {
          const d = Math.abs(pitch - t.pitch);
          if (d < SNAP && (!best || d < best.d)) best = { pitch: t.pitch, d };
        }
        if (best) {
          snapStuckRef.current.pitch = best.pitch;
          pitch = best.pitch;
        }
      }

      onHotspotDrag(dragId, yaw, pitch);
    };
    const handleUp = () => {
      setDragId(null);
      snapStuckRef.current = { yaw: null, pitch: null };
      if (orbitRef.current) orbitRef.current.enabled = true;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragId, editable, onHotspotDrag, gl, camera, raycaster, hotspots]);

  /* -------- Idle showcase spin ("attract mode") --------------------------
   * After IDLE_MS with no pointer / wheel interaction, slowly auto-rotate
   * the camera like a turntable. Any interaction stops it immediately and
   * restarts the idle countdown. Viewer-only, and never while a hotspot is
   * being dragged. Delivers the "the scene is alive" premium feel. */
  const [idleActive, setIdleActive] = useState(false);
  useEffect(() => {
    if (!idleSpin || editable) {
      setIdleActive(false);
      return;
    }
    const IDLE_MS = 5000;
    const canvas = gl.domElement;
    let timer: number | undefined;
    const arm = () => {
      setIdleActive(false);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdleActive(true), IDLE_MS);
    };
    const onInteract = () => arm();
    canvas.addEventListener("pointerdown", onInteract);
    canvas.addEventListener("wheel", onInteract, { passive: true });
    canvas.addEventListener("pointermove", onInteract);
    arm(); // start the first countdown
    return () => {
      if (timer) window.clearTimeout(timer);
      canvas.removeEventListener("pointerdown", onInteract);
      canvas.removeEventListener("wheel", onInteract);
      canvas.removeEventListener("pointermove", onInteract);
    };
    // Re-arm on scene change so a fresh scene starts its own countdown.
  }, [idleSpin, editable, gl, imageUrl]);

  // Set initial FOV whenever the scene / zoomInitialFov changes.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = Math.max(zoomMinFov, Math.min(zoomMaxFov, zoomInitialFov));
    cam.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, zoomInitialFov]);

  // Expose a zoom-reset function to the parent (used by a UI button).
  useEffect(() => {
    if (!onProvideZoomReset) return;
    onProvideZoomReset(() => {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = Math.max(zoomMinFov, Math.min(zoomMaxFov, zoomInitialFov));
      cam.updateProjectionMatrix();
    });
  }, [camera, onProvideZoomReset, zoomInitialFov, zoomMinFov, zoomMaxFov]);

  // Expose a snapshot function — captures a PNG data URL of the current WebGL view.
  useEffect(() => {
    if (!onProvideSnapshot) return;
    onProvideSnapshot(() => {
      try {
        gl.render(threeScene, camera);
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    });
  }, [gl, camera, threeScene, onProvideSnapshot]);

  // Wheel / trackpad-pinch → change FOV (proper panorama zoom).
  // On Mac, trackpad pinch dispatches wheel events with ctrlKey=true.
  useEffect(() => {
    const canvas = gl.domElement;
    const cam = camera as THREE.PerspectiveCamera;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const baseFactor = e.ctrlKey ? 0.5 : 0.05;
      const step = baseFactor * zoomSensitivity;
      const next = (cam.fov ?? 75) + e.deltaY * step;
      cam.fov = Math.max(zoomMinFov, Math.min(zoomMaxFov, next));
      cam.updateProjectionMatrix();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [gl, camera, zoomMinFov, zoomMaxFov, zoomSensitivity]);

  return (
    <>
      {/* Sphere is always BackSide-rendered. The mirror/standard difference is
          applied via the panorama TEXTURE's UV transform above — not via mesh
          scale (which culls triangles from inside the sphere).
          The whole panorama is wrapped in a group so we can apply the
          per-scene `level_correction` roll around the world Z axis. */}
      {/* Sphere is only rendered once the first panorama texture is ready.
          Reason: Three.js compiles the material's shader with a USE_MAP
          define at CREATION time; if we render the material with map=null
          and later set map=texture, the shader stays compiled without
          USE_MAP and ignores the texture (renders solid diffuse color).
          Gating the mesh on `texture` guarantees the material is always
          born with a valid map. Subsequent scene swaps just change the
          texture object under the same shader signature — no recompile,
          no flash. During the very first load the Canvas shows its
          default clear color (matches the wrapping bg-black div). */}
      {texture && (
        <group rotation={[0, 0, levelCorrection]}>
          <mesh ref={sphereRef}>
            <sphereGeometry args={[SPHERE_RADIUS, 64, 40]} />
            <meshBasicMaterial map={texture} side={THREE.BackSide} />
          </mesh>
        </group>
      )}

      {/* Scene transition — mounted only while a fly-through is in flight.
          Renders a second BackSide sphere just inside the main one, driving
          camera dolly + FOV whip + alpha crossfade in a single useFrame
          loop. OrbitControls is disabled for the duration via
          setOrbitEnabled so its per-frame update doesn't fight the
          animation and cause wobble. */}
      {transitionTargetUrl && onTransitionComplete && (
        <SceneTransition
          targetUrl={transitionTargetUrl}
          durationMs={transitionDurationMs}
          cinematic={transitionCinematic}
          dissolve={transitionDissolve}
          direction={transitionDirection}
          targetAim={transitionTargetAim}
          mirrored={mirrored}
          levelCorrection={levelCorrection}
          setOrbitEnabled={(v) => {
            if (orbitRef.current) orbitRef.current.enabled = v;
          }}
          onComplete={onTransitionComplete}
        />
      )}

      {/* Nadir patch — circular image at the south pole. Sized as a
          percentage of the viewport's angular height so it feels consistent
          across zoom levels. */}
      {nadirImageUrl && (
        <NadirPatch url={nadirImageUrl} sizePct={nadirSize} />
      )}

      {hideTripod && rawTexture && (
        <TripodPatch
          panoramaImage={rawTexture.image as HTMLImageElement | undefined}
          sizePct={tripodSize}
        />
      )}

      {hotspots.map((h) => (
        <HotspotMarker
          key={h.id}
          hotspot={h}
          editable={!!editable}
          fx={hotspotFx ?? DEFAULT_FX}
          selected={
            selectedHotspotId === h.id ||
            !!selectedHotspotIds?.has(h.id)
          }
          mirrored={mirrored}
          scenesLookup={scenesLookup}
          onClick={() => onHotspotClick?.(h)}
          onDoubleClick={() => onHotspotDoubleClick?.(h)}
          onHover={() => onHotspotHover?.(h)}
          onIntent={
            onHotspotIntent
              ? (intent) => onHotspotIntent(intent, h)
              : undefined
          }
          onDragStart={() => setDragId(h.id)}
          setOrbitEnabled={(v) => {
            if (orbitRef.current) orbitRef.current.enabled = v;
          }}
        />
      ))}

      <OrbitControls
        ref={orbitRef}
        enableZoom={false}
        enablePan={false}
        enableDamping
        /* Momentum / inertia: on release the camera keeps rotating with the
           residual drag velocity and eases to rest, iOS-scroll style. With
           enableDamping, OrbitControls decays the last sphericalDelta by
           (1 - dampingFactor) every frame, so a lower dampingFactor = a
           longer, smoother glide. 0.035 ≈ ~1.5s ease-to-stop at 60fps — even
           a quick flick throws satisfyingly and coasts to a halt. */
        dampingFactor={0.035}
        rotateSpeed={-0.45}
        /* User pitch is stored as: +π/2 = up, -π/2 = down.
           OrbitControls polarAngle: 0 = up, π = down. So polar = π/2 - pitch.
           A tighter pitch_max (looking up limit) becomes a smaller polar min. */
        minPolarAngle={
          pitchMax != null ? Math.PI / 2 - pitchMax : 0.05
        }
        maxPolarAngle={
          pitchMin != null ? Math.PI / 2 - pitchMin : Math.PI - 0.05
        }
        minAzimuthAngle={yawMin ?? -Infinity}
        maxAzimuthAngle={yawMax ?? Infinity}
        /* Auto-tour rotation takes priority; otherwise the idle showcase
           spin kicks in after inactivity. */
        autoRotate={autoRotate || idleActive}
        autoRotateSpeed={autoRotate ? autoRotateSpeed : 0.35}
      />
    </>
  );
}

/* --------- Router: choose renderer per hotspot ---------- */

function HotspotMarker(props: {
  hotspot: Hotspot;
  editable: boolean;
  fx: HotspotFx;
  selected: boolean;
  mirrored: boolean;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onClick: () => void;
  onDoubleClick: () => void;
  onHover?: () => void;
  onIntent?: (intent: HotspotAction) => void;
  onDragStart: () => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const { hotspot: h } = props;

  // TEXT hotspots always render as HTML billboards — the "text" of a text
  // hotspot IS the payload, and the 3D-plane renderers only know how to
  // paint an image/icon texture (they'd render the default icon_key instead
  // of the text, which is why 2D/Floor/Wall previously showed a mystery
  // circle for text hotspots). Overlay modes don't apply to text.
  if (h.type === "text") return <HtmlBillboard {...props} />;

  // PERSON hotspots (human tags) get their own compact renderer — pulsing
  // dot that expands to a name pill on hover/click.
  if (h.type === "person") return <PersonTag {...props} />;

  // INFO hotspots go through the standard billboard so they inherit every
  // styling control — skin, shape, glow colour, intensity, size. Without an
  // icon of their own they fall back to the classic "i" glyph inside
  // IconOrImage, so the familiar affordance survives while the author can
  // now dress it like any other marker.
  if (h.type === "info") return <HtmlBillboard {...props} />;

  // IMAGE hotspots — blue circle that morphs into a card with a blue
  // header and white image/caption body. Skips the 3D-plane router so
  // overlay modes don't apply here (they don't make sense for this UI).
  if (h.type === "image") return <MediaHotspot {...props} />;

  // 3D-plane overlay modes (only when we actually have an image).
  // Overlay modes are available for every hotspot kind. They need a texture
  // to paint on the plane — use image_url, icon_url, or (last resort) a
  // rasterized snapshot of the built-in icon. If no visual is available at
  // all, fall through to the HTML billboard so the hotspot still renders.
  const hasTexturableVisual = !!(h.image_url || h.icon_url || h.icon_key);
  if (hasTexturableVisual) {
    if (h.overlay_mode === "surface") return <SurfaceImage {...props} />;
    if (h.overlay_mode === "wall") return <WallImage {...props} />;
    if (h.overlay_mode === "floor") return <FloorImage {...props} />;
  }

  // Polygon hotspot — user-traced outline of an object
  if (h.type === "polygon" && h.polygon_points && h.polygon_points.length >= 3) {
    return <PolygonHotspot {...props} />;
  }

  return <HtmlBillboard {...props} />;
}

/* --------- Html-based billboard (icons, text, billboard images) ---------- */

function HtmlBillboard({
  hotspot: h,
  selected,
  editable,
  fx = DEFAULT_FX,
  scenesLookup,
  onClick,
  onDoubleClick,
  onHover,
  onIntent,
  onDragStart,
}: {
  hotspot: Hotspot;
  selected: boolean;
  editable: boolean;
  fx?: HotspotFx;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onClick: () => void;
  onDoubleClick: () => void;
  onHover?: () => void;
  onIntent?: (intent: HotspotAction) => void;
  onDragStart: () => void;
  setOrbitEnabled?: (v: boolean) => void;
}) {
  const { t } = useT();
  const [hovered, setHovered] = useState(false);
  // Hover-intent for the floating card: it survives the trip from marker
  // to card and plays a real exit instead of blinking out.
  const card = useHoverCard();
  // Analytics dwell timer — fire onHover once the pointer lingers ~400ms so
  // brushing past a marker doesn't register as a "hover". Cleared on leave.
  const hoverTimerRef = useRef<number | null>(null);
  // Hover ripple — increments each time the pointer enters, forcing the
  // ripple <div> to remount and re-run its keyframe animation. Color is
  // driven by the hotspot's own colour so authors can tune it per marker.
  const [rippleKey, setRippleKey] = useState(0);
  const pos = useMemo(
    () => sphericalToVec3(h.yaw, h.pitch),
    [h.yaw, h.pitch]
  );
  const opacity = h.opacity ?? 1;
  const w = Math.max(4, h.width_pct ?? 80);
  const hh = Math.max(4, h.height_pct ?? 80);
  const rotation = h.rotation_deg ?? 0;
  const showLabel = h.label && (!h.only_hover || hovered);

  // Click vs drag threshold + double-click
  const lastClickRef = useRef(0);
  function handlePointerDown(e: React.PointerEvent) {
    if (!editable) {
      // Public / preview mode: pointerup on same element = click
      return;
    }
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragged = false;

    const onMove = (ev: PointerEvent) => {
      if (dragged) return;
      if (
        Math.hypot(ev.clientX - startX, ev.clientY - startY) >
        DRAG_THRESHOLD_PX
      ) {
        dragged = true;
        onDragStart();
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (dragged) return;
      const now = performance.now();
      if (now - lastClickRef.current < 350) {
        onDoubleClick();
        lastClickRef.current = 0;
      } else {
        onClick();
        lastClickRef.current = now;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // scale_on_zoom: when true (default), pass distanceFactor so the HTML
  // scales like a world-space object and grows on zoom-in.
  const scaleOnZoom = h.scale_on_zoom !== false;

  // For "no scale on zoom", drei's Html without distanceFactor renders at
  // raw CSS pixel size — which reads as huge because the icon dimensions
  // (~80px) were tuned for the distanceFactor=400 world scale. Instead we
  // keep distanceFactor active but dynamically shrink it in proportion to
  // the camera's FOV, so the on-screen size stays constant across zoom.
  const { camera } = useThree();
  const [dynFactor, setDynFactor] = useState(400);
  useFrame(() => {
    if (scaleOnZoom) return;
    const cam = camera as THREE.PerspectiveCamera;
    // Reference values at FOV=75° → distanceFactor=400.
    const refTan = Math.tan((75 * Math.PI) / 360);
    const curTan = Math.tan(((cam.fov ?? 75) * Math.PI) / 360);
    const target = 400 * (curTan / refTan);
    // Throttle React updates to avoid re-render every frame.
    if (Math.abs(target - dynFactor) > 3) setDynFactor(target);
  });
  const activeDistanceFactor = scaleOnZoom ? 400 : dynFactor;

  // A video hotspot set to "virtual card" already paints its thumbnail
  // directly on the panorama, so it doesn't also get a hover card.
  const rendersAsInlineCard = h.type === "video" && !!h.video_show_thumbnail;

  return (
    <Html
      position={pos.toArray()}
      center
      distanceFactor={activeDistanceFactor}
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "auto" }}
    >
      {/* Outer transparent padded hit area */}
      <div
        style={{
          padding: 18,
          background: "transparent",
          border: "none",
          borderRadius: 0,
          cursor: "pointer",
          userSelect: "none",
          transform: `rotate(${rotation}deg)`,
          opacity: h.only_hover && !hovered ? 0.35 : opacity,
          filter: h.shadow
            ? "drop-shadow(0 2px 6px rgba(0,0,0,0.6))"
            : undefined,
          transition: "opacity 0.15s",
          boxSizing: "content-box",
        }}
        onMouseEnter={() => {
          setHovered(true);
          card.show();
          // Fire a fresh ripple each time the pointer enters.
          setRippleKey((k) => k + 1);
          // Analytics: count a hover only after a short dwell.
          if (!editable && onHover) {
            if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = window.setTimeout(() => onHover(), 400);
          }
        }}
        onMouseLeave={() => {
          setHovered(false);
          card.hide();
          if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
        }}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          if (!editable) {
            e.stopPropagation();
            onClick();
          }
        }}
      >
        {/* One-shot hover ripple. Keyed so React remounts it and the
            keyframe animation re-runs. Color + max radius both driven by
            data (ripple_color / ripple_size_pct), falling back to the
            hotspot's own color and a subtle default radius. */}
        {rippleKey > 0 && fx.ripple && (
          <div
            key={rippleKey}
            className="hs-hover-ripple"
            style={
              {
                "--hs-ripple-color": h.ripple_color || h.color,
                // 100% → scale 1.8 (default). 50% → 0.9. 300% → 5.4.
                "--hs-ripple-scale": `${((h.ripple_size_pct ?? 100) / 100) * 1.8}`,
              } as React.CSSProperties
            }
          />
        )}

        {/* Premium hover card — one card for every hotspot kind. It builds
            itself from whatever the hotspot carries (nav destination,
            video, image, PDF, audio, link, description), so nav previews,
            video previews and info previews are now visibly the same
            object. Pointer-events stay off so the marker keeps every
            click. Suppressed for the inline VideoCard, which already shows
            its own thumbnail on the panorama. */}
        {card.mounted && !editable && fx.hoverCard && !rendersAsInlineCard && (
          <HotspotHoverCard
            hotspot={h}
            open={card.open}
            scenesLookup={scenesLookup}
            scale={fx.hoverCardScale}
            onPointerEnter={card.keep}
            onPointerLeave={card.hide}
            onIntent={
              onIntent
                ? (intent) => {
                    onIntent(intent);
                    card.close();
                  }
                : undefined
            }
          />
        )}

        {/* Inner: pure content, with a clean outline offset for selection.
            flex-direction depends on `label_position` — bottom (default) puts
            the label under the icon, top puts it above, left/right place it
            side-by-side. Alignment stays centered so the icon anchor stays
            visually locked to the hotspot's true yaw/pitch. */}
        {(() => {
          const pos = (h.label_position ?? "bottom") as
            | "top"
            | "bottom"
            | "left"
            | "right";
          const flexDir: React.CSSProperties["flexDirection"] =
            pos === "top"
              ? "column-reverse"
              : pos === "left"
              ? "row-reverse"
              : pos === "right"
              ? "row"
              : "column";
          return (
        <div
          className="pointer-events-none"
          style={{
            display: "flex",
            flexDirection: flexDir,
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            borderRadius: 0,
            outline: selected ? "2px solid rgb(34,211,238)" : "none",
            outlineOffset: 4,
            // Hover magnify: editor keeps its subtle 1.03; public viewer
            // gets a more satisfying 1.12 pop when fx.hoverMagnify is on.
            transform: hovered
              ? editable
                ? "scale(1.03)"
                : fx.hoverMagnify
                ? "scale(1.12)"
                : "none"
              : "none",
            transition: "transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          {/* Dedicated wrapper for the interaction animation so its transform
              doesn't conflict with the hover-scale transform above.
              Idle breathing pulse (fx.breathing) plays only when NOT hovered
              and when the hotspot has no explicit hover animation, so the
              two never fight. */}
          <div
            className={[
              hovered && h.animation && h.animation !== "none"
                ? `hs-anim-${h.animation}`
                : "",
              !hovered &&
              !editable &&
              fx.breathing &&
              (!h.animation || h.animation === "none")
                ? "hs-breathing"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              display: "flex",
              flexDirection: flexDir,
              alignItems: "center",
              gap: 4,
            }}
          >
            {/* Text-type hotspots render label ONLY — no icon marker.
                Non-text hotspots pass through the premium HotspotSkinFrame,
                which layers on the chosen skin (glowing ring, hexagon,
                crosshair etc.) + shape mask. Skin defaults to "none" so
                pre-existing hotspots look identical until the author picks
                a different one. */}
            {h.type === "video" && h.video_show_thumbnail ? (
              <VideoCard hotspot={h} />
            ) : h.type !== "text" ? (
              <HotspotSkinFrame
                skin={h.skin}
                shape={h.icon_shape}
                size={Math.max(w, hh)}
                glow={h.glow_color || h.color || "#22d3ee"}
                intensity={h.glow_intensity}
                fill={h.shape_fill_color}
                hovered={hovered}
              >
                <IconOrImage hotspot={h} width={w} height={hh} />
              </HotspotSkinFrame>
            ) : null}
            {showLabel && (
              <span
                style={{
                  color: h.label_color ?? "#ffffff",
                  fontSize: h.label_size ?? 12,
                  fontWeight: h.label_bold ? 700 : 400,
                  fontFamily: fontFor(h.label_font),
                  background: h.label_bg || "transparent",
                  padding: h.label_bg ? "2px 6px" : 0,
                  borderRadius: h.label_bg ? 4 : 0,
                  textShadow: h.label_bg
                    ? "none"
                    : "0 1px 2px rgba(0,0,0,0.9)",
                  // pre-wrap = preserve the user's newlines exactly
                  // as typed. width:max-content sizes the span to its
                  // actual content so it doesn't collapse to the
                  // (very narrow) icon's width and wrap every single
                  // word — max-width caps it for genuinely long lines.
                  whiteSpace: "pre-wrap",
                  textAlign: "center",
                  width: "max-content",
                  maxWidth: 320,
                  wordBreak: "break-word",
                }}
              >
                {t(h.label)}
              </span>
            )}
          </div>
        </div>
          );
        })()}
      </div>
    </Html>
  );
}

/* --------- Visual for the hotspot (image, icon, or fallback) ---------- */

function IconOrImage({
  hotspot: h,
  width,
  height,
}: {
  hotspot: Hotspot;
  width: number;
  height: number;
}) {
  const url = h.icon_url ?? (h.type === "image" ? h.image_url : null);

  if (url) {
    // Tint an uploaded icon:
    //   • For type === "image" (a photo card) — never tint, always show
    //     the original.
    //   • For an icon upload (icon_url) — apply the user's tint by
    //     rendering the image as a CSS mask over a solid-colour box.
    //     This treats the image's alpha as a silhouette so any hex
    //     tint just "colours the shape", exactly like the built-in
    //     Lucide icons already do. Skip the mask when tint is white
    //     (the default) so untouched uploads still render in their
    //     natural colours.
    const tint = h.icon_tint ?? "#ffffff";
    const isPhotoCard = h.type === "image" && !!h.image_url;
    const tintable =
      !isPhotoCard &&
      !!h.icon_url &&
      tint.toLowerCase() !== "#ffffff" &&
      tint.toLowerCase() !== "#fff";
    if (tintable) {
      return (
        <div
          role="img"
          aria-label=""
          style={{
            display: "block",
            width: `${width}px`,
            height: `${height}px`,
            backgroundColor: tint,
            WebkitMaskImage: `url(${url})`,
            maskImage: `url(${url})`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            maskSize: "contain",
          }}
        />
      );
    }
    // Fallthrough — original untinted <img> render (unchanged).
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          display: "block",
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: "none",
          maxHeight: "none",
          minWidth: 0,
          minHeight: 0,
          objectFit: "contain",
          borderRadius: 0,
          border: "none",
          padding: 0,
          margin: 0,
          background: "transparent",
          clipPath: "none",
          WebkitMaskImage: "none",
          maskImage: "none",
          boxSizing: "content-box",
        }}
      />
    );
  }

  const entry = findIcon(h.icon_key);
  if (entry) {
    const size = Math.min(width, height);
    const IconCmp = entry.Icon;
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconCmp
          size={size}
          color={h.icon_tint ?? "#ffffff"}
          strokeWidth={2}
        />
      </div>
    );
  }

  // No icon chosen — fall back to the glyph that matches the hotspot's
  // kind. This is what lets an info hotspot keep its familiar "i" while
  // still flowing through the normal styling pipeline (skin, shape, glow),
  // instead of needing a bespoke renderer of its own.
  const TypeGlyph = defaultGlyphFor(h);
  if (TypeGlyph) {
    const size = Math.min(width, height);
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TypeGlyph
          size={size}
          color={h.icon_tint ?? "#ffffff"}
          strokeWidth={2}
        />
      </div>
    );
  }

  // Last-resort marker
  return (
    <div
      style={{
        width,
        height,
        borderRadius: "50%",
        background: h.color ?? "#22c55e",
        border: "2px solid #fff",
      }}
    />
  );
}

/** The glyph a hotspot falls back to when its author hasn't picked one. */
function defaultGlyphFor(h: Hotspot) {
  switch (h.type) {
    case "info":
      return InfoGlyph;
    case "video":
      return Play;
    case "audio":
      return Headphones;
    case "pdf":
      return FileText;
    case "url":
      return Link2;
    case "nav":
      return Navigation;
    case "person":
      return UserGlyph;
    default:
      // An action can imply the glyph even when the type doesn't.
      if (h.action === "info_popup") return InfoGlyph;
      if (h.action === "video_popup") return Play;
      if (h.action === "audio_popup") return Headphones;
      if (h.action === "pdf_popup") return FileText;
      if (h.action === "url") return Link2;
      if (h.action === "nav") return Navigation;
      return null;
  }
}

/* --------- Inline video card (thumbnail + play, expands to player) ---------- */

/** Module-level cache for oEmbed responses so we don't re-hit the network
 *  every time the same hotspot renders. */
const videoMetaCache = new Map<string, { title: string; author?: string }>();

function VideoCard({ hotspot: h }: { hotspot: Hotspot }) {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [meta, setMeta] = useState<{ title: string; author?: string } | null>(
    () => (h.video_url ? videoMetaCache.get(h.video_url) ?? null : null)
  );
  const ytId = useMemo(
    () => extractYouTubeVideoId(h.video_url ?? ""),
    [h.video_url]
  );
  const thumbnail =
    h.video_thumbnail_url ||
    (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

  // On hover for a YouTube URL, fetch title/author via oEmbed once.
  // Cached in the module map so subsequent hovers are instant. Never
  // blocks the render — silent fallback to hotspot.label if it fails.
  useEffect(() => {
    if (!hovered || meta || !ytId || !h.video_url) return;
    const url = h.video_url;
    let cancelled = false;
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        url
      )}&format=json`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const entry = { title: d.title as string, author: d.author_name };
        videoMetaCache.set(url, entry);
        setMeta(entry);
      })
      .catch(() => {
        /* silent — fall back to hotspot.label */
      });
    return () => {
      cancelled = true;
    };
  }, [hovered, meta, ytId, h.video_url]);

  const thumbScale = (h.thumbnail_size_pct ?? 100) / 100;
  const cardW = Math.round(260 * thumbScale);
  const cardH = Math.round(146 * thumbScale);

  // Best-effort display title, in priority order.
  const displayTitle =
    meta?.title || h.info_title || h.label || (ytId ? "YouTube video" : "Video");
  const displaySubtitle = meta?.author ?? (ytId ? "YouTube" : "");

  if (playing) {
    return (
      <div
        style={{
          width: cardW,
          height: cardH,
          background: "#000",
          borderRadius: 6,
          overflow: "hidden",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {ytId ? (
          <iframe
            width={cardW}
            height={cardH}
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
            title={displayTitle}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ border: "none", display: "block" }}
          />
        ) : h.video_url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={h.video_url}
            controls
            autoPlay
            style={{ width: "100%", height: "100%", background: "#000" }}
          />
        ) : (
          <div style={{ color: "#888", padding: 12, fontSize: 12 }}>
            No video URL set.
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setPlaying(true);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: cardW,
        height: cardH,
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
        cursor: "pointer",
        background: "#111",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: hovered
          ? "0 10px 32px rgba(0,0,0,0.7)"
          : "0 6px 22px rgba(0,0,0,0.55)",
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        pointerEvents: "auto",
      }}
    >
      {thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      {/* Play button + gradient — always visible so the card reads as
          "video" from a distance. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: hovered
            ? "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.7))"
            : "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55))",
          transition: "background 180ms ease",
        }}
      >
        <div
          style={{
            width: hovered ? 64 : 56,
            height: hovered ? 64 : 56,
            borderRadius: "50%",
            background: hovered ? "rgba(220,20,20,0.9)" : "rgba(0,0,0,0.65)",
            border: hovered
              ? "2px solid #ffffff"
              : "2px solid rgba(255,255,255,0.9)",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,0.6)",
            transition:
              "width 180ms ease, height 180ms ease, background 180ms ease",
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              marginLeft: 4,
              borderLeft: `${hovered ? 18 : 16}px solid white`,
              borderTop: `${hovered ? 12 : 10}px solid transparent`,
              borderBottom: `${hovered ? 12 : 10}px solid transparent`,
              transition: "border-width 180ms ease",
            }}
          />
        </div>
      </div>

      {/* Hover overlay — title + subtitle at the bottom of the card.
          Slides up + fades in from the bottom. Content set from oEmbed
          (YouTube) or falls back to hotspot label / info_title. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "10px 12px",
          background:
            "linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0) 100%)",
          transform: hovered ? "translateY(0)" : "translateY(6px)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 200ms ease, transform 200ms ease",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayTitle}
        </div>
        {displaySubtitle && (
          <div
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 10,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displaySubtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      const parts = u.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

/* ---------- Shared texture loader for Surface/Wall/Floor hotspots ---------
 * Handles all three ways a hotspot can supply its visual:
 *   1. h.image_url   — user-uploaded image (uploaded via IconPicker "image")
 *   2. h.icon_url    — user-uploaded custom icon
 *   3. h.icon_key    — built-in library icon (Lucide) — rasterized here with
 *                      the current tint applied
 * Returning null (with `failed=false`) means the hotspot has no visual set;
 * returning tex means paint the plane with it. `failed` means we tried and
 * something went wrong (bad URL, CORS, etc.) — the plane shows a red state.
 */
function useHotspotFaceTexture(h: Hotspot): {
  tex: THREE.Texture | null;
  failed: boolean;
  aspect: number;
} {
  const url = h.image_url ?? h.icon_url ?? null;
  const iconKey = url ? null : h.icon_key ?? null;
  const tint = h.icon_tint ?? "#ffffff";

  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    // Path 1: real image URL
    if (url) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(
        url,
        (t) => {
          if (cancelled) return;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          t.needsUpdate = true;
          const img = t.image as HTMLImageElement | undefined;
          if (img?.naturalWidth && img?.naturalHeight) {
            setAspect(img.naturalWidth / img.naturalHeight);
          }
          setTex(t);
        },
        undefined,
        () => {
          if (!cancelled) setFailed(true);
        }
      );
      return () => {
        cancelled = true;
      };
    }

    // Path 2: built-in Lucide icon — render to SVG, then to a canvas texture
    if (iconKey) {
      const entry = findIcon(iconKey);
      if (!entry) {
        setTex(null);
        return;
      }
      const Icon = entry.Icon;
      const SIZE = 256;
      // Render the icon to a static SVG string with the tint applied as stroke
      let svgMarkup: string;
      try {
        svgMarkup = renderToStaticMarkup(
          <Icon color={tint} size={SIZE} strokeWidth={2} />
        );
      } catch {
        setFailed(true);
        return;
      }
      // Ensure the xmlns is present so the browser can decode the blob
      if (!/xmlns=/.test(svgMarkup)) {
        svgMarkup = svgMarkup.replace(
          "<svg",
          '<svg xmlns="http://www.w3.org/2000/svg"'
        );
      }
      const blob = new Blob([svgMarkup], {
        type: "image/svg+xml;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          setFailed(true);
          return;
        }
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        URL.revokeObjectURL(objectUrl);
        const canvasTex = new THREE.CanvasTexture(canvas);
        canvasTex.colorSpace = THREE.SRGBColorSpace;
        canvasTex.needsUpdate = true;
        setAspect(1);
        setTex(canvasTex);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (!cancelled) setFailed(true);
      };
      img.src = objectUrl;
      return () => {
        cancelled = true;
      };
    }

    // Path 3: nothing to paint
    setTex(null);
    return () => {
      cancelled = true;
    };
  }, [url, iconKey, tint]);

  return { tex, failed, aspect };
}

/* ---------- Person tag (human-tag hotspot renderer) --------------------
 * Compact "who is this" marker for tagging people in a scene. Reads:
 *   label      → person's name (main line)
 *   info_body  → role / caption (sub-line, optional)
 *   icon_url   → optional avatar photo (round crop)
 * Renders a small dot with a pulsing halo. On hover it expands into a
 * name pill; on click the full card stays open with an optional caption.
 * Small footprint on the panorama, big visual reward on interaction. */
function PersonTag({
  hotspot: h,
  editable,
  selected,
  fx = DEFAULT_FX,
  scenesLookup,
  onClick,
  onDoubleClick,
  onHover,
  onIntent,
  onDragStart,
}: {
  hotspot: Hotspot;
  editable: boolean;
  selected: boolean;
  fx?: HotspotFx;
  mirrored: boolean;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onClick: () => void;
  onDoubleClick: () => void;
  onHover?: () => void;
  onIntent?: (intent: HotspotAction) => void;
  onDragStart: () => void;
  setOrbitEnabled?: (v: boolean) => void;
}) {
  // The name pill stays the marker; the premium card carries the detail.
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const card = useHoverCard();
  const pos = useMemo(
    () => sphericalToVec3(h.yaw, h.pitch),
    [h.yaw, h.pitch]
  );
  const lastClickRef = useRef(0);

  function handlePointerDown(e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    const sx = e.clientX,
      sy = e.clientY;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      if (dragged) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD_PX) {
        dragged = true;
        onDragStart();
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (dragged) return;
      const now = performance.now();
      if (now - lastClickRef.current < 350) onDoubleClick();
      else onClick();
      lastClickRef.current = now;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const { t: tPerson } = useT();
  const name = tPerson(h.label) || tPerson("Person");
  const desc = tPerson(h.info_body) || null;
  const bg = h.color || "rgba(45,47,52,0.94)";
  const fg = h.label_color || "#ffffff";
  // Card size uses width_pct for the mini pill scale; card_size_pct for
  // the opened balloon.
  const miniScale = (h.width_pct ?? 80) / 80;
  const bigScale = (h.card_size_pct ?? 80) / 80;
  const miniW = Math.round(96 * miniScale);
  const miniH = Math.round(38 * miniScale);
  const bigW = Math.round(240 * bigScale);
  const bigH = Math.round(240 * bigScale);

  return (
    <Html
      position={pos.toArray()}
      center
      distanceFactor={400}
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="human-hs"
        style={
          {
            "--hs-bg": bg,
            "--hs-fg": fg,
            "--hs-mini-w": `${miniW}px`,
            "--hs-mini-h": `${miniH}px`,
            "--hs-big-w": `${bigW}px`,
            "--hs-big-h": `${bigH}px`,
            // Text formatting from the panel — name uses label_size/bold/font,
            // details scales at ~85% of the name so they read as a hierarchy.
            "--hs-font": fontFor(h.label_font),
            "--hs-name-size": `${h.label_size ?? 14}px`,
            "--hs-name-weight": h.label_bold ? 700 : 500,
            "--hs-desc-size": `${Math.round((h.label_size ?? 14) * 0.85)}px`,
            outline: selected ? "2px solid rgb(34,211,238)" : "none",
            outlineOffset: 6,
            borderRadius: "50%",
          } as React.CSSProperties
        }
        onMouseEnter={() => {
          setHovered(true);
          card.show();
          if (!editable && onHover) {
            if (hoverTimerRef.current)
              window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = window.setTimeout(() => onHover(), 400);
          }
        }}
        onMouseLeave={() => {
          setHovered(false);
          card.hide();
          if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
        }}
      >
        {/* Premium hover card — avatar, name, role and any attached media,
            in the same card language as every other hotspot. */}
        {card.mounted && !editable && fx.hoverCard && (
          <HotspotHoverCard
            hotspot={h}
            open={card.open}
            scenesLookup={scenesLookup}
            scale={fx.hoverCardScale}
            onPointerEnter={card.keep}
            onPointerLeave={card.hide}
            onIntent={
              onIntent
                ? (intent) => {
                    onIntent(intent);
                    card.close();
                  }
                : undefined
            }
          />
        )}

        <div
          className="human-hs__bubble"
          onPointerDown={handlePointerDown}
          onClick={(e) => {
            if (editable) return;
            e.stopPropagation();
            // Fire the parent onClick so hotspot_click analytics
            // events attribute to this hotspot.
            onClick();
          }}
        >
          <div className="human-hs__name">{name}</div>
          <svg
            className="human-hs__figure"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="12" cy="7.5" r="4.2" />
            <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8H4z" />
          </svg>
          {desc && <div className="human-hs__desc">{desc}</div>}
        </div>
        {/* Speech-bubble tail — sits outside the overflow-hidden bubble
            so it shows only when closed. Uses the same bg colour. */}
        <div className="human-hs__tail" />
      </div>
    </Html>
  );
}

/* ---------- Media hotspot (circle → card morph) -----------------------
 * Idle: blue circle with camera glyph.
 * Hover / click: morphs into a card — blue header keeps the icon, white
 * body reveals the image and (optional) caption. Unhover collapses back
 * to the circle unless the user has clicked (which "pins" it open).
 * Icon size + card size are both driven by data (width_pct / card_size_pct)
 * so the size sliders in the panel work out of the box.
 * --------------------------------------------------------------------- */
function MediaHotspot({
  hotspot: h,
  editable,
  selected,
  fx = DEFAULT_FX,
  scenesLookup,
  onClick,
  onDoubleClick,
  onHover,
  onIntent,
  onDragStart,
}: {
  hotspot: Hotspot;
  editable: boolean;
  selected: boolean;
  fx?: HotspotFx;
  mirrored: boolean;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onClick: () => void;
  onDoubleClick: () => void;
  onHover?: () => void;
  onIntent?: (intent: HotspotAction) => void;
  onDragStart: () => void;
  setOrbitEnabled?: (v: boolean) => void;
}) {
  // The glass circle is the marker; the premium card carries the image.
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const card = useHoverCard();
  const pos = useMemo(
    () => sphericalToVec3(h.yaw, h.pitch),
    [h.yaw, h.pitch]
  );
  const lastClickRef = useRef(0);

  function handlePointerDown(e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    const sx = e.clientX,
      sy = e.clientY;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      if (dragged) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD_PX) {
        dragged = true;
        onDragStart();
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (dragged) return;
      const now = performance.now();
      if (now - lastClickRef.current < 350) onDoubleClick();
      else onClick();
      lastClickRef.current = now;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Size mapping — reuse the existing width_pct (icon size, 40-200%)
  // and card_size_pct (opened card size, 40-200%).
  const iconSize = Math.max(36, Math.min(140, (h.width_pct ?? 80) * 0.7));
  const cardScale = (h.card_size_pct ?? 80) / 80; // 80% → 1.0
  const cardW = Math.round(240 * cardScale);
  const cardH = Math.round(300 * cardScale);
  const headerH = Math.max(48, Math.min(80, iconSize));

  // Bubble colour comes from h.color; falls back to the default blue.
  const bubbleColor = h.color && h.color !== "#22c55e" ? h.color : "#29b6f6";
  const iconColor = h.label_color || "#ffffff";

  return (
    <Html
      position={pos.toArray()}
      center
      distanceFactor={400}
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="media-hs"
        style={
          {
            "--media-icon": `${iconSize}px`,
            "--media-w": `${cardW}px`,
            "--media-h": `${cardH}px`,
            "--media-header": `${headerH}px`,
            "--media-blue": bubbleColor,
            outline: selected ? "2px solid rgb(34,211,238)" : "none",
            outlineOffset: 4,
          } as React.CSSProperties
        }
        onMouseEnter={() => {
          setHovered(true);
          card.show();
          if (!editable && onHover) {
            if (hoverTimerRef.current)
              window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = window.setTimeout(() => onHover(), 400);
          }
        }}
        onMouseLeave={() => {
          setHovered(false);
          card.hide();
          if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
        }}
      >
        {/* Premium hover card — the photo, its caption and any other
            payload, in the shared card language. Clicking the marker hands
            off to the anchored popup with the full-size image. */}
        {card.mounted && !editable && fx.hoverCard && (
          <HotspotHoverCard
            hotspot={h}
            open={card.open}
            scenesLookup={scenesLookup}
            scale={fx.hoverCardScale}
            onPointerEnter={card.keep}
            onPointerLeave={card.hide}
            onIntent={
              onIntent
                ? (intent) => {
                    onIntent(intent);
                    card.close();
                  }
                : undefined
            }
          />
        )}

        <div
          className="media-hs__card"
          onPointerDown={handlePointerDown}
          onClick={(e) => {
            if (editable) return;
            e.stopPropagation();
            // Fire the parent onClick so hotspot_click analytics
            // events attribute to this hotspot, and the anchored premium
            // card opens with the image.
            onClick();
          }}
        >
          <div className="media-hs__header">
            {/* Inline camera SVG — no extra import; scales with the card */}
            <svg
              className="media-hs__icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke={iconColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        </div>
      </div>
    </Html>
  );
}

/* --------- Surface (2D wall-attached) image ---------- */

/* ---------------------------- Nadir patch ------------------------------ */

/* ---- Tripod cover: auto-color-matched disc that hides the shadow ---- */
/* Samples a horizontal strip from the panorama just above the south pole
 * (where the tripod shadow lives), wraps that strip radially into a disc,
 * and renders the disc at the south pole with a soft alpha edge so it
 * blends into the surrounding floor. */
function TripodPatch({
  panoramaImage,
  sizePct,
}: {
  panoramaImage: HTMLImageElement | undefined;
  sizePct: number;
}) {
  const tex = useMemo(() => {
    if (!panoramaImage?.width || !panoramaImage?.height) return null;
    try {
      const src = document.createElement("canvas");
      src.width = panoramaImage.width;
      src.height = panoramaImage.height;
      const sctx = src.getContext("2d");
      if (!sctx) return null;
      sctx.drawImage(panoramaImage, 0, 0);

      // Clean-floor sample band: rows well above the tripod shadow. We take
      // a fairly tall strip so the average absorbs floor pattern noise.
      const rowStart = Math.round(panoramaImage.height * 0.70);
      const rowEnd = Math.min(
        panoramaImage.height - 1,
        Math.round(panoramaImage.height * 0.82)
      );
      const stripH = rowEnd - rowStart;
      const stripData = sctx.getImageData(
        0,
        rowStart,
        panoramaImage.width,
        stripH
      ).data;

      // ---- Directional color model ----
      // For each of NUM_BINS angular slices around the panorama, compute the
      // MEAN color of the clean-floor strip for that column range. Then apply
      // a wide moving-average smoothing pass so adjacent bins don't jump.
      // This gives one soft, floor-matched color per direction.
      const NUM_BINS = 128;
      const bins = new Array(NUM_BINS)
        .fill(0)
        .map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
      for (let sx = 0; sx < panoramaImage.width; sx++) {
        const bi = Math.floor((sx / panoramaImage.width) * NUM_BINS);
        const bin = bins[bi];
        for (let sy = 0; sy < stripH; sy++) {
          const srcIdx = (sy * panoramaImage.width + sx) * 4;
          bin.r += stripData[srcIdx];
          bin.g += stripData[srcIdx + 1];
          bin.b += stripData[srcIdx + 2];
          bin.n++;
        }
      }
      const raw = bins.map((b) =>
        b.n > 0 ? [b.r / b.n, b.g / b.n, b.b / b.n] : [128, 128, 128]
      );
      // Wide smoothing (±12 bins ≈ ±34°) to erase visible seams / patterns.
      const SMOOTH = 12;
      const smoothed = raw.map((_, i) => {
        let r = 0, g = 0, b = 0, n = 0;
        for (let k = -SMOOTH; k <= SMOOTH; k++) {
          const j = ((i + k) % NUM_BINS + NUM_BINS) % NUM_BINS;
          r += raw[j][0];
          g += raw[j][1];
          b += raw[j][2];
          n++;
        }
        return [r / n, g / n, b / n];
      });

      // ---- Render the disc ----
      const SIZE = 512;
      const out = document.createElement("canvas");
      out.width = SIZE;
      out.height = SIZE;
      const octx = out.getContext("2d");
      if (!octx) return null;
      const outData = octx.createImageData(SIZE, SIZE);

      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const R = SIZE / 2;
      // Very wide feather (starts at 45% of radius, fully transparent at 100%)
      // so the disc melts into surrounding floor without a visible border.
      const FEATHER_START = 0.45;

      for (let py = 0; py < SIZE; py++) {
        for (let px = 0; px < SIZE; px++) {
          const dx = px - cx;
          const dy = py - cy;
          const r = Math.hypot(dx, dy);
          const dstIdx = (py * SIZE + px) * 4;
          if (r > R) {
            outData.data[dstIdx + 3] = 0;
            continue;
          }
          const rNorm = r / R;

          // Angular position → interpolated color from adjacent bins.
          let theta = Math.atan2(dy, dx);
          if (theta < 0) theta += Math.PI * 2;
          const binF = (theta / (Math.PI * 2)) * NUM_BINS;
          const b0 = Math.floor(binF) % NUM_BINS;
          const b1 = (b0 + 1) % NUM_BINS;
          const t = binF - Math.floor(binF);
          const c0 = smoothed[b0];
          const c1 = smoothed[b1];
          const cr = c0[0] * (1 - t) + c1[0] * t;
          const cg = c0[1] * (1 - t) + c1[1] * t;
          const cb = c0[2] * (1 - t) + c1[2] * t;

          // Smoothstep alpha ramp for a natural fade.
          let alpha = 1;
          if (rNorm > FEATHER_START) {
            const x = (rNorm - FEATHER_START) / (1 - FEATHER_START);
            const s = x * x * (3 - 2 * x); // smoothstep
            alpha = 1 - s;
          }

          outData.data[dstIdx] = cr;
          outData.data[dstIdx + 1] = cg;
          outData.data[dstIdx + 2] = cb;
          outData.data[dstIdx + 3] = Math.round(255 * alpha);
        }
      }
      octx.putImageData(outData, 0, 0);

      const t = new THREE.CanvasTexture(out);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    } catch {
      return null;
    }
  }, [panoramaImage]);

  if (!tex) return null;
  const worldSize = (SPHERE_RADIUS * Math.max(5, Math.min(80, sizePct))) / 100;
  return (
    <mesh
      position={[0, -HOTSPOT_RADIUS + 4, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <circleGeometry args={[worldSize, 96]} />
      <meshBasicMaterial
        map={tex}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function NadirPatch({ url, sizePct }: { url: string; sizePct: number }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    const l = new THREE.TextureLoader();
    l.setCrossOrigin("anonymous");
    l.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      const img = t.image as HTMLImageElement | undefined;
      if (img?.naturalWidth && img?.naturalHeight) {
        setAspect(img.naturalWidth / img.naturalHeight);
      }
      setTex(t);
    });
  }, [url]);
  if (!tex) return null;
  // Plane lying flat at the "south pole" of the sphere, sized by the
  // image's natural aspect ratio. Round logos (transparent PNG) still look
  // round because the PNG alpha channel does the masking; square/rectangular
  // logos (QR codes, wordmarks) render at their true shape instead of being
  // clipped to a circle.
  const base = (SPHERE_RADIUS * Math.max(5, Math.min(80, sizePct))) / 100;
  // "base" acts as the longer side; the shorter side scales down by aspect.
  const worldW = aspect >= 1 ? base * 2 : base * 2 * aspect;
  const worldH = aspect >= 1 ? (base * 2) / aspect : base * 2;
  return (
    <mesh
      position={[0, -HOTSPOT_RADIUS + 5, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={3}
    >
      <planeGeometry args={[worldW, worldH]} />
      <meshBasicMaterial
        map={tex}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function SurfaceImage({
  hotspot: h,
  selected,
  editable,
  mirrored,
  onClick,
  onDoubleClick,
  onDragStart,
  setOrbitEnabled,
}: {
  hotspot: Hotspot;
  selected: boolean;
  editable: boolean;
  mirrored: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  // Unified texture loader — handles image_url / icon_url / icon_key (built-in
  // library icon, rasterized on the fly). See useHotspotFaceTexture above.
  const { tex, failed } = useHotspotFaceTexture(h);

  const pos = useMemo(
    () => sphericalToVec3(h.yaw, h.pitch),
    [h.yaw, h.pitch]
  );
  const worldW = Math.max(20, (h.width_pct ?? 80) * 2);
  const worldH = Math.max(20, (h.height_pct ?? 80) * 2);

  // Explicit basis matrix orientation. lookAt at the poles is degenerate;
  // this handles that and also gives a predictable "up = world Y" for
  // non-polar placements, so posters aren't tilted.
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    const g = ref.current;
    g.position.copy(pos);

    // Plane normal (+Z_local) should face the camera at origin — i.e. inward.
    const inward = pos.clone().negate().normalize();
    // Prefer world-up; at the poles fall back to a horizontal axis.
    let worldUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(inward.dot(worldUp)) > 0.99) {
      worldUp = new THREE.Vector3(0, 0, 1);
    }
    const right = new THREE.Vector3()
      .crossVectors(worldUp, inward)
      .normalize();
    const up = new THREE.Vector3().crossVectors(inward, right).normalize();

    const m = new THREE.Matrix4().makeBasis(right, up, inward);
    g.quaternion.setFromRotationMatrix(m);

    if (h.rotation_deg) {
      g.rotateZ((h.rotation_deg * Math.PI) / 180);
    }
  }, [pos, h.rotation_deg]);

  // Same drag/click behavior as billboard.
  // OrbitControls is stopped both at the DOM level (stopImmediatePropagation)
  // and via ref (setOrbitEnabled), so panorama rotation never fires while
  // dragging the plane.
  const lastClickRef = useRef(0);
  function handlePointerDown(e: any) {
    e.stopPropagation?.();
    const native = e.nativeEvent as PointerEvent | undefined;
    native?.stopImmediatePropagation?.();
    if (editable) setOrbitEnabled(false);

    const startX = e.clientX;
    const startY = e.clientY;
    let dragged = false;

    const onMove = (ev: PointerEvent) => {
      if (!editable) return;
      if (dragged) return;
      if (
        Math.hypot(ev.clientX - startX, ev.clientY - startY) >
        DRAG_THRESHOLD_PX
      ) {
        dragged = true;
        onDragStart();
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setOrbitEnabled(true);

      if (dragged) return;
      const now = performance.now();
      if (editable && now - lastClickRef.current < 350) {
        onDoubleClick();
        lastClickRef.current = 0;
      } else {
        onClick();
        lastClickRef.current = now;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <group ref={ref} onPointerDown={handlePointerDown}>
      {/* Plane always renders on top of the sphere so large planes don't
          get depth-clipped to a circle at their intersection. */}
      <mesh renderOrder={2}>
        <planeGeometry args={[worldW, worldH]} />
        {tex && !failed ? (
          <meshBasicMaterial
            map={tex}
            transparent
            opacity={h.opacity ?? 1}
            side={THREE.DoubleSide}
            toneMapped={false}
            depthTest={false}
            depthWrite={false}
          />
        ) : (
          <meshBasicMaterial
            color={failed ? "#7f1d1d" : "#404040"}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        )}
        {selected && (
          <Edges scale={1.02} color="#22d3ee" threshold={15} />
        )}
      </mesh>

      {failed && (
        <Html center distanceFactor={400} position={[0, 0, 1]}>
          <div
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "#fca5a5",
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            image failed to load (check URL / CORS)
          </div>
        </Html>
      )}
    </group>
  );
}

/* --------- Wall (perspective-matched, tunable) image ---------- */
/* Realistic "poster on a wall" render, distinct from 2D:
 *   - Auto-fits the plane to the image's natural aspect ratio, so posters
 *     never look stretched (this is the biggest realism win).
 *   - Nudged slightly toward the camera along the plane normal, so the
 *     graphic feels physically mounted ON the wall rather than embedded IN
 *     it (with the sphere shell visible at the join).
 *   - Renders a subtle drop-shadow plane behind — depth cue that sells the
 *     "printed poster" look versus 2D's flat sticker feel.
 *   - Same auto tangent-to-sphere orientation as 2D, PLUS user tilts on
 *     the plane's local axes for fine-tuning to each wall's geometry.
 */
function WallImage(props: {
  hotspot: Hotspot;
  editable: boolean;
  selected: boolean;
  mirrored: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const {
    hotspot: h,
    selected,
    editable,
    onClick,
    onDoubleClick,
    onDragStart,
    setOrbitEnabled,
  } = props;
  // Unified texture loader — handles image_url / icon_url / icon_key.
  const { tex, failed, aspect: imgAspect } = useHotspotFaceTexture(h);

  const pos = useMemo(() => sphericalToVec3(h.yaw, h.pitch), [h.yaw, h.pitch]);

  // User's "size" comes from width_pct — treat it as the poster's LONGER
  // edge, and derive the shorter edge from the image's real aspect ratio.
  // This is what makes wall posters look proportional automatically.
  const baseSize = Math.max(20, (h.width_pct ?? 80) * 2);
  const worldW = imgAspect >= 1 ? baseSize : baseSize * imgAspect;
  const worldH = imgAspect >= 1 ? baseSize / imgAspect : baseSize;

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    const g = ref.current;

    // Base orientation: face the camera, tangent to sphere.
    const inward = pos.clone().negate().normalize();
    let worldUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(inward.dot(worldUp)) > 0.99) {
      worldUp = new THREE.Vector3(0, 0, 1);
    }
    const right = new THREE.Vector3().crossVectors(worldUp, inward).normalize();
    const up = new THREE.Vector3().crossVectors(inward, right).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, inward);
    g.quaternion.setFromRotationMatrix(m);

    // Nudge slightly toward camera (opposite of inward) so the poster sits
    // ON the wall surface — with the sphere/wall visible right behind it.
    const forwardOffset = 8; // world units
    g.position.copy(pos).addScaledVector(inward, -forwardOffset);

    // Apply user's fine-tune tilts on the plane's LOCAL axes.
    if (h.wall_tilt_yaw) g.rotateY(h.wall_tilt_yaw);
    if (h.wall_tilt_pitch) g.rotateX(h.wall_tilt_pitch);
    if (h.wall_tilt_roll || h.rotation_deg) {
      g.rotateZ(
        (h.wall_tilt_roll ?? 0) + ((h.rotation_deg ?? 0) * Math.PI) / 180
      );
    }
  }, [
    pos,
    h.rotation_deg,
    h.wall_tilt_yaw,
    h.wall_tilt_pitch,
    h.wall_tilt_roll,
  ]);

  const lastClickRef = useRef(0);
  function handlePointerDown(e: any) {
    e.stopPropagation?.();
    const native = e.nativeEvent as PointerEvent | undefined;
    native?.stopImmediatePropagation?.();
    if (editable) setOrbitEnabled(false);

    const startX = e.clientX;
    const startY = e.clientY;
    let dragged = false;
    const onMove = (ev: PointerEvent) => {
      if (!editable) return;
      if (dragged) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD_PX) {
        dragged = true;
        onDragStart();
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setOrbitEnabled(true);
      if (dragged) return;
      const now = performance.now();
      if (editable && now - lastClickRef.current < 350) {
        onDoubleClick();
        lastClickRef.current = 0;
      } else {
        onClick();
        lastClickRef.current = now;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <group ref={ref} onPointerDown={handlePointerDown}>
      <mesh renderOrder={2}>
        <planeGeometry args={[worldW, worldH]} />
        {tex && !failed ? (
          <meshBasicMaterial
            map={tex}
            transparent
            opacity={h.opacity ?? 1}
            side={THREE.DoubleSide}
            toneMapped={false}
            depthTest={false}
            depthWrite={false}
          />
        ) : (
          <meshBasicMaterial
            color={failed ? "#7f1d1d" : "#404040"}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        )}
        {selected && <Edges scale={1.02} color="#22d3ee" threshold={15} />}
      </mesh>
    </group>
  );
}

function FloorImage(props: { hotspot: Hotspot; editable: boolean; selected: boolean; mirrored: boolean; onClick: () => void; onDoubleClick: () => void; onDragStart: () => void; setOrbitEnabled: (v: boolean) => void }) {
  const { hotspot: h, selected, editable, onClick, onDoubleClick, onDragStart, setOrbitEnabled } = props;
  // Unified texture loader — handles image_url / icon_url / icon_key.
  const { tex, failed } = useHotspotFaceTexture(h);
  const pos = useMemo(() => {
    const p = sphericalToVec3(h.yaw, h.pitch);
    const horiz = new THREE.Vector3(p.x, 0, p.z);
    const len = horiz.length();
    if (len < 1) horiz.set(0, 0, HOTSPOT_RADIUS * 0.5);
    else {
      const t = Math.min(HOTSPOT_RADIUS, Math.max(20, len));
      horiz.setLength(t);
    }
    horiz.y = -HOTSPOT_RADIUS * 0.9;
    return horiz;
  }, [h.yaw, h.pitch]);
  const worldW = Math.max(20, (h.width_pct ?? 80) * 2);
  const worldH = Math.max(20, (h.height_pct ?? 80) * 2);
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    const g = ref.current;
    g.position.copy(pos);
    g.rotation.set(0, 0, 0);
    g.rotateX(-Math.PI / 2);
    if (h.rotation_deg) g.rotateZ((h.rotation_deg * Math.PI) / 180);
  }, [pos, h.rotation_deg]);
  const lastClickRef = useRef(0);
  function handlePointerDown(e: any) {
    e.stopPropagation?.();
    (e.nativeEvent as PointerEvent | undefined)?.stopImmediatePropagation?.();
    if (editable) setOrbitEnabled(false);
    const startX = e.clientX, startY = e.clientY;
    let dragged = false;
    const onMove = (ev: PointerEvent) => {
      if (!editable || dragged) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD_PX) { dragged = true; onDragStart(); }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setOrbitEnabled(true);
      if (dragged) return;
      const now = performance.now();
      if (editable && now - lastClickRef.current < 350) { onDoubleClick(); lastClickRef.current = 0; }
      else { onClick(); lastClickRef.current = now; }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  return (
    <group ref={ref} onPointerDown={handlePointerDown}>
      <mesh renderOrder={2}>
        <planeGeometry args={[worldW, worldH]} />
        {tex && !failed ? (
          <meshBasicMaterial map={tex} transparent opacity={h.opacity ?? 1} side={THREE.DoubleSide} toneMapped={false} depthTest={false} depthWrite={false} />
        ) : (
          <meshBasicMaterial color={failed ? "#7f1d1d" : "#404040"} transparent opacity={0.6} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
        )}
        {selected && <Edges scale={1.02} color="#22d3ee" threshold={15} />}
      </mesh>
    </group>
  );
}
