"use client";

/**
 * SceneTransition — WebGL scene-swap animation between two 360° scenes.
 *
 * Two modes, one code path:
 *
 *   • CINEMATIC (nav-hotspots, auto-tour) — full Google-Earth-style
 *     fly-through: camera dolly forward-and-back, FOV whip, alpha
 *     crossfade of the target sphere, and a SLERP of the camera aim in
 *     the final 25% so the user lands facing the target scene's saved
 *     initial view. Feels like "walking into the next room". ~1100ms.
 *
 *   • QUICK (scene strip, menu) — no camera motion, no FOV whip. Just a
 *     ~300ms alpha crossfade with the full-duration SLERP so the target
 *     scene appears at its saved initial view without a hard cut. Kills
 *     the perceived lag of instant swaps without adding a heavy
 *     animation the user has to sit through.
 *
 * Architecture:
 *   1. Async-loads the target panorama (module-level cache — reused
 *      across mounts so preloaded scenes are instant).
 *   2. Renders a second BackSide sphere at a slightly smaller radius so
 *      it naturally occludes the main sphere once fully opaque.
 *   3. useFrame drives all animations from a single elapsed-time scalar
 *      so dropped frames just skip ahead on the timeline (no jitter).
 *   4. Fires onComplete when elapsed >= duration. Parent commits the
 *      real scene swap at that moment; because the target sphere is
 *      fully opaque with the target's texture AND the camera is already
 *      at the target's aim (via SLERP), the swap under it is invisible.
 *
 * Wobble prevention:
 *   OrbitControls' per-frame update() re-derives the camera pose from an
 *   internal spherical, which fought our position writes. We DISABLE
 *   OrbitControls for the whole transition via setOrbitEnabled(false)
 *   and re-enable at the end after the final pose is restored.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SPHERE_RADIUS, sphericalToVec3 } from "./math";

const TRANSITION_SPHERE_RADIUS = SPHERE_RADIUS - 2;
const EPS = 0.01; // camera radius from origin — matches Canvas init pose

const textureCache = new Map<string, THREE.Texture>();

function loadTexture(url: string, mirrored: boolean): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        if (!mirrored) {
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.x = -1;
          t.offset.x = 1;
        } else {
          t.wrapS = THREE.ClampToEdgeWrapping;
          t.repeat.x = 1;
          t.offset.x = 0;
        }
        t.needsUpdate = true;
        textureCache.set(url, t);
        resolve(t);
      },
      undefined,
      reject
    );
  });
}

/* ----------------------------- Easing helpers --------------------------- */

/** Smoothstep — Hermite polynomial with zero derivatives at 0 and 1.
 *  Natural fade-in/out shape with no acceleration seam at the edges. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Bell curve — 0 at t=0, 1 at t=0.5, 0 at t=1. Clean slow-accelerate /
 *  slow-decelerate profile for dolly + FOV animations that start and
 *  end at rest. */
function bell(t: number): number {
  return Math.sin(t * Math.PI);
}

/* ================================ Component ============================== */

