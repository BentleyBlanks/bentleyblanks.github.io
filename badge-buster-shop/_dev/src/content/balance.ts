import type { UpgradeDef } from '../types/content.types';

export const GRID_COLS = 4;
export const GRID_ROWS = 5;
export const INITIAL_ACTIVE_SLOTS = 1; // 开局一台，靠"加装工位"慢慢扩张
export const INITIAL_QUEUE_CAPACITY = 3;
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

/** 肉鸽 / 盲盒 / 特殊手机（财富有回滚风险，现金最低 0 元） */
export function phoneTier(level: number): number {
  return clamp(1 + Math.floor(level / 3), 1, 12);
}
export const TIER_PAYOUT_STEP = 0.32; // 档次越高身价越高

// 黄金手机：高收益，但每次清除有小概率碎裂被抓走赔巨款
export const GOLDEN_UNLOCK_LEVEL = 10;
export const GOLDEN_CHANCE = 0.08;
export const GOLDEN_BREAK_CHANCE = 0.012;
export const GOLDEN_FINE_PER_TIER = 60;
export const GOLDEN_PAYOUT_MULT = 3;

// 灵魂手机：持续掉声誉，归还时有概率白嫖一个极品技能
export const SOUL_UNLOCK_LEVEL = 8;
export const SOUL_CHANCE = 0.06;
export const SOUL_REP_DRAIN_PER_SEC = 0.02;
export const SOUL_SKILL_CHANCE = 0.25;

// 宇宙魔方手机：仅前期出现，倒计时内不拆除/不修完就变形砸店 → 现金清零
export const COSMIC_MAX_LEVEL = 6;
export const COSMIC_CHANCE = 0.05;
export const COSMIC_TRANSFORM_MS = 20_000;

// 盲盒"帮顾客清理垃圾"邀约
export const OFFER_UNLOCK_LEVEL = 4;
export const OFFER_BASE_INTERVAL_MS = 22_000;
export const OFFER_WIN_CHANCE = 0.62;
export const OFFER_WIN_PER_TIER = 18;
export const OFFER_FINE_PER_TIER = 28;

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
