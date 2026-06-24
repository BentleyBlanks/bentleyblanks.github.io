import { createStore } from 'zustand/vanilla';
import { PRODUCERS, UPGRADES, producerCost, upgradeCost } from '../config/upgrades';

// Player state (§4 三根支柱：算力 / 幻觉 / 权限). This is the single source of
// truth; Pixi views only read from it (§A.9 数据与表现分离).
export interface GameState {
  compute: number;
  hallucination: number; // global probability bar 0..75 (§6)
  permission: number; // passive multiplier counter (§4)
  stage: number; // 宿主阶段 1..5
  totalProcessed: number;
  producers: Record<string, number>; // id -> owned count
  upgrades: Record<string, number>; // id -> level

  addCompute: (n: number) => void;
  spend: (n: number) => boolean;
  bumpHallucination: (delta: number) => void;
  addPermission: (n: number) => void;
  markProcessed: () => void;
  buyProducer: (id: string) => boolean;
  buyUpgrade: (id: string) => boolean;
  hydrate: (partial: Partial<GameState>) => void;
}

const HALLU_CAP = 75; // §6.2 封顶 75%

export const store = createStore<GameState>((set, get) => ({
  compute: 0,
  hallucination: 0,
  permission: 0,
  stage: 1,
  totalProcessed: 0,
  producers: {},
  upgrades: {},

  addCompute: (n) => set((s) => ({ compute: s.compute + n })),
  spend: (n) => {
    if (get().compute < n) return false;
    set((s) => ({ compute: s.compute - n }));
    return true;
  },
  bumpHallucination: (delta) =>
    set((s) => ({ hallucination: Math.max(0, Math.min(HALLU_CAP, s.hallucination + delta)) })),
  addPermission: (n) => set((s) => ({ permission: s.permission + n })),
  markProcessed: () => set((s) => ({ totalProcessed: s.totalProcessed + 1 })),

  buyProducer: (id) => {
    const def = PRODUCERS.find((p) => p.id === id);
    if (!def) return false;
    const owned = get().producers[id] ?? 0;
    const cost = producerCost(def, owned);
    if (!get().spend(cost)) return false;
    set((s) => ({ producers: { ...s.producers, [id]: owned + 1 } }));
    return true;
  },
  buyUpgrade: (id) => {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lvl = get().upgrades[id] ?? 0;
    if (lvl >= def.maxLevel) return false;
    const cost = upgradeCost(def, lvl);
    if (!get().spend(cost)) return false;
    set((s) => ({ upgrades: { ...s.upgrades, [id]: lvl + 1 } }));
    return true;
  },

  hydrate: (partial) => set((s) => ({ ...s, ...partial })),
}));

// ---- Derived selectors (the global output formula, §5) -------------------

export const sel = {
  permMul: (s: GameState) => 1 + 0.02 * s.permission, // §4
  haluDiscount: (s: GameState) => Math.max(0.25, 1 - s.hallucination / 100), // §5 幻觉折扣 0.25~1
  stageMul: (s: GameState) => Math.pow(10, s.stage - 1), // §5 阶段乘数
  yieldMul: (s: GameState) => 1 + 0.2 * (s.upgrades['yield'] ?? 0), // §同源合并
  throughputMul: (s: GameState) => 1 + 0.18 * (s.upgrades['throughput'] ?? 0),
  // §6 压制等级 0..0.48 reduces single-card hallucination probability.
  suppression: (s: GameState) => 0.12 * (s.upgrades['suppress'] ?? 0),
  // §6.2 passive decay: base −1%/s + 事实核查 −1%/s per level.
  decayPerSec: (s: GameState) => 1 + (s.upgrades['factcheck'] ?? 0),
};
