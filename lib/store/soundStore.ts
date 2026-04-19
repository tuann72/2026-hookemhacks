import { create } from "zustand";

// Global mute flag consumed by lib/sound/player.ts. Kept as a Zustand store
// so the toggle UI in /world re-renders when the flag flips. Default on.

interface SoundStore {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
}

export const useSoundStore = create<SoundStore>((set) => ({
  enabled: true,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  setEnabled: (enabled) => set({ enabled }),
}));
