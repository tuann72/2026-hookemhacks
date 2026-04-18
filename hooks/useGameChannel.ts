"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { GameChannel } from "@/lib/multiplayer/gameChannel";
import type {
  PlayerState,
  AttackEvent,
  HitEvent,
  GameEvent,
  PlayerPresence,
  PoseSnapshot,
} from "@/lib/multiplayer/types";

interface UseGameChannelOptions {
  roomId: string;
  playerId: string;
  playerName: string;
  onPlayerState?: (state: PlayerState) => void;
  onAttack?: (attack: AttackEvent) => void;
  onHit?: (hit: HitEvent) => void;
  onGameEvent?: (event: GameEvent) => void;
  onPoseSnapshot?: (snapshot: PoseSnapshot) => void;
}

export function useGameChannel({
  roomId,
  playerId,
  playerName,
  onPlayerState,
  onAttack,
  onHit,
  onGameEvent,
  onPoseSnapshot,
}: UseGameChannelOptions) {
  const channelRef = useRef<GameChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<PlayerPresence[]>([]);

  // Stable refs so subscribe doesn't need to re-run when handlers change
  const onPlayerStateRef = useRef(onPlayerState);
  const onAttackRef = useRef(onAttack);
  const onHitRef = useRef(onHit);
  const onGameEventRef = useRef(onGameEvent);
  const onPoseSnapshotRef = useRef(onPoseSnapshot);

  useEffect(() => { onPlayerStateRef.current = onPlayerState; }, [onPlayerState]);
  useEffect(() => { onAttackRef.current = onAttack; }, [onAttack]);
  useEffect(() => { onHitRef.current = onHit; }, [onHit]);
  useEffect(() => { onGameEventRef.current = onGameEvent; }, [onGameEvent]);
  useEffect(() => { onPoseSnapshotRef.current = onPoseSnapshot; }, [onPoseSnapshot]);

  useEffect(() => {
    if (!roomId || !playerId) return;

    const channel = new GameChannel(roomId, playerId, playerName);
    channelRef.current = channel;

    channel
      .subscribe({
        onPlayerState: (s) => onPlayerStateRef.current?.(s),
        onAttack: (a) => onAttackRef.current?.(a),
        onHit: (h) => onHitRef.current?.(h),
        onGameEvent: (e) => onGameEventRef.current?.(e),
        onPoseSnapshot: (p) => onPoseSnapshotRef.current?.(p),
        onPresenceChange: setPlayers,
      })
      .then(() => setConnected(true))
      .catch(console.error);

    return () => {
      channel.unsubscribe();
      setConnected(false);
    };
  }, [roomId, playerId, playerName]);

  const broadcastPlayerState = useCallback(
    (state: Omit<PlayerState, "playerId" | "timestamp">) => {
      channelRef.current?.broadcastPlayerState(state);
    },
    []
  );

  const broadcastAttack = useCallback(
    (attack: Omit<AttackEvent, "playerId" | "timestamp">) => {
      channelRef.current?.broadcastAttack(attack);
    },
    []
  );

  const broadcastHit = useCallback((hit: Omit<HitEvent, "timestamp">) => {
    channelRef.current?.broadcastHit(hit);
  }, []);

  const broadcastGameEvent = useCallback(
    (event: Omit<GameEvent, "timestamp">) => {
      channelRef.current?.broadcastGameEvent(event);
    },
    []
  );

  const broadcastPoseSnapshot = useCallback(
    (snapshot: Omit<PoseSnapshot, "playerId" | "timestamp">) => {
      channelRef.current?.broadcastPoseSnapshot(snapshot);
    },
    []
  );

  return {
    connected,
    players,
    broadcastPlayerState,
    broadcastAttack,
    broadcastHit,
    broadcastGameEvent,
    broadcastPoseSnapshot,
  };
}
