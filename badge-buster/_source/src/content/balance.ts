// balance.ts —— 公式与初始常量（纯数据/纯函数，零逻辑）
export const SAVE_KEY = 'badge-buster-save-v1';

export const GRID_COLS = 4;
export const GRID_ROWS = 5;

export const INITIAL_ACTIVE_SLOTS = 1;
export const INITIAL_QUEUE_CAPACITY = 3;
export const INITIAL_REPUTATION = 3; // 0..5

export const BADGE_INCOME_BASE_MS = 2500; // 每 2500/incomingRateMult ms 在随机图标 +1
export const INITIAL_MAX_PATIENCE = 30000;
export const PATIENCE_PER_UPGRADE = 10000;

export const CUSTOMER_START_ICON_RANGE: [number, number] = [5, 8];

export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 5;
export const REP_GAIN_HAPPY = 0.05;
export const REP_LOSS_ANGRY = 0.2;
export const REP_LOSS_OVERFLOW = 0.2;

export const ARRIVAL_MIN_MS = 1800;

export const PHONE_INCOMING_RATE_MULT = 1; // 单机初始收入速率系数

// 结算系数
export const SPEED_BONUS_FAST = 1.5;
export const SPEED_BONUS_SLOW = 1.0;
export const MOOD_MULT: Record<string, number> = {
  happy: 1.2, neutral: 1.0, annoyed: 0.8, angry: 0.6,
};

/** 升级第 owned 级的造价 */
export function upgradeCost(baseCost: number, costGrowth: number, owned: number): number {
  return Math.floor(baseCost * Math.pow(costGrowth, owned));
}

/** 升到 level 所需经验 */
export function xpToNext(level: number): number {
  return Math.floor(10 * Math.pow(level, 1.6));
}

/** 到店间隔（声誉越高、等级越高越快） */
export function arrivalIntervalMs(reputation: number, level: number): number {
  const factor = 0.7 + 0.1 * reputation + 0.02 * level;
  return Math.max(ARRIVAL_MIN_MS, Math.floor(8000 / factor));
}

/** 声誉对酬金的乘数（rep=3 → 1.0） */
export function reputationPayoutFactor(reputation: number): number {
  return 0.7 + 0.1 * reputation;
}
