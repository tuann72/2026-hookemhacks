import { REMOTE_PLAYER_ID, SELF_PLAYER_ID, type PlayerId } from "@/types";
import { useGameStore } from "@/lib/store/gameStore";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import { useRemoteGuardStore } from "@/lib/store/remoteGuardStore";

// Shared damage constants — tweak in one place.

export const PUNCH_DAMAGE_BASE = 12;
export const GUARD_MULTIPLIER = 0.3;
export const HIT_RADIUS = 0.35;
export const EXTEND_MS = 140;
export const RECOVER_MS = 180;
export const HIT_EXTENSION_THRESHOLD = 0.7;

/**
 * True if either of the target's hands is currently in guard position.
 * Local player reads the live calibration-derived metrics; remote reads the
 * synced flag from the pose broadcast.
 */
export function isTargetInGuard(targetId: PlayerId): boolean {
  if (targetId === SELF_PLAYER_ID) {
    const s = usePunchCalibrationStore.getState();
    return s.leftMetrics.inGuard || s.rightMetrics.inGuard;
  }
  if (targetId === REMOTE_PLAYER_ID) {
    const g = useRemoteGuardStore.getState();
    return g.left || g.right;
  }
  return false;
}

/**
 * Apply damage to a player with the guard multiplier baked in. Returns the
 * final amount dealt and whether guard mitigated it, in case the caller
 * wants to log / broadcast / flash a hit indicator.
 */
export function applyDamage(
  targetId: PlayerId,
  base: number,
): { amount: number; guarded: boolean } {
  const guarded = isTargetInGuard(targetId);
  const amount = base * (guarded ? GUARD_MULTIPLIER : 1);
  useGameStore.getState().damagePlayer(targetId, amount);
  return { amount, guarded };
}
