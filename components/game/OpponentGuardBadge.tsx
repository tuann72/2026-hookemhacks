"use client";

import { Html } from "@react-three/drei";
import { Shield } from "lucide-react";
import { useRemoteGuardStore } from "@/lib/store/remoteGuardStore";

// Red shield floating above the opponent's head whenever their pose broadcast
// reports `inGuard` on either hand. Mount once per remote avatar inside
// <Canvas>, passing the world-space head position of that avatar.

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
      position={[headPos[0], headPos[1] + 0.7, headPos[2]]}
      center
      // No zIndexRange — drei's default [16777271, 0] keeps the badge above
      // the rest of the DOM (custom ranges capped it below the page's other
      // HUD overlays and the badge got occluded).
      wrapperClass="pointer-events-none"
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Shield
          size={72}
          strokeWidth={2}
          className="text-red-600 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
          fill="currentColor"
        />
      </div>
    </Html>
  );
}
