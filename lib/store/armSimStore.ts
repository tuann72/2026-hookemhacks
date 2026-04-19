"use client";

import { create } from "zustand";
import type { PlayerId } from "@/types";

export type ArmSimState = "guard" | "punch";

interface ArmSimStore {
  /** Right-arm sim override, keyed by player. Unset entries = no override;
   *  Avatar falls through to its normal CV / idle / punch-keyframe stack. */
  rightArm: Partial<Record<PlayerId, ArmSimState>>;
  setRightArm: (playerId: PlayerId, state: ArmSimState) => void;
  clearRightArm: (playerId: PlayerId) => void;
}

export const useArmSimStore = create<ArmSimStore>((set) => ({
  rightArm: {},
  setRightArm: (playerId, state) =>
    set((s) => ({ rightArm: { ...s.rightArm, [playerId]: state } })),
  clearRightArm: (playerId) =>
    set((s) => {
      const next = { ...s.rightArm };
      delete next[playerId];
      return { rightArm: next };
    }),
}));
