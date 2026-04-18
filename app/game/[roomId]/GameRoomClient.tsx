"use client";

import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { ScoreHUD } from "@/components/game/ScoreHUD";
import { SELF_PLAYER_ID } from "@/types";

// R3F must never run on the server — dynamic(ssr:false) has to be invoked from
// a client component in Next 16, hence this thin wrapper.
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

export function GameRoomClient({
  roomId,
  debug,
}: {
  roomId: string;
  debug: boolean;
}) {
  return (
    // <BodyDetector> opens the webcam, runs MediaPipe (teammate's pipeline),
    // and publishes BodyTrackingState via context. <CVRigBridge> listens and
    // writes the rig into the pose store for the local player — Avatar then
    // applies it automatically through its useFrame loop.
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={debug} key={roomId} />
        <ScoreHUD />
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          room · {roomId}
        </div>
      </div>
    </BodyDetector>
  );
}
