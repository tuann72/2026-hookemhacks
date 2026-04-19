import { create } from "zustand";
import type { PlayerId, PoseLandmark, RigRotations } from "@/types";
import { SELF_PLAYER_ID, REMOTE_PLAYER_ID } from "@/types";

// Per-frame pose data lives here, NOT in React state. R3F reads via getState()
// inside useFrame so we don't trigger re-renders at 30fps.
// Each player has an independent slot so the local CV feed and remote
// realtime feed don't clobber each other.
// Ref: HOOKEMHACKS_CONTEXT.md — "Never do this: useState for per-frame pose data"

/**
 * Transient punch-animation state. Written by the punch detector when a jab/
 * cross fires; read by Avatar.useFrame to override the CV rig on the punching
 * arm for a short window. `null` means CV drives the arms normally.
 */
export interface PunchAnim {
  side: "left" | "right";
  startedAt: number; // performance.now()
  durationMs: number;
}

export interface PlayerPose {
  landmarks: PoseLandmark[] | null;
  rig: RigRotations | null;
  lastUpdateMs: number;
  punchAnim: PunchAnim | null;
}

const emptyPose = (): PlayerPose => ({
  landmarks: null,
  rig: null,
  lastUpdateMs: 0,
  punchAnim: null,
});

interface PoseStore {
  players: Record<PlayerId, PlayerPose>;
  setLandmarks: (
    playerId: PlayerId,
    landmarks: PoseLandmark[],
    timestampMs: number
  ) => void;
  setRig: (playerId: PlayerId, rig: RigRotations) => void;
  setPunchAnim: (
    playerId: PlayerId,
    side: "left" | "right",
    durationMs: number,
  ) => void;
  clearPunchAnim: (playerId: PlayerId) => void;
  clearPlayer: (playerId: PlayerId) => void;
  reset: () => void;
}

const initialPlayers: Record<PlayerId, PlayerPose> = {
  [SELF_PLAYER_ID]: emptyPose(),
  [REMOTE_PLAYER_ID]: emptyPose(),
};

export const usePoseStore = create<PoseStore>((set) => ({
  players: initialPlayers,
  setLandmarks: (playerId, landmarks, timestampMs) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: {
          ...(s.players[playerId] ?? emptyPose()),
          landmarks,
          lastUpdateMs: timestampMs,
        },
      },
    })),
  setRig: (playerId, rig) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: {
          ...(s.players[playerId] ?? emptyPose()),
          rig,
        },
      },
    })),
  setPunchAnim: (playerId, side, durationMs) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: {
          ...(s.players[playerId] ?? emptyPose()),
          punchAnim: { side, startedAt: performance.now(), durationMs },
        },
      },
    })),
  clearPunchAnim: (playerId) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: {
          ...(s.players[playerId] ?? emptyPose()),
          punchAnim: null,
        },
      },
    })),
  clearPlayer: (playerId) =>
    set((s) => ({
      players: { ...s.players, [playerId]: emptyPose() },
    })),
  reset: () =>
    set({
      players: {
        [SELF_PLAYER_ID]: emptyPose(),
        [REMOTE_PLAYER_ID]: emptyPose(),
      },
    }),
}));

// Helper for consumers in useFrame — avoids re-subscription overhead.
export const getPlayerPose = (playerId: PlayerId): PlayerPose =>
  usePoseStore.getState().players[playerId] ?? emptyPose();
