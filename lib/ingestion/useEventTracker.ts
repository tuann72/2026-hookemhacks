"use client";

import { useRef, useCallback, useState } from "react";
import type { PoseLandmark } from "@/types";
import type { ActionEvent } from "./types";

// Knuckle span (lm 5→17) must be this many × the calibrated pinky segment
// (lm 17→18) to count as a punch. Mirrors the punch-test default.
const PUNCH_SIZE = 3.5;
// Wrist must return within this normalized-image distance of the calibrated
// guard position before the next punch on that hand can fire.
const GUARD_TOLERANCE = 0.1;
const PUNCH_COOLDOWN_MS = 550;

type Baseline = {
  pinkySegment: number;
  wristX: number;
  wristY: number;
};

function sampleBaseline(lm: PoseLandmark[] | null): Baseline | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[0];
  const pinkyMCP = lm[17];
  const pinkyPIP = lm[18];
  const pinkySegment = Math.hypot(pinkyPIP.x - pinkyMCP.x, pinkyPIP.y - pinkyMCP.y);
  return { pinkySegment, wristX: wrist.x, wristY: wrist.y };
}

export function useEventTracker() {
  const baselineRef = useRef<{ left: Baseline | null; right: Baseline | null }>({
    left: null,
    right: null,
  });
  // A punch fires once per extension; rearms when hand returns near guard.
  const armedRef = useRef<{ left: boolean; right: boolean }>({ left: true, right: true });
  const lastFireRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  const totalRef = useRef<Record<string, number>>({});
  const chunkRef = useRef<Record<string, number>>({});
  const eventQueueRef = useRef<ActionEvent[]>([]);
  const matchStartRef = useRef<number>(0);

  const [isCalibrated, setIsCalibrated] = useState(false);

  // Call with current hand landmarks while the user is in guard position.
  const calibrate = useCallback(
    (leftHandLm: PoseLandmark[] | null, rightHandLm: PoseLandmark[] | null) => {
      const l = sampleBaseline(leftHandLm);
      const r = sampleBaseline(rightHandLm);
      if (!l && !r) return;
      baselineRef.current = {
        left: l ?? baselineRef.current.left,
        right: r ?? baselineRef.current.right,
      };
      armedRef.current = { left: true, right: true };
      setIsCalibrated(true);
    },
    []
  );

  const detect = useCallback(
    (leftHandLm: PoseLandmark[] | null, rightHandLm: PoseLandmark[] | null) => {
      const now = Date.now();
      if (matchStartRef.current === 0) matchStartRef.current = now;

      const checkSide = (side: "left" | "right", lm: PoseLandmark[] | null) => {
        if (!lm || lm.length < 21) return;
        const base = baselineRef.current[side];
        if (!base) return;

        const wrist = lm[0];
        const indexMCP = lm[5];
        const pinkyMCP = lm[17];
        const knuckleSpan = Math.hypot(
          pinkyMCP.x - indexMCP.x,
          pinkyMCP.y - indexMCP.y
        );

        const inGuard =
          Math.hypot(wrist.x - base.wristX, wrist.y - base.wristY) <= GUARD_TOLERANCE;

        if (inGuard) armedRef.current[side] = true;

        const isPunch = knuckleSpan >= PUNCH_SIZE * base.pinkySegment;

        if (
          isPunch &&
          armedRef.current[side] &&
          now - lastFireRef.current[side] >= PUNCH_COOLDOWN_MS
        ) {
          armedRef.current[side] = false;
          lastFireRef.current[side] = now;
          chunkRef.current.punch = (chunkRef.current.punch ?? 0) + 1;
          totalRef.current.punch = (totalRef.current.punch ?? 0) + 1;
          eventQueueRef.current.push({
            type: "punch",
            occurredAt: now,
            matchTimeMs: now - matchStartRef.current,
          });
        }
      };

      checkSide("left", leftHandLm);
      checkSide("right", rightHandLm);
    },
    []
  );

  const rollChunk = useCallback((): Record<string, number> => {
    const counts = { ...chunkRef.current };
    chunkRef.current = {};
    return counts;
  }, []);

  const drainEvents = useCallback((): ActionEvent[] => {
    const events = eventQueueRef.current;
    eventQueueRef.current = [];
    return events;
  }, []);

  const getTotals = useCallback(() => ({ ...totalRef.current }), []);

  return { detect, calibrate, rollChunk, drainEvents, getTotals, isCalibrated };
}
