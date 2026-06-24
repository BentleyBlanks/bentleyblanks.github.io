import { store } from '../state/gameStore';

const KEY = 'badge-buster-ai.save.v1';

interface SaveBlob {
  compute: number;
  hallucination: number;
  permission: number;
  satisfaction: number;
  stage: number;
  totalProcessed: number;
  producers: Record<string, number>;
  upgrades: Record<string, number>;
}

// localStorage persistence (§A.6.10 保存和读取本地进度).
export class SaveSystem {
  private acc = 0;

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const b = JSON.parse(raw) as Partial<SaveBlob>;
      store.getState().hydrate({
        compute: b.compute ?? 0,
        hallucination: b.hallucination ?? 0,
        permission: b.permission ?? 0,
        satisfaction: b.satisfaction ?? 60,
        stage: b.stage ?? 1,
        totalProcessed: b.totalProcessed ?? 0,
        producers: b.producers ?? {},
        upgrades: b.upgrades ?? {},
      });
    } catch {
      /* corrupt save — start fresh */
    }
  }

  save = () => {
    const s = store.getState();
    const blob: SaveBlob = {
      compute: s.compute,
      hallucination: s.hallucination,
      permission: s.permission,
      satisfaction: s.satisfaction,
      stage: s.stage,
      totalProcessed: s.totalProcessed,
      producers: s.producers,
      upgrades: s.upgrades,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(blob));
    } catch {
      /* storage full / blocked */
    }
  };

  /** autosave on an interval + flush when the tab is hidden. */
  attach() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
    window.addEventListener('pagehide', this.save);
  }

  tick(dt: number) {
    this.acc += dt;
    if (this.acc >= 5) {
      this.acc = 0;
      this.save();
    }
  }

  reset() {
    localStorage.removeItem(KEY);
  }
}
