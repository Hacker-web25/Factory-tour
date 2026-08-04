"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Edges } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Hotspot } from "@/lib/types";
import { findIcon } from "@/lib/iconLibrary";
import { fontFor } from "@/lib/fonts";
import {
  SPHERE_RADIUS,
  HOTSPOT_RADIUS,
  sphericalToVec3,
  vec3ToSpherical,
} from "./math";
import PolygonHotspot from "./PolygonHotspot";
import SceneTransition from "./SceneTransition";

type Props = {
  imageUrl: string;
  hotspots: Hotspot[];
  editable?: boolean;
  selectedHotspotId?: string | null;
  /** When true: BackSide rendering (world appears mirror-imaged).
   *  When false: sphere is x-flipped so text/signs read correctly. Default: false. */
  mirrored?: boolean;
  /** Optional nadir patch image URL — circular overlay at the south pole. */
  nadirImageUrl?: string | null;
  /** Nadir size in percent of viewport height (default 25). */
  nadirSize?: number;
  /** Auto-rotate the camera (used by Auto-tour). */
  autoRotate?: boolean;
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
  /** Optional dolly direction (nav-hotspot yaw/pitch). Ignored when
   *  transitionCinematic=false. Null = dolly along camera's forward. */
  transitionDirection?: { yaw: number; pitch: number } | null;
  /** Target scene's saved initial view. Camera SLERPs to this aim so the
   *  swap lands facing the "front" of the new scene, not wherever the
   *  user was looking. */
  transitionTargetAim?: { yaw: number; pitch: number } | null;
  transitionDurationMs?: number;
  onTransitionComplete?: () => void;
};

const DRAG_THRESHOLD_PX = 5;

export default function PanoramaViewer(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 0.01], fov: 75, near: 0.1, far: 1100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({
  imageUrl,
  hotspots,
  editable,
  selectedHotspotId,
  mirrored = false,
  nadirImageUrl,
  nadirSize = 25,
  autoRotate = false,
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
  onHotspotDrag,
  initialYaw = 0,
  initialPitch = 0,
  transitionTargetUrl = null,
  transitionCinematic = false,
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

  useEffect(() => {
    if (!dragId || !editable || !onHotspotDrag) return;
    if (orbitRef.current) orbitRef.current.enabled = false;

    const canvas = gl.domElement;
    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = raycaster.intersectObject(sphereRef.current)[0];
      if (hit) {
        const p = hit.point.clone().normalize().multiplyScalar(HOTSPOT_RADIUS);
        const { yaw, pitch } = vec3ToSpherical(p);
        onHotspotDrag(dragId, yaw, pitch);
      }
    };
    const handleUp = () => {
      setDragId(null);
      if (orbitRef.current) orbitRef.current.enabled = true;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragId, editable, onHotspotDrag, gl, camera, raycaster]);

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
          selected={selectedHotspotId === h.id}
          mirrored={mirrored}
          scenesLookup={scenesLookup}
          onClick={() => onHotspotClick?.(h)}
          onDoubleClick={() => onHotspotDoubleClick?.(h)}
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
        dampingFactor={0.06}
        rotateSpeed={-0.4}
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
        autoRotate={autoRotate}
        autoRotateSpeed={autoRotateSpeed}
      />
    </>
  );
}

/* --------- Router: choose renderer per hotspot ---------- */

