import type { UpgradeDef } from '../types/content.types';

export const GRID_COLS = 4;
export const GRID_ROWS = 5;
export const INITIAL_ACTIVE_SLOTS = 3; // 默认同时平铺 3 台手机
export const INITIAL_QUEUE_CAPACITY = 4;
export const INITIAL_REPUTATION = 3;
export const BASE_PATIENCE_MS = 30_000;
export const BASE_ARRIVAL_INTERVAL_MS = 8_000;
export const INCOMING_BASE_INTERVAL_MS = 2_600;
export const SAVE_KEY = 'badge-buster-shop:v2';

/** 在岗顾客也会流失耐心（按真实时间的比例），制造"忙不过来"的压力。 */
export const ACTIVE_PATIENCE_RATE = 0.5;
export const PATIENCE_PER_UPGRADE = 8_000;

/** 遮挡弹窗节奏 */
export const AD_POPUP_BASE_INTERVAL_MS = 6_400;
export const SCAM_POPUP_BASE_INTERVAL_MS = 16_000;
export const SCAM_GRACE_BASE_MS = 6_000;
export const MAX_POPUPS_PER_PHONE = 3;
export const SCAM_UNLOCK_LEVEL = 3;

/** 顶部通知栏广告 */
export const NOTIF_BASE_INTERVAL_MS = 5_200;
export const MAX_NOTIFICATIONS = 6;

/** 后台恶意软件 */
export const MALWARE_GAIN_INTERVAL_MS = 1_500;
export const MALWARE_LAG_THRESHOLD = 78; // ≥ 此值手机卡死，无法清角标
export const MALWARE_MAX = 100;
export const MALWARE_UNLOCK_LEVEL = 2;

export function xpToNextLevel(level: number): number {
  return Math.floor(10 * Math.pow(level, 1.6));
}

export function upgradeCost(def: UpgradeDef, ownedLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, ownedLevel));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function randomRangeInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
