import type { TweaksState } from "./types";

export const PAGE_STORAGE_KEY = "hookemhacks2026_page";

export const TWEAK_DEFAULTS: TweaksState = {
  timeOfDay: "day",
  playerCount: 4,
  matchPct: 72,
  scoreLevel: "mid",
  intensity: "normal",
};

export const BRAND = {
  event: "Hook 'Em Hacks 2026",
  gameName: "Beach Box",
} as const;
