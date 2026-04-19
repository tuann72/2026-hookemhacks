"use client";

import { useCallback } from "react";
import { usePunchDetector } from "@/hooks/usePunchDetector";
import { usePoseStore } from "@/lib/store/poseStore";
import type { PlayerId } from "@/types";

/**
 * Headless detector — mount inside BodyDetector so hand landmarks are
 * available. When a punch fires, writes a transient punchAnim onto the
 * player's pose slot; Avatar.useFrame reads it and overrides the CV rig on
 * the punching arm for the duration.
 *
 * Returns nothing. If the caller also wants to render the debug panel, it
 * should call `usePunchDetector` directly to share the same detector instance
 * (instead of mounting both this component and the hook).
 */
export function PunchDetector({
  playerId,
  punchDurationMs = 400,
}: {
  playerId: PlayerId;
  punchDurationMs?: number;
}) {
  const onPunch = useCallback(
    (side: "left" | "right") => {
      usePoseStore.getState().setPunchAnim(playerId, side, punchDurationMs);
    },
    [playerId, punchDurationMs],
  );
  usePunchDetector({ onPunch });
  return null;
}
