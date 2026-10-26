"use client";

import { useEffect, useRef, useState } from "react";
import { Ruler, X, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Ruler overlay for a 360 panorama.
 *
 * A single 360 photo captures direction per pixel but not depth. To recover
 * real 3D distance we need an assumption or an anchor to establish depth for
 * every clicked point. This tool exposes four modes that solve that in
 * different ways:
 *
 *   • FLOOR — assume both clicks are on the floor at y = -cameraHeight.
 *     Direct floor-plane intersection. Great for room dimensions, pipes on
 *     the ground, machine footprints.
 *
 *   • WALL — the user first anchors a floor point at the base of the wall.
 *     That fixes the wall's distance from the camera and defines a vertical
 *     plane. Subsequent A / B clicks intersect that plane and give a true 3D
 *     distance across the wall (including diagonals).
 *
 *   • HEIGHT — user picks Base (on floor, known depth) and Top (directly
 *     above the base). We use the base's horizontal distance from the camera
 *     to raycast the top to the same vertical column, then read out its
 *     height above the floor. Great for door heights, machine heights, rack
 *     heights.
 *
 *   • CALIBRATE — pick A / B on the floor of a known-length feature (door
 *     width, standard brick, floor tile, etc.), enter the true distance in
 *     metres, and the tool reverse-solves the scene's camera_height so every
 *     future measurement in this scene is accurate.
 *
 * The `cameraHeight` prop is treated as the current assumed tripod height.
 * Calibrate mutates it (via `onCameraHeightChange` + a Supabase write).
 */

type Mode = "floor" | "wall" | "height" | "calibrate";
type Point = { yaw: number; pitch: number; x: number; y: number };

export default function MeasureTool({
  active,
  onClose,
  cameraHeight,
  sceneId,
  onCameraHeightChange,
  requestPoint,
}: {
  active: boolean;
  onClose: () => void;
  cameraHeight: number;
  /** Scene ID — needed to persist Calibrate results to the scene row. */
  sceneId?: string | null;
  /** Fired after Calibrate finishes writing so the parent can refresh state. */
  onCameraHeightChange?: (newHeight: number) => void;
  /** Async: called on next viewer click, resolves with (yaw,pitch) + screen
   *  coords, or null if cancelled. */
  requestPoint: () => Promise<Point | null>;
}) {
  const [mode, setMode] = useState<Mode>("floor");
  const [anchor, setAnchor] = useState<Point | null>(null); // wall base
  const [a, setA] = useState<Point | null>(null);
  const [b, setB] = useState<Point | null>(null);
  const [waitingFor, setWaitingFor] = useState<
    "anchor" | "a" | "b" | null
  >(null);
  const [calibInput, setCalibInput] = useState("");
  const [calibMsg, setCalibMsg] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(false);

  // Wipe everything when the tool is closed / re-opened, and whenever mode
  // switches (each mode has a different point layout).
  const modeRef = useRef(mode);
  useEffect(() => {
    if (modeRef.current !== mode) {
      modeRef.current = mode;
      setAnchor(null);
      setA(null);
      setB(null);
      setWaitingFor(null);
      setCalibMsg(null);
    }
  }, [mode]);
  useEffect(() => {
    if (!active) {
      setAnchor(null);
      setA(null);
      setB(null);
      setWaitingFor(null);
      setCalibMsg(null);
      setCalibInput("");
    }
  }, [active]);

  async function pick(which: "anchor" | "a" | "b") {
    setWaitingFor(which);
    const p = await requestPoint();
    setWaitingFor(null);
    if (!p) return;
    if (which === "anchor") setAnchor(p);
    if (which === "a") setA(p);
    if (which === "b") setB(p);
  }

  // ------------ distance computed per mode ------------
  let distanceMetres: number | null = null;
  let distanceLabel: string = "";
  let warning: string | null = null;

  if (mode === "floor" || mode === "calibrate") {
    if (a && b) {
      distanceMetres = floorDistance(
        a.yaw,
        a.pitch,
        b.yaw,
        b.pitch,
        cameraHeight
      );
      distanceLabel = "Floor";
    }
  } else if (mode === "wall") {
    if (anchor && a && b) {
      const res = wallDistance(anchor, a, b, cameraHeight);
      distanceMetres = res.distance;
      distanceLabel = "Wall";
      warning = res.warning;
    }
  } else if (mode === "height") {
    if (a && b) {
      const res = heightAboveFloor(a, b, cameraHeight);
      distanceMetres = res.distance;
      distanceLabel = "Height";
      warning = res.warning;
    }
  }

  async function runCalibrate() {
    if (mode !== "calibrate" || !a || !b || !sceneId) return;
    const trueMetres = parseFloat(calibInput);
    if (!isFinite(trueMetres) || trueMetres <= 0) {
      setCalibMsg("Enter a positive number of metres.");
      return;
    }
    const measured = floorDistance(a.yaw, a.pitch, b.yaw, b.pitch, cameraHeight);
    if (measured == null || measured <= 0) {
      setCalibMsg("Both points must be on the floor.");
      return;
    }
    const newHeight = cameraHeight * (trueMetres / measured);
    // Clamp — anything outside 0.3–5m is almost certainly a bad pick, not a
    // real correction.
    const clamped = Math.max(0.3, Math.min(5, newHeight));
    setCalibMsg(
      `was ${cameraHeight.toFixed(2)} m → now ${clamped.toFixed(2)} m ` +
        `(${((clamped / cameraHeight - 1) * 100).toFixed(1)}% adjust). Saved.`
    );
    const { error } = await supabase
      .from("scenes")
      .update({ camera_height: clamped })
      .eq("id", sceneId);
    if (error) {
      setCalibMsg(`Save failed: ${error.message}`);
      return;
    }
    onCameraHeightChange?.(clamped);
  }

  if (!active) return null;

  return (
    <>
      {/* ---- Top control bar ---- */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/85 border border-cyan-500/50 rounded-lg text-white text-xs backdrop-blur-sm flex flex-col overflow-hidden">
        {/* Row 1: mode + close */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Ruler size={14} className="text-cyan-400" />
          <span className="font-medium mr-1">Measure</span>
          <ModeChip
            active={mode === "floor"}
            onClick={() => setMode("floor")}
            label="Floor"
          />
          <ModeChip
            active={mode === "wall"}
            onClick={() => setMode("wall")}
            label="Wall"
          />
          <ModeChip
            active={mode === "height"}
            onClick={() => setMode("height")}
            label="Height"
          />
          <ModeChip
            active={mode === "calibrate"}
            onClick={() => setMode("calibrate")}
            label="Calibrate"
          />
          <div className="flex-1" />
          <button
            onClick={() => setShowRef((v) => !v)}
            className="text-neutral-300 hover:text-white flex items-center gap-1 text-[11px]"
            title="Reference sizes to sanity-check accuracy"
          >
            <Info size={12} />
            ref
          </button>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
            title="Close ruler"
          >
            <X size={14} />
          </button>
        </div>

        {/* Row 2: point buttons + distance */}
        <div className="flex items-center gap-2 px-3 py-2">
          {mode === "wall" && (
            <PickBtn
              label={anchor ? "Anchor ✓" : "Anchor (floor at wall base)"}
              filled={!!anchor}
              waiting={waitingFor === "anchor"}
              onClick={() => pick("anchor")}
            />
          )}
          {mode === "height" ? (
            <>
              <PickBtn
                label={a ? "Base ✓" : "Set Base (on floor)"}
                filled={!!a}
                waiting={waitingFor === "a"}
                onClick={() => pick("a")}
              />
              <PickBtn
                label={b ? "Top ✓" : "Set Top"}
                filled={!!b}
                waiting={waitingFor === "b"}
                disabled={!a}
                onClick={() => pick("b")}
              />
            </>
          ) : (
            <>
              <PickBtn
                label={a ? "Point A ✓" : "Set Point A"}
                filled={!!a}
                waiting={waitingFor === "a"}
                disabled={mode === "wall" && !anchor}
                onClick={() => pick("a")}
              />
              <PickBtn
                label={b ? "Point B ✓" : "Set Point B"}
                filled={!!b}
                waiting={waitingFor === "b"}
                disabled={!a}
                onClick={() => pick("b")}
              />
            </>
          )}

          {distanceMetres != null && (
            <span className="ml-1 px-2 py-1 rounded bg-cyan-400 text-black font-mono font-semibold">
              {formatDistance(distanceMetres)}
              <span className="ml-1 text-[10px] opacity-70">
                {distanceLabel}
              </span>
            </span>
          )}

          {(anchor || a || b) && (
            <button
              onClick={() => {
                setAnchor(null);
                setA(null);
                setB(null);
                setCalibMsg(null);
              }}
              className="ml-1 text-neutral-400 hover:text-white text-[11px]"
            >
              reset
            </button>
          )}
        </div>

        {/* Row 3: calibrate input */}
        {mode === "calibrate" && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10 bg-black/40">
            <span className="text-[11px] text-neutral-300">
              True distance:
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={calibInput}
              onChange={(e) => {
                setCalibInput(e.target.value);
                setCalibMsg(null);
              }}
              placeholder="e.g. 0.9"
              className="w-20 bg-panelSoft border border-border rounded px-2 py-1 text-xs text-cyan-300 font-mono"
            />
            <span className="text-[11px] text-neutral-500">m</span>
            <button
              onClick={runCalibrate}
              disabled={!a || !b || !calibInput || !sceneId}
              className="text-[11px] bg-cyan-400 hover:bg-cyan-300 text-black font-medium px-2 py-1 rounded disabled:opacity-40"
            >
              Calibrate
            </button>
            {calibMsg && (
              <span className="text-[10px] text-cyan-200">{calibMsg}</span>
            )}
          </div>
        )}

        {warning && (
          <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-amber-300 bg-amber-500/10">
            {warning}
          </div>
        )}
      </div>

      {/* ---- SVG overlay: markers + line ---- */}
      <svg
        className="absolute inset-0 pointer-events-none z-20"
        style={{ width: "100%", height: "100%" }}
      >
        {a && b && (
          <line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="rgba(34,211,238,0.95)"
            strokeWidth={3}
            strokeDasharray="6 4"
          />
        )}
        {anchor && a && (
          <line
            x1={anchor.x}
            y1={anchor.y}
            x2={a.x}
            y2={a.y}
            stroke="rgba(250,204,21,0.55)"
            strokeWidth={2}
            strokeDasharray="3 3"
          />
        )}
        {anchor && (
          <Marker
            x={anchor.x}
            y={anchor.y}
            label="⚓"
            fill="rgb(250,204,21)"
            halo="rgba(250,204,21,0.25)"
          />
        )}
        {a && (
          <Marker
            x={a.x}
            y={a.y}
            label={mode === "height" ? "Base" : "A"}
          />
        )}
        {b && (
          <Marker
            x={b.x}
            y={b.y}
            label={mode === "height" ? "Top" : "B"}
          />
        )}
      </svg>

      {/* Bottom hint */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 text-[11px] text-white/70 bg-black/60 px-2 py-1 rounded">
        {modeHint(mode)} · camera height: {cameraHeight.toFixed(2)} m
      </div>

      {/* Reference sizes cheat sheet */}
      {showRef && (
        <div className="absolute top-24 right-3 z-30 bg-black/85 border border-cyan-500/40 rounded-lg text-white text-[11px] px-3 py-2.5 max-w-[240px] backdrop-blur-sm">
          <div className="font-semibold mb-1.5 text-cyan-300">
            Reference sizes (sanity check)
          </div>
          <ul className="space-y-1 text-neutral-300">
            <li>Standard door width — <span className="text-white">0.90 m</span></li>
            <li>Standard door height — <span className="text-white">2.03 m</span></li>
            <li>Standard brick (long side) — <span className="text-white">0.24 m</span></li>
            <li>EU pallet — <span className="text-white">1.20 × 0.80 m</span></li>
            <li>US pallet — <span className="text-white">1.22 × 1.02 m</span></li>
            <li>Fire extinguisher (6kg) — <span className="text-white">0.55 m tall</span></li>
            <li>Chair seat height — <span className="text-white">0.45 m</span></li>
          </ul>
          <div className="mt-2 text-[10px] text-neutral-400">
            Measure one of these in Floor mode. If it&rsquo;s off, use
            <span className="text-cyan-300"> Calibrate</span> with the true
            value.
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------- UI atoms ------------------------------- */

function ModeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
        active
          ? "bg-cyan-500/25 border-cyan-400 text-cyan-100"
          : "border-white/20 text-neutral-300 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function PickBtn({
  label,
  filled,
  waiting,
  disabled,
  onClick,
}: {
  label: string;
  filled: boolean;
  waiting: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded border text-[11px] transition-colors ${
        filled
          ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
          : waiting
          ? "border-cyan-300 bg-cyan-400 text-black animate-pulse"
          : "border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
      }`}
    >
      {label}
    </button>
  );
}

function Marker({
  x,
  y,
  label,
  fill = "rgb(34,211,238)",
  halo = "rgba(34,211,238,0.25)",
}: {
  x: number;
  y: number;
  label: string;
  fill?: string;
  halo?: string;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={halo} />
      <circle cx={x} cy={y} r={5} fill={fill} stroke="white" strokeWidth={2} />
      <text
        x={x + 12}
        y={y - 8}
        fill="white"
        stroke="black"
        strokeWidth={3}
        paintOrder="stroke"
        fontSize={12}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
}

function modeHint(mode: Mode): string {
  switch (mode) {
    case "floor":
      return "Both points on the floor";
    case "wall":
      return "Anchor at wall base, then two points on the wall";
    case "height":
      return "Base on the floor, top directly above";
    case "calibrate":
      return "Pick a known-length feature on the floor, enter true length";
  }
}

/* ------------------------------ Formatting ------------------------------ */

function formatDistance(m: number): string {
  if (m < 1) return `${(m * 100).toFixed(1)} cm`;
  if (m < 10) return `${m.toFixed(2)} m`;
  return `${m.toFixed(1)} m`;
}

/* ---------------------------- Geometry helpers -------------------------- */

/** Direction unit vector for a spherical (yaw, pitch) — right-handed, +Z fwd. */
function dirVec(yaw: number, pitch: number) {
  return {
    x: Math.cos(pitch) * Math.sin(yaw),
    y: Math.sin(pitch),
    z: Math.cos(pitch) * Math.cos(yaw),
  };
}

/** Intersect a ray from origin (yaw, pitch) with the floor plane at
 *  y = -cameraHeight. Returns the 3D floor point or null if the ray points
 *  up or horizontal. */
function floorPoint(
  yaw: number,
  pitch: number,
  cameraHeight: number
): { x: number; y: number; z: number } | null {
  const d = dirVec(yaw, pitch);
  if (d.y >= -0.001) return null;
  const t = -cameraHeight / d.y;
  return { x: d.x * t, y: -cameraHeight, z: d.z * t };
}

function floorDistance(
  yawA: number,
  pitchA: number,
  yawB: number,
  pitchB: number,
  cameraHeight: number
): number | null {
  const A = floorPoint(yawA, pitchA, cameraHeight);
  const B = floorPoint(yawB, pitchB, cameraHeight);
  if (!A || !B) return null;
  return Math.hypot(A.x - B.x, A.z - B.z);
}

/** Wall-plane distance: `anchor` is a floor point at the base of the wall.
 *  The wall is the vertical plane through `anchor` whose horizontal normal
 *  points from the camera toward `anchor`. A and B are intersected with that
 *  plane and the true 3D distance is returned. */
function wallDistance(
  anchor: Point,
  a: Point,
  b: Point,
  cameraHeight: number
): { distance: number | null; warning: string | null } {
  const P0 = floorPoint(anchor.yaw, anchor.pitch, cameraHeight);
  if (!P0) {
    return {
      distance: null,
      warning: "Anchor must be on the floor.",
    };
  }
  const horiz = Math.hypot(P0.x, P0.z);
  if (horiz < 0.05) {
    return {
      distance: null,
      warning: "Anchor is directly below the camera — pick further out.",
    };
  }
  const n = { x: P0.x / horiz, y: 0, z: P0.z / horiz }; // horizontal unit normal
  const d = horiz; // camera-to-wall distance
  const resolve = (
    p: Point
  ): { x: number; y: number; z: number } | null => {
    const v = dirVec(p.yaw, p.pitch);
    const dot = n.x * v.x + n.z * v.z; // n.y is 0
    if (dot < 0.01) return null; // ray parallel to or away from wall
    const t = d / dot;
    return { x: v.x * t, y: v.y * t, z: v.z * t };
  };
  const A3 = resolve(a);
  const B3 = resolve(b);
  if (!A3 || !B3) {
    return {
      distance: null,
      warning:
        "One point isn't on the wall (ray went behind the anchor). Try again.",
    };
  }
  return {
    distance: Math.hypot(A3.x - B3.x, A3.y - B3.y, A3.z - B3.z),
    warning: null,
  };
}

/** Base (on floor) + top (above base in the same vertical column). Returns
 *  vertical height between them. If the top's ray is horizontal or points
 *  downward, it can't be above the base. */
function heightAboveFloor(
  base: Point,
  top: Point,
  cameraHeight: number
): { distance: number | null; warning: string | null } {
  const B = floorPoint(base.yaw, base.pitch, cameraHeight);
  if (!B) {
    return { distance: null, warning: "Base must be on the floor." };
  }
  const horizBase = Math.hypot(B.x, B.z);
  if (horizBase < 0.05) {
    return {
      distance: null,
      warning: "Base is right under the camera — pick further out.",
    };
  }
  const v = dirVec(top.yaw, top.pitch);
  const horizV = Math.hypot(v.x, v.z);
  if (horizV < 0.01) {
    return {
      distance: null,
      warning: "Top ray is looking straight up/down — pick a valid top.",
    };
  }
  // Solve for t so that the top ray reaches the base's horizontal position.
  const t = horizBase / horizV;
  const topY = v.y * t;
  const height = topY - B.y; // B.y = -cameraHeight
  if (height < 0) {
    return {
      distance: null,
      warning:
        "Top ended up below the base. Pick a point above the base, not below.",
    };
  }
  return { distance: height, warning: null };
}
