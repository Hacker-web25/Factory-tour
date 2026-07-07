"use client";

import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Edges } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Hotspot } from "@/lib/types";
import { findIcon } from "@/lib/iconLibrary";
import { fontFor } from "@/lib/fonts";
import {
  SPHERE_RADIUS,
  HOTSPOT_RADIUS,
  sphericalToVec3,
  vec3ToSpherical,
} from "./math";

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
  onRequestAim?: (getAim: () => { yaw: number; pitch: number }) => void;
  onProvideScreenToYawPitch?: (
    fn: (clientX: number, clientY: number) => { yaw: number; pitch: number } | null
  ) => void;
  onHotspotClick?: (h: Hotspot) => void;
  onHotspotDoubleClick?: (h: Hotspot) => void;
  onHotspotDrag?: (id: string, yaw: number, pitch: number) => void;
  initialYaw?: number;
  initialPitch?: number;
};

const DRAG_THRESHOLD_PX = 5;

export default function PanoramaViewer(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 0.01], fov: 75, near: 0.1, far: 1100 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
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
  onRequestAim,
  onProvideScreenToYawPitch,
  onHotspotClick,
  onHotspotDoubleClick,
  onHotspotDrag,
  initialYaw = 0,
  initialPitch = 0,
}: Props) {
  const texture = useLoader(THREE.TextureLoader, imageUrl);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Standard mode: horizontally flip the panorama texture UVs so text reads
  // correctly (compensates for BackSide sphere's built-in flip).
  // Mirrored mode: leave texture unmodified (world stays flipped).
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

  const { camera, gl, raycaster } = useThree();
  const sphereRef = useRef<THREE.Mesh>(null!);
  const orbitRef = useRef<any>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    const target = sphericalToVec3(initialYaw, initialPitch, 100);
    camera.lookAt(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

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

  // Wheel / trackpad-pinch → change FOV (proper panorama zoom).
  // On Mac, trackpad pinch dispatches wheel events with ctrlKey=true;
  // handling both is the same code path.
  useEffect(() => {
    const canvas = gl.domElement;
    const cam = camera as THREE.PerspectiveCamera;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.ctrlKey ? 0.5 : 0.05; // finer step for pinch
      const next = (cam.fov ?? 75) + e.deltaY * factor;
      cam.fov = Math.max(30, Math.min(90, next));
      cam.updateProjectionMatrix();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [gl, camera]);

  return (
    <>
      {/* Sphere is always BackSide-rendered. The mirror/standard difference is
          applied via the panorama TEXTURE's UV transform above — not via mesh
          scale (which culls triangles from inside the sphere). */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[SPHERE_RADIUS, 64, 40]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} />
      </mesh>

      {/* Nadir patch — circular image at the south pole. Sized as a
          percentage of the viewport's angular height so it feels consistent
          across zoom levels. */}
      {nadirImageUrl && (
        <NadirPatch url={nadirImageUrl} sizePct={nadirSize} />
      )}

      {hotspots.map((h) => (
        <HotspotMarker
          key={h.id}
          hotspot={h}
          editable={!!editable}
          selected={selectedHotspotId === h.id}
          mirrored={mirrored}
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
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
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
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const { hotspot: h } = props;

  // Surface image only if we have an image URL
  if (
    h.type === "image" &&
    h.overlay_mode === "surface" &&
    (h.image_url || h.icon_url)
  ) {
    return <SurfaceImage {...props} />;
  }

  return <HtmlBillboard {...props} />;
}

/* --------- Html-based billboard (icons, text, billboard images) ---------- */

function HtmlBillboard({
  hotspot: h,
  selected,
  editable,
  onClick,
  onDoubleClick,
  onDragStart,
}: {
  hotspot: Hotspot;
  selected: boolean;
  editable: boolean;
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

  return (
    <Html
      position={pos.toArray()}
      center
      distanceFactor={400}
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
            <IconOrImage hotspot={h} width={w} height={hh} />
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

/* --------- Surface (2D wall-attached) image ---------- */

/* ---------------------------- Nadir patch ------------------------------ */

function NadirPatch({ url, sizePct }: { url: string; sizePct: number }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const l = new THREE.TextureLoader();
    l.setCrossOrigin("anonymous");
    l.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
    });
  }, [url]);
  if (!tex) return null;
  // Circular disc lying flat at the "south pole" of the sphere.
  const worldSize = (SPHERE_RADIUS * Math.max(5, Math.min(80, sizePct))) / 100;
  return (
    <mesh
      position={[0, -HOTSPOT_RADIUS + 5, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={3}
    >
      <circleGeometry args={[worldSize, 64]} />
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
  const url = h.image_url ?? h.icon_url ?? null;

  // Load texture with an explicit loader (no Suspense) + UV mirror to compensate
  // for the panorama sphere's BackSide flip. This is done at the texture level
  // so it never conflicts with the mesh's world transform.
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setTex(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        if (cancelled) return;
        t.colorSpace = THREE.SRGBColorSpace;
        // No UV flip.
        //
        // Reasoning: `camera.lookAt(+Z)` is effectively a 180° rotation from
        // the default camera pose, which makes the camera's screen-right axis
        // align with world -X (not +X). The plane's basis matrix orients its
        // local +X toward world -X as well. So local +X and screen right
        // point the same way — texture reads correctly without any flip.
        // A prior UV flip was inverting a plane that was already correct.
        t.needsUpdate = true;
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
  }, [url, mirrored]);

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
