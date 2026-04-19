import type { HitEvent } from "./types";

// Global ref to the current room's broadcastHit. The game page registers its
// channel broadcaster on mount; other surfaces (solo /world) leave it null
// so calls from PunchCollisionDetector turn into no-ops.

type Broadcaster = (hit: Omit<HitEvent, "timestamp">) => void;
let broadcaster: Broadcaster | null = null;

export function setHitBroadcaster(fn: Broadcaster | null): void {
  broadcaster = fn;
}

export function broadcastHit(hit: Omit<HitEvent, "timestamp">): void {
  broadcaster?.(hit);
}
