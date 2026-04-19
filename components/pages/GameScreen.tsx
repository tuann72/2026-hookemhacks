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

  const [debugPanel, setDebugPanel] = useState(false);

  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={false} />
        <HPBars />
        <DropBallButton />
      </div>
      <GameStageContent
        debugPanel={debugPanel}
        onToggleDebug={() => setDebugPanel((v) => !v)}
        onCloseDebug={() => setDebugPanel(false)}
      />
    </BodyDetector>
  );
}

function GameStageContent({
  debugPanel,
  onToggleDebug,
  onCloseDebug,
}: {
  debugPanel: boolean;
  onToggleDebug: () => void;
  onCloseDebug: () => void;
}) {
  const onPunch = useCallback((side: "left" | "right") => {
    usePoseStore.getState().setPunchAnim(SELF_PLAYER_ID, side, 400);
  }, []);
  const { onCalibrate, onResetCounts } = usePunchDetector({ onPunch });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <GameCanvas debug={false} />
      <button
        type="button"
        onClick={onToggleDebug}
        className={`absolute right-4 top-4 z-10 rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] transition ${
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
    </div>
  );
}
