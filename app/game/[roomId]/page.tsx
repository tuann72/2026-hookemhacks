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
  const setPlayerConnected = useGameStore((s) => s.setPlayerConnected);

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

  const { broadcastGameEvent, broadcastPoseSnapshot, connected, players, peerBroadcastSeen } = useGameChannel({
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
      // DEBUG(multiplayer-broadcast-flakiness): logs every incoming pose.
      // If the sender's console shows "[pose-sync] broadcast #N" but this
      // line never fires on the other tab, the break is server-side (Supabase
      // not relaying) or transport (channel CLOSED without reconnect). If
      // this fires but the filter below trips, both tabs share the same
      // `hookem:playerId` in localStorage — common when testing two tabs in
      // one browser profile.
      console.log("[pose-sync] recv from", snap.playerId, "self=", playerId, "hasRig=", !!snap.rig);
      if (!snap.rig || snap.playerId === playerId) return;
      usePoseStore.getState().setRig(REMOTE_PLAYER_ID, snap.rig);
    },
  });

  usePoseSync({
    selfId: SELF_PLAYER_ID,
    broadcast: broadcastPoseSnapshot,
    enabled: connected && !!roomUuid,
  });

  // "Connecting…" overlay hides the auto-reconnect dance at match start.
  // Criteria for dismissal, in priority order:
  //  1. Peer broadcast seen → definitely wired up both ways. Dismiss.
  //  2. Peer in presence for 3s without a broadcast → safety-net dismiss so
  //     the joiner isn't stuck if the host hasn't produced pose data yet
  //     (camera still warming up, calibrating, etc.). GameChannel.subscribe
  //     also broadcasts a hello post-SUBSCRIBED that should trip (1) within
  //     ~200ms, so this timeout mostly shouldn't fire — it's belt-and-braces.
  //  3. Connected + no peer presence + 4s elapsed → likely solo player.
  //     Dismiss so they're not stuck staring at a spinner.
  //  4. Otherwise keep the overlay up — better to wait a beat than show a
  //     frozen opponent avatar.
  const hasPeerPresence = players.some((p) => p.playerId !== playerId);
  const [soloTimedOut, setSoloTimedOut] = useState(false);
  const [presenceTimedOut, setPresenceTimedOut] = useState(false);
  useEffect(() => {
    if (peerBroadcastSeen || hasPeerPresence || !connected) return;
    const t = setTimeout(() => setSoloTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [connected, hasPeerPresence, peerBroadcastSeen]);
  useEffect(() => {
    if (peerBroadcastSeen || !hasPeerPresence || !connected) return;
    const t = setTimeout(() => setPresenceTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, [connected, hasPeerPresence, peerBroadcastSeen]);
  // Reset fallbacks when peer-presence state changes (e.g., peer leaves then
  // rejoins mid-match); fresh timeouts arm on the new state.
  useEffect(() => {
    setSoloTimedOut(false);
    setPresenceTimedOut(false);
  }, [hasPeerPresence]);

  useEffect(() => {
    setPlayerConnected(REMOTE_PLAYER_ID, hasPeerPresence);
  }, [hasPeerPresence, setPlayerConnected]);
  const ready =
    peerBroadcastSeen ||
    (connected && (soloTimedOut || presenceTimedOut));

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

      {step === "game" && (
        <GameScreen roomId={roomUuid ?? undefined} playerId={playerId || undefined} />
      )}

      {!ready && (
        <div className="connect-overlay" aria-live="polite" role="status">
          <div className="connect-sun" />
          <div className="connect-label mono">
            {hasPeerPresence ? "Syncing with your buddy…" : "Joining the cove…"}
          </div>
        </div>
      )}

      <style>{`
        .leave-match-btn {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 100;
          padding: 8px 14px;
          font-size: 13px;
        }
        .connect-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          background: radial-gradient(
            ellipse at 50% 80%,
            #ff6b4a 0%,
            #c23e2f 45%,
            #1a1025 100%
          );
          color: #fff2e4;
          animation: connect-fade 160ms ease-out both;
        }
        .connect-sun {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 45%, #ffd48c 0%, #ff8a4a 55%, #c23e2f 100%);
          box-shadow: 0 0 60px 12px rgba(255, 150, 80, 0.55);
          animation: connect-pulse 1.6s ease-in-out infinite;
        }
        .connect-label {
          font-size: 13px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          opacity: 0.92;
        }
        @keyframes connect-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes connect-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
