"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Hotspot } from "@/lib/types";
import { HOTSPOT_RADIUS, sphericalToVec3 } from "./math";

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
  const [fullscreen, setFullscreen] = useState(false);
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

  // Image: standard TextureLoader.
  const imageUrl = h.image_url ?? null;
  const [imageTex, setImageTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      imageUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        setImageTex(tex);
      },
      undefined,
      () => {
        /* load error — leave texture null; quad will render dim */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const texture = videoTex ?? imageTex;

  function onQuadClick(e: any) {
    e.stopPropagation?.();
    if (editable) return;
    if (videoUrl && videoRef.current) {
      // Unmute on first click so visitors can hear the video.
      const v = videoRef.current;
      v.muted = !v.muted;
      setMuted(v.muted);
      v.play().catch(() => {});
    } else if (imageUrl) {
      setFullscreen(true);
    }
  }

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
      {/* Fullscreen image viewer — portalled to body so it escapes any
          transform ancestor (the WebGL canvas). */}
      {fullscreen &&
        imageUrl &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="media-hs__fullscreen"
            onClick={() => setFullscreen(false)}
          >
            <button
              className="media-hs__fullscreen-close"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreen(false);
              }}
              aria-label="Close"
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
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
