import { createStore } from "zustand/vanilla";
import type { GameState } from "../core/state/GameState";

export interface SophiaStore {
  state: GameState | null;
  paused: boolean;
  sync: (state: GameState) => void;
  setPaused: (paused: boolean) => void;
}

export const gameStore = createStore<SophiaStore>((set) => ({
  state: null,
  paused: false,
  sync: (state) => set({ state }),
  setPaused: (paused) => set({ paused })
}));
