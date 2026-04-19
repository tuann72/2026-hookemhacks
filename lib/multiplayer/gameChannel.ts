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
type TintChangeHandler = (playerId: string, tint: string) => void;

interface SubscribeHandlers {
  onPlayerState?: PlayerStateHandler;
  onAttack?: AttackHandler;
  onHit?: HitHandler;
  onGameEvent?: GameEventHandler;
  onPoseSnapshot?: PoseSnapshotHandler;
  onPresenceChange?: PresenceHandler;
  /**
   * Fires when a peer publishes a tint change. Piggy-backed as a dedicated
   * broadcast because Supabase presence updates to an existing key don't
   * reliably fire `sync` on the peer, so a runtime color change in the lobby
   * otherwise wouldn't propagate.
   */
  onTintChange?: TintChangeHandler;
}

// Exponential backoff for reconnects. 500 ms → 1 s → 2 s → 4 s, capped at 8 s.
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8000;

export class GameChannel {
  private channel: RealtimeChannel;
  private readonly roomId: string;
  private readonly playerId: string;
  private readonly playerName: string;
  /** Stable join time for this tab — avoids churning presence sort order on every ready toggle. */
  private readonly onlineAt: string;
  private ready = false;
  private tint: string | undefined = undefined;

  // Reconnect bookkeeping. `handlers` is captured on the first subscribe() call
  // and reused when we have to rebuild the channel after a drop. `destroyed`
  // flips on unsubscribe() so we stop retrying after a real teardown. The
  // `stableTimer` defers reset of `retryAttempt` until the channel has been
  // SUBSCRIBED for a few seconds — without this, a SUBSCRIBED→CLOSED
  // oscillation keeps the counter at 0 and pins the retry at the min delay.
  private handlers: SubscribeHandlers | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private destroyed = false;
  // True while reconnect() is actively tearing down + re-subscribing. The
  // removeChannel() call there synchronously fires a CLOSED status on the
  // old channel's callback, which would otherwise schedule a backoff retry
  // and race against the fresh subscribe we're about to do. Suppresses the
  // retry scheduler during that window.
  private reconnecting = false;

  constructor(
    roomId: string,
    playerId: string,
    playerName: string,
    initialTint?: string,
  ) {
    this.roomId = roomId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.onlineAt = new Date().toISOString();
    // Pre-seed tint so the first trackPresence on SUBSCRIBED already carries
    // it. Without this, the channel tracks with tint=undefined, setTint fires
    // a second track soon after, and peers can race into a render where only
    // the stale sync has landed.
    this.tint = initialTint;
    this.channel = this.createChannel();
  }

  private createChannel(): RealtimeChannel {
    // DEBUG(multiplayer-broadcast-flakiness): logs every channel construction
    // so we can correlate with Fast-Refresh remounts / stale-channel drops.
    // Remove once the broadcast-drops-on-deploy issue is root-caused.
    console.log("[GC] new", { roomId: this.roomId, playerId: this.playerId });
    return supabase.channel(`room:${this.roomId}`, {
      config: {
        broadcast: { self: false, ack: false }, // ack:false = fire-and-forget for lowest latency
        presence: { key: this.playerId },
      },
    });
  }

  private trackPresence(): Promise<unknown> {
    return this.channel.track({
      playerId: this.playerId,
      name: this.playerName,
      onlineAt: this.onlineAt,
      ready: this.ready,
      tint: this.tint,
    });
  }

  async setReady(ready: boolean): Promise<void> {
    this.ready = ready;
    await this.trackPresence();
  }

  async setTint(tint: string): Promise<void> {
    this.tint = tint;
    // Explicit broadcast — presence `track()` updates don't always fire a
    // `sync` event on peers, so a runtime color change would otherwise not
    // reach the other side until a reconnect. The broadcast is the source of
    // truth for the peer's render; trackPresence is kept only so late-joiners
    // still see the right tint in their initial presence sync.
    this.channel.send({
      type: "broadcast",
      event: "tint",
      payload: { playerId: this.playerId, tint },
    });
    await this.trackPresence();
  }

  subscribe(handlers: SubscribeHandlers): Promise<void> {
    this.handlers = handlers;
    this.bindHandlers();
    return this.startSubscribe();
  }

