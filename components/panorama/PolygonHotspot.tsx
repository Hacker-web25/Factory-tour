"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Hotspot } from "@/lib/types";
import { HOTSPOT_RADIUS, SPHERE_RADIUS, sphericalToVec3 } from "./math";

/**
 * A polygon-shaped hotspot: user traces the outline of an object (e.g. a TV,
 * a machine, a doorway) and the traced region becomes a clickable, styled
 * hotspot.
 *
 * Points are stored as (yaw, pitch) so they follow the panorama when the
 * camera turns. We build a filled mesh from those points using ShapeGeometry
 * in a local tangent plane, then place it at the centroid on the sphere.
 * The stroke is drawn as a Line loop wrapping the same points.
 */
export default function PolygonHotspot({
  hotspot: h,
  selected,
  editable,
  onClick,
  onDoubleClick,
  onDragStart,
  setOrbitEnabled,
}: {
  hotspot: Hotspot;
  editable: boolean;
  selected: boolean;
  mirrored: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const points = h.polygon_points ?? [];

  // Convert each (yaw,pitch) → world position on the hotspot sphere.
  const worldPoints = useMemo(
    () => points.map((p) => sphericalToVec3(p.yaw, p.pitch)),
    [points]
  );

  // Centroid (average of world points) — used as the anchor & tangent basis.
  const centroid = useMemo(() => {
    if (worldPoints.length === 0) return new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const p of worldPoints) c.add(p);
    c.divideScalar(worldPoints.length);
    // Project back onto the sphere so it stays at a stable radius.
    c.setLength(HOTSPOT_RADIUS);
    return c;
  }, [worldPoints]);

  // Local tangent basis (right, up) at the centroid, so we can flatten the
  // polygon into 2D for ShapeGeometry.
  const basis = useMemo(() => {
    const inward = centroid.clone().negate().normalize();
    let worldUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(inward.dot(worldUp)) > 0.99) worldUp = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(worldUp, inward).normalize();
    const up = new THREE.Vector3().crossVectors(inward, right).normalize();
    return { right, up, inward };
  }, [centroid]);

  // Flatten each point to 2D local coords relative to centroid.
  const flatPoints = useMemo(() => {
    return worldPoints.map((p) => {
      const rel = p.clone().sub(centroid);
      return new THREE.Vector2(rel.dot(basis.right), rel.dot(basis.up));
    });
  }, [worldPoints, centroid, basis]);

  // Build a filled shape geometry from the flat points.
  const fillGeom = useMemo(() => {
    if (flatPoints.length < 3) return null;
    const shape = new THREE.Shape(flatPoints);
    const geom = new THREE.ShapeGeometry(shape);
    return geom;
  }, [flatPoints]);

  // Build a closed stroke geometry (line loop) from the world points.
  const strokeGeom = useMemo(() => {
    if (worldPoints.length < 2) return null;
    const pts = worldPoints.map((p) =>
      p.clone().setLength(HOTSPOT_RADIUS - 1) // slightly in front of the fill
    );
    pts.push(pts[0].clone()); // close the loop
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    return geom;
  }, [worldPoints]);

  // Basis matrix — orient the fill mesh so its local X/Y match right/up.
  const groupRef = useRef<THREE.Group>(null);
  useMemo(() => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.position.copy(centroid);
    const m = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.inward);
    g.quaternion.setFromRotationMatrix(m);
  }, [centroid, basis]);

  // Simple click handler (no dragging — polygon points are edited via the
  // Right panel or a separate draw mode).
  const lastClickRef = useRef(0);
  function handlePointerDown(e: any) {
    e.stopPropagation?.();
    (e.nativeEvent as PointerEvent | undefined)?.stopImmediatePropagation?.();
    if (editable) setOrbitEnabled(false);
    const onUp = () => {
      window.removeEventListener("pointerup", onUp);
      setOrbitEnabled(true);
      const now = performance.now();
      if (editable && now - lastClickRef.current < 350) {
        onDoubleClick();
        lastClickRef.current = 0;
      } else {
        onClick();
        lastClickRef.current = now;
      }
    };
    window.addEventListener("pointerup", onUp);
  }

  if (!fillGeom || !strokeGeom) return null;

  // MEDIA MODE — when the polygon has exactly 4 points and a video or
  // image URL, we project that media onto the quad instead of drawing an
  // outlined region. Feels like the media is physically embedded in the
  // scene (billboard replacement, poster overlay, TV screen, etc.).
  const isMediaQuad =
    worldPoints.length === 4 && (!!h.video_url || !!h.image_url);

  const fillColor = h.polygon_fill_color ?? "#22d3ee";
  const strokeColor = selected
    ? "#ffffff"
    : h.polygon_stroke_color ?? "#22d3ee";
  const fillOpacity = h.polygon_fill_opacity ?? 0.15;
  const strokeWidth = Math.max(1, h.polygon_stroke_width ?? 2);

  return (
    <group onPointerDown={handlePointerDown}>
      {/* Draggable vertex handles — visible only in edit mode when this
          polygon is selected. Grab and move any corner to nudge the
          traced shape into place. Fires a window custom event on drag
          which the edit page listens for and persists. */}
      {editable && selected && worldPoints.length > 0 && (
        <PolygonVertexHandles hotspotId={h.id} points={h.polygon_points ?? []} />
      )}

      {isMediaQuad ? (
        <MediaQuad
          hotspot={h}
          worldPoints={worldPoints}
          editable={editable}
          selected={selected}
        />
      ) : (
        <group ref={groupRef}>
          {/* Filled interior — click target */}
          <mesh geometry={fillGeom} renderOrder={2}>
            <meshBasicMaterial
              color={fillColor}
              transparent
              opacity={fillOpacity}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          {/* Stroke — drawn in world coords (not affected by the basis) */}
          <lineSegments renderOrder={3} onUpdate={(l) => (l.frustumCulled = false)}>
            <bufferGeometry
              attach="geometry"
              {...strokeGeomAsSegments(strokeGeom)}
            />
            <lineBasicMaterial
              attach="material"
              color={strokeColor}
              linewidth={strokeWidth}
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------------ *
 *  MediaQuad — textured 4-vertex quad for "media embedded in the scene"
 *
 *  Builds a BufferGeometry from the polygon's 4 world-space corners with
 *  matching UVs, then applies either a VideoTexture (for video_url) or a
 *  regular Texture (for image_url). The quad tracks the polygon's shape
 *  1:1 so perspective looks physically correct — a billboard, wall poster
 *  or TV screen the user can trace.
 *
 *  Interaction:
 *    - Image quad: click → opens a fullscreen overlay portalled to
 *      document.body (so it escapes drei's <Html> transform).
 *    - Video quad: plays inline continuously; muted so autoplay works
 *      cross-browser. Click toggles mute so the visitor can hear audio.
 * ------------------------------------------------------------------------ */
function MediaQuad({
  hotspot: h,
  worldPoints,
  editable,
  selected,
}: {
  hotspot: Hotspot;
  worldPoints: THREE.Vector3[];
  editable: boolean;
  selected: boolean;
}) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Push the media surface slightly inside the sphere so it sits ON the
  // scene rather than fighting the pano's own texels for depth.
  const insetPoints = useMemo(
    () => worldPoints.map((p) => p.clone().setLength(HOTSPOT_RADIUS - 2)),
    [worldPoints]
  );

  // Build the quad geometry.
  //   Vertex order (traced by the user, going around):
  //     0 - top-left       1 - top-right
  //     3 - bottom-left    2 - bottom-right
  //   Two triangles: (0,1,2) and (0,2,3).
  //   UVs map (0,0)=top-left → (1,1)=bottom-right so the texture reads
  //   right-way-up regardless of tracing direction.
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const p of insetPoints) positions.push(p.x, p.y, p.z);
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [insetPoints]);

  // Video: hidden <video> element that feeds a VideoTexture on the quad.
  // Auto-plays muted (browsers require this) and loops.
  const videoUrl = h.video_url ?? null;
  const [videoTex, setVideoTex] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    if (!videoUrl) return;
    const v = document.createElement("video");
    v.src = videoUrl;
    v.crossOrigin = "anonymous";
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.play().catch(() => {
      /* autoplay blocked — user click will start it */
    });
    videoRef.current = v;
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    setVideoTex(tex);
    return () => {
      v.pause();
      v.src = "";
      tex.dispose();
      videoRef.current = null;
      setVideoTex(null);
    };
  }, [videoUrl]);

  // Image: load via our own <img> element so we can retry on failure
  // and force `needsUpdate = true` after the pixels arrive. The naive
  // TextureLoader path sometimes produces a plain-white quad because
  // the texture's image is still empty when the material first samples
  // it — happens on cold cache / slow network. This version guarantees
  // the material re-renders once the image really is ready.
  const imageUrl = h.image_url ?? null;
  const [imageTex, setImageTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 3;
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;

    function load() {
      attempts++;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        tex.image = img;
        tex.needsUpdate = true;
        setImageTex(tex);
      };
      img.onerror = () => {
        if (cancelled) return;
        if (attempts < maxAttempts) {
          // Backoff: 400ms, 1200ms. Bust cache with a query param so a
          // stale 4xx doesn't keep coming back.
          const delay = 400 * Math.pow(3, attempts - 1);
          window.setTimeout(load, delay);
        } else {
          console.warn("[polygon-image] load failed after 3 attempts:", imageUrl);
        }
      };
      // First attempt uses the URL as-is so the browser cache can help.
      // Later attempts bust cache to force a fresh fetch.
      img.src = attempts === 1 ? imageUrl! : `${imageUrl}?r=${Date.now()}`;
    }
    load();
    return () => {
      cancelled = true;
      tex.dispose();
    };
  }, [imageUrl]);

  const texture = videoTex ?? imageTex;

  function onQuadClick(e: any) {
    e.stopPropagation?.();
    if (editable) return;
    // Fire a window event so TourPlayer (which lives outside the R3F
    // Canvas and can render <video>/<img> without R3F trying to
    // reconcile them as THREE objects) shows the fullscreen viewer.
    if (videoUrl) {
      window.dispatchEvent(
        new CustomEvent("factour:polygon-fullscreen", {
          detail: { kind: "video", url: videoUrl },
        })
      );
    } else if (imageUrl) {
      window.dispatchEvent(
        new CustomEvent("factour:polygon-fullscreen", {
          detail: { kind: "image", url: imageUrl },
        })
      );
    }
  }

  // Keyboard shortcuts on the polygon video:
  //   M       → toggle mute
  //   Space   → toggle play / pause
  // Only registered when there IS a video and we're not editing (author
  // may be typing) or focused in an input/textarea.
  useEffect(() => {
    if (editable || !videoUrl) return;
    function onKey(e: KeyboardEvent) {
      const isM = e.key === "m" || e.key === "M";
      const isSpace = e.key === " " || e.code === "Space";
      if (!isM && !isSpace) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      if (isSpace) {
        // Prevent the browser's default space = scroll behaviour while
        // the visitor is intentionally using the shortcut.
        e.preventDefault();
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      } else {
        v.muted = !v.muted;
        setMuted(v.muted);
        v.play().catch(() => {});
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, videoUrl]);

  return (
    <>
      <mesh geometry={geom} onPointerUp={onQuadClick} renderOrder={2}>
        <meshBasicMaterial
          map={texture ?? undefined}
          color={texture ? "#ffffff" : "#0a0a0a"}
          side={THREE.DoubleSide}
          transparent={!texture}
          opacity={texture ? 1 : 0.7}
          depthTest={true}
          depthWrite={false}
        />
      </mesh>
      {/* Editor-mode selection ring so authors can see the media quad's
          outline while positioning it. Hidden in preview. */}
      {editable && (
        <lineSegments renderOrder={3} onUpdate={(l) => (l.frustumCulled = false)}>
          <bufferGeometry
            attach="geometry"
            {...quadEdgeSegments(insetPoints)}
          />
          <lineBasicMaterial
            attach="material"
            color={selected ? "#22d3ee" : "#ffffff"}
            transparent
            opacity={selected ? 0.9 : 0.35}
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      )}
      {/* Fullscreen viewer moved to TourPlayer.
       *  We can't render DOM elements (especially <video>) inline here —
       *  even inside a createPortal — because the surrounding tree is
       *  reconciled by @react-three/fiber, which tries to construct a
       *  THREE.Video object from the <video> tag and blows up.
       *  Instead, on click we fire a window event and TourPlayer (which
       *  lives OUTSIDE the Canvas) renders the fullscreen overlay in a
       *  plain React DOM tree. See TourPlayer's PolygonFullscreenViewer. */}
    </>
  );
}

/* ------------------------------------------------------------------------ *
 *  PolygonVertexHandles — draggable dot at each polygon vertex.
 *
 *  Renders a small circular marker via drei's <Html> so the DOM handles
 *  hover / cursor / pointer-capture. On drag, we cast a ray from the
 *  mouse position onto the sphere at HOTSPOT_RADIUS and read back
 *  yaw/pitch. Each frame of drag dispatches a `factour:polygon-point`
 *  window event; the tour editor listens and updates the polygon_points
 *  array live. Drop = final event with `commit: true` for the editor's
 *  persistence layer.
 * ------------------------------------------------------------------------ */
function PolygonVertexHandles({
  hotspotId,
  points,
}: {
  hotspotId: string;
  points: { yaw: number; pitch: number }[];
}) {
  const { camera, gl, raycaster } = useThree();
  // Reusable sphere used only for the drag hit test — bigger than the
  // panorama sphere so drag stays smooth even when the user pulls
  // slightly past the visible surface.
  const dragSphere = useMemo(
    () => new THREE.Sphere(new THREE.Vector3(0, 0, 0), HOTSPOT_RADIUS),
    []
  );
  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragIdx.current == null) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      const didHit = raycaster.ray.intersectSphere(dragSphere, hit);
      if (!didHit) return;
      // Convert world position → (yaw, pitch). Matches the inverse of
      // sphericalToVec3: yaw = atan2(x, z), pitch = asin(y / R).
      const yaw = Math.atan2(hit.x, hit.z);
      const pitch = Math.asin(Math.max(-1, Math.min(1, hit.y / hit.length())));
      window.dispatchEvent(
        new CustomEvent("factour:polygon-point", {
          detail: { hotspotId, idx: dragIdx.current, yaw, pitch },
        })
      );
    }
    function onUp() {
      if (dragIdx.current == null) return;
      window.dispatchEvent(
        new CustomEvent("factour:polygon-point-commit", {
          detail: { hotspotId, idx: dragIdx.current },
        })
      );
      dragIdx.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [hotspotId, camera, gl, raycaster, dragSphere]);

  return (
    <>
      {points.map((p, i) => {
        const pos = sphericalToVec3(p.yaw, p.pitch);
        // Nudge the handle *inside* the sphere so it hovers slightly
        // above the fill and doesn't get z-clipped by the pano.
        pos.setLength(HOTSPOT_RADIUS - 3);
        return (
          <Html
            key={i}
            position={pos.toArray()}
            center
            distanceFactor={400}
            zIndexRange={[100, 90]}
            style={{ pointerEvents: "auto" }}
          >
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                dragIdx.current = i;
              }}
              title={`Vertex ${i + 1} — drag to reposition`}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#22d3ee",
                border: "2px solid #fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                cursor: "grab",
                touchAction: "none",
              }}
            />
          </Html>
        );
      })}
    </>
  );
}

/** Build a line-segments geometry that walks the 4 quad edges — used to
 *  draw the selection outline in edit mode. */
function quadEdgeSegments(pts: THREE.Vector3[]) {
  const g = new THREE.BufferGeometry();
  const arr: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

/** BufferGeometry.setFromPoints produces a line strip; convert to segments so
 *  the react-three-fiber `<lineSegments>` renders correctly. */
function strokeGeomAsSegments(strip: THREE.BufferGeometry) {
  const posAttr = strip.getAttribute("position") as THREE.BufferAttribute;
  if (!posAttr) return {};
  const pts: number[] = [];
  const count = posAttr.count;
  for (let i = 0; i < count - 1; i++) {
    pts.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    pts.push(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
