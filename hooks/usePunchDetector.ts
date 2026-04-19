"use client";

import { useCallback, useEffect, useRef } from "react";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import {
  type HandMetrics,
  EMPTY_METRICS,
  RANGES,
  isOff,
  sampleHand,
  wrapAngle,
  UPPERCUT_ROTATION_THRESH,
  UPPERCUT_CHARGE_MS,
  MIN_GUARD_MS,
  UPPERCUT_SIZE_FACTOR,
} from "@/lib/detection/punch";
import type { PoseLandmark } from "@/types";

/**
 * Shared punch detection. Reads hand landmarks from useBodyDetection() and
 * calibration/thresholds from usePunchCalibrationStore. Fires the supplied
 * callback once per punch (per hand) and publishes per-frame metrics + counts
 * to the calibration store so any UI can render them.
 *
 * Hot per-frame mutables (armed flag, cooldown timestamps, last wrist pos for
 * velocity) live here as refs — not in the store — to avoid re-render churn.
 */
export function usePunchDetector(opts: {
  onPunch?: (side: "left" | "right", isUppercut?: boolean) => void;
  /** Fired when a previously-fired hand drops back below thresholds. */
  onRelease?: (side: "left" | "right") => void;
} = {}): {
  onCalibrate: () => void;
  onResetCounts: () => void;
} {
  const body = useBodyDetection();

  // Per-side velocity requires last position + timestamp.
  const lastPos = useRef<{
    left: { x: number; y: number; t: number } | null;
    right: { x: number; y: number; t: number } | null;
  }>({ left: null, right: null });

  // Held timeouts for the 3-2-1 countdown — cleared on cancel/unmount.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // The capture fires ~3s after the button press — read fresh landmarks from
  // a ref so the timeout callback doesn't close over stale state.
  const latestHandsRef = useRef<{
    left: PoseLandmark[] | null;
    right: PoseLandmark[] | null;
  }>({ left: null, right: null });

  // Single-fire lock so a held punch doesn't count continuously while the
  // thresholds remain met; flips back to armed once thresholds drop.
  const armed = useRef<{ left: boolean; right: boolean }>({
    left: true,
    right: true,
  });

  // Per-hand cooldown timestamp.
  const lastFire = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  // Uppercut state machine refs — hot mutables, not in the store.
  const isUppercutModeRef = useRef(false);
  const uppercutChargeStartRef = useRef<number | null>(null);
  const guardHeldSinceRef = useRef<number | null>(null);

  // Ref-stable onPunch so the detection effect's dep array doesn't churn.
  const onPunchRef = useRef(opts.onPunch);
  const onReleaseRef = useRef(opts.onRelease);
  useEffect(() => {
    onPunchRef.current = opts.onPunch;
  }, [opts.onPunch]);
  useEffect(() => {
    onReleaseRef.current = opts.onRelease;
  }, [opts.onRelease]);

  useEffect(() => {
    latestHandsRef.current = {
      left: body.leftHandLandmarks,
      right: body.rightHandLandmarks,
    };
  }, [body.leftHandLandmarks, body.rightHandLandmarks]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  const capture = useCallback(() => {
    const store = usePunchCalibrationStore.getState();
    const l = sampleHand(latestHandsRef.current.left);
    const r = sampleHand(latestHandsRef.current.right);
    if (!l && !r) {
      store.setCalibrateMsg("No hand visible — raise your guard in frame.");
      return;
    }
    store.setBaselineSides(l, r);
    store.resetCounts();
    armed.current = { left: true, right: true };
    lastFire.current = { left: 0, right: 0 };
    store.setCalibrateMsg(null);
  }, []);

  const cancelCountdown = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    usePunchCalibrationStore.getState().setCountdown(null);
  }, []);

  const onCalibrate = useCallback(() => {
    // Re-pressing during the countdown cancels it.
    if (timersRef.current.length > 0) {
      cancelCountdown();
      return;
    }
    const store = usePunchCalibrationStore.getState();
    store.setCalibrateMsg(null);
    store.setCountdown(3);
    timersRef.current.push(
      setTimeout(() => usePunchCalibrationStore.getState().setCountdown(2), 1000),
      setTimeout(() => usePunchCalibrationStore.getState().setCountdown(1), 2000),
      setTimeout(() => {
        timersRef.current = [];
        usePunchCalibrationStore.getState().setCountdown(null);
        capture();
      }, 3000),
    );
  }, [cancelCountdown, capture]);

  const onResetCounts = useCallback(() => {
    usePunchCalibrationStore.getState().resetCounts();
    armed.current = { left: true, right: true };
    lastFire.current = { left: 0, right: 0 };
    isUppercutModeRef.current = false;
    uppercutChargeStartRef.current = null;
    guardHeldSinceRef.current = null;
  }, []);

  // Detection tick — reruns whenever hand landmarks change. Thresholds +
  // baseline are read via getState() inside the effect so the effect doesn't
  // re-subscribe on every slider change.
  useEffect(() => {
    const store = usePunchCalibrationStore.getState();
    const { active, baseline } = store;
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
      const sizeRatioVsBase = base
        ? sample.knuckleSpan / Math.max(base.pinkySegment, 1e-4)
        : 0;
      const rotDelta = base
        ? Math.abs(wrapAngle(sample.rotation - base.rotation))
        : 0;

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
        ? Math.hypot(
            sample.wristX - base.wristX,
            sample.wristY - base.wristY,
          ) <= active.guard
        : false;

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
        const effectiveSize = uppercutMode ? active.size * UPPERCUT_SIZE_FACTOR : active.size;
        if (m.size < effectiveSize) return false;
      }
      return true;
    };

    const lm = compute("left", body.leftHandLandmarks);
    const rm = compute("right", body.rightHandLandmarks);

    const nowMs = performance.now();
    const mutate = usePunchCalibrationStore.getState();

    // Guard hold tracking — gates uppercut charge start.
    if (lm.inGuard || rm.inGuard) {
      if (guardHeldSinceRef.current === null) guardHeldSinceRef.current = nowMs;
    } else {
      guardHeldSinceRef.current = null;
    }
    const guardReady =
      guardHeldSinceRef.current !== null &&
      nowMs - guardHeldSinceRef.current >= MIN_GUARD_MS;

    // Uppercut charge state machine.
    const bothFacing = lm.knucklesFacing && rm.knucklesFacing;
    if (bothFacing && !isUppercutModeRef.current && guardReady) {
      if (uppercutChargeStartRef.current === null) uppercutChargeStartRef.current = nowMs;
      const elapsed = nowMs - uppercutChargeStartRef.current;
      const progress = Math.min(1, elapsed / UPPERCUT_CHARGE_MS);
      mutate.setChargeProgress(progress);
      if (elapsed >= UPPERCUT_CHARGE_MS) {
        isUppercutModeRef.current = true;
        mutate.setIsUppercutMode(true);
        uppercutChargeStartRef.current = null;
        mutate.setChargeProgress(0);
      }
    } else {
      if (!isUppercutModeRef.current) mutate.setChargeProgress(0);
      uppercutChargeStartRef.current = null;
    }

    const inUppercut = isUppercutModeRef.current;

    if (fires(lm, inUppercut)) {
      if (armed.current.left && nowMs - lastFire.current.left >= active.cooldown) {
        mutate.setLeftCount((c) => c + 1);
        if (inUppercut) {
          mutate.setUppercutCount((c) => c + 1);
          isUppercutModeRef.current = false;
          mutate.setIsUppercutMode(false);
        }
        armed.current.left = false;
        lastFire.current.left = nowMs;
        onPunchRef.current?.("left", inUppercut);
      }
    } else {
      // Transition from un-armed (still in a fired punch) → armed is the
      // release signal: the user's fist dropped back below thresholds.
      if (!armed.current.left) {
        armed.current.left = true;
        onReleaseRef.current?.("left");
      }
    }

    if (fires(rm, inUppercut)) {
      if (armed.current.right && nowMs - lastFire.current.right >= active.cooldown) {
        mutate.setRightCount((c) => c + 1);
        if (inUppercut) {
          mutate.setUppercutCount((c) => c + 1);
          isUppercutModeRef.current = false;
          mutate.setIsUppercutMode(false);
        }
        armed.current.right = false;
        lastFire.current.right = nowMs;
        onPunchRef.current?.("right", inUppercut);
      }
    } else {
      if (!armed.current.right) {
        armed.current.right = true;
        onReleaseRef.current?.("right");
      }
    }

    mutate.setLeftMetrics(lm);
    mutate.setRightMetrics(rm);
  }, [body.leftHandLandmarks, body.rightHandLandmarks]);

  return { onCalibrate, onResetCounts };
}
