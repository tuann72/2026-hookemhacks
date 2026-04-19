"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getAvatarBones, registeredPlayerIds } from "./avatarCollision";
import { usePoseStore } from "@/lib/store/poseStore";
import {
  EXTEND_MS,
  HIT_EXTENSION_THRESHOLD,
  HIT_RADIUS,
  PUNCH_DAMAGE_BASE,
  applyDamage,
} from "@/lib/combat/damage";
import { broadcastHit } from "@/lib/multiplayer/hitBroadcaster";
import { SELF_PLAYER_ID, type PlayerId } from "@/types";

// Headless scene component — mount once inside <Canvas>, below Avatars.
//
// Each frame:
//   - For every registered avatar, read their punchAnim.
//   - If the punch is past the hit-extension threshold and not yet released,
//     compute the fist world position (tail of LowerArm bone).
//   - For each other avatar, distance-check the fist against their Head
//     world position. First hit per startedAt value lands damage; the
//     startedAt is then stored in a consumed-set to prevent re-damage.
//   - The attacker applies damage locally AND broadcasts a HitEvent so the
//     peer side converges to the same HP.

const LOWER_ARM_LEN = 0.51; // matches Avatar.tsx

const _fist = new THREE.Vector3();
const _head = new THREE.Vector3();
const _fistLocal = new THREE.Vector3();

export function PunchCollisionDetector() {
  // Track which punches (by startedAt timestamp) have already landed a hit
  // so a held punch in the collision window doesn't damage every frame.
  const consumedRef = useRef<Set<number>>(new Set());

  useFrame(() => {
    const poseState = usePoseStore.getState().players;
    const ids = registeredPlayerIds();

    for (const attackerId of ids) {
      const pose = poseState[attackerId];
      const punch = pose?.punchAnim;
      if (!punch) continue;
      if (punch.releasedAt !== null) continue; // recovering; no more hits
      if (consumedRef.current.has(punch.startedAt)) continue;

      const extension = Math.min(
        1,
        (performance.now() - punch.startedAt) / EXTEND_MS,
      );
      if (extension < HIT_EXTENSION_THRESHOLD) continue;

      const bones = getAvatarBones(attackerId);
      const lower =
        punch.side === "left" ? bones?.LeftLowerArm : bones?.RightLowerArm;
      if (!lower) continue;

      // Fist = LowerArm origin + (0, -LOWER_ARM_LEN, 0) in local space.
      _fistLocal.set(0, -LOWER_ARM_LEN, 0);
      _fist.copy(_fistLocal);
      (lower as THREE.Object3D).localToWorld(_fist);

      for (const targetId of ids) {
        if (targetId === attackerId) continue;
        const targetBones = getAvatarBones(targetId);
        const head = targetBones?.Head;
        if (!head) continue;
        (head as THREE.Object3D).getWorldPosition(_head);

        if (_fist.distanceTo(_head) <= HIT_RADIUS) {
          consumedRef.current.add(punch.startedAt);
          const { amount } = applyDamage(targetId, PUNCH_DAMAGE_BASE);
          // Broadcast so the peer applies the same damage. No-op in /world.
          if (attackerId === SELF_PLAYER_ID) {
            broadcastHit({
              attackerId: attackerId as PlayerId,
              targetId: targetId as PlayerId,
              damage: amount,
            });
          }
          break; // one target per punch
        }
      }
    }

    // Garbage-collect consumed punches that no longer exist in the store so
    // the set doesn't grow unbounded over a long session.
    if (consumedRef.current.size > 32) {
      const active = new Set<number>();
      for (const p of Object.values(poseState)) {
        if (p?.punchAnim) active.add(p.punchAnim.startedAt);
      }
      for (const t of consumedRef.current) {
        if (!active.has(t)) consumedRef.current.delete(t);
      }
    }

  });

  return null;
}
