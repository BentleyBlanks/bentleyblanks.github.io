import type { GameState } from "../state/GameState";
import { SAVE_VERSION } from "../state/initialState";
import type { IStorage } from "./IStorage";

export interface LoadedSave {
  state: GameState;
  offlineMs: number;
}

export const SAVE_STORAGE_KEYS = ["sophia-awakening-save-v1", `sophia-awakening-save-v${SAVE_VERSION}`];

export class SaveManager {
  constructor(
    private readonly storage: IStorage,
    private readonly key = `sophia-awakening-save-v${SAVE_VERSION}`
  ) {}

  load(): LoadedSave | null {
    const raw = this.storage.read(this.key);

    if (!raw) {
      return null;
    }

    try {
      const state = JSON.parse(raw) as GameState;

      if (state.version !== SAVE_VERSION) {
        return null;
      }

      const offlineMs = Math.max(0, Date.now() - (state.lastSaveAt || Date.now()));
      return { state, offlineMs };
    } catch {
      return null;
    }
  }

  save(state: GameState): void {
    const snapshot: GameState = JSON.parse(JSON.stringify(state));
    snapshot.lastSaveAt = Date.now();
    this.storage.write(this.key, JSON.stringify(snapshot));
  }

  clear(): void {
    for (const key of SAVE_STORAGE_KEYS) {
      this.storage.remove(key);
    }
  }
}
