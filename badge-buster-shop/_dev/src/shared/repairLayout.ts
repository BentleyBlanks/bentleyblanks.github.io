import { REPAIR_SERVICES, REPAIR_STEAL_LEVEL } from '../content/balance';
import type { CustomerRuntime, GameState, RepairKind } from '../types/state.types';
import { REPAIR_BENCH_H, type Rect } from './layout';

export interface RepairTileLayout {
  kind: RepairKind;
  body: Rect;            // 点击=施工
  tierChip: Rect | null; // 点击=切换材料档（仅贴膜/手机壳）
}

export interface RepairBenchLayout {
  open: boolean;
  customer: CustomerRuntime | null;
  panel: Rect;
  title: Rect;
  tiles: RepairTileLayout[];
  steal: Rect | null;  // 偷资料开关（未解锁=null）
  deliver: Rect;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** 当前聚焦工位、且已进入维修台阶段的顾客（否则 null） */
export function focusedAwaitingPhone(state: GameState): CustomerRuntime | null {
  const count = state.activeCustomers.length;
  if (count === 0) return null;
  const i = clampInt(state.ui.focusedSlot ?? 0, 0, count - 1);
  const customer = state.activeCustomers[i];
  return customer && customer.phone.awaitingDelivery ? customer : null;
}

const EMPTY: RepairBenchLayout = {
  open: false,
  customer: null,
  panel: { x: 0, y: 0, w: 0, h: 0 },
  title: { x: 0, y: 0, w: 0, h: 0 },
  tiles: [],
  steal: null,
  deliver: { x: 0, y: 0, w: 0, h: 0 },
};

export function computeRepairLayout(state: GameState, w: number, h: number): RepairBenchLayout {
  const customer = focusedAwaitingPhone(state);
  if (!customer) return EMPTY;

  const panel: Rect = { x: 0, y: h - REPAIR_BENCH_H, w, h: REPAIR_BENCH_H };
  const pad = 10;
  const gap = 8;
  const title: Rect = { x: pad, y: panel.y + 8, w: w - pad * 2, h: 22 };

  const tileTop = panel.y + 32;
  const tileH = 90;
  const n = REPAIR_SERVICES.length;
  const tileW = (w - pad * 2 - gap * (n - 1)) / n;
  const tiles: RepairTileLayout[] = REPAIR_SERVICES.map((def, i) => {
    const bx = pad + i * (tileW + gap);
    const body: Rect = { x: bx, y: tileTop, w: tileW, h: tileH };
    const hasTiers = def.tiers.length > 1;
    const tierChip: Rect | null = hasTiers
      ? { x: bx + tileW * 0.06, y: tileTop + tileH - 23, w: tileW * 0.88, h: 20 }
      : null;
    return { kind: def.kind, body, tierChip };
  });

  const rowY = tileTop + tileH + 10;
  const rowH = panel.y + REPAIR_BENCH_H - rowY - 12;
  const stealUnlocked = state.level >= REPAIR_STEAL_LEVEL;
  const deliverW = stealUnlocked ? w * 0.44 : w * 0.62;
  const deliver: Rect = { x: w - pad - deliverW, y: rowY, w: deliverW, h: rowH };
  const steal: Rect | null = stealUnlocked
    ? { x: pad, y: rowY, w: w - pad * 2 - deliverW - gap, h: rowH }
    : null;

  return { open: true, customer, panel, title, tiles, steal, deliver };
}
