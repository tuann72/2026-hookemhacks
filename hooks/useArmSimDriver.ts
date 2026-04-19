"use client";

import { useCallback, useEffect, useRef } from "react";
import { useArmSimStore } from "@/lib/store/armSimStore";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import { applyDamage, PUNCH_DAMAGE_BASE } from "@/lib/combat";
import { broadcastHit } from "@/lib/multiplayer/hitBroadcaster";
import { playHit } from "@/lib/sound/player";
import type { PlayerId } from "@/types";

// Drives the armSim store from CV punch detection + live guard flags.
//
// State machine per side (CV-label → mirrored avatar side):
//   punching → "punch"   (aim at opponent head via Avatar's armSim block)
//   guarding → "guard"   (defensive pose, fist near baseline)
//   neither  → clear     (CV rig drives freely, original behaviour)
//
// Also applies damage (guard-respecting) and optionally broadcasts the hit so
// the peer applies the same damage locally.

export interface UseArmSimDriverOptions {
  /** Self slot in the game/pose stores. Usually SELF_PLAYER_ID. */
  playerId: PlayerId;
  /** Damage target. Usually REMOTE_PLAYER_ID. */
  opponentId: PlayerId;
  /** Broadcast the hit over the realtime channel. True in /game; false in /world. */
  broadcastOnHit?: boolean;
}

export interface UseArmSimDriverResult {
  onPunch: (side: "left" | "right") => void;
  onRelease: (side: "left" | "right") => void;
}

export function useArmSimDriver({
  playerId,
  opponentId,
  broadcastOnHit = false,
}: UseArmSimDriverOptions): UseArmSimDriverResult {
  // Per-side punch-active flag — flipped by onPunch/onRelease.
  const punchingRef = useRef<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  // CV side labels are swapped relative to the avatar rig (see
  // useBodyDetection.ts:160-170), so invert when pushing into armSim.
  const refreshArm = useCallback(
    (cvSide: "left" | "right") => {
      const avatarSide = cvSide === "left" ? "right" : "left";
      const cal = usePunchCalibrationStore.getState();
      const guarding =
        cvSide === "left" ? cal.leftMetrics.inGuard : cal.rightMetrics.inGuard;
      const arm = useArmSimStore.getState();
      if (punchingRef.current[cvSide]) {
        arm.setArm(playerId, avatarSide, "punch");
      } else if (guarding) {
        arm.setArm(playerId, avatarSide, "guard");
      } else {
        arm.clearArm(playerId, avatarSide);
      }
    },
    [playerId],
  );

  const onPunch = useCallback(
    (side: "left" | "right") => {
      punchingRef.current[side] = true;
      refreshArm(side);
      const { amount, guarded } = applyDamage(opponentId, PUNCH_DAMAGE_BASE);
      if (broadcastOnHit) {
        broadcastHit({
          attackerId: playerId,
          targetId: opponentId,
          damage: amount,
        });
      } else if (!guarded) {
        // /world path only — PunchCollisionDetector isn't mounted here, so
        // sound the cue directly off the driver. In /game (broadcastOnHit
        // true) the collision detector plays the cue so we skip it to avoid
        // a double-trigger.
        playHit();
      }
    },
    [refreshArm, playerId, opponentId, broadcastOnHit],
  );

  const onRelease = useCallback(
    (side: "left" | "right") => {
      punchingRef.current[side] = false;
      refreshArm(side);
    },
    [refreshArm],
  );

  // Initial derivation covers the case where the user is already guarding on
  // mount; the subscription catches later transitions.
  useEffect(() => {
    refreshArm("left");
    refreshArm("right");
    return usePunchCalibrationStore.subscribe((state, prev) => {
      if (state.leftMetrics.inGuard !== prev.leftMetrics.inGuard) {
        // Returning to guard clears any stuck punch latch — covers the case
        // where the CV thresholds stayed true (e.g. fingers still spread) so
        // usePunchDetector never emitted an onRelease.
        if (state.leftMetrics.inGuard) punchingRef.current.left = false;
        refreshArm("left");
      }
      if (state.rightMetrics.inGuard !== prev.rightMetrics.inGuard) {
        if (state.rightMetrics.inGuard) punchingRef.current.right = false;
        refreshArm("right");
      }
    });
  }, [refreshArm]);

  return { onPunch, onRelease };
}
