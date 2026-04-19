import { create } from "zustand";

// Lightweight pub-sub for camera reset + hit shake. GameCanvas controllers
// watch these ticks — resetTick snaps the camera back to the first-person
// POV, shakeTick plays a brief decaying wobble in place.

type CameraStore = {
  resetTick: number;
  shakeTick: number;
  shakeIntensity: number;
  requestReset: () => void;
  requestShake: (intensity?: number) => void;
};

export const useCameraStore = create<CameraStore>((set) => ({
  resetTick: 0,
  shakeTick: 0,
  shakeIntensity: 1,
  requestReset: () => set((s) => ({ resetTick: s.resetTick + 1 })),
  requestShake: (intensity = 1) =>
    set((s) => ({ shakeTick: s.shakeTick + 1, shakeIntensity: intensity })),
}));
