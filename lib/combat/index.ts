import { REMOTE_PLAYER_ID, SELF_PLAYER_ID, type PlayerId } from "@/types";
import { useGameStore } from "@/lib/store/gameStore";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import { useRemoteGuardStore } from "@/lib/store/remoteGuardStore";
import { GUARD_MULTIPLIER } from "@/lib/combat/damage";

// Re-export the tunables so consumers can grab everything from a single import.
// The canonical location for tweaking values is lib/combat/damage.ts.
export * from "@/lib/combat/damage";

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
