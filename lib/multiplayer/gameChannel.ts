import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type {
  PlayerState,
  AttackEvent,
  HitEvent,
  GameEvent,
  PlayerPresence,
  PoseSnapshot,
} from "./types";

type PlayerStateHandler = (state: PlayerState) => void;
type AttackHandler = (attack: AttackEvent) => void;
type HitHandler = (hit: HitEvent) => void;
type GameEventHandler = (event: GameEvent) => void;
type PoseSnapshotHandler = (snapshot: PoseSnapshot) => void;
type PresenceHandler = (players: PlayerPresence[]) => void;

export class GameChannel {
  private channel: RealtimeChannel;
  private readonly roomId: string;
  private readonly playerId: string;
  private readonly playerName: string;

  constructor(roomId: string, playerId: string, playerName: string) {
    this.roomId = roomId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false, ack: false }, // ack:false = fire-and-forget for lowest latency
        presence: { key: playerId },
      },
    });
  }

  subscribe(handlers: {
    onPlayerState?: PlayerStateHandler;
    onAttack?: AttackHandler;
    onHit?: HitHandler;
    onGameEvent?: GameEventHandler;
    onPoseSnapshot?: PoseSnapshotHandler;
    onPresenceChange?: PresenceHandler;
  }): Promise<void> {
    const {
      onPlayerState,
      onAttack,
      onHit,
      onGameEvent,
      onPoseSnapshot,
      onPresenceChange,
    } = handlers;

    if (onPlayerState) {
      this.channel.on("broadcast", { event: "player_state" }, ({ payload }) =>
        onPlayerState(payload as PlayerState)
      );
    }

    if (onAttack) {
      this.channel.on("broadcast", { event: "attack" }, ({ payload }) =>
        onAttack(payload as AttackEvent)
      );
    }

    if (onHit) {
      this.channel.on("broadcast", { event: "hit" }, ({ payload }) =>
        onHit(payload as HitEvent)
      );
    }

    if (onGameEvent) {
      this.channel.on("broadcast", { event: "game_event" }, ({ payload }) =>
        onGameEvent(payload as GameEvent)
      );
    }

    if (onPoseSnapshot) {
      this.channel.on("broadcast", { event: "pose" }, ({ payload }) =>
        onPoseSnapshot(payload as PoseSnapshot)
      );
    }

    if (onPresenceChange) {
      this.channel.on("presence", { event: "sync" }, () => {
        const state = this.channel.presenceState<PlayerPresence>();
        // Presence stores one array per key (= per player). Multiple entries
        // in the array mean multiple live connections for the same player
        // (dev StrictMode remount, reconnect, two tabs) — collapse to one.
        const players: PlayerPresence[] = [];
        for (const entries of Object.values(state)) {
          const first = entries[0];
          if (first) {
            players.push({
              playerId: first.playerId,
              name: first.name,
              onlineAt: first.onlineAt,
            });
          }
        }
        onPresenceChange(players);
      });
    }

    return new Promise((resolve, reject) => {
      this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.channel.track({
            playerId: this.playerId,
            name: this.playerName,
            onlineAt: new Date().toISOString(),
          });
          resolve();
        } else if (status === "CHANNEL_ERROR") {
          reject(new Error("Failed to connect to game channel"));
        }
      });
    });
  }

  broadcastPlayerState(state: Omit<PlayerState, "playerId" | "timestamp">): void {
    this.channel.send({
      type: "broadcast",
      event: "player_state",
      payload: {
        ...state,
        playerId: this.playerId,
        timestamp: performance.now(),
      } satisfies PlayerState,
    });
  }

  broadcastAttack(attack: Omit<AttackEvent, "playerId" | "timestamp">): void {
    this.channel.send({
      type: "broadcast",
      event: "attack",
      payload: {
        ...attack,
        playerId: this.playerId,
        timestamp: performance.now(),
      } satisfies AttackEvent,
    });
  }

  broadcastHit(hit: Omit<HitEvent, "timestamp">): void {
    this.channel.send({
      type: "broadcast",
      event: "hit",
      payload: {
        ...hit,
        timestamp: performance.now(),
      } satisfies HitEvent,
    });
  }

  broadcastGameEvent(event: Omit<GameEvent, "timestamp">): void {
    this.channel.send({
      type: "broadcast",
      event: "game_event",
      payload: {
        ...event,
        timestamp: performance.now(),
      } satisfies GameEvent,
    });
  }

  // Fire-and-forget pose frame. Expect callers to throttle (~15 Hz) — this
  // method itself does not rate-limit.
  broadcastPoseSnapshot(
    snapshot: Omit<PoseSnapshot, "playerId" | "timestamp">,
  ): void {
    this.channel.send({
      type: "broadcast",
      event: "pose",
      payload: {
        ...snapshot,
        playerId: this.playerId,
        timestamp: performance.now(),
      } satisfies PoseSnapshot,
    });
  }

  unsubscribe(): void {
    supabase.removeChannel(this.channel);
  }
}
