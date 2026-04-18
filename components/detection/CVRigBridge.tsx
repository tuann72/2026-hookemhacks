"use client";

import { useEffect } from "react";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import { usePoseStore } from "@/lib/store/poseStore";
import { armStateToRigRotations } from "@/lib/rigging";
import type { PlayerId } from "@/types";

/**
 * Reads BodyTrackingState from teammate's useBodyDetection context and pushes
 * the derived rig into the pose store under `playerId`. The Avatar's useFrame
 * is already subscribed to `usePoseStore.getState().players[playerId].rig` and
 * applies it automatically — so mounting this bridge is the entire integration.
 *
 * Renders nothing.
 */
export function CVRigBridge({ playerId }: { playerId: PlayerId }) {
  const { leftArm, rightArm, isReady } = useBodyDetection();

  useEffect(() => {
    if (!isReady) return;
    const rig = armStateToRigRotations(leftArm, rightArm);
    usePoseStore.getState().setRig(playerId, rig);
  }, [leftArm, rightArm, isReady, playerId]);

  return null;
}
