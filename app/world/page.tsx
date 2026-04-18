"use client";

// Full-screen 3D world — the arena + rigged avatars + CV all at max size
// without the 2D HUD. Linked from the "Full" button in AvatarStage.

import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { SELF_PLAYER_ID } from "@/types";

const GameCanvas = dynamic(
  () => import("@/components/game/GameCanvas").then((m) => m.GameCanvas),
  { ssr: false, loading: () => <CanvasFallback /> }
);

function CanvasFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
        booting arena…
      </div>
    </div>
  );
}

export default function WorldPage() {
  // Debug overlay on by default — the webcam feed + arm skeleton + hand
  // landmarks is the whole point of this route: it lets you watch the
  // incoming CV signal while the avatar reacts to it in real time.
  // Append ?debug=0 to hide the overlay if you want a clean capture.
  const hideDebug =
    typeof window !== "undefined" && window.location.search.includes("debug=0");
  const debug = !hideDebug;

  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={false /* R3F stats off even in CV debug mode */} />
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          world · CV driven {debug ? "· feed bottom-right" : ""}
        </div>
      </div>
    </BodyDetector>
  );
}
