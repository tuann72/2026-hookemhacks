"use client";

// Full-screen 3D world — the arena + rigged avatars + CV all at max size
// without the 2D HUD. Linked from the "Full" button in AvatarStage.

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { ArmRigSim } from "@/components/game/ArmRigSim";
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
        <GameCanvas debug={debugPanel} />
        <HPBars />
        <DropBallButton />
        <ArmRigSim />
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          world · CV driven{debug ? " · feed bottom-right" : ""}
        </div>
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
  // Single detector instance — fires punchAnim on the player's pose slot and
  // exposes calibration callbacks for the debug panel to reuse.
  //
  // Side mapping: the CV arm rig (useBodyDetection.ts:160-170) swaps anatomical
  // left/right so `leftArm` state drives `LeftUpperArm`. The punch detector's
  // `left`/`right` labels land on the OPPOSITE arm from what the CV rig is
  // animating, so we invert here so the punch override plays on the same arm
  // the user physically threw.
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
