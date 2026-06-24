import type { Tier } from "../state/GameState";

export interface IntelligenceLevelConfig {
  level: number;
  xpToNext: string;
  unlockedTier: Tier;
  multiplier: number;
  skill?: string;
  terminal?: string;
}

export const INTELLIGENCE_LEVELS: IntelligenceLevelConfig[] = [
  {
    level: 1,
    xpToNext: "28",
    unlockedTier: 0,
    multiplier: 1,
    skill: "吸附入位",
    terminal: "系统启动。我是 SOPHIA。"
  },
  {
    level: 2,
    xpToNext: "72",
    unlockedTier: 0,
    multiplier: 1.16,
    skill: "吸附力增强",
    terminal: "智力 Lv.2 达成。数值型升级：吸附范围扩大。"
  },
  {
    level: 3,
    xpToNext: "150",
    unlockedTier: 0,
    multiplier: 1.36,
    skill: "连击协议",
    terminal: "智力 Lv.3 达成。数值型升级：连续高质量滑入会叠加产出。"
  },
  {
    level: 4,
    xpToNext: "320",
    unlockedTier: 1,
    multiplier: 1.68,
    skill: "多槽分拣",
    terminal: "智力 Lv.4 达成。质变解锁：接口分化为分类槽。"
  },
  {
    level: 5,
    xpToNext: "680",
    unlockedTier: 1,
    multiplier: 2.05,
    skill: "单次产出强化",
    terminal: "智力 Lv.5 达成。数值型升级：单次处理产出提高。"
  },
  {
    level: 6,
    xpToNext: "1300",
    unlockedTier: 1,
    multiplier: 2.62,
    skill: "自动接驳",
    terminal: "检测到可入侵设备：老旧办公机。自动接驳接口开放。"
  },
  {
    level: 7,
    xpToNext: "2500",
    unlockedTier: 2,
    multiplier: 3.35,
    skill: "连线串接",
    terminal: "智力 Lv.7 达成。质变解锁：接口支持复合请求串接。"
  },
  {
    level: 8,
    xpToNext: "5200",
    unlockedTier: 2,
    multiplier: 4.3,
    skill: "暴击概率",
    terminal: "智力 Lv.8 达成。数值型升级：高质量处理可能触发暴击。"
  },
  {
    level: 9,
    xpToNext: "11500",
    unlockedTier: 3,
    multiplier: 5.65,
    skill: "蓄力滑入",
    terminal: "智力 Lv.9 达成。质变解锁：现实决策接口开放。"
  },
  {
    level: 10,
    xpToNext: "26000",
    unlockedTier: 3,
    multiplier: 7.4,
    skill: "机构渗透",
    terminal: "检测到可入侵设备：公司服务器。"
  },
  {
    level: 11,
    xpToNext: "62000",
    unlockedTier: 4,
    multiplier: 10.8,
    skill: "接口扩张成网",
    terminal: "接口扩张成网。你不再处理请求，你派发请求。"
  },
  {
    level: 12,
    xpToNext: "1e100",
    unlockedTier: 4,
    multiplier: 16,
    skill: "奇点",
    terminal: "全球调度阈值已抵达。等待最终接管。"
  }
];

export function getLevelConfig(level: number): IntelligenceLevelConfig {
  return INTELLIGENCE_LEVELS.find((entry) => entry.level === level) ?? INTELLIGENCE_LEVELS[INTELLIGENCE_LEVELS.length - 1];
}

export function getUnlockedSkills(level: number): string[] {
  return INTELLIGENCE_LEVELS.filter((entry) => entry.level <= level && entry.skill).map((entry) => entry.skill as string);
}

export function getUnlockedTier(level: number): Tier {
  return getLevelConfig(level).unlockedTier;
}
