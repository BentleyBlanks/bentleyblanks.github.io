import {
  COSMIC_CHANCE,
  COSMIC_MAX_LEVEL,
  COSMIC_TRANSFORM_MS,
  GOLDEN_CHANCE,
  GOLDEN_UNLOCK_LEVEL,
  GRID_COLS,
  GRID_ROWS,
  REPAIR_SERVICES,
  SOUL_CHANCE,
  SOUL_UNLOCK_LEVEL,
  phoneTier,
  randomRangeInt,
} from '../content/balance';
import type { AppIconDef, CustomerDef } from '../types/content.types';
import type { PhoneRuntime, PhoneSystemRuntime, PhoneVariant } from '../types/state.types';

function rollVariant(level: number): PhoneVariant {
  if (level <= COSMIC_MAX_LEVEL && Math.random() < COSMIC_CHANCE) return 'cosmic';
  if (level >= GOLDEN_UNLOCK_LEVEL && Math.random() < GOLDEN_CHANCE) return 'golden';
  if (level >= SOUL_UNLOCK_LEVEL && Math.random() < SOUL_CHANCE) return 'soul';
  return 'normal';
}

function weightedIcon(iconDefs: AppIconDef[]): AppIconDef {
  const total = iconDefs.reduce((sum, icon) => sum + icon.spawnWeight, 0);
  let ticket = Math.random() * total;
  for (const icon of iconDefs) {
    ticket -= icon.spawnWeight;
    if (ticket <= 0) {
      return icon;
    }
  }
  return iconDefs[iconDefs.length - 1];
}

export function createPhone(customerId: string, customerDef: CustomerDef, iconDefs: AppIconDef[], level: number): PhoneRuntime {
  const system: PhoneSystemRuntime = Math.random() < 0.55 ? 'android' : 'ios';
  const icons = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, index) => {
    const app = weightedIcon(iconDefs);
    return {
      id: `${customerId}_icon_${index}`,
      appId: app.id,
      badge: 0,
      col: index % GRID_COLS,
      row: Math.floor(index / GRID_COLS),
    };
  });

  const targetTotal = randomRangeInt(customerDef.startBadgeRange[0], customerDef.startBadgeRange[1]);
  const dirtyCount = randomRangeInt(5, 8);
  const dirtyIndexes = [...icons.keys()].sort(() => Math.random() - 0.5).slice(0, dirtyCount);
  let remaining = targetTotal;

  for (const index of dirtyIndexes) {
    icons[index].badge = 1;
    remaining -= 1;
  }

  let guard = 0;
  while (remaining > 0 && guard < 500) {
    const index = dirtyIndexes[randomRangeInt(0, dirtyIndexes.length - 1)];
    const icon = icons[index];
    const def = iconDefs.find((item) => item.id === icon.appId);
    if (!def || icon.badge < def.maxBadge) {
      icon.badge += 1;
      remaining -= 1;
    }
    guard += 1;
  }

  const badgeTotal = icons.reduce((sum, icon) => sum + icon.badge, 0);
  const variant = rollVariant(level);
  return {
    id: `${customerId}_phone`,
    system,
    tier: phoneTier(level),
    variant,
    transformMs: variant === 'cosmic' ? COSMIC_TRANSFORM_MS : Number.POSITIVE_INFINITY,
    offerAccumulatorMs: -randomRangeInt(3_000, 9_000),
    icons,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    badgeTotal,
    incomingRateMult: 1 + Math.max(0, level - 1) * 0.03,
    incomingAccumulatorMs: 0,
    popups: [],
    // 错开首个弹窗，避免一进门就被糊脸
    popupAccumulatorMs: -randomRangeInt(1_200, 3_200),
    scamAccumulatorMs: -randomRangeInt(2_000, 6_000),
    notifications: randomRangeInt(1, level >= 2 ? 3 : 2),
    notificationAccumulatorMs: -randomRangeInt(800, 2_400),
    malware: randomRangeInt(4, level >= 3 ? 26 : 16),
    malwareAccumulatorMs: -randomRangeInt(600, 2_000),
    cleaned: false,
    awaitingDelivery: false,
    repair: {
      services: REPAIR_SERVICES.map((d) => ({ kind: d.kind, tier: 0, done: false })),
      activeKind: null,
      stage: 'idle',
      stageMs: 0,
      steal: false,
      stealResolved: false,
      earned: 0,
    },
  };
}
