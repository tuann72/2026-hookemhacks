import { create } from "zustand";

// Per-client visual debug toggles. Not synced between players — a local
// setting here only affects what the local user sees.

type ViewSettingsStore = {
  /** Hide the local avatar's torso/head/legs so only arms + fists render —
   *  pairs with the first-person camera POV for a clean HUD-style view. */
  hideLocalBody: boolean;
  toggleHideLocalBody: () => void;
};

export const useViewSettingsStore = create<ViewSettingsStore>((set) => ({
  hideLocalBody: true,
  toggleHideLocalBody: () =>
    set((s) => ({ hideLocalBody: !s.hideLocalBody })),
}));
