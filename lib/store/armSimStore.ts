"use client";

import { create } from "zustand";
import type { PlayerId } from "@/types";

export type ArmSimState = "guard" | "punch";

type ArmMap = Partial<Record<PlayerId, ArmSimState>>;

interface ArmSimStore {
  /** Per-arm sim override, keyed by player. Unset entries = no override;
   *  Avatar falls through to its normal CV / idle stack for that arm. */
  leftArm: ArmMap;
  rightArm: ArmMap;
  setArm: (playerId: PlayerId, side: "left" | "right", state: ArmSimState) => void;
  clearArm: (playerId: PlayerId, side: "left" | "right") => void;
  // Convenience — ArmRigSim's right-arm Guard/Punch buttons still call these.
  setRightArm: (playerId: PlayerId, state: ArmSimState) => void;
  clearRightArm: (playerId: PlayerId) => void;
}

export const useArmSimStore = create<ArmSimStore>((set) => ({
  leftArm: {},
  rightArm: {},
  setArm: (playerId, side, state) =>
    set((s) =>
      side === "left"
        ? { leftArm: { ...s.leftArm, [playerId]: state } }
        : { rightArm: { ...s.rightArm, [playerId]: state } },
    ),
  clearArm: (playerId, side) =>
    set((s) => {
      if (side === "left") {
        const next = { ...s.leftArm };
        delete next[playerId];
        return { leftArm: next };
      }
      const next = { ...s.rightArm };
      delete next[playerId];
      return { rightArm: next };
    }),
  setRightArm: (playerId, state) =>
    set((s) => ({ rightArm: { ...s.rightArm, [playerId]: state } })),
  clearRightArm: (playerId) =>
    set((s) => {
      const next = { ...s.rightArm };
      delete next[playerId];
      return { rightArm: next };
    }),
}));
