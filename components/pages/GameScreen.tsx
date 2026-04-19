"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { IngestionBridge } from "@/components/detection/IngestionBridge";
import { HPBars } from "@/components/game/HPBars";
import { CalibrateGuardPanel } from "@/components/detection/CalibrateGuardPanel";
import { GuardVignette } from "@/components/detection/GuardVignette";
import { GameLoadingOverlay } from "@/components/pages/GameLoadingOverlay";
import { usePunchDetector } from "@/hooks/usePunchDetector";
import { useArmSimDriver } from "@/hooks/useArmSimDriver";
import { useCameraStore } from "@/lib/store/cameraStore";
import { useViewSettingsStore } from "@/lib/store/viewSettingsStore";
import { SELF_PLAYER_ID, REMOTE_PLAYER_ID } from "@/types";

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
  /** Peer sync complete — gate for dismissing the loading overlay. */
  ready?: boolean;
  /** Whether a peer is in presence; shapes the connecting-phase copy. */
  hasPeerPresence?: boolean;
  /** Peer has broadcast guard_ready; gates waiting-peer → combat. */
  peerGuardReady?: boolean;
  /** Fires once when our local baseline lands; parent broadcasts guard_ready. */
  onSelfGuardReady?: () => void;
};

export function GameScreen({
  onEnd: _onEnd,
  roomId,
  playerId,
  ready = false,
  hasPeerPresence = false,
  peerGuardReady = false,
  onSelfGuardReady,
}: GameScreenProps) {
  const hideDebug =
    typeof window !== "undefined" && window.location.search.includes("debug=0");
  const debug = !hideDebug;

  const [debugPanel, setDebugPanel] = useState(false);
  const [combatStarted, setCombatStarted] = useState(false);

  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      {roomId && playerId && (
        <IngestionBridge roomId={roomId} playerId={playerId} combatStarted={combatStarted} />
      )}
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <GameCanvas debug={debugPanel} />
        <HPBars />
        <GuardVignette />
        <PunchDebugLayer
          debugPanel={debugPanel}
          onToggleDebug={() => setDebugPanel((v) => !v)}
          onCloseDebug={() => setDebugPanel(false)}
        />
      </div>
      <GameLoadingOverlay
        ready={ready}
        hasPeerPresence={hasPeerPresence}
        peerGuardReady={peerGuardReady}
        onSelfGuardReady={onSelfGuardReady}
        onDone={() => setCombatStarted(true)}
      />
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
  // Multiplayer /game: broadcast hits so the peer applies matching damage.
  const { onPunch, onRelease } = useArmSimDriver({
    playerId: SELF_PLAYER_ID,
    opponentId: REMOTE_PLAYER_ID,
    broadcastOnHit: true,
  });
  const { onCalibrate, onResetCounts } = usePunchDetector({
    onPunch,
    onRelease,
  });
  const requestCameraReset = useCameraStore((s) => s.requestReset);
  const hideLocalBody = useViewSettingsStore((s) => s.hideLocalBody);
  const toggleHideLocalBody = useViewSettingsStore((s) => s.toggleHideLocalBody);

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
          onResetCamera={requestCameraReset}
          hideLocalBody={hideLocalBody}
          onToggleHideLocalBody={toggleHideLocalBody}
        />
      )}
    </>
  );
}
