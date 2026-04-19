"use client";

import { useEffect, useRef } from "react";
import { usePoseStore } from "@/lib/store/poseStore";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import type { PlayerId } from "@/types";
import type { PoseSnapshot } from "@/lib/multiplayer/types";

// Subscribes to the local player's rig in usePoseStore and pushes it over the
// Realtime channel at a bounded rate. Receiver-side mapping lives in the game
// page's `onPoseSnapshot` handler — it routes the incoming rig into the
// REMOTE_PLAYER_ID pose slot so the opponent avatar animates.

const BROADCAST_HZ = 12;

export interface UsePoseSyncOptions {
  /** Pose-store slot the local CV pipeline writes to — typically SELF_PLAYER_ID. */
  selfId: PlayerId;
  /** GameChannel.broadcastPoseSnapshot from useGameChannel. */
  broadcast: (snapshot: Omit<PoseSnapshot, "playerId" | "timestamp">) => void;
  /** When false, subscription is a no-op (e.g. while the channel is still connecting). */
  enabled?: boolean;
}

export function usePoseSync({ selfId, broadcast, enabled = true }: UsePoseSyncOptions) {
  const lastSendMs = useRef(0);
  const sendCount = useRef(0);

  useEffect(() => {
    // DEBUG(multiplayer-broadcast-flakiness): logs every transition of the
    // `enabled` gate (driven by `connected && !!roomUuid` in the game page).
    // If this flips to false mid-match, broadcasts stop — so this is the
    // first place to check when the opponent avatar freezes.
    console.log("[pose-sync] enabled=", enabled);
    if (!enabled) return;
    const interval = 1000 / BROADCAST_HZ;

    const unsub = usePoseStore.subscribe((state) => {
      const now = performance.now();
      if (now - lastSendMs.current < interval) return;

      const mine = state.players[selfId];
      const rig = mine?.rig;
      if (!rig?.pose || Object.keys(rig.pose).length === 0) return;

      lastSendMs.current = now;
      sendCount.current++;
      // DEBUG(multiplayer-broadcast-flakiness): log the 1st broadcast and
      // every 24th (~2s at 12 Hz) so we can see the local sender is alive
      // without spamming the console. `sendCount` staying at 0 = CV pipeline
      // isn't producing a rig (camera / BodyDetector issue, not realtime).
      if (sendCount.current === 1 || sendCount.current % 24 === 0) {
        console.log("[pose-sync] broadcast #", sendCount.current, "bones=", Object.keys(rig.pose).length);
      }
      const cal = usePunchCalibrationStore.getState();
      broadcast({
        rig,
        inGuard: {
          left: cal.leftMetrics.inGuard,
          right: cal.rightMetrics.inGuard,
        },
      });
    });

    return unsub;
  }, [selfId, broadcast, enabled]);
}
