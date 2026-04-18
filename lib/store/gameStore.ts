import { create } from "zustand";
import type { GameEvent, GamePhase, Player, PlayerId, Sport } from "@/types";
import { REMOTE_PLAYER_ID, SELF_PLAYER_ID } from "@/types";

interface GameStore {
  sport: Sport;
  phase: GamePhase;
  events: GameEvent[];
  elapsedMs: number;

  players: Player[];
  localPlayerId: PlayerId;

  setSport: (sport: Sport) => void;
  setPhase: (phase: GamePhase) => void;
  addScore: (playerId: PlayerId, delta: number) => void;
  setPlayerName: (playerId: PlayerId, name: string) => void;
  setPlayerConnected: (playerId: PlayerId, connected: boolean) => void;
  pushEvent: (event: GameEvent) => void;
  tick: (deltaMs: number) => void;
  reset: () => void;
}

const initialPlayers: Player[] = [
  {
    id: SELF_PLAYER_ID,
    displayName: "P1",
    tint: "#f97316",
    score: 0,
    isLocal: true,
    isConnected: true,
  },
  {
    id: REMOTE_PLAYER_ID,
    displayName: "P2",
    tint: "#22d3ee",
    score: 0,
    isLocal: false,
    isConnected: false,
  },
];

const initial = {
  sport: "boxing" as Sport,
  phase: "idle" as GamePhase,
  events: [] as GameEvent[],
  elapsedMs: 0,
  players: initialPlayers,
  localPlayerId: SELF_PLAYER_ID,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initial,
  setSport: (sport) => set({ sport }),
  setPhase: (phase) => set({ phase }),
  addScore: (playerId, delta) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, score: p.score + delta } : p
      ),
    })),
  setPlayerName: (playerId, name) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, displayName: name } : p
      ),
    })),
  setPlayerConnected: (playerId, connected) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, isConnected: connected } : p
      ),
    })),
  pushEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  tick: (deltaMs) => set((s) => ({ elapsedMs: s.elapsedMs + deltaMs })),
  reset: () =>
    set((s) => ({
      ...initial,
      // keep sport selection across resets; only scores & phase reset
      sport: s.sport,
      players: s.players.map((p) => ({ ...p, score: 0 })),
    })),
}));
