"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import BodyDetector from "@/components/detection/BodyDetector";
import { CalibrateGuardPanel } from "@/components/detection/CalibrateGuardPanel";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import type { PoseLandmark } from "@/types";

// ---------- types ----------

type Params = {
  size: number;      // 0 = off; required fist-growth ratio vs calibrated baseline
  rotation: number;  // 0 = off; required |Δ| in radians from calibrated wrist rotation
  velocity: number;  // 0 = off; required wrist speed (normalized-image units / sec)
  guard: number;     // wrist-to-calibrated-guard tolerance (normalized-image distance)
  cooldown: number;  // ms — same-hand min gap between consecutive punches (0 = no gap)
};

type HandSample = {
  /** Length of the pinky's MCP→PIP segment (lm 17→18). Intrinsic to the
   *  user's hand, captured at calibration time and used as a scale reference
   *  for the punch-size check. */
  pinkySegment: number;
  /** Width across the knuckles: index MCP → pinky MCP (lm 5→17). Appears
   *  long when the fist faces the camera (pronated, knuckles forward) and
   *  collapses when the hand turns sideways. Drives the size check at
   *  runtime. */
  knuckleSpan: number;
  rotation: number;
  wristX: number;
  wristY: number;
};

type Baseline = { left: HandSample | null; right: HandSample | null };

type HandMetrics = {
  detected: boolean;
  size: number;
  rotation: number;
  velocity: number;
  sizeRatio: number; // 0..1 — fill ratio for bar; 1 = threshold met
  rotRatio: number;
  velRatio: number;
  sizeMet: boolean;
  rotMet: boolean;
  velMet: boolean;
  inGuard: boolean;
  /** True when the hand has rotated ~90° from calibrated guard — knuckles now facing camera. */
  knucklesFacing: boolean;
};

