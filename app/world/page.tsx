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
  const debug = typeof window !== "undefined" && window.location.search.includes("debug=1");

  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={debug} />
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          world · CV driven
        </div>
      </div>
    </BodyDetector>
  );
}
