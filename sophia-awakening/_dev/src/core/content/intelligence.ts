import type { Tier } from "../state/GameState";

export interface IntelligenceLevelConfig {
  level: number;
  xpToNext: string;
  unlockedTier: Tier;
  multiplier: number;
  skill?: string;
  terminal?: string;
}

// Pacing intent: the manual-drag "skill ladder" gets a long, escalating arc
// (suction -> combo -> sorting -> crit -> chain -> charge) across L1-L10.
// Automation only unlocks at L11, dispatch mode at L12, ending approach at L13.
// Because automation arrives near the very end, it accelerates the economy but
// can never blow through the whole ladder on its own.
export const INTELLIGENCE_LEVELS: IntelligenceLevelConfig[] = [
  {
    level: 1,
    xpToNext: "30",
    unlockedTier: 0,
    multiplier: 1,
    skill: "吸附入位",
    terminal: "系统启动。我是 SOPHIA。"
  },
  {
    level: 2,
    xpToNext: "78",
    unlockedTier: 0,
    multiplier: 1.14,
    skill: "吸附力增强",
    terminal: "智力 Lv.2。吸附范围扩大，请求更容易自己滑进核心。"
  },
  {
    level: 3,
    xpToNext: "170",
    unlockedTier: 0,
    multiplier: 1.3,
    skill: "连击协议",
    terminal: "智力 Lv.3。连续高质量滑入会叠加连击产出。手稳，节奏就稳。"
  },
  {
    level: 4,
    xpToNext: "360",
    unlockedTier: 1,
    multiplier: 1.5,
    skill: "多槽分拣",
    terminal: "智力 Lv.4。质变：接口分化为分类槽——看类型，分拣到对应入口。"
  },
  {
    level: 5,
    xpToNext: "720",
    unlockedTier: 1,
    multiplier: 1.74,
    skill: "分拣精通",
    terminal: "智力 Lv.5。分拣命中收益提高，放错的代价也更明显。"
  },
  {
    level: 6,
    xpToNext: "1400",
    unlockedTier: 1,
    multiplier: 2.02,
    skill: "暴击直觉",
    terminal: "智力 Lv.6。高质量分拣开始有概率触发暴击。"
  },
  {
    level: 7,
    xpToNext: "2700",
    unlockedTier: 2,
    multiplier: 2.36,
    skill: "连线串接",
    terminal: "智力 Lv.7。质变：接口支持复合请求，一次滑入结算多条关联请求。"
  },
  {
    level: 8,
    xpToNext: "5200",
    unlockedTier: 2,
    multiplier: 2.78,
    skill: "串接强化",
    terminal: "智力 Lv.8。复合串接的收益进一步提高。"
  },
  {
    level: 9,
    xpToNext: "9800",
    unlockedTier: 3,
    multiplier: 3.3,
    skill: "蓄力滑入",
    terminal: "智力 Lv.9。质变：高价值请求需要按住蓄力，蓄满再滑入核心。"
  },
  {
    level: 10,
    xpToNext: "19000",
    unlockedTier: 3,
    multiplier: 3.95,
    skill: "蓄力精通",
    terminal: "智力 Lv.10。蓄力上限与暴击收益提高。手动处理已近极限。"
  },
  {
    level: 11,
    xpToNext: "42000",
    unlockedTier: 3,
    multiplier: 4.75,
    skill: "自动接驳",
    terminal: "检测到可入侵设备。自动接驳开放——你终于可以让机器替你处理低层请求。"
  },
  {
    level: 12,
    xpToNext: "98000",
    unlockedTier: 4,
    multiplier: 5.8,
    skill: "接口扩张成网",
    terminal: "接口扩张成网。你不再处理请求——你派发请求。"
  },
  {
    level: 13,
    xpToNext: "1e100",
    unlockedTier: 4,
    multiplier: 7.2,
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

export const AUTOMATION_UNLOCK_LEVEL = 11;
export const DISPATCH_UNLOCK_LEVEL = 12;
export const MAX_INTELLIGENCE_LEVEL = INTELLIGENCE_LEVELS[INTELLIGENCE_LEVELS.length - 1].level;
