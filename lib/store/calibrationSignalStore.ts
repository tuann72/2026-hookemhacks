import { create } from "zustand";

// Pub-sub trigger for punch-detector (re)calibration. Non-UI code (e.g. the
// rematch flow) calls requestRecalibrate() to bump the tick; usePunchDetector
// watches the tick and re-runs its 3-2-1 capture.

type CalibrationSignalStore = {
  requestTick: number;
  requestRecalibrate: () => void;
};

export const useCalibrationSignalStore = create<CalibrationSignalStore>((set) => ({
  requestTick: 0,
  requestRecalibrate: () => set((s) => ({ requestTick: s.requestTick + 1 })),
}));
