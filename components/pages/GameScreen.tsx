"use client";

import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { SELF_PLAYER_ID } from "@/types";

// Full-screen 3D arena — same layout as /world, but mounted inside the
// room-scoped /game/[roomId] route so the multiplayer channel + host-based
// boxer assignment (GameCanvas) are live.

const GameCanvas = dynamic(
  () => import("../game/GameCanvas").then((m) => m.GameCanvas),
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

type GameScreenProps = { onEnd?: () => void };

export function GameScreen({ onEnd: _onEnd }: GameScreenProps) {
  const hideDebug =
    typeof window !== "undefined" && window.location.search.includes("debug=0");
  const debug = !hideDebug;

  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={false} />
      </div>
    </BodyDetector>
  );
}
