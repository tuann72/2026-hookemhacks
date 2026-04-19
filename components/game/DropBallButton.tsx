"use client";

import { useBallsStore } from "@/lib/store/ballsStore";
import { SELF_PLAYER_ID } from "@/types";

// Debug / fun button — drops a ball on the local player's head and deducts
// HP. Mount as a DOM overlay anywhere above the Canvas; it only talks to
// the balls store.
export function DropBallButton() {
  const drop = useBallsStore((s) => s.drop);
  return (
    <button
      type="button"
      onClick={() => drop(SELF_PLAYER_ID, 15)}
      style={{
        position: "absolute",
        top: 24,
        left: 24,
        zIndex: 5,
        padding: "8px 14px",
        fontFamily: "monospace",
        fontSize: 11,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "#fff",
        background: "rgba(244, 63, 94, 0.85)",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 4,
        cursor: "pointer",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      Drop ball
    </button>
  );
}
