"use client";

// Full-screen 3D world — the arena + rigged avatars + CV all at max size
// without the 2D HUD. Linked from the "Full" button in AvatarStage.

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
  // Debug CV feed overlay on by default. Append ?debug=0 to hide.
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
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          world · CV driven{debug ? " · feed bottom-right" : ""}
        </div>
      </div>
      <WorldContent
        debug={debug}
        debugPanel={debugPanel}
        onToggleDebug={() => setDebugPanel((v) => !v)}
        onCloseDebug={() => setDebugPanel(false)}
      />
    </BodyDetector>
  );
}

function WorldContent({
  debug,
  debugPanel,
  onToggleDebug,
  onCloseDebug,
}: {
  debug: boolean;
  debugPanel: boolean;
  onToggleDebug: () => void;
  onCloseDebug: () => void;
}) {
  // Single detector instance — fires punchAnim on the player's pose slot and
  // exposes calibration callbacks for the debug panel to reuse.
  const onPunch = useCallback((side: "left" | "right") => {
    usePoseStore.getState().setPunchAnim(SELF_PLAYER_ID, side, 400);
  }, []);
  const { onCalibrate, onResetCounts } = usePunchDetector({ onPunch });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <GameCanvas debug={false} />
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
        world · CV driven{debug ? " · feed bottom-right" : ""}
      </div>
      <button
        type="button"
        onClick={onToggleDebug}
        className={`absolute right-4 top-4 rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] transition ${
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
