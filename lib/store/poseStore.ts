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
 * arm. `null` means CV drives the arms normally.
 *
 * The animation is driven in two halves:
 *   1. EXTEND: startedAt → startedAt + EXTEND_MS — arm straightens toward
 *      target; once extension hits 1 it HOLDS there.
 *   2. RECOVER: begins when the detector sees the fist drop back to guard
 *      and stamps `releasedAt`. Lasts RECOVER_MS, then Avatar clears.
 */
export interface PunchAnim {
  side: "left" | "right";
  startedAt: number; // performance.now()
  releasedAt: number | null;
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
  ) => void;
  markPunchReleased: (playerId: PlayerId, side: "left" | "right") => void;
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
  setPunchAnim: (playerId, side) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: {
          ...(s.players[playerId] ?? emptyPose()),
          punchAnim: {
            side,
            startedAt: performance.now(),
            releasedAt: null,
          },
        },
      },
    })),
  markPunchReleased: (playerId, side) =>
    set((s) => {
      const prev = s.players[playerId];
      if (!prev?.punchAnim) return s;
      if (prev.punchAnim.side !== side) return s;
      if (prev.punchAnim.releasedAt !== null) return s;
      return {
        players: {
          ...s.players,
          [playerId]: {
            ...prev,
            punchAnim: {
              ...prev.punchAnim,
              releasedAt: performance.now(),
            },
          },
        },
      };
    }),
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
