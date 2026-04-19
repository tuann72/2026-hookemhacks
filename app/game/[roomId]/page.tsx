"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Backdrop } from "@/components/scenery/Scenery";
import { Calibration } from "@/components/pages/Calibration";
import { GameScreen } from "@/components/pages/GameScreen";
import { Results } from "@/components/pages/Results";
import { TWEAK_DEFAULTS } from "@/components/shared/constants";
import { useGameChannel } from "@/hooks/useGameChannel";
import { useIdentity } from "@/hooks/useIdentity";
import { usePoseSync } from "@/hooks/usePoseSync";
import { endMatch, getRoomByCode } from "@/lib/multiplayer/roomService";
import { useGameStore } from "@/lib/store/gameStore";
import { usePoseStore } from "@/lib/store/poseStore";
import { useRemoteGuardStore } from "@/lib/store/remoteGuardStore";
import { setHitBroadcaster } from "@/lib/multiplayer/hitBroadcaster";
import { useCameraStore } from "@/lib/store/cameraStore";
import { isTargetInGuard } from "@/lib/combat";
import { playEnd, playHit } from "@/lib/sound/player";
import { loadStoredTint } from "@/lib/game/avatarColors";
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
  // matchKey was bumped on rematch to remount IngestionBridge; rematch now
  // does a full page reload so the natural mount handles it. Kept as a static
  // 0 so the GameScreen prop signature is unchanged.
  const [matchKey] = useState(0);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const endedMatchesRef = useRef<Set<string>>(new Set());
  const setHostId = useGameStore((s) => s.setHostId);
  const setPlayerConnected = useGameStore((s) => s.setPlayerConnected);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const setPlayerTint = useGameStore((s) => s.setPlayerTint);
  const selfHp = useGameStore(
    (s) => s.players.find((p) => p.id === SELF_PLAYER_ID)?.hp ?? 100,
  );
  const remoteHp = useGameStore(
    (s) => s.players.find((p) => p.id === REMOTE_PLAYER_ID)?.hp ?? 100,
  );
  const [outcome, setOutcome] = useState<"self" | "remote" | null>(null);
  // Peer has broadcast guard_ready — their calibration is done. Gates
  // GameLoadingOverlay's waiting-peer → done transition so one side can't
  // start boxing while the other is still in their 3-2-1 countdown.
  const [peerGuardReady, setPeerGuardReady] = useState(false);
  // Tracks whether *we've* broadcast our own guard_ready this match. Used to
  // (a) fire exactly once from the overlay's onSelfGuardReady, and (b)
  // re-broadcast when a peer joins presence after we're already locked in
  // (covers refresh/reconnect cases).
  const selfGuardReadyRef = useRef(false);

  // Fresh match on page mount — clear any stale HP / outcome from a previous
  // match so the HP→outcome effect below doesn't instantly flash Results when
  // the user re-enters a game room after returning to the lobby.
  useEffect(() => {
    useGameStore.getState().reset();
  }, []);

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

  // Reset HP/score/phase every time we enter a match. Zustand is a singleton,
  // so a return-to-lobby-then-new-match flow would otherwise carry the prior
  // match's ending HP (often 0) into the fresh fight. Rematch has its own
  // reset; this covers lobby → game transitions.
  useEffect(() => {
    useGameStore.getState().reset();
  }, []);

  const { broadcastGameEvent, broadcastHit, broadcastPoseSnapshot, connected, players, peerBroadcastSeen, setTint } = useGameChannel({
    roomId: roomUuid ?? "",
    playerId,
    playerName: playerName || playerId,
    initialTint: loadStoredTint() ?? undefined,
    onGameEvent: (e) => {
      if (e.type === "game_end") router.push(`/lobby/${code}`);
      else if (e.type === "rematch") {
        // Hard reload to guarantee a fresh Supabase channel + MediaPipe state
        // for round N+1. The post-reload mount runs the existing on-mount
        // resets (gameStore.reset, recalibrate signal, etc.) naturally.
        window.location.reload();
      } else if (e.type === "guard_ready") {
        // GameChannel.broadcastGameEvent uses self:false, so any guard_ready
        // we receive is by definition the peer's.
        setPeerGuardReady(true);
      }
    },
    onHit: (hit) => {
      // Freeze after KO: drop any in-flight hits rather than trying to land
      // them on a player who's already at 0. Mirrors the gate in
      // PunchCollisionDetector so both sides stop together.
      const players = useGameStore.getState().players;
      if (players.some((p) => p.hp <= 0)) return;
      // Peer says they hit REMOTE_PLAYER_ID (us). Remap to our local perspective:
      // their "remote" = our "self", and vice versa.
      const localTargetId = hit.targetId === REMOTE_PLAYER_ID ? SELF_PLAYER_ID : REMOTE_PLAYER_ID;
      useGameStore.getState().damagePlayer(localTargetId, hit.damage);
      // Direct hit on us (guard down) → wobble the camera and play the
      // impact cue. Local guard state is the source of truth for whether we
      // blocked it.
      if (localTargetId === SELF_PLAYER_ID && !isTargetInGuard(SELF_PLAYER_ID)) {
        useCameraStore.getState().requestShake(1);
        playHit();
      }
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
      // Every pose frame carries the sender's tint — keeps the opponent's
      // avatar color in sync even if the presence update was dropped.
      if (snap.tint) useGameStore.getState().setPlayerTint(REMOTE_PLAYER_ID, snap.tint);
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

  // Seed self tint from the lobby choice (localStorage) on mount so the
  // avatar reflects it even before presence has a chance to sync.
  useEffect(() => {
    const stored = loadStoredTint();
    if (stored) setPlayerTint(SELF_PLAYER_ID, stored);
  }, [setPlayerTint]);

  // Push self tint up to presence when the channel connects so a direct
  // /game entry (skipping lobby) still carries the preference.
  useEffect(() => {
    if (!connected) return;
    const stored = loadStoredTint();
    if (stored) setTint(stored);
  }, [connected, setTint]);

  // Mirror presence tints into gameStore for both sides — self + peer.
  useEffect(() => {
    const self = players.find((p) => p.playerId === playerId);
    if (self?.tint) setPlayerTint(SELF_PLAYER_ID, self.tint);
    const peer = players.find((p) => p.playerId !== playerId);
    if (peer?.tint) setPlayerTint(REMOTE_PLAYER_ID, peer.tint);
  }, [players, playerId, setPlayerTint]);

  const remotePeer = players.find((p) => p.playerId !== playerId);
  const winnerName =
    outcome === "self"
      ? playerName || "You"
      : remotePeer?.name || "Opponent";
  const loserName =
    outcome === "self"
      ? remotePeer?.name || "Opponent"
      : playerName || "You";

  // When HP hits 0: lock the outcome. Only the winning side POSTs — it's the
  // only side that reliably knows its own playerId without depending on peer
  // presence (which can be missing at KO if channel presence just dropped).
  // We pass the peer's playerId as a hint when presence is available; the
  // server falls through to match_events / room_players otherwise.
  // endedMatchesRef keyed on activeMatchId prevents duplicate POSTs.
  useEffect(() => {
    if (selfHp > 0 && remoteHp > 0) return;
    const selfWon = remoteHp <= 0;
    setOutcome(selfWon ? "self" : "remote");
    // One-shot round-end cue. The outer guard above only passes this effect
    // when one HP has hit zero, and the setOutcome + KO-freeze in the hit
    // loop prevents re-entry on the same KO — so playEnd() fires exactly
    // once per round end.
    playEnd();
    if (!selfWon) return;
    if (!activeMatchId || !playerId) return;
    if (endedMatchesRef.current.has(activeMatchId)) return;
    endedMatchesRef.current.add(activeMatchId);
    const peer = players.find((p) => p.playerId !== playerId);
    const body: { matchId: string; winnerId: string; loserId?: string } = {
      matchId: activeMatchId,
      winnerId: playerId,
    };
    if (peer?.playerId) body.loserId = peer.playerId;
    fetch("/api/matches/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      endedMatchesRef.current.delete(activeMatchId);
    });
  }, [selfHp, remoteHp, activeMatchId, playerId, players]);

  const onMatchIdChange = useCallback((id: string | null) => {
    setActiveMatchId(id);
  }, []);

  const onPlayAgain = useCallback(async () => {
    // Await the broadcast wire flush so the peer reliably receives rematch
    // and triggers their own reload before we tear down our runtime.
    await broadcastGameEvent({ type: "rematch", payload: {} });
    window.location.reload();
  }, [broadcastGameEvent]);

  // Overlay calls this once when local baseline capture lands. Broadcasts
  // guard_ready so the peer's waiting-peer phase can dismiss. Ref-guarded so
  // double-invocation (StrictMode, React re-entry) doesn't double-broadcast.
  const handleSelfGuardReady = useCallback(() => {
    if (selfGuardReadyRef.current) return;
    selfGuardReadyRef.current = true;
    broadcastGameEvent({ type: "guard_ready", payload: {} });
  }, [broadcastGameEvent]);

  // Re-broadcast guard_ready whenever a peer newly appears in presence after
  // we've already locked in. Covers the "peer refreshed their tab / joined
  // late" case — broadcasts are ephemeral, so a peer who wasn't subscribed
  // when we first fired would otherwise never learn we're ready.
  useEffect(() => {
    if (!hasPeerPresence) return;
    if (!selfGuardReadyRef.current) return;
    broadcastGameEvent({ type: "guard_ready", payload: {} });
  }, [hasPeerPresence, broadcastGameEvent]);
  const ready =
    peerBroadcastSeen ||
    (connected && (soloTimedOut || presenceTimedOut));

  const returnToLobby = async (reason: string) => {
    if (leaving) return;
    setLeaving(true);
    // Clear local game state so re-entering a room doesn't flash Results on
    // mount (HP would still be 0 from the previous match otherwise).
    useGameStore.getState().reset();
    setOutcome(null);
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
          matchKey={matchKey}
          matchOver={outcome !== null}
          onMatchIdChange={onMatchIdChange}
          peerGuardReady={peerGuardReady}
          onSelfGuardReady={handleSelfGuardReady}
        />
      )}

      {outcome !== null && (
        <Results
          winnerName={winnerName}
          loserName={loserName}
          selfWon={outcome === "self"}
          onPlayAgain={onPlayAgain}
          onBackToLobby={() => returnToLobby("match_complete")}
        />
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
      `}</style>
    </div>
  );
}
