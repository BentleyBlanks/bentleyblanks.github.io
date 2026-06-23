import { GRID_COLS, GRID_ROWS, randomRangeInt } from '../content/balance';
import type { AppIconDef, CustomerDef } from '../types/content.types';
import type { PhoneRuntime } from '../types/state.types';

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
  return {
    id: `${customerId}_phone`,
    icons,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    badgeTotal,
    incomingRateMult: 1 + Math.max(0, level - 1) * 0.035,
    incomingAccumulatorMs: 0,
    cleaned: false,
  };
}