function HotspotMarker(props: {
  hotspot: Hotspot;
  editable: boolean;
  selected: boolean;
  mirrored: boolean;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const { hotspot: h } = props;

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
  scenesLookup,
  onClick,
  onDoubleClick,
  onDragStart,
}: {
  hotspot: Hotspot;
  selected: boolean;
  editable: boolean;
  scenesLookup?: Map<string, { name: string; thumbnailUrl: string | null }>;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  setOrbitEnabled?: (v: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
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

  // Navigation preview: when hovering over a nav hotspot (nav type or a
  // hotspot with an action that navigates), show a small card with the
  // target scene's thumbnail + name.
  const isNav =
    (h.type === "nav" || h.action === "nav") && !!h.target_scene_id;
  const navTarget =
    isNav && h.target_scene_id ? scenesLookup?.get(h.target_scene_id) : null;

  // Video preview: any hotspot that has a video URL AND isn't already
  // rendered as an inline VideoCard gets a rich hover preview with the
  // thumbnail + play button + title. Catches all three configurations:
  //   • type="video"  + video_show_thumbnail=false → small icon, show preview
  //   • type="video"  + video_show_thumbnail=true  → inline card already visible, no preview
  //   • type="icon" / other + action="video_popup" + video_url → show preview
  const hasVideoUrl = !!h.video_url;
  const rendersAsInlineCard = h.type === "video" && !!h.video_show_thumbnail;
  const showVideoPreview = hasVideoUrl && !rendersAsInlineCard;
  const videoYtId = showVideoPreview
    ? extractYouTubeVideoId(h.video_url ?? "")
    : null;
  const videoPreviewThumb = showVideoPreview
    ? h.video_thumbnail_url ||
      (videoYtId
        ? `https://img.youtube.com/vi/${videoYtId}/hqdefault.jpg`
        : null)
    : null;

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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          if (!editable) {
            e.stopPropagation();
            onClick();
          }
        }}
      >
        {/* Nav preview card — floats above the hotspot on hover, shows
            where this hotspot takes you. */}
        {hovered && navTarget && !editable && (
          <div
            className="pointer-events-none"
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(15, 15, 20, 0.92)",
              border: "1px solid rgba(34, 211, 238, 0.55)",
              borderRadius: 6,
              padding: 8,
              width: 260,
              boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 20,
              animation: "hs-nav-preview-in 0.18s ease-out",
            }}
          >
            {navTarget.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={navTarget.thumbnailUrl}
                alt=""
                draggable={false}
                style={{
                  width: "100%",
                  height: 150,
                  objectFit: "cover",
                  borderRadius: 4,
                  display: "block",
                }}
              />
            )}
            <div
              style={{
                marginTop: navTarget.thumbnailUrl ? 4 : 0,
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              → {navTarget.name}
            </div>
          </div>
        )}

        {/* Video preview card — floats above the hotspot on hover for
            any hotspot with a video URL that isn't already rendered as
            an inline VideoCard. Shows thumbnail + play button + title.
            Click bubbles up to the hotspot's onClick so the video opens
            normally (modal or inline). */}
        {hovered && showVideoPreview && !editable && (
          <VideoPreviewCard hotspot={h} thumbnail={videoPreviewThumb} />
        )}

        {/* Inner: pure content, with a clean outline offset for selection */}
        <div
          className="pointer-events-none"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            borderRadius: 0,
            outline: selected
              ? "2px solid rgb(34,211,238)"
              : hovered && editable
              ? "1.5px solid rgba(255,255,255,0.6)"
              : "none",
            outlineOffset: 4,
            transform: hovered && editable ? "scale(1.05)" : "none",
            transition: "transform 0.15s",
          }}
        >
          {/* Dedicated wrapper for the interaction animation so its transform
              doesn't conflict with the hover-scale transform above. */}
          <div
            className={
              hovered && h.animation && h.animation !== "none"
                ? `hs-anim-${h.animation}`
                : ""
            }
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            {/* Text-type hotspots render label ONLY — no icon marker. */}
            {h.type === "video" && h.video_show_thumbnail ? (
              <VideoCard hotspot={h} />
            ) : h.type !== "text" ? (
              <IconOrImage hotspot={h} width={w} height={hh} />
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
                  whiteSpace: "nowrap",
                }}
              >
                {h.label}
              </span>
            )}
          </div>
        </div>
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
    // Force strict rectangular rendering — no clipping, no border-radius, no mask
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

/* -------- Hover preview card for video hotspots rendered as icons ---------
 * Mounted only while the user hovers a video hotspot that ISN'T already
 * showing an inline VideoCard. Renders a full YouTube-style thumbnail
 * with title + play button — click bubbles up to the underlying hotspot
 * so the actual video (modal or inline) opens on click. */
function VideoPreviewCard({
  hotspot: h,
  thumbnail,
}: {
  hotspot: Hotspot;
  thumbnail: string | null;
}) {
  const [meta, setMeta] = useState<{ title: string; author?: string } | null>(
    () => (h.video_url ? videoMetaCache.get(h.video_url) ?? null : null)
  );
  const ytId = useMemo(
    () => extractYouTubeVideoId(h.video_url ?? ""),
    [h.video_url]
  );

  // Fetch YouTube title/author via oEmbed on mount (cached).
  useEffect(() => {
    if (meta || !ytId || !h.video_url) return;
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
        /* silent — falls back to hotspot label / info_title */
      });
    return () => {
      cancelled = true;
    };
  }, [meta, ytId, h.video_url]);

  const title =
    meta?.title ||
    h.info_title ||
    h.label ||
    (ytId ? "YouTube video" : "Video");
  const subtitle = meta?.author ?? (ytId ? "YouTube" : "");

  return (
    <div
      className="pointer-events-none"
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: "50%",
        transform: "translateX(-50%)",
        width: 300,
        background: "rgba(15, 15, 20, 0.95)",
        border: "1px solid rgba(220, 20, 20, 0.55)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 10px 32px rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 20,
        animation: "hs-nav-preview-in 0.18s ease-out",
      }}
    >
      {thumbnail ? (
        <div style={{ position: "relative", width: "100%", height: 168 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
          {/* Play button */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.55))",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(220, 20, 20, 0.92)",
                border: "3px solid #ffffff",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 20px rgba(0,0,0,0.7)",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 5,
                  borderLeft: "18px solid white",
                  borderTop: "12px solid transparent",
                  borderBottom: "12px solid transparent",
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            height: 168,
            background: "#111",
            display: "grid",
            placeItems: "center",
            color: "#666",
            fontSize: 11,
          }}
        >
          No thumbnail
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 10.5,
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
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

  const cardW = 260;
  const cardH = 146;

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
