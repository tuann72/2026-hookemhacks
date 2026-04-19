import { create } from "zustand";
import {
  type Baseline,
  type HandMetrics,
  type HandSample,
  type Params,
  DEFAULTS,
  EMPTY_METRICS,
} from "@/lib/detection/punch";

// Calibration + tuning state shared between the always-mounted PunchDetector
// (which reads thresholds to fire punches) and the CalibrateGuardPanel UI
// (which tunes them). Kept out of React state so detector effects aren't
// re-subscribed on every keystroke in the sliders.
//
// Hot per-frame mutables (armed, lastFire, lastPos) live as refs inside the
// detector itself — only the bits both sides share live here.

interface PunchCalibrationStore {
  /** Slider draft values — not yet applied to the detector. */
  pending: Params;
  /** Live thresholds driving detection. Apply pending → active to commit. */
  active: Params;
  /** Captured baseline hand samples. `null` if never calibrated. */
  baseline: Baseline | null;
  /** Countdown readout (3/2/1) while calibrating, `null` otherwise. */
  countdown: number | null;
  /** Error/info string shown under the calibrate button. */
  calibrateMsg: string | null;
  /** Live punch counts. Reset by the panel or when applying new params. */
  leftCount: number;
  rightCount: number;
  uppercutCount: number;
  /** Uppercut charge + mode state. Published by the detector each frame. */
  isUppercutMode: boolean;
  chargeProgress: number; // 0..1
  /** Live per-hand detection metrics. Published by the detector each frame. */
  leftMetrics: HandMetrics;
  rightMetrics: HandMetrics;

  setPending: (p: Params | ((prev: Params) => Params)) => void;
  setActive: (p: Params) => void;
  applyPending: () => void;
  setBaseline: (
    updater: Baseline | null | ((prev: Baseline | null) => Baseline | null),
  ) => void;
  setBaselineSides: (left: HandSample | null, right: HandSample | null) => void;
  setCountdown: (n: number | null) => void;
  setCalibrateMsg: (msg: string | null) => void;
  setLeftCount: (n: number | ((prev: number) => number)) => void;
  setRightCount: (n: number | ((prev: number) => number)) => void;
  setUppercutCount: (n: number | ((prev: number) => number)) => void;
  setIsUppercutMode: (b: boolean) => void;
  setChargeProgress: (p: number) => void;
  setLeftMetrics: (m: HandMetrics) => void;
  setRightMetrics: (m: HandMetrics) => void;
  resetCounts: () => void;
  reset: () => void;
}

export const usePunchCalibrationStore = create<PunchCalibrationStore>((set) => ({
  pending: DEFAULTS,
  active: DEFAULTS,
  baseline: null,
  countdown: null,
  calibrateMsg: null,
  leftCount: 0,
  rightCount: 0,
  uppercutCount: 0,
  isUppercutMode: false,
  chargeProgress: 0,
  leftMetrics: EMPTY_METRICS,
  rightMetrics: EMPTY_METRICS,

  setPending: (p) =>
    set((s) => ({ pending: typeof p === "function" ? p(s.pending) : p })),
  setActive: (p) => set({ active: p }),
  applyPending: () => set((s) => ({ active: s.pending })),
  setBaseline: (updater) =>
    set((s) => ({
      baseline: typeof updater === "function" ? updater(s.baseline) : updater,
    })),
  setBaselineSides: (left, right) =>
    set((s) => ({
      baseline: {
        left: left ?? s.baseline?.left ?? null,
        right: right ?? s.baseline?.right ?? null,
      },
    })),
  setCountdown: (n) => set({ countdown: n }),
  setCalibrateMsg: (msg) => set({ calibrateMsg: msg }),
  setLeftCount: (n) =>
    set((s) => ({ leftCount: typeof n === "function" ? n(s.leftCount) : n })),
  setRightCount: (n) =>
    set((s) => ({ rightCount: typeof n === "function" ? n(s.rightCount) : n })),
  setUppercutCount: (n) =>
    set((s) => ({ uppercutCount: typeof n === "function" ? n(s.uppercutCount) : n })),
  setIsUppercutMode: (b) => set({ isUppercutMode: b }),
  setChargeProgress: (p) => set({ chargeProgress: p }),
  setLeftMetrics: (m) => set({ leftMetrics: m }),
  setRightMetrics: (m) => set({ rightMetrics: m }),
  resetCounts: () => set({ leftCount: 0, rightCount: 0, uppercutCount: 0, isUppercutMode: false, chargeProgress: 0 }),
  reset: () =>
    set({
      pending: DEFAULTS,
      active: DEFAULTS,
      baseline: null,
      countdown: null,
      calibrateMsg: null,
      leftCount: 0,
      rightCount: 0,
      uppercutCount: 0,
      isUppercutMode: false,
      chargeProgress: 0,
      leftMetrics: EMPTY_METRICS,
      rightMetrics: EMPTY_METRICS,
    }),
}));
