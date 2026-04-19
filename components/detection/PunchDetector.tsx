"use client";

import { useCallback } from "react";
import { usePunchDetector } from "@/hooks/usePunchDetector";
import { usePoseStore } from "@/lib/store/poseStore";
import type { PlayerId } from "@/types";

/**
 * Headless detector — mount inside BodyDetector so hand landmarks are
 * available. When a punch fires, writes a transient punchAnim onto the
 * player's pose slot; Avatar.useFrame reads it and overrides the CV rig on
 * the punching arm. When the hand drops back below the detector's
 * thresholds, marks the punch as released so the arm can retract.
 */
export function PunchDetector({ playerId }: { playerId: PlayerId }) {
  const onPunch = useCallback(
    (side: "left" | "right") => {
      usePoseStore.getState().setPunchAnim(playerId, side);
    },
    [playerId],
  );
  const onRelease = useCallback(
    (side: "left" | "right") => {
      usePoseStore.getState().markPunchReleased(playerId, side);
    },
    [playerId],
  );
  usePunchDetector({ onPunch, onRelease });
  return null;
}
