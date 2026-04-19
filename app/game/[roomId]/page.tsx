"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Backdrop } from "@/components/scenery/Scenery";
import { Calibration } from "@/components/pages/Calibration";
import { GameScreen } from "@/components/pages/GameScreen";
import { TWEAK_DEFAULTS } from "@/components/shared/constants";
import { useGameChannel } from "@/hooks/useGameChannel";
import { useIdentity } from "@/hooks/useIdentity";
import { usePoseSync } from "@/hooks/usePoseSync";
import { endMatch, getRoomByCode } from "@/lib/multiplayer/roomService";
import { useGameStore } from "@/lib/store/gameStore";
import { usePoseStore } from "@/lib/store/poseStore";
import { REMOTE_PLAYER_ID, SELF_PLAYER_ID } from "@/types";

type GameStep = "calibrate" | "game";

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const code = (params.roomId as string).toUpperCase();

  const { playerId, playerName } = useIdentity();
  const [roomUuid, setRoomUuid] = useState<string | null>(null);
  const [step, setStep] = useState<GameStep>("game");
  const [matchPct, setMatchPct] = useState(TWEAK_DEFAULTS.matchPct);
  const [leaving, setLeaving] = useState(false);
  const setHostId = useGameStore((s) => s.setHostId);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getRoomByCode(code)
      .then((r) => {
        if (cancelled || !r) return;
        setRoomUuid(r.id);
        setHostId(r.host_id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code, setHostId]);

  const { broadcastGameEvent, broadcastPoseSnapshot, connected } = useGameChannel({
    roomId: roomUuid ?? "",
    playerId,
    playerName: playerName || playerId,
    onGameEvent: (e) => {
      if (e.type === "game_end") router.push(`/lobby/${code}`);
    },
    onPoseSnapshot: (snap) => {
      // Ignore our own echo (GameChannel uses broadcast self:false, so this
      // shouldn't fire, but guard anyway). Remote rigs land in the REMOTE
      // pose slot — the Avatar reads from there and animates automatically.
      if (!snap.rig || snap.playerId === playerId) return;
      usePoseStore.getState().setRig(REMOTE_PLAYER_ID, snap.rig);
    },
  });

  usePoseSync({
    selfId: SELF_PLAYER_ID,
    broadcast: broadcastPoseSnapshot,
    enabled: connected && !!roomUuid,
  });

  const returnToLobby = async (reason: string) => {
    if (leaving) return;
    setLeaving(true);
    broadcastGameEvent({ type: "game_end", payload: { reason } });
    if (roomUuid) {
      try {
        await endMatch(roomUuid);
      } catch {
        // best-effort
      }
    }
    router.push(`/lobby/${code}`);
  };

  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <button
        type="button"
        onClick={() => returnToLobby("player_left")}
        disabled={leaving}
        className="btn ghost leave-match-btn"
      >
        ← Leave match
      </button>

      {step === "calibrate" && (
        <Calibration
          matchPct={matchPct}
          setMatchPct={setMatchPct}
          onNext={() => setStep("game")}
        />
      )}

      {step === "game" && <GameScreen />}

      <style>{`
        .leave-match-btn {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 100;
          padding: 8px 14px;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
