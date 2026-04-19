"use client";

import { create } from "zustand";
import type { PlayerId } from "@/types";

export interface FallingBall {
  id: string;
  targetPlayerId: PlayerId;
  damage: number;
  /** Height above the target's root at which the ball spawns (meters). */
  startY: number;
}

interface BallsStore {
  balls: FallingBall[];
  /** Spawn a new falling ball above the target player. */
  drop: (target: PlayerId, damage?: number) => void;
  /** Called by the ball component once it lands or falls off the map. */
  remove: (id: string) => void;
}

let idCounter = 0;

export const useBallsStore = create<BallsStore>((set) => ({
  balls: [],
  drop: (target, damage = 15) =>
    set((s) => ({
      balls: [
        ...s.balls,
        {
          id: `ball-${Date.now()}-${idCounter++}`,
          targetPlayerId: target,
          damage,
          startY: 7,
        },
      ],
    })),
  remove: (id) =>
    set((s) => ({ balls: s.balls.filter((b) => b.id !== id) })),
}));
