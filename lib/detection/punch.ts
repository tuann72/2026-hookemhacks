import type { PoseLandmark } from "@/types";

// Shared punch-detection types and pure math, extracted from the punch-test
// page so the live detector, the debug panel, and the test page can all
// import from a single source of truth.

export type Params = {
  /** 0 = off. Required fist-growth ratio vs calibrated baseline pinkySegment. */
  size: number;
  /** 0 = off. Required |Δ| in radians from calibrated wrist rotation. */
  rotation: number;
  /** 0 = off. Required wrist speed (normalized-image units / sec). */
  velocity: number;
  /** Wrist-to-calibrated-guard tolerance (normalized-image distance). */
  guard: number;
  /** ms — same-hand min gap between consecutive punches (0 = no gap). */
  cooldown: number;
};

export type HandSample = {
  /** Length of the pinky's MCP→PIP segment (lm 17→18). */
  pinkySegment: number;
  /** Width across the knuckles: index MCP → pinky MCP (lm 5→17). */
  knuckleSpan: number;
  /** Angle of the knuckle line — pronation/supination proxy. */
  rotation: number;
  wristX: number;
  wristY: number;
};

export type Baseline = { left: HandSample | null; right: HandSample | null };

export type HandMetrics = {
  detected: boolean;
  size: number;
  rotation: number;
  velocity: number;
  sizeRatio: number;
  rotRatio: number;
  velRatio: number;
  sizeMet: boolean;
  rotMet: boolean;
  velMet: boolean;
  inGuard: boolean;
  /** True when rotated ~90° from calibrated guard — knuckles facing camera. */
  knucklesFacing: boolean;
};

export const EMPTY_METRICS: HandMetrics = {
  detected: false,
  size: 0,
  rotation: 0,
  velocity: 0,
  sizeRatio: 0,
  rotRatio: 0,
  velRatio: 0,
  sizeMet: false,
  rotMet: false,
  velMet: false,
  inGuard: false,
  knucklesFacing: false,
};

// Uppercut: hold guard for MIN_GUARD_MS, then rotate both fists knuckles-forward
// for UPPERCUT_CHARGE_MS to activate the mode (lowers size threshold by UPPERCUT_SIZE_FACTOR).
export const UPPERCUT_ROTATION_THRESH = Math.PI * 0.45; // ~81°
export const UPPERCUT_CHARGE_MS = 1000;
export const MIN_GUARD_MS = 500;
export const UPPERCUT_SIZE_FACTOR = 0.6;

export const DEFAULTS: Params = {
  size: 3.5,
  rotation: 0,
  velocity: 0,
  guard: 0.1,
  cooldown: 550,
};

export const RANGES = {
  size: { min: 0, max: 5, step: 0.05, offBelow: 0.05 as number | null },
  rotation: { min: 0, max: 1.5, step: 0.01, offBelow: 0.02 as number | null },
  velocity: { min: 0, max: 3, step: 0.01, offBelow: 0.02 as number | null },
  guard: { min: 0.02, max: 0.3, step: 0.005, offBelow: null as number | null },
  cooldown: { min: 0, max: 1500, step: 10, offBelow: null as number | null },
} as const;

export type Range = (typeof RANGES)[keyof typeof RANGES];

export function isOff(value: number, range: Range): boolean {
  return range.offBelow !== null && value <= range.offBelow;
}

export function wrapAngle(r: number): number {
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/**
 * Sample hand landmarks for the three punch signals.
 *   pinkySegment — lm 17→18 (pinky MCP→PIP). Scale reference captured at
 *                  calibration.
 *   knuckleSpan  — lm 5→17 (index MCP → pinky MCP). Expands when the fist
 *                  faces the camera.
 *   rotation     — angle of the knuckle line; changes on pronation/supination.
 *   wristX/Y     — image-plane wrist position for velocity + guard-match.
 */
export function sampleHand(lm: PoseLandmark[] | null): HandSample | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[0];
  const indexMCP = lm[5];
  const pinkyMCP = lm[17];
  const pinkyPIP = lm[18];
  const pinkySegment = Math.hypot(pinkyPIP.x - pinkyMCP.x, pinkyPIP.y - pinkyMCP.y);
  const knuckleSpan = Math.hypot(pinkyMCP.x - indexMCP.x, pinkyMCP.y - indexMCP.y);
  const rotation = Math.atan2(pinkyMCP.y - indexMCP.y, pinkyMCP.x - indexMCP.x);
  return {
    pinkySegment,
    knuckleSpan,
    rotation,
    wristX: wrist.x,
    wristY: wrist.y,
  };
}
