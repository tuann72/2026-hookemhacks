"use client";

import { useRef, useCallback } from "react";
import type { ArmState } from "@/types";

// Minimum wrist velocity (units/sec normalized by /6) to count as a punch swing.
const PUNCH_SPEED = 0.3;
// Elbow must be at least this extended (degrees) — filters out tight guard posture.
const PUNCH_ELBOW_MIN = 130;
// Wrist must be at least this high relative to shoulder — rules out low arm drops.
const PUNCH_HEIGHT_MIN = 0.2;
// Minimum ms between consecutive punches on the same arm.
const PUNCH_COOLDOWN_MS = 600;

export function useEventTracker() {
  // Per-side cooldown timestamps
  const cooldownRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  // Running totals for the entire session
  const totalRef = useRef<Record<string, number>>({});
  // Counts since the last rollChunk() call
  const chunkRef = useRef<Record<string, number>>({});

  const detect = useCallback((left: ArmState | null, right: ArmState | null) => {
    const now = Date.now();

    if (isPunch(left) && now - cooldownRef.current.left > PUNCH_COOLDOWN_MS) {
      cooldownRef.current.left = now;
      chunkRef.current.punch = (chunkRef.current.punch ?? 0) + 1;
      totalRef.current.punch = (totalRef.current.punch ?? 0) + 1;
    }

    if (isPunch(right) && now - cooldownRef.current.right > PUNCH_COOLDOWN_MS) {
      cooldownRef.current.right = now;
      chunkRef.current.punch = (chunkRef.current.punch ?? 0) + 1;
      totalRef.current.punch = (totalRef.current.punch ?? 0) + 1;
    }
  }, []);

  // Call when a new chunk boundary fires. Returns counts for the just-finished chunk.
  const rollChunk = useCallback((): Record<string, number> => {
    const counts = { ...chunkRef.current };
    chunkRef.current = {};
    return counts;
  }, []);

  const getTotals = useCallback(() => ({ ...totalRef.current }), []);

  return { detect, rollChunk, getTotals };
}

function isPunch(arm: ArmState | null): boolean {
  if (!arm) return false;
  return (
    arm.swingSpeed > PUNCH_SPEED &&
    arm.elbowAngle > PUNCH_ELBOW_MIN &&
    arm.raisedHeight > PUNCH_HEIGHT_MIN
  );
}