export default function SceneTransition({
  targetUrl,
  durationMs,
  cinematic,
  direction,
  targetAim,
  mirrored,
  levelCorrection,
  setOrbitEnabled,
  onComplete,
}: {
  targetUrl: string;
  durationMs: number;
  /** True → dolly + FOV whip + late-stage SLERP (nav hotspot).
   *  False → alpha crossfade only + full-duration SLERP (manual swap). */
  cinematic: boolean;
  /** Nav-hotspot direction to dolly toward, in radians. Ignored when
   *  cinematic=false (no dolly in quick mode). */
  direction: { yaw: number; pitch: number } | null;
  /** Target scene's saved initial view. Camera SLERPs to this aim so the
   *  swap lands facing the "front" of the new scene, not wherever the
   *  user happened to be looking. Null → no aim change (stay at current). */
  targetAim: { yaw: number; pitch: number } | null;
  mirrored: boolean;
  /** Kept in sync with the main sphere so horizons don't shift mid-fade. */
  levelCorrection: number;
  /** Toggles OrbitControls. Set false at start so our per-frame writes
   *  aren't overridden; set true at end after pose is restored. */
  setOrbitEnabled?: (enabled: boolean) => void;
  onComplete: () => void;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { camera } = useThree();

  // Captured baseline pose — restored at t=1 so orbit re-enables cleanly.
  const baseFovRef = useRef<number>((camera as THREE.PerspectiveCamera).fov);
  const baseAimDirRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const targetAimDirRef = useRef<THREE.Vector3 | null>(null);
  const dollyDirRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Load target texture.
  useEffect(() => {
    let cancelled = false;
    loadTexture(targetUrl, mirrored)
      .then((t) => {
        if (!cancelled) setTexture(t);
      })
      .catch(() => {
        if (!cancelled) onComplete();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUrl, mirrored]);

  // Once texture is ready, capture baseline camera state + disable orbit.
  // Note: setOrbitEnabled is intentionally excluded from deps (it's a
  // fresh arrow function every parent render; including it would re-fire
  // this effect and reset baselines mid-transition).
  useEffect(() => {
    if (!texture) return;
    startTimeRef.current = performance.now();
    completedRef.current = false;
    baseFovRef.current = (camera as THREE.PerspectiveCamera).fov;

    // Aim direction = -position/|position| (camera looks at origin).
    // Fallback to +Z if camera is at origin exactly (shouldn't happen).
    const pos = camera.position;
    if (pos.lengthSq() > 1e-8) {
      baseAimDirRef.current.copy(pos).negate().normalize();
    } else {
      baseAimDirRef.current.set(0, 0, -1);
    }

    if (targetAim) {
      const t = sphericalToVec3(targetAim.yaw, targetAim.pitch, 1);
      if (!targetAimDirRef.current) {
        targetAimDirRef.current = new THREE.Vector3();
      }
      targetAimDirRef.current.set(t.x, t.y, t.z).normalize();
    } else {
      targetAimDirRef.current = null;
    }

    if (cinematic && direction) {
      const d = sphericalToVec3(direction.yaw, direction.pitch, 1);
      dollyDirRef.current.set(d.x, d.y, d.z).normalize();
    } else {
      // No dolly direction needed — copy aim so any residual dolly stays
      // along a sensible axis.
      dollyDirRef.current.copy(baseAimDirRef.current);
    }

    setOrbitEnabled?.(false);

    return () => {
      // Safety net if this effect re-runs or the component unmounts
      // before completion: leave orbit enabled so the user isn't locked
      // out of the camera.
      setOrbitEnabled?.(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, cinematic, direction, targetAim]);

  useFrame(() => {
    if (
      !startTimeRef.current ||
      !materialRef.current ||
      completedRef.current ||
      !texture
    ) {
      return;
    }

    const elapsed = performance.now() - startTimeRef.current;
    const raw = Math.min(1, elapsed / durationMs);

    // ---- Alpha crossfade ----
    // Cinematic starts the fade slightly later (t=0.15) so the outgoing
    // scene is fully visible for a beat; quick mode fades from t=0.05
    // for near-immediate response.
    const fadeStart = cinematic ? 0.15 : 0.05;
    const fadeEnd = cinematic ? 0.9 : 0.9;
    materialRef.current.opacity = smoothstep(fadeStart, fadeEnd, raw);

    // ---- Aim SLERP ----
    // Cinematic: SLERPs in the final 25%, so early motion feels like
    // "walking through the door" (preserved aim + dolly), and the last
    // beat re-orients to face the new scene's "front".
    // Quick: SLERPs over the full duration, so the whole 300ms is
    // spent smoothly re-aiming.
    const aimT = targetAimDirRef.current
      ? smoothstep(cinematic ? 0.75 : 0.0, 1.0, raw)
      : 0;
    const aimDir = targetAimDirRef.current
      ? new THREE.Vector3()
          .lerpVectors(baseAimDirRef.current, targetAimDirRef.current, aimT)
          .normalize()
      : baseAimDirRef.current;

    // Base camera position from aim direction (radius EPS from origin).
    const basePos = new THREE.Vector3()
      .copy(aimDir)
      .multiplyScalar(-EPS);

    // ---- Camera dolly (cinematic only) ----
    // Small forward-and-back bell curve. Only in cinematic mode — quick
    // swaps stay still because any dolly at 300ms feels rushed.
    if (cinematic) {
      const dolly = bell(raw) * 0.12;
      basePos.add(dollyDirRef.current.clone().multiplyScalar(dolly));
    }

    camera.position.copy(basePos);
    camera.lookAt(0, 0, 0);

    // ---- FOV whip (cinematic only) ----
    const cam = camera as THREE.PerspectiveCamera;
    if (cinematic) {
      cam.fov = baseFovRef.current + bell(raw) * 5;
      cam.updateProjectionMatrix();
    }

    // ---- Completion ----
    if (raw >= 1) {
      completedRef.current = true;
      // Snap to exact final pose: at target aim (if provided), radius EPS,
      // FOV restored. This is what OrbitControls picks up when re-enabled.
      const finalDir = targetAimDirRef.current ?? baseAimDirRef.current;
      camera.position.copy(finalDir).multiplyScalar(-EPS);
      camera.lookAt(0, 0, 0);
      cam.fov = baseFovRef.current;
      cam.updateProjectionMatrix();
      setOrbitEnabled?.(true);
      onComplete();
    }
  });

  const groupRotation = useMemo(
    () => [0, 0, levelCorrection] as [number, number, number],
    [levelCorrection]
  );

  if (!texture) return null;

  return (
    <group rotation={groupRotation}>
      <mesh renderOrder={5}>
        <sphereGeometry args={[TRANSITION_SPHERE_RADIUS, 64, 40]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          side={THREE.BackSide}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
