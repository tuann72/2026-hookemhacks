"use client";

// Full-screen 3D world — the arena + rigged avatars + CV all at max size
// without the 2D HUD. Linked from the "Full" button in AvatarStage.

import { useState } from "react";
import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { HPBars } from "@/components/game/HPBars";
import { CalibrateGuardPanel } from "@/components/detection/CalibrateGuardPanel";
import { GuardVignette } from "@/components/detection/GuardVignette";
import { UppercutChargeIndicator } from "@/components/detection/UppercutChargeIndicator";
import { usePunchDetector } from "@/hooks/usePunchDetector";
import { useArmSimDriver } from "@/hooks/useArmSimDriver";
import { useCameraStore } from "@/lib/store/cameraStore";
import { useViewSettingsStore } from "@/lib/store/viewSettingsStore";
import { useSoundStore } from "@/lib/store/soundStore";
import { usePoseStore } from "@/lib/store/poseStore";
import { EXTEND_MS } from "@/lib/combat/damage";
import { REMOTE_PLAYER_ID, SELF_PLAYER_ID } from "@/types";

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
        <GuardVignette />
        <UppercutChargeIndicator />
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          world · CV driven{debug ? " · feed bottom-right" : ""}
        </div>
        <PunchDebugLayer
          debugPanel={debugPanel}
          onToggleDebug={() => setDebugPanel((v) => !v)}
          onCloseDebug={() => setDebugPanel(false)}
        />
        <UppercutTestButton />
      </div>
    </BodyDetector>
  );
}

function UppercutTestButton() {
  // Fires an uppercut animation on the local avatar's right arm. Since /world
  // has no CV-driven release to stamp `releasedAt`, we fake it on a timer so
  // the arm holds at peak briefly then retracts, then the animation clears.
  const triggerUppercut = () => {
    usePoseStore.getState().setPunchAnim(SELF_PLAYER_ID, "right", "uppercut");
    const HOLD_MS = 180;
    setTimeout(() => {
      usePoseStore.getState().markPunchReleased(SELF_PLAYER_ID, "right");
    }, EXTEND_MS + HOLD_MS);
  };

  return (
    <button
      type="button"
      onClick={triggerUppercut}
      className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/20"
    >
      ⬆ Uppercut
    </button>
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
  // Single-player /world: no realtime channel, so we don't broadcast hits.
  const { onPunch, onRelease } = useArmSimDriver({
    playerId: SELF_PLAYER_ID,
    opponentId: REMOTE_PLAYER_ID,
    broadcastOnHit: false,
  });
  const { onCalibrate, onResetCounts } = usePunchDetector({
    onPunch,
    onRelease,
  });
  const requestCameraReset = useCameraStore((s) => s.requestReset);
  const hideLocalBody = useViewSettingsStore((s) => s.hideLocalBody);
  const toggleHideLocalBody = useViewSettingsStore((s) => s.toggleHideLocalBody);
  const soundEnabled = useSoundStore((s) => s.enabled);
  const toggleSound = useSoundStore((s) => s.toggle);

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
      <button
        type="button"
        onClick={toggleSound}
        className={`absolute left-6 top-[104px] z-10 rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] transition ${
          soundEnabled
            ? "border border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
            : "border border-zinc-500/60 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/20"
        }`}
      >
        {soundEnabled ? "Sound · on" : "Sound · off"}
      </button>
      {debugPanel && (
        <CalibrateGuardPanel
          variant="overlay"
          onCalibrate={onCalibrate}
          onResetCounts={onResetCounts}
          onClose={onCloseDebug}
          onResetCamera={requestCameraReset}
          hideLocalBody={hideLocalBody}
          onToggleHideLocalBody={toggleHideLocalBody}
        />
      )}
    </>
  );
}
