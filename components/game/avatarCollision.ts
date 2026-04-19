"use client";

import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { PlayerId } from "@/types";

// Radius of the cylindrical "body" used for avatar-vs-avatar separation.
// Covers the torso with a small buffer; arm swings are intentionally not
// included so punches don't push the opponent just by arm overlap.
export const AVATAR_RADIUS = 0.35;

const registry = new Map<PlayerId, Group>();

/**
 * Register/unregister an avatar's root group for collision. Pass `null` on
 * unmount. Callers should do this via a callback ref that fires with the
 * mounted group element and again with `null` during cleanup.
 */
export function registerAvatarBody(id: PlayerId, group: Group | null): void {
  if (group) registry.set(id, group);
  else registry.delete(id);
}

export function getAvatarBody(id: PlayerId): Group | undefined {
  return registry.get(id);
}

/**
 * Scene-level resolver. Each frame, walks every pair of registered avatars
 * and — if they overlap horizontally within `2 × AVATAR_RADIUS` — pushes each
 * half of the overlap apart along the XZ separation vector. Upright pose is
 * preserved (Y is untouched). O(n²) which is fine for ≤ ~8 players.
 *
 * Mount once inside the <Canvas> tree.
 */
export function AvatarCollisionResolver() {
  useFrame(() => {
    const bodies = Array.from(registry.values());
    const minDist = 2 * AVATAR_RADIUS;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;
          a.position.x -= nx * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.z += nz * push;
        }
      }
    }
  });
  return null;
}