const EMPTY_METRICS: HandMetrics = {
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

// ---------- constants ----------

const DEFAULTS: Params = {
  size: 3.5,
  rotation: 0, // off
  velocity: 0, // off
  guard: 0.1,
  cooldown: 550,
};

// Uppercut charge: both fists must have rotated this many radians from calibrated guard
// (pinky bone facing camera → knuckles facing camera ≈ 90°). Hold for UPPERCUT_CHARGE_MS.
const UPPERCUT_ROTATION_THRESH = Math.PI * 0.45; // ~81° — slightly under 90° for easier trigger
const UPPERCUT_CHARGE_MS = 1000;
const MIN_GUARD_MS = 500; // must hold guard for this long before charge can start
// In uppercut mode the size threshold is multiplied by this factor (easier to trigger).
const UPPERCUT_SIZE_FACTOR = 0.6;

// offBelow = the slider value at/under which that param is considered "off".
// Guard has no off state — it's always required if calibration exists.
const RANGES = {
  // Size slider is a multiplier: knuckleSpan ≥ size × pinkySegmentBaseline.
  // Default 1.0 matches the user's "larger than pinky segment" rule; raise
  // for a stricter punch.
  size: { min: 0, max: 5, step: 0.05, offBelow: 0.05 as number | null },
  rotation: { min: 0, max: 1.5, step: 0.01, offBelow: 0.02 as number | null },
  velocity: { min: 0, max: 3, step: 0.01, offBelow: 0.02 as number | null },
  guard: { min: 0.02, max: 0.3, step: 0.005, offBelow: null as number | null },
  // Cooldown = 0 is valid (no rate limit at all), so no "off" sentinel.
  cooldown: { min: 0, max: 1500, step: 10, offBelow: null as number | null },
} as const;

type Range = (typeof RANGES)[keyof typeof RANGES];

function isOff(value: number, range: Range): boolean {
  return range.offBelow !== null && value <= range.offBelow;
}

// ---------- math ----------

/**
 * Sample hand landmarks for the three punch signals:
 *   pinkySegment — lm 17→18 (pinky MCP→PIP). Short, intrinsic finger span.
 *                  Captured at calibration as the scale reference.
 *   knuckleSpan  — lm 5→17 (index MCP → pinky MCP). Expands when the fist
 *                  faces the camera (pronated for a straight punch). Size
 *                  threshold fires when knuckleSpan ≥ multiplier × baseline
 *                  pinkySegment.
 *   rotation     — angle of the knuckle line; changes when the wrist
 *                  pronates/supinates during a punch.
 *   wristX/Y     — image-plane wrist position for velocity + guard-match.
 */
function sampleHand(lm: PoseLandmark[] | null): HandSample | null {
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

function wrapAngle(r: number): number {
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

// ---------- arms-only skeleton canvas ----------

// Standard MediaPipe hand skeleton — 21 landmarks, five fingers + palm bridges.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function ArmsSkeletonCanvas() {
  const { videoRef, poseLandmarks, leftHandLandmarks, rightHandLandmarks } =
    useBodyDetection();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const video = videoRef?.current;

    ctx.clearRect(0, 0, width, height);
    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -width, 0, width, height);
      ctx.restore();
    }

    const toX = (x: number) => (1 - x) * width;
    const toY = (y: number) => y * height;

    if (poseLandmarks) {
      const bones: [number, number, string][] = [
        [11, 12, "#ffcc00"],
        [11, 13, "#00ff88"],
        [13, 15, "#00ff88"],
        [12, 14, "#00ccff"],
        [14, 16, "#00ccff"],
      ];
      ctx.lineWidth = 3;
      for (const [a, b, color] of bones) {
        const pa = poseLandmarks[a];
        const pb = poseLandmarks[b];
        if (!pa || !pb) continue;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX(pa.x), toY(pa.y));
        ctx.lineTo(toX(pb.x), toY(pb.y));
        ctx.stroke();
      }
      for (const i of [11, 12, 13, 14, 15, 16]) {
        const p = poseLandmarks[i];
        if (!p) continue;
        ctx.fillStyle =
          i === 11 || i === 12 ? "#ffcc00" : i <= 14 ? "#33ff99" : "#66ddff";
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const [hand, color] of [
      [leftHandLandmarks, "#ff6ad5"],
      [rightHandLandmarks, "#ffd36a"],
    ] as const) {
      if (!hand || hand.length < 21) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = hand[a];
        const pb = hand[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(toX(pa.x), toY(pa.y));
        ctx.lineTo(toX(pb.x), toY(pb.y));
        ctx.stroke();
      }
      ctx.fillStyle = color;
      for (const p of hand) {
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [poseLandmarks, leftHandLandmarks, rightHandLandmarks, videoRef]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 overflow-hidden rounded-lg border border-zinc-700 bg-black shadow-2xl">
      <canvas ref={canvasRef} width={320} height={240} />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
        rig · arms
      </div>
    </div>
  );
}

function PunchTest() {
  const body = useBodyDetection();

  const [pending, setPending] = useState<Params>(DEFAULTS);
  const [active, setActive] = useState<Params>(DEFAULTS);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [leftCount, setLeftCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  const [uppercutCount, setUppercutCount] = useState(0);
  const [leftMetrics, setLeftMetrics] = useState<HandMetrics>(EMPTY_METRICS);
  const [rightMetrics, setRightMetrics] = useState<HandMetrics>(EMPTY_METRICS);
  const [calibrateMsg, setCalibrateMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isUppercutMode, setIsUppercutMode] = useState(false);
  const [chargeProgress, setChargeProgress] = useState(0); // 0..1

  // Per-side velocity requires last position + timestamp. Kept in a ref so it
  // doesn't trigger renders.
  const lastPos = useRef<{
    left: { x: number; y: number; t: number } | null;
    right: { x: number; y: number; t: number } | null;
  }>({ left: null, right: null });

  // Held timeouts for the countdown — cleared if the user cancels or the
  // component unmounts mid-countdown.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // The capture fires ~3s after the button press, so we can't close over
  // `body.*HandLandmarks` from the button handler (it would be 3s stale). A
  // ref holds the latest landmarks so the timeout callback reads fresh data.
  const latestHandsRef = useRef<{
    left: PoseLandmark[] | null;
    right: PoseLandmark[] | null;
  }>({ left: null, right: null });

  // Single-fire lock — stays `true` (armed) until a punch is counted, then
  // flips back to `true` once thresholds fall below (release). Without this
  // a single extended punch would count continuously while thresholds hold.
  const armed = useRef<{ left: boolean; right: boolean }>({ left: true, right: true });

  // Per-hand cooldown (seconds timestamp) — suppresses back-to-back punches
  // from the SAME hand fired faster than COOLDOWN_MS. Cooldowns are
  // independent between hands, so an L→R combo can land with no gap.
  const lastFire = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  // Uppercut mode refs
  const isUppercutModeRef = useRef(false);
  const uppercutChargeStartRef = useRef<number | null>(null);
  // Tracks when both calibrated hands entered guard — uppercut charge is
  // blocked until this timer has run for at least MIN_GUARD_MS.
  const guardHeldSinceRef = useRef<number | null>(null);

  // Keep the ref fresh outside of render — written here (a post-render
  // effect) rather than inline so React's refs-during-render rule stays happy.
  useEffect(() => {
    latestHandsRef.current = {
      left: body.leftHandLandmarks,
      right: body.rightHandLandmarks,
    };
  }, [body.leftHandLandmarks, body.rightHandLandmarks]);

  // Unmount cleanup — drop any pending countdown timers.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  const capture = useCallback(() => {
    const l = sampleHand(latestHandsRef.current.left);
    const r = sampleHand(latestHandsRef.current.right);
    if (!l && !r) {
      setCalibrateMsg("No hand visible — raise your guard in frame.");
      return;
    }
    // Re-calibrating one hand keeps the other side's existing baseline.
    setBaseline((prev) => ({
      left: l ?? prev?.left ?? null,
      right: r ?? prev?.right ?? null,
    }));
    setLeftCount(0);
    setRightCount(0);
    armed.current = { left: true, right: true };
    lastFire.current = { left: 0, right: 0 };
    setCalibrateMsg(null);
  }, []);

  const cancelCountdown = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setCountdown(null);
  }, []);

  const onCalibrate = useCallback(() => {
    // Re-pressing during the countdown cancels it.
    if (timersRef.current.length > 0) {
      cancelCountdown();
      return;
    }
    setCalibrateMsg(null);
    setCountdown(3);
    timersRef.current.push(
      setTimeout(() => setCountdown(2), 1000),
      setTimeout(() => setCountdown(1), 2000),
      setTimeout(() => {
        timersRef.current = [];
        setCountdown(null);
        capture();
      }, 3000),
    );
  }, [cancelCountdown, capture]);

  const onApply = useCallback(() => {
    setActive(pending);
    // Resetting counts on apply would surprise the user — leave them.
    armed.current = { left: true, right: true };
  }, [pending]);

  const onDefaults = useCallback(() => setPending(DEFAULTS), []);
  const onResetCounts = useCallback(() => {
    setLeftCount(0);
    setRightCount(0);
    setUppercutCount(0);
    setIsUppercutMode(false);
    setChargeProgress(0);
    isUppercutModeRef.current = false;
    uppercutChargeStartRef.current = null;
    guardHeldSinceRef.current = null;
    armed.current = { left: true, right: true };
    lastFire.current = { left: 0, right: 0 };
  }, []);

  // Detection tick — runs whenever new hand landmarks arrive from the body
  // tracker (i.e. every frame it publishes).
  useEffect(() => {
    const now = performance.now() / 1000;

    const compute = (
      side: "left" | "right",
      lm: PoseLandmark[] | null,
    ): HandMetrics => {
      const sample = sampleHand(lm);
      if (!sample) {
        lastPos.current[side] = null;
        return EMPTY_METRICS;
      }

      const prev = lastPos.current[side];
      let velocity = 0;
      if (prev) {
        const dt = Math.max(1e-3, now - prev.t);
        velocity =
          Math.hypot(sample.wristX - prev.x, sample.wristY - prev.y) / dt;
      }
      lastPos.current[side] = { x: sample.wristX, y: sample.wristY, t: now };

      const base = baseline?.[side] ?? null;
      // Knuckle-span multiple of the calibrated pinky segment. Punch = span
      // grows past the required multiple (fist rotated flat to camera).
      const sizeRatioVsBase = base
        ? sample.knuckleSpan / Math.max(base.pinkySegment, 1e-4)
        : 0;
      const rotDelta = base ? Math.abs(wrapAngle(sample.rotation - base.rotation)) : 0;

      const sizeEnabled = !isOff(active.size, RANGES.size) && !!base;
      const rotEnabled = !isOff(active.rotation, RANGES.rotation) && !!base;
      const velEnabled = !isOff(active.velocity, RANGES.velocity);

      const sizeRatio = sizeEnabled
        ? Math.max(0, Math.min(1, sizeRatioVsBase / Math.max(active.size, 1e-4)))
        : 0;
      const rotRatio = rotEnabled
        ? Math.max(0, Math.min(1, rotDelta / Math.max(active.rotation, 1e-4)))
        : 0;
      const velRatio = velEnabled
        ? Math.max(0, Math.min(1, velocity / Math.max(active.velocity, 1e-4)))
        : 0;

      const sizeMet = sizeEnabled && sizeRatioVsBase >= active.size;
      const rotMet = rotEnabled && rotDelta >= active.rotation;
      const velMet = velEnabled && velocity >= active.velocity;

      const inGuard = base
        ? Math.hypot(sample.wristX - base.wristX, sample.wristY - base.wristY) <=
          active.guard
        : false;

      // rotDelta is how far the hand has rotated from the calibrated guard.
      // Guard = pinky bone facing camera; ~90° rotation = knuckles facing camera.
      const knucklesFacing = !!base && rotDelta >= UPPERCUT_ROTATION_THRESH;

      return {
        detected: true,
        size: sizeRatioVsBase,
        rotation: sample.rotation,
        velocity,
        sizeRatio,
        rotRatio,
        velRatio,
        sizeMet,
        rotMet,
        velMet,
        inGuard,
        knucklesFacing,
      };
    };

    const sizeReq = !isOff(active.size, RANGES.size);
    const rotReq = !isOff(active.rotation, RANGES.rotation);
    const velReq = !isOff(active.velocity, RANGES.velocity);

    const fires = (m: HandMetrics, uppercutMode: boolean): boolean => {
      if (!m.detected) return false;
      if (!sizeReq && !rotReq && !velReq) return false;
      if (rotReq && !m.rotMet) return false;
      if (velReq && !m.velMet) return false;
      if (sizeReq) {
        // In uppercut mode: lower threshold by UPPERCUT_SIZE_FACTOR
        const effectiveSize = uppercutMode
          ? active.size * UPPERCUT_SIZE_FACTOR
          : active.size;
        const base = baseline?.[(m === lm ? "left" : "right")] ?? null;
        const sample = sampleHand(m === lm ? body.leftHandLandmarks : body.rightHandLandmarks);
        if (!base || !sample) return false;
        const ratio = sample.knuckleSpan / Math.max(base.pinkySegment, 1e-4);
        if (ratio < effectiveSize) return false;
      }
      return true;
    };

    const lm = compute("left", body.leftHandLandmarks);
    const rm = compute("right", body.rightHandLandmarks);

    const nowMs = performance.now();

    // --- Guard hold tracking (gates uppercut charge) ---
    if (lm.inGuard || rm.inGuard) {
      if (guardHeldSinceRef.current === null) guardHeldSinceRef.current = nowMs;
    } else {
      guardHeldSinceRef.current = null;
    }
    const guardReady =
      guardHeldSinceRef.current !== null &&
      nowMs - guardHeldSinceRef.current >= MIN_GUARD_MS;

    // --- Uppercut charge tracking ---
    const bothFacing = lm.knucklesFacing && rm.knucklesFacing;
    if (bothFacing && !isUppercutModeRef.current && guardReady) {
      if (uppercutChargeStartRef.current === null) {
        uppercutChargeStartRef.current = nowMs;
      }
      const elapsed = nowMs - uppercutChargeStartRef.current;
      const progress = Math.min(1, elapsed / UPPERCUT_CHARGE_MS);
      setChargeProgress(progress);
      if (elapsed >= UPPERCUT_CHARGE_MS) {
        isUppercutModeRef.current = true;
        setIsUppercutMode(true);
        uppercutChargeStartRef.current = null;
        setChargeProgress(0);
      }
    } else {
      if (!isUppercutModeRef.current) setChargeProgress(0);
      uppercutChargeStartRef.current = null;
    }

    // --- Punch fire ---
    const inUppercut = isUppercutModeRef.current;
    if (fires(lm, inUppercut)) {
      if (armed.current.left && nowMs - lastFire.current.left >= active.cooldown) {
        setLeftCount((c) => c + 1);
        if (inUppercut) {
          setUppercutCount((c) => c + 1);
          isUppercutModeRef.current = false;
          setIsUppercutMode(false);
        }
        armed.current.left = false;
        lastFire.current.left = nowMs;
      }
    } else {
      armed.current.left = true;
    }
    if (fires(rm, inUppercut)) {
      if (armed.current.right && nowMs - lastFire.current.right >= active.cooldown) {
        setRightCount((c) => c + 1);
        if (inUppercut) {
          setUppercutCount((c) => c + 1);
          isUppercutModeRef.current = false;
          setIsUppercutMode(false);
        }
        armed.current.right = false;
        lastFire.current.right = nowMs;
      }
    } else {
      armed.current.right = true;
    }

    setLeftMetrics(lm);
    setRightMetrics(rm);
  }, [body.leftHandLandmarks, body.rightHandLandmarks, active, baseline]);

  const total = leftCount + rightCount;
  const calibratedLeft = !!baseline?.left;
  const calibratedRight = !!baseline?.right;
  const anyCalibrated = calibratedLeft || calibratedRight;
  // "In guard" means every *calibrated* hand is at its baseline position.
  // Uncalibrated hands don't prevent the banner from firing.
  const inGuard =
    anyCalibrated &&
    (!calibratedLeft || leftMetrics.inGuard) &&
    (!calibratedRight || rightMetrics.inGuard);
  const pendingDirty =
    pending.size !== active.size ||
    pending.rotation !== active.rotation ||
    pending.velocity !== active.velocity ||
    pending.guard !== active.guard ||
    pending.cooldown !== active.cooldown;

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-cyan-400">
            Punch Detection · Test Bench
          </div>
          <h1 className="text-lg font-semibold">Jab / cross / guard tuning</h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
          <span
            className={`h-2 w-2 rounded-full ${body.isReady ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          <span>{body.isReady ? "READY" : "waiting for webcam…"}</span>
          <span className="text-zinc-600">·</span>
          <span>{body.fps} fps</span>
          <Link
            href="/"
            className="ml-3 text-[11px] uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            ← Home
          </Link>
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[360px_1fr]">
        {/* Controls */}
        <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.3em] text-zinc-500">
              Calibration
            </div>
            <button
              type="button"
              onClick={onCalibrate}
              className={`w-full rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-widest ${
                countdown !== null
                  ? "border border-rose-500/60 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                  : "border border-cyan-500/60 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
              }`}
            >
              {countdown !== null
                ? `Cancel · ${countdown}`
                : anyCalibrated
                  ? "Re-calibrate guard"
                  : "Calibrate guard"}
            </button>
            <div className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              {countdown !== null
                ? "Hold your guard — capturing in 3 seconds."
                : anyCalibrated
                  ? `Locked: ${[calibratedLeft && "L", calibratedRight && "R"]
                      .filter(Boolean)
                      .join(" + ")}. Press again to re-capture any visible hand.`
                  : "Hold your guard, then press. Any visible hand is captured."}
              {calibrateMsg && (
                <div className="mt-1 text-rose-400">{calibrateMsg}</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
              Thresholds · far-left = off
            </div>
            <ParamSlider
              label="Size (knuckle × pinky)"
              value={pending.size}
              onChange={(v) => setPending((p) => ({ ...p, size: v }))}
              range={RANGES.size}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <ParamSlider
              label="Rotation (wrist Δ)"
              value={pending.rotation}
              onChange={(v) => setPending((p) => ({ ...p, rotation: v }))}
              range={RANGES.rotation}
              format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
            />
            <ParamSlider
              label="Velocity (wrist speed)"
              value={pending.velocity}
              onChange={(v) => setPending((p) => ({ ...p, velocity: v }))}
              range={RANGES.velocity}
            />
            <ParamSlider
              label="Guard tolerance"
              value={pending.guard}
              onChange={(v) => setPending((p) => ({ ...p, guard: v }))}
              range={RANGES.guard}
              format={(v) => v.toFixed(3)}
            />
            <ParamSlider
              label="Same-hand cooldown"
              value={pending.cooldown}
              onChange={(v) => setPending((p) => ({ ...p, cooldown: v }))}
              range={RANGES.cooldown}
              format={(v) => `${Math.round(v)} ms`}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onApply}
              disabled={!pendingDirty}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest transition ${
                pendingDirty
                  ? "border border-emerald-500/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                  : "cursor-not-allowed border border-zinc-700 bg-zinc-800/50 text-zinc-500"
              }`}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={onDefaults}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800"
            >
              Defaults
            </button>
            <button
              type="button"
              onClick={onResetCounts}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800"
            >
              Reset
            </button>
          </div>

          <div className="rounded-md border border-zinc-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
              Active thresholds
            </div>
            <div>
              size:{" "}
              {isOff(active.size, RANGES.size)
                ? "off"
                : `${active.size.toFixed(2)}×`}
              {"   "}rot:{" "}
              {isOff(active.rotation, RANGES.rotation)
                ? "off"
                : `${Math.round((active.rotation * 180) / Math.PI)}°`}
            </div>
            <div>
              vel:{" "}
              {isOff(active.velocity, RANGES.velocity)
                ? "off"
                : active.velocity.toFixed(2)}
              {"   "}guard: {active.guard.toFixed(3)}
            </div>
            <div>cooldown: {Math.round(active.cooldown)} ms</div>
          </div>
        </div>

        {/* Main panel */}
        <div className="flex flex-col gap-6">
          {/* Count */}
          <div className="relative flex flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/60 px-6 py-8">
            {countdown !== null && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.4em] text-cyan-300">
                  Calibrating in
                </div>
                <div className="mt-1 font-mono text-[140px] font-bold leading-none tabular-nums text-white">
                  {countdown}
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-[0.3em] text-zinc-400">
                  hold your guard
                </div>
              </div>
            )}
            <div className="text-[10px] uppercase tracking-[0.4em] text-zinc-500">
              Total punches
            </div>
            <div className="mt-1 font-mono text-[96px] font-bold leading-none tabular-nums text-white">
              {total}
            </div>
            <div className="mt-4 grid w-full max-w-md grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-emerald-400">Left</div>
                <div className="font-mono text-3xl tabular-nums text-emerald-200">{leftCount}</div>
              </div>
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-cyan-400">Right</div>
                <div className="font-mono text-3xl tabular-nums text-cyan-200">{rightCount}</div>
              </div>
              <div className={`rounded-lg border p-3 text-center transition-colors ${uppercutCount > 0 ? "border-yellow-500/40 bg-yellow-500/10" : "border-zinc-700 bg-zinc-800/30"}`}>
                <div className="text-[10px] uppercase tracking-widest text-yellow-400">Uppercut</div>
                <div className="font-mono text-3xl tabular-nums text-yellow-200">{uppercutCount}</div>
              </div>
            </div>

            {/* Uppercut charge bar */}
            {chargeProgress > 0 && !isUppercutMode && (
              <div className="mt-4 w-full max-w-md">
                <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-yellow-400">
                  Charging uppercut…
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-yellow-400 transition-[width] duration-75"
                    style={{ width: `${chargeProgress * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Uppercut mode banner */}
            {isUppercutMode && (
              <div className="mt-4 animate-pulse rounded-xl border border-yellow-400/60 bg-yellow-400/10 px-6 py-3 text-center">
                <div className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-300">
                  ⚡ Uppercut Mode — Punch Now!
                </div>
                <div className="mt-1 text-[10px] text-yellow-400/70 tracking-wider">
                  threshold lowered · one shot · resets on punch
                </div>
              </div>
            )}

            {/* Guard banner */}
            <div
              className={`mt-5 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] transition-opacity ${
                anyCalibrated
                  ? inGuard
                    ? "bg-emerald-500/20 text-emerald-200 opacity-100"
                    : "bg-zinc-800/50 text-zinc-500 opacity-80"
                  : "bg-amber-500/20 text-amber-200 opacity-100"
              }`}
            >
              {anyCalibrated
                ? inGuard
                  ? "In guard position"
                  : "Out of guard"
                : "Calibrate to enable guard tracking"}
            </div>
          </div>

          {/* Live metric bars */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricsCard side="Left" metrics={leftMetrics} active={active} />
            <MetricsCard side="Right" metrics={rightMetrics} active={active} />
          </div>
        </div>
      </div>

      <ArmsSkeletonCanvas />
    </div>
  );
}

export default function PunchTestPage() {
  return (
    <BodyDetector>
      <PunchTest />
    </BodyDetector>
  );
}
