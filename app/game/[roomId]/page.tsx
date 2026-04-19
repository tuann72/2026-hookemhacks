"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Backdrop } from "@/components/scenery/Scenery";
import { Calibration } from "@/components/pages/Calibration";
import { GameScreen } from "@/components/pages/GameScreen";
import { MatchOverOverlay } from "@/components/pages/MatchOverOverlay";
import { TWEAK_DEFAULTS } from "@/components/shared/constants";
import { useGameChannel } from "@/hooks/useGameChannel";
import { useIdentity } from "@/hooks/useIdentity";
import { usePoseSync } from "@/hooks/usePoseSync";
import { endMatch, getRoomByCode } from "@/lib/multiplayer/roomService";
import { useGameStore } from "@/lib/store/gameStore";
import { usePoseStore } from "@/lib/store/poseStore";
import { useRemoteGuardStore } from "@/lib/store/remoteGuardStore";
import { setHitBroadcaster } from "@/lib/multiplayer/hitBroadcaster";
import { useCalibrationSignalStore } from "@/lib/store/calibrationSignalStore";
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
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const selfHp = useGameStore(
    (s) => s.players.find((p) => p.id === SELF_PLAYER_ID)?.hp ?? 100,
  );
  const remoteHp = useGameStore(
    (s) => s.players.find((p) => p.id === REMOTE_PLAYER_ID)?.hp ?? 100,
  );
  const [outcome, setOutcome] = useState<"self" | "remote" | null>(null);

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

  const { broadcastGameEvent, broadcastHit, broadcastPoseSnapshot, connected, players, peerBroadcastSeen } = useGameChannel({
    roomId: roomUuid ?? "",
    playerId,
    playerName: playerName || playerId,
    onGameEvent: (e) => {
      if (e.type === "game_end") router.push(`/lobby/${code}`);
      else if (e.type === "rematch") {
        useGameStore.getState().reset();
        useCalibrationSignalStore.getState().requestRecalibrate();
        setOutcome(null);
      }
    },
    onHit: (hit) => {
      // Peer says they hit REMOTE_PLAYER_ID (us). Remap to our local perspective:
      // their "remote" = our "self", and vice versa.
      const localTargetId = hit.targetId === REMOTE_PLAYER_ID ? SELF_PLAYER_ID : REMOTE_PLAYER_ID;
      useGameStore.getState().damagePlayer(localTargetId, hit.damage);
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
      if (snap.playerId === playerId) return;
      if (snap.rig) usePoseStore.getState().setRig(REMOTE_PLAYER_ID, snap.rig);
      if (snap.inGuard) useRemoteGuardStore.getState().set(snap.inGuard);
    },
  });

  // Register the channel's broadcastHit so PunchCollisionDetector can publish
  // landed hits. Cleared on unmount so a stale ref doesn't leak across rooms.
  useEffect(() => {
    setHitBroadcaster(broadcastHit);
    return () => setHitBroadcaster(null);
  }, [broadcastHit]);

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

  useEffect(() => {
    if (playerName) setPlayerName(SELF_PLAYER_ID, playerName);
  }, [playerName, setPlayerName]);

  useEffect(() => {
    const peer = players.find((p) => p.playerId !== playerId);
    if (peer?.name) setPlayerName(REMOTE_PLAYER_ID, peer.name);
  }, [players, playerId, setPlayerName]);

  // Lock in the winner the first time either HP reaches 0. Held until a
  // rematch event resets it so later store changes can't flip the outcome.
  useEffect(() => {
    if (outcome) return;
    if (remoteHp <= 0) setOutcome("self");
    else if (selfHp <= 0) setOutcome("remote");
  }, [selfHp, remoteHp, outcome]);

  const remotePeer = players.find((p) => p.playerId !== playerId);
  const winnerName =
    outcome === "self"
      ? playerName || "You"
      : remotePeer?.name || "Opponent";

  const onPlayAgain = useCallback(() => {
    useGameStore.getState().reset();
    useCalibrationSignalStore.getState().requestRecalibrate();
    broadcastGameEvent({ type: "rematch", payload: {} });
    setOutcome(null);
  }, [broadcastGameEvent]);
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
        <GameScreen
          roomId={roomUuid ?? undefined}
          playerId={playerId || undefined}
          ready={ready}
          hasPeerPresence={hasPeerPresence}
        />
      )}

      <MatchOverOverlay
        visible={outcome !== null}
        winnerName={winnerName}
        selfWon={outcome === "self"}
        onPlayAgain={onPlayAgain}
      />

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
