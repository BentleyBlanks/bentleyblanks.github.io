import type { UpgradeDef } from '../types/content.types';
import type { RepairKind } from '../types/state.types';

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
export const SCAM_UNLOCK_LEVEL = 7;

/** 顶部通知栏广告 */
export const NOTIF_BASE_INTERVAL_MS = 5_200;
export const MAX_NOTIFICATIONS = 6;

/** 后台恶意软件 */
export const MALWARE_GAIN_INTERVAL_MS = 1_500;
export const MALWARE_PROMPT_THRESHOLD = 60; // ≥ 此值才弹出"清理后台"按钮（低于不打扰）
export const MALWARE_LAG_THRESHOLD = 78; // ≥ 此值手机卡死，无法清角标
export const MALWARE_MAX = 100;
export const MALWARE_UNLOCK_LEVEL = 5;

/** 滑动连清：前期爽感放大器，提前解锁（爽游基准·爽前置） */
export const SWIPE_UNLOCK_LEVEL = 4;

/** 升级解锁等级（分层级阶段：到等级才能买）。基础项 1 级即可，进阶项更晚。 */
export function upgradeUnlockLevel(id: string): number {
  if (id === 'up_swipe') return SWIPE_UNLOCK_LEVEL;
  return 1;
}

/** 铺子段位称号，随等级提升。 */
export function shopRankName(level: number): string {
  if (level >= 30) return '宗师';
  if (level >= 18) return '大师';
  if (level >= 8) return '匠人';
  return '学徒';
}

/** 烦人弹窗扩展 */
export const TIMED_CLOSE_MS = 4_200; // "X 秒后才能关闭"的等待

/** 会动的弹窗（更恶心）：躲避光标 / 泡泡乱滚。爽游基准：后置到纯爽期之后（≥L10）、并降低出现率。 */
export const POPUP_MOTION_UNLOCK_LEVEL = 10;
export const POPUP_DODGE_CHANCE = 0.1;
export const POPUP_BUBBLE_CHANCE = 0.06;
export const POPUP_BUBBLE_SPEED = 0.26; // 屏幕比例/秒（要明显"滚来滚去"又不至于点不到）
export const POPUP_DODGE_RADIUS = 66; // px：光标进入即逃
export const POPUP_DODGE_STEP = 0.2; // 逃逸步长（屏幕比例）
export const BAIT_FINE_PER_TIER = 22; // 假奖励陷阱：点"领取"按钮的扣款（随档次）
export const BAIT_UNLOCK_LEVEL = 8;

/** 肉鸽 / 盲盒 / 特殊手机（财富有回滚风险，现金最低 0 元） */
export function phoneTier(level: number): number {
  return clamp(1 + Math.floor(level / 3), 1, 12);
}
export const TIER_PAYOUT_STEP = 0.32; // 档次越高身价越高

// 黄金手机：高收益，但每次清除有小概率碎裂被抓走赔巨款
export const GOLDEN_UNLOCK_LEVEL = 10;
export const GOLDEN_CHANCE = 0.08;
export const GOLDEN_BREAK_CHANCE = 0.012;
export const GOLDEN_FINE_PER_TIER = 30;
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

// —— 手机维修系统（#4）——
export const REPAIR_UNLOCK_LEVEL = 4;  // 到此级，清完角标后进入"维修台"阶段
export const REPAIR_STEAL_LEVEL = 9;   // 到此级，维修台出现"偷资料"选项
export const REPAIR_OPEN_MS = 620;     // 拆机仪式时长
export const REPAIR_WORK_MS = 920;     // 施工仪式时长
export const REPAIR_CLOSE_MS = 560;    // 装回仪式时长

export interface RepairTier { name: string; profitMult: number; unlockLevel: number }
export interface RepairServiceDef { kind: RepairKind; name: string; emoji: string; base: number; tiers: RepairTier[] }

/** 四项维修服务；贴膜/手机壳分材料档（利润高低不同，按等级解锁，开局只能用低档） */
export const REPAIR_SERVICES: RepairServiceDef[] = [
  { kind: 'dust', name: '清灰', emoji: '🧹', base: 9, tiers: [{ name: '标准清灰', profitMult: 1, unlockLevel: 0 }] },
  {
    kind: 'film', name: '贴膜', emoji: '🛡', base: 10, tiers: [
      { name: '高透膜', profitMult: 1, unlockLevel: 0 },
      { name: '钢化膜', profitMult: 2.2, unlockLevel: 6 },
      { name: '防窥膜', profitMult: 3.8, unlockLevel: 12 },
    ],
  },
  {
    kind: 'case', name: '手机壳', emoji: '📦', base: 8, tiers: [
      { name: '硅胶壳', profitMult: 1, unlockLevel: 0 },
      { name: '磨砂壳', profitMult: 2.1, unlockLevel: 7 },
      { name: '真皮壳', profitMult: 3.6, unlockLevel: 14 },
    ],
  },
  { kind: 'battery', name: '换电池', emoji: '🔋', base: 18, tiers: [{ name: '原厂电池', profitMult: 1, unlockLevel: 0 }] },
];

export function repairServiceDef(kind: RepairKind): RepairServiceDef {
  return REPAIR_SERVICES.find((s) => s.kind === kind) ?? REPAIR_SERVICES[0];
}

/** 某服务在玩家当前等级下最高可用的材料档下标 */
export function maxUnlockedTier(def: RepairServiceDef, level: number): number {
  let idx = 0;
  for (let i = 0; i < def.tiers.length; i += 1) if (level >= def.tiers[i].unlockLevel) idx = i;
  return idx;
}

/** 维修利润：base · 材料倍率 · 档次加成（手机越贵越赚） */
export function repairProfit(def: RepairServiceDef, tierIndex: number, phoneTier: number): number {
  const tier = def.tiers[clamp(tierIndex, 0, def.tiers.length - 1)];
  return Math.max(1, Math.round(def.base * tier.profitMult * (1 + (phoneTier - 1) * 0.24)));
}

// 偷资料：被抓→掉信任(声誉)+赔款；成功→拿到"信息差"换大额现金
export const STEAL_CATCH_CHANCE = 0.34;
export const STEAL_REP_PENALTY = 0.5;          // 被抓掉的声誉
export const STEAL_FINE_PER_TIER = 36;         // 被抓的赔款（随档次）
export const STEAL_WINDFALL_PER_TIER = 130;    // 成功偷到信息差换得的现金（随档次）

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
