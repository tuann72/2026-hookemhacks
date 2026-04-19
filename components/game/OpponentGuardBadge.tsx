"use client";

import { Html } from "@react-three/drei";
import { Shield } from "lucide-react";
import { useRemoteGuardStore } from "@/lib/store/remoteGuardStore";

// Small shield badge floating above the opponent's head whenever their pose
// broadcast reports `inGuard` on either hand. Mount once per remote avatar
// inside <Canvas>, passing the world-space head position of that avatar.

export function OpponentGuardBadge({
  headPos,
}: {
  /** World-space center of the opponent's head sphere. */
  headPos: [number, number, number];
}) {
  const left = useRemoteGuardStore((s) => s.left);
  const right = useRemoteGuardStore((s) => s.right);
  if (!left && !right) return null;
  return (
    <Html
      position={[headPos[0], headPos[1] + 0.5, headPos[2]]}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none" }}
    >
      <Shield
        size={56}
        strokeWidth={2}
        className="text-red-600 drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
        fill="currentColor"
      />
    </Html>
  );
}
