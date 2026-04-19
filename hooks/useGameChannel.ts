"use client";

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
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
  /**
   * Tint to seed into presence on the first trackPresence. Prevents the race
   * where the channel subscribes with tint=undefined and a follow-up setTint
   * fires a second trackPresence, sometimes leaving peers on the stale sync.
   * Read at construction time only — later tint changes must go through setTint.
   */
  initialTint?: string;
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
  initialTint,
  onPlayerState,
  onAttack,
  onHit,
  onGameEvent,
  onPoseSnapshot,
}: UseGameChannelOptions) {
  const channelRef = useRef<GameChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [rawPlayers, setRawPlayers] = useState<PlayerPresence[]>([]);
  // Broadcast-received tint per playerId. Overrides the presence-derived tint
  // when merging into the final `players` array — Supabase presence updates
  // to an existing key don't always fire sync, so we treat the tint broadcast
  // as authoritative for runtime color changes.
  const [tintOverrides, setTintOverrides] = useState<Record<string, string>>({});
  const players = useMemo(
    () =>
      rawPlayers.map((p) => {
        const override = tintOverrides[p.playerId];
        return override ? { ...p, tint: override } : p;
      }),
    [rawPlayers, tintOverrides],
  );
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

  // initialTint via ref so a tint change doesn't tear down + recreate the
  // channel. Only the first construction reads it; later updates go via setTint.
  const initialTintRef = useRef(initialTint);
  useEffect(() => { initialTintRef.current = initialTint; }, [initialTint]);

  // Reconnect-on-peer-arrival bookkeeping. We keep kicking `reconnect()` on a
  // backoff schedule as long as a peer is in presence but hasn't sent a
  // broadcast we can see — handles the "fast side subscribes, slow side takes
  // 10s to boot" case where one-shot kicks all happen before the slow side
  // is actually ready to respond. Caps at MAX_KICKS to avoid infinite churn.
  const MAX_KICKS = 6;
  const [kickAttempt, setKickAttempt] = useState(0);
  const lastPeerActivityRef = useRef(0);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roomId || !playerId) return;

    // In dev StrictMode, this effect runs → cleans up → runs again. The first
    // channel can emit CHANNEL_ERROR as it's torn down mid-connect; `cancelled`
    // lets us ignore that noise and only react to the final channel.
    let cancelled = false;
    lastPeerActivityRef.current = 0;
    peerBroadcastSeenRef.current = false;
    setPeerBroadcastSeen(false);
    setKickAttempt(0);
    setTintOverrides({});
    const channel = new GameChannel(
      roomId,
      playerId,
      playerName,
      initialTintRef.current,
    );
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
        onPresenceChange: setRawPlayers,
        onTintChange: (pid, tint) => {
          stamp();
          setTintOverrides((prev) =>
            prev[pid] === tint ? prev : { ...prev, [pid]: tint },
          );
        },
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

  // Persistent auto-kick loop. While `hasPeer && connected && !peerBroadcastSeen`,
  // schedule a `reconnect()` and bump `kickAttempt`, which re-runs the effect
  // after the reconnect lands. First kick uses a per-client jitter (derived
  // from playerId) so two sides don't tear down at the same instant. Later
  // kicks wait 2s to give the peer's slow boot time to catch up — crucial
  // when one side is still initialising camera/MediaPipe and can't yet hit
  // us with a broadcast. Stops as soon as we see *any* peer broadcast, or
  // after MAX_KICKS attempts to avoid infinite churn on a dead room.
  useEffect(() => {
    if (!connected || peerBroadcastSeen) return;
    const hasPeer = players.some((p) => p.playerId !== playerId);
    if (!hasPeer) return;
    if (kickAttempt >= MAX_KICKS) return;

    let delay: number;
    if (kickAttempt === 0) {
      // Deterministic 400-1200ms jitter from playerId hash for the first kick
      // so two clients with different ids don't collide.
      let h = 0;
      for (let i = 0; i < playerId.length; i++) {
        h = (h * 31 + playerId.charCodeAt(i)) & 0xffffffff;
      }
      delay = 400 + (Math.abs(h) % 800);
    } else {
      // Subsequent kicks: 2s apart, plenty of breathing room for a slow
      // peer to finish booting before we kick again.
      delay = 2000;
    }

    fallbackTimerRef.current = setTimeout(async () => {
      if (kickAttempt > 0) {
        console.log("[GC] retry kick", kickAttempt + 1, "— peer presence but no broadcast");
      }
      await channelRef.current?.reconnect();
      // Bump the attempt counter to re-run this effect. The guard at the
      // top short-circuits if `peerBroadcastSeen` flipped during the kick.
      setKickAttempt((n) => n + 1);
    }, delay);
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [connected, players, playerId, peerBroadcastSeen, kickAttempt]);

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
      return channelRef.current?.broadcastGameEvent(event) ?? Promise.resolve();
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

  const setTint = useCallback((tint: string) => {
    void channelRef.current?.setTint(tint);
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
    setTint,
  };
}
