import { create } from "zustand";

// Remote player's guard state, mirrored from their pose broadcast. Read by
// the damage helper when a punch or ball strikes REMOTE_PLAYER_ID.

interface RemoteGuardStore {
  left: boolean;
  right: boolean;
  set: (flags: { left: boolean; right: boolean }) => void;
  reset: () => void;
}

export const useRemoteGuardStore = create<RemoteGuardStore>((set) => ({
  left: false,
  right: false,
  set: (flags) => set(flags),
  reset: () => set({ left: false, right: false }),
}));
