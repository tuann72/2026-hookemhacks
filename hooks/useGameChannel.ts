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
  // True once the first broadcast from any peer has arrived. Consumers use
  // this as the "both sides wired up" signal to hide loading overlays —
  // presence alone isn't enough (the wedged-listener bug means presence
  // can be synced while broadcasts are still being dropped).
  const [peerBroadcastSeen, setPeerBroadcastSeen] = useState(false);
  // Ref-gate so the state-setter only fires once instead of on every stamp.
  const peerBroadcastSeenRef = useRef(false);

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

  // Reconnect-on-peer-arrival bookkeeping. We fire an initial `reconnect()`
  // when a peer first appears (the "alone at subscribe" path leaves broadcast
  // listeners wedged); then, if no broadcast arrives from the peer within 2s
  // after that, we fire one more fallback reconnect. Caps at 2 attempts so
  // we don't thrash forever in a genuinely dead room. Refs not state so flag
  // flips don't cause re-renders.
  const hasKickedRef = useRef(false);
  const hasFallbackKickedRef = useRef(false);
  const lastPeerActivityRef = useRef(0);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roomId || !playerId) return;

    // In dev StrictMode, this effect runs → cleans up → runs again. The first
    // channel can emit CHANNEL_ERROR as it's torn down mid-connect; `cancelled`
    // lets us ignore that noise and only react to the final channel.
    let cancelled = false;
    hasKickedRef.current = false;
    hasFallbackKickedRef.current = false;
    lastPeerActivityRef.current = 0;
    peerBroadcastSeenRef.current = false;
    setPeerBroadcastSeen(false);
    const channel = new GameChannel(roomId, playerId, playerName);
    channelRef.current = channel;

    // Stamps last-broadcast-from-peer so the fallback-kick effect can tell
    // whether the first reconnect actually restored the flow. Also flips
    // `peerBroadcastSeen` on first receipt to dismiss the loading overlay.
    const stamp = () => {
      lastPeerActivityRef.current = Date.now();
      if (!peerBroadcastSeenRef.current) {
        peerBroadcastSeenRef.current = true;
        setPeerBroadcastSeen(true);
      }
    };

    channel
      .subscribe({
        onPlayerState: (s) => { stamp(); onPlayerStateRef.current?.(s); },
        onAttack: (a) => { stamp(); onAttackRef.current?.(a); },
        onHit: (h) => { stamp(); onHitRef.current?.(h); },
        onGameEvent: (e) => { stamp(); onGameEventRef.current?.(e); },
        onPoseSnapshot: (p) => { stamp(); onPoseSnapshotRef.current?.(p); },
        onPresenceChange: setPlayers,
      })
      .then(() => {
        if (!cancelled) setConnected(true);
      })
      .catch(() => {
        // Swallow CHANNEL_ERROR silently. Happens on StrictMode remount, brief
        // disconnects during lobby→game nav, Cloudflare hiccups, etc. Supabase
        // auto-reconnects; if it's actually broken the symptom is visible (no
        // presence / no broadcasts) without needing a dev-overlay popup.
      });

    return () => {
      cancelled = true;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      channel.unsubscribe();
      setConnected(false);
    };
  }, [roomId, playerId, playerName]);

  // Auto-kick: when a peer first appears in presence, force a fresh subscribe.
  // Delay is jittered per-client via a playerId hash so two sides don't both
  // tear down at the same instant (which leaves both offline in the window
  // and loses the handshake). Range 400-1200ms → ~800ms spread between any
  // two clients, plenty to avoid simultaneous reconnect. After the first
  // reconnect lands, we arm a fallback: if no broadcast from the peer arrives
  // within 2s, kick once more — catches cases where the first kick raced.
  useEffect(() => {
    if (hasKickedRef.current || !connected) return;
    const hasPeer = players.some((p) => p.playerId !== playerId);
    if (!hasPeer) return;
    hasKickedRef.current = true;

    // Deterministic 400-1200ms jitter from playerId hash.
    let h = 0;
    for (let i = 0; i < playerId.length; i++) {
      h = (h * 31 + playerId.charCodeAt(i)) & 0xffffffff;
    }
    const delay = 400 + (Math.abs(h) % 800);

    const t = setTimeout(async () => {
      const kickAt = Date.now();
      await channelRef.current?.reconnect();
      // Arm the fallback-kick. If we haven't heard anything from the peer
      // 2s after the reconnect lands, try once more — same jitter avoids
      // collision with the other side's own fallback.
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;
        if (hasFallbackKickedRef.current) return;
        if (lastPeerActivityRef.current > kickAt) return; // peer already active
        hasFallbackKickedRef.current = true;
        console.log("[GC] fallback reconnect (no peer activity after first kick)");
        void channelRef.current?.reconnect();
      }, 2000);
    }, delay);
    return () => clearTimeout(t);
  }, [connected, players, playerId]);

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

  const setReady = useCallback((ready: boolean) => {
    void channelRef.current?.setReady(ready);
  }, []);

  return {
    connected,
    players,
    peerBroadcastSeen,
    broadcastPlayerState,
    broadcastAttack,
    broadcastHit,
    broadcastGameEvent,
    broadcastPoseSnapshot,
    setReady,
  };
}
