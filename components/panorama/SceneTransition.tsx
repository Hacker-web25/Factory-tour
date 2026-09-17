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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SPHERE_RADIUS, sphericalToVec3 } from "./math";

const TRANSITION_SPHERE_RADIUS = SPHERE_RADIUS - 2;
const EPS = 0.01; // camera radius from origin — matches Canvas init pose

// How far the camera dollies forward at the peak of a cinematic
// fly-through, in world units. The sphere radius is 500, so ~150 pushes
// the camera ~30% of the way toward the wall — enough that the world
// genuinely rushes past (a real "moving through space" feel) without
// getting close enough to the texture to look distorted. The old value
// (0.12) was 1000× too small, which is why transitions felt like an
// instant flick instead of a camera move.
const CINEMATIC_DOLLY = 150;
// FOV widening at peak — amplifies the peripheral "speed" sensation.
const CINEMATIC_FOV_WHIP = 14;

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
  dissolve = false,
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
  /** True → cinematic soft-dissolve: no dolly, a gentle FOV breath, a
   *  luminance-lifted cross-dissolve of the incoming scene, and a
   *  full-duration aim settle. Completely independent of the warp path;
   *  when true it takes over the whole animation. */
  dissolve?: boolean;
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
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  // Captured baseline pose — restored at t=1 so orbit re-enables cleanly.
  const baseFovRef = useRef<number>((camera as THREE.PerspectiveCamera).fov);
  const baseAimDirRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const targetAimDirRef = useRef<THREE.Vector3 | null>(null);
  const dollyDirRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  // FREEZE the camera the instant this component mounts — BEFORE the
  // target texture has loaded. This kills the auto-tour "flash": without
  // it, OrbitControls keeps auto-rotating (and the camera-reset effect
  // can fire) during the texture-load gap, so the user sees the camera
  // jump around before the fly-through even starts. We disable orbit and
  // snapshot the current aim right away, then the animation begins from
  // exactly this frozen pose once the texture is ready.
  useLayoutEffect(() => {
    setOrbitEnabled?.(false);
    baseFovRef.current = (camera as THREE.PerspectiveCamera).fov;
    const pos = camera.position;
    if (pos.lengthSq() > 1e-8) {
      baseAimDirRef.current.copy(pos).negate().normalize();
    } else {
      baseAimDirRef.current.set(0, 0, -1);
    }
    return () => {
      // If we unmount before completing, hand control back.
      setOrbitEnabled?.(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // baseFov + baseAimDir were already captured on mount (useLayoutEffect
    // above) so the frozen pose is exactly where the user/auto-tour left
    // the camera — we don't recapture here or we'd pick up any drift
    // during the texture-load gap.

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
      // No explicit direction (auto-tour, menu) → dolly straight along
      // the frozen forward aim so the fly-through still moves through
      // space rather than sitting still.
      dollyDirRef.current.copy(baseAimDirRef.current);
    }
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
    const rawLinear = Math.min(1, elapsed / durationMs);
    // Ease the whole timeline with smoothstep so the transition starts
    // and ends gently — no abrupt onset that reads as a "glitch".
    const raw = smoothstep(0, 1, rawLinear);

    /* ======================= DISSOLVE MODE ==============================
     * A soft film-style cross-dissolve. Independent of the warp path: no
     * forward dolly, no FOV whip. The incoming scene materialises with a
     * luminance-lifted cross-fade while the walls ease inward slightly
     * (a gentle "settle toward you") and the camera does a barely-there
     * FOV breath. Aim settles to the target's front over the full run. */
    if (dissolve) {
      const cam = camera as THREE.PerspectiveCamera;

      // Cross-dissolve: ease-in-out over most of the timeline.
      materialRef.current.opacity = smoothstep(0.05, 0.95, rawLinear);

      // Luminance lift — the incoming scene briefly blooms brighter at the
      // midpoint then settles to neutral, giving the "developing" glow of a
      // classic dissolve. bell() peaks at 0.5. (toneMapped=false lets the
      // >1 channel values read as a soft highlight before clamping.)
      const bloom = 1 + bell(rawLinear) * 0.25;
      materialRef.current.color.setScalar(bloom);

      // Walls ease inward from +4% to rest — subtle parallax that makes the
      // new room feel like it resolves into place rather than hard-cutting.
      if (meshRef.current) {
        const s = 1 + (1 - raw) * 0.04;
        meshRef.current.scale.setScalar(s);
      }

      // Aim settle over the full duration (no late whip).
      const aimT = targetAimDirRef.current ? raw : 0;
      const aimDir = targetAimDirRef.current
        ? new THREE.Vector3()
            .lerpVectors(baseAimDirRef.current, targetAimDirRef.current, aimT)
            .normalize()
        : baseAimDirRef.current.clone();
      const pos = new THREE.Vector3().copy(aimDir).multiplyScalar(-EPS);
      camera.position.copy(pos);
      camera.lookAt(0, 0, 0);

      // Barely-there FOV breath (±3°) so it feels alive, not static.
      cam.fov = baseFovRef.current - bell(rawLinear) * 3;
      cam.updateProjectionMatrix();

      if (rawLinear >= 1) {
        completedRef.current = true;
        const finalDir = targetAimDirRef.current ?? baseAimDirRef.current;
        camera.position.copy(finalDir).multiplyScalar(-EPS);
        camera.lookAt(0, 0, 0);
        cam.fov = baseFovRef.current;
        cam.updateProjectionMatrix();
        materialRef.current.color.setScalar(1);
        if (meshRef.current) meshRef.current.scale.setScalar(1);
        setOrbitEnabled?.(true);
        onComplete();
      }
      return;
    }

    // ---- Alpha crossfade ----
    // Fade the incoming scene across the MIDDLE of the timeline so the
    // outgoing scene is visible during the initial dolly-in and the
    // incoming scene is fully settled before the camera eases to rest.
    const fadeStart = cinematic ? 0.28 : 0.08;
    const fadeEnd = cinematic ? 0.82 : 0.92;
    materialRef.current.opacity = smoothstep(fadeStart, fadeEnd, rawLinear);

    // ---- Aim SLERP ----
    // Cinematic: re-orient across the SECOND HALF (0.5→1) so early motion
    // is a pure forward push (preserved aim + dolly), and the back half
    // smoothly swings to face the new scene's front. Spreading it over
    // half the timeline (vs the old final 25%) removes the late "whip"
    // that felt like a glitch.
    // Quick: SLERP over the full duration.
    const aimT = targetAimDirRef.current
      ? smoothstep(cinematic ? 0.5 : 0.0, 1.0, rawLinear)
      : 0;
    const aimDir = targetAimDirRef.current
      ? new THREE.Vector3()
          .lerpVectors(baseAimDirRef.current, targetAimDirRef.current, aimT)
          .normalize()
      : baseAimDirRef.current.clone();

    // ---- Camera dolly (cinematic only) ----
    // Forward-and-back bell curve ALONG the current view direction, so
    // the world genuinely rushes toward the viewer. CINEMATIC_DOLLY is
    // ~30% of the sphere radius — a real move, not the old imperceptible
    // 0.12 units. Camera keeps LOOKING FORWARD (lookAt a point ahead
    // along aimDir), so dollying off-centre never flips the view.
    const dolly = cinematic ? bell(rawLinear) * CINEMATIC_DOLLY : 0;
    const pos = new THREE.Vector3()
      .copy(aimDir)
      .multiplyScalar(dolly - EPS);
    camera.position.copy(pos);
    const lookTarget = new THREE.Vector3().copy(pos).add(aimDir);
    camera.lookAt(lookTarget);

    // ---- FOV whip (cinematic only) ----
    const cam = camera as THREE.PerspectiveCamera;
    if (cinematic) {
      cam.fov = baseFovRef.current + bell(rawLinear) * CINEMATIC_FOV_WHIP;
      cam.updateProjectionMatrix();
    }

    // ---- Completion ----
    if (rawLinear >= 1) {
      completedRef.current = true;
      // Snap to exact final pose: at target aim, radius EPS, FOV restored,
      // looking at origin — exactly what OrbitControls expects when it
      // re-takes control.
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
      <mesh ref={meshRef} renderOrder={5}>
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
