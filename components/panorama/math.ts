import * as THREE from "three";

export const SPHERE_RADIUS = 500;
export const HOTSPOT_RADIUS = 490;

/** yaw (around Y, 0..2π) + pitch (-π/2..π/2) → cartesian on sphere of given radius */
export function sphericalToVec3(
  yaw: number,
  pitch: number,
  radius = HOTSPOT_RADIUS
): THREE.Vector3 {
  const x = radius * Math.cos(pitch) * Math.sin(yaw);
  const y = radius * Math.sin(pitch);
  const z = radius * Math.cos(pitch) * Math.cos(yaw);
  return new THREE.Vector3(x, y, z);
}

/** cartesian → yaw/pitch */
export function vec3ToSpherical(v: THREE.Vector3): {
  yaw: number;
  pitch: number;
} {
  const r = v.length();
  const pitch = Math.asin(v.y / r);
  const yaw = Math.atan2(v.x, v.z);
  return { yaw, pitch };
}