  /** Wire the stored handlers onto the current channel. Called on initial
   * subscribe and on every reconnect after the channel is recreated. */
  private bindHandlers(): void {
    const h = this.handlers;
    if (!h) return;

    if (h.onPlayerState) {
      this.channel.on("broadcast", { event: "player_state" }, ({ payload }) =>
        h.onPlayerState!(payload as PlayerState),
      );
    }

    if (h.onAttack) {
      this.channel.on("broadcast", { event: "attack" }, ({ payload }) =>
        h.onAttack!(payload as AttackEvent),
      );
    }

    if (h.onHit) {
      this.channel.on("broadcast", { event: "hit" }, ({ payload }) =>
        h.onHit!(payload as HitEvent),
      );
    }

    if (h.onGameEvent) {
      this.channel.on("broadcast", { event: "game_event" }, ({ payload }) =>
        h.onGameEvent!(payload as GameEvent),
      );
    }

    if (h.onPoseSnapshot) {
      this.channel.on("broadcast", { event: "pose" }, ({ payload }) =>
        h.onPoseSnapshot!(payload as PoseSnapshot),
      );
    }

    if (h.onTintChange) {
      this.channel.on("broadcast", { event: "tint" }, ({ payload }) => {
        const p = payload as { playerId: string; tint: string };
        h.onTintChange!(p.playerId, p.tint);
      });
    }

    if (h.onPresenceChange) {
      this.channel.on("presence", { event: "sync" }, () => {
        const state = this.channel.presenceState<PlayerPresence>();
        // Presence stores one array per key (= per player). Multiple entries
        // in the array mean multiple live connections for the same player
        // (dev StrictMode remount, reconnect, two tabs) — collapse to one.
        const players: PlayerPresence[] = [];
        for (const entries of Object.values(state)) {
          if (entries.length === 0) continue;
          // Multiple entries under one key = same player across multiple
          // connections. The player is "ready" if any connection reports ready.
          const anyReady = entries.some((e) => !!e.ready);
          const latest = entries.reduce((a, b) =>
            new Date(a.onlineAt).getTime() >= new Date(b.onlineAt).getTime() ? a : b,
          );
          players.push({
            playerId: latest.playerId,
            name: latest.name,
            onlineAt: latest.onlineAt,
            ready: anyReady,
            tint: latest.tint,
          });
        }
        h.onPresenceChange!(players);
      });
    }
  }

