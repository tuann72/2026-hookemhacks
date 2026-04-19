"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { DropBallButton } from "@/components/game/DropBallButton";
import { HPBars } from "@/components/game/HPBars";
import { CalibrateGuardPanel } from "@/components/detection/CalibrateGuardPanel";
import { usePunchDetector } from "@/hooks/usePunchDetector";
import { usePoseStore } from "@/lib/store/poseStore";
import { IngestionBridge } from "@/components/detection/IngestionBridge";
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

type GameScreenProps = {
  onEnd?: () => void;
  roomId?: string;
  playerId?: string;
};

export function GameScreen({ onEnd: _onEnd, roomId, playerId }: GameScreenProps) {
  const hideDebug =
    typeof window !== "undefined" && window.location.search.includes("debug=0");
  const debug = !hideDebug;

  const [debugPanel, setDebugPanel] = useState(false);

  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      {roomId && playerId && <IngestionBridge roomId={roomId} playerId={playerId} />}
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={debugPanel} />
        <HPBars />
        <DropBallButton />
        <PunchDebugLayer
          debugPanel={debugPanel}
          onToggleDebug={() => setDebugPanel((v) => !v)}
          onCloseDebug={() => setDebugPanel(false)}
        />
      </div>
    </BodyDetector>
  );
}

function PunchDebugLayer({
  debugPanel,
  onToggleDebug,
  onCloseDebug,
}: {
  debugPanel: boolean;
  onToggleDebug: () => void;
  onCloseDebug: () => void;
}) {
  // Side mapping: see comment in app/world/page.tsx PunchDebugLayer — the CV
  // arm rig swaps anatomical sides, so we invert the punch label here so the
  // override plays on the same arm the user physically threw.
  const onPunch = useCallback((side: "left" | "right") => {
    const mirrored = side === "left" ? "right" : "left";
    usePoseStore.getState().setPunchAnim(SELF_PLAYER_ID, mirrored, 400);
  }, []);
  const { onCalibrate, onResetCounts } = usePunchDetector({ onPunch });

  return (
    <>
      <button
        type="button"
        onClick={onToggleDebug}
        className={`absolute left-6 top-[64px] z-10 rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] transition ${
          debugPanel
            ? "border border-rose-500/60 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
            : "border border-cyan-500/60 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
        }`}
      >
        {debugPanel ? "Close debug" : "Debug · punches"}
      </button>
      {debugPanel && (
        <CalibrateGuardPanel
          variant="overlay"
          onCalibrate={onCalibrate}
          onResetCounts={onResetCounts}
          onClose={onCloseDebug}
        />
      )}
    </>
  );
}
