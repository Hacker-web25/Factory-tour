"use client";

import * as THREE from "three";
import { useMemo, useRef, useState } from "react";
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

  const fillColor = h.polygon_fill_color ?? "#22d3ee";
  const strokeColor = selected
    ? "#ffffff"
    : h.polygon_stroke_color ?? "#22d3ee";
  const fillOpacity = h.polygon_fill_opacity ?? 0.15;
  const strokeWidth = Math.max(1, h.polygon_stroke_width ?? 2);

  return (
    <group ref={groupRef} onPointerDown={handlePointerDown}>
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
        <bufferGeometry attach="geometry" {...strokeGeomAsSegments(strokeGeom)} />
        <lineBasicMaterial
          attach="material"
          color={strokeColor}
          linewidth={strokeWidth}
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
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