  /** Begin (or re-begin) a subscribe handshake on the current channel.
   * Returns a promise that only resolves/rejects for the *first* attempt —
   * later status transitions trigger the reconnect loop silently. */
  private startSubscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.channel.subscribe(async (status, err) => {
        // DEBUG(multiplayer-broadcast-flakiness): logs SUBSCRIBED /
        // CHANNEL_ERROR / TIMED_OUT / CLOSED transitions. A post-SUBSCRIBED
        // CLOSED or CHANNEL_ERROR now triggers an automatic reconnect via
        // scheduleReconnect() below, so the old "broadcasts silently stop
        // forever" behavior is gone — check the retry logs if pose stops.
        console.log("[GC] status", status, err ?? "");
        if (status === "SUBSCRIBED") {
          this.ready = false;
          await this.trackPresence();
          // Immediately broadcast a "hello" so the peer's client has something
          // to stamp for the `peerBroadcastSeen` signal (used to dismiss the
          // loading overlay). Without this, a joiner whose host hasn't started
          // sending pose data yet would hang on the overlay indefinitely. Sent
          // via the existing pose event with no rig — the game page's
          // onPoseSnapshot already guards on `!snap.rig` so it's a no-op there,
          // but the hook's stamp wrapper catches it first.
          this.channel.send({
            type: "broadcast",
            event: "pose",
            payload: {
              playerId: this.playerId,
              timestamp: performance.now(),
              tint: this.tint,
            } satisfies PoseSnapshot,
          });
          // Also re-announce tint as a dedicated broadcast — covers the case
          // where a peer just arrived and would otherwise miss any earlier
          // color change that happened before they subscribed.
          if (this.tint) {
            this.channel.send({
              type: "broadcast",
              event: "tint",
              payload: { playerId: this.playerId, tint: this.tint },
            });
          }
          // Defer the retry-counter reset: only clear it after the channel
          // has been SUBSCRIBED continuously for 5s. This keeps the backoff
          // climbing during SUBSCRIBED→CLOSED oscillation (which otherwise
          // resets to attempt 1 every cycle and hammers at the min delay).
          if (this.stableTimer) clearTimeout(this.stableTimer);
          this.stableTimer = setTimeout(() => {
            this.retryAttempt = 0;
            this.stableTimer = null;
          }, 5000);
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
          if (this.stableTimer) {
            clearTimeout(this.stableTimer);
            this.stableTimer = null;
          }
          if (this.destroyed) return;
          this.scheduleReconnect();
          if (!settled) {
            settled = true;
            reject(new Error(`Channel ${status}`));
          }
        }
      });
    });
  }

  /** Tear down the dead channel, build a new one, re-bind handlers, and
   * retry subscribe after an exponential-backoff delay. Dedupes against
   * multiple simultaneous status events (CLOSED often fires twice). */
  private scheduleReconnect(): void {
    if (this.retryTimer || this.destroyed || this.reconnecting) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.retryAttempt, RECONNECT_MAX_MS);
    this.retryAttempt++;
    console.log("[GC] reconnect scheduled in", delay, "ms (attempt", this.retryAttempt, ")");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.destroyed) return;
      // removeChannel is safe on an already-dead channel; it just no-ops.
      supabase.removeChannel(this.channel);
      // Kick the underlying realtime socket. If the whole transport is
      // down (not just our channel), new channels will keep CHANNEL_ERROR'ing
      // until the socket itself is reopened — the SDK's auto-reconnect
      // sometimes stalls, so we nudge it. connect() is a no-op when the
      // socket is already open, so this is safe to call unconditionally.
      try {
        supabase.realtime.connect();
      } catch {
        // connect throws if socket is mid-transition — harmless, the next
        // retry attempt will try again.
      }
      this.channel = this.createChannel();
      this.bindHandlers();
      // Any further status errors here are handled inside startSubscribe —
      // the reject path re-schedules another attempt, so we can ignore.
      void this.startSubscribe().catch(() => {});
    }, delay);
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

  broadcastGameEvent(event: Omit<GameEvent, "timestamp">): Promise<unknown> {
    // Returned so callers (e.g. game_start, rematch) can await the wire flush
    // before tearing down the JS runtime via window.location.* — without the
    // await, a hard nav can race the WebSocket and drop the event.
    return Promise.resolve(
      this.channel.send({
        type: "broadcast",
        event: "game_event",
        payload: {
          ...event,
          timestamp: performance.now(),
        } satisfies GameEvent,
      }),
    );
  }

  // Fire-and-forget pose frame. Expect callers to throttle (~15 Hz) — this
  // method itself does not rate-limit.
  broadcastPoseSnapshot(
    snapshot: Omit<PoseSnapshot, "playerId" | "timestamp">,
  ): void {
    const res = this.channel.send({
      type: "broadcast",
      event: "pose",
      payload: {
        // Carry tint on every pose frame as a redundant sync channel. Presence
        // occasionally drops the tint update during the /lobby→/game channel
        // flip; 12 Hz pose broadcasts mean the peer converges within ~80ms
        // even when presence races.
        tint: this.tint,
        ...snapshot,
        playerId: this.playerId,
        timestamp: performance.now(),
      } satisfies PoseSnapshot,
    });
    // DEBUG(multiplayer-broadcast-flakiness): channel.send returns a
    // promise resolving to 'ok' / 'timed out' / 'rate limited'. We log the
    // first 3 sends + every 60th so the console shows whether the sender
    // side is healthy when the receiver reports nothing. `__poseSendCount`
    // is also useful to grep from the live console.
    if (res && typeof (res as Promise<unknown>).then === "function") {
      (res as Promise<unknown>).then((r) => {
        const w = window as unknown as { __poseSendCount?: number };
        w.__poseSendCount = (w.__poseSendCount ?? 0) + 1;
        if (w.__poseSendCount <= 3 || w.__poseSendCount % 60 === 0) {
          console.log("[GC] pose send #", w.__poseSendCount, "result", r);
        }
      }).catch((e) => console.warn("[GC] pose send err", e));
    }
  }

  unsubscribe(): void {
    this.destroyed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    supabase.removeChannel(this.channel);
  }

  /**
   * Tear down the current channel and re-subscribe with the same handlers.
   * Called when a peer first appears in presence — there's a wedged state
   * where the initial alone-in-room subscribe doesn't deliver broadcasts
   * after the peer joins, and recreating the channel clears it. Equivalent
   * to what a manual page reload on both clients fixes.
   */
  async reconnect(): Promise<void> {
    if (this.destroyed || !this.handlers || this.reconnecting) return;
    console.log("[GC] manual reconnect (peer arrival)");
    this.reconnecting = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.retryAttempt = 0;
    // removeChannel synchronously fires CLOSED on the old channel's
    // callback — scheduleReconnect's `reconnecting` guard above skips it.
    supabase.removeChannel(this.channel);
    this.channel = this.createChannel();
    this.bindHandlers();
    try {
      await this.startSubscribe();
    } catch {
      // startSubscribe's reject path schedules a backoff retry internally
      // via scheduleReconnect. By the time that runs we'll have cleared
      // `reconnecting`, so the retry proceeds normally.
    } finally {
      this.reconnecting = false;
    }
  }
}
