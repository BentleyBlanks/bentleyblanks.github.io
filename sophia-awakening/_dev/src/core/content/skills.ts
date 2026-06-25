import type { Tier } from "../state/GameState";

export type SkillCategory = "feel" | "output" | "speed" | "milestone";
export type MilestoneKind = "tier1" | "tier2" | "tier3" | "tier4" | "automation";

export interface SkillDef {
  id: string;
  name: string;
  category: SkillCategory;
  maxLevel: number;
  requiredLevel: number; // intelligence level at which the skill appears on the shelf
  basePrice: number; // compute cost of the first level
  priceGrowth: number; // multiplier applied per already-owned level
  blurb: string; // one-line effect summary (per level for multi-level skills)
  milestone?: MilestoneKind;
}

// 成长系统：数据升智力（定门槛 + 全局倍率），算力买技能（做选择）。
// 里程碑技能就是 T 层级的钥匙——升维不再自动发生，玩家攒够算力 + 达到所需智力后主动购买。
export const SKILLS: SkillDef[] = [
  // ① 手感类（地基，让动作变顺；前期就有用）
  { id: "magnet", name: "磁吸接口", category: "feel", maxLevel: 5, requiredLevel: 1, basePrice: 40, priceGrowth: 1.9, blurb: "扩大吸附半径，滑到接口附近就自动吸入（吸附圈会变大）" },
  { id: "steady", name: "稳健处理", category: "feel", maxLevel: 6, requiredLevel: 1, basePrice: 34, priceGrowth: 1.8, blurb: "扎实的基本功——每次接入产出 +10%" },
  { id: "comboGrace", name: "连击护持", category: "feel", maxLevel: 4, requiredLevel: 4, basePrice: 420, priceGrowth: 1.95, blurb: "判错时连击不清零、只回落一部分（每级保留更多）" },

  // ② 产出类（让数字变大，算力主要去处）
  { id: "efficient", name: "高效处理", category: "output", maxLevel: 8, requiredLevel: 1, basePrice: 28, priceGrowth: 1.78, blurb: "每次接入算力产出 +14%" },
  { id: "extract", name: "数据榨取", category: "output", maxLevel: 6, requiredLevel: 2, basePrice: 95, priceGrowth: 1.95, blurb: "每次接入额外掉数据 +16%（加速升智力）" },
  { id: "crit", name: "暴击处理", category: "output", maxLevel: 5, requiredLevel: 5, basePrice: 540, priceGrowth: 2.0, blurb: "每级 +5% 概率暴击，产出乘暴击倍率" },
  { id: "comboAmp", name: "连击增幅", category: "output", maxLevel: 6, requiredLevel: 8, basePrice: 3400, priceGrowth: 2.0, blurb: "连击数越高，单次产出加成越大" },
  { id: "critPower", name: "暴击强化", category: "output", maxLevel: 4, requiredLevel: 12, basePrice: 26000, priceGrowth: 2.1, blurb: "暴击倍率自 ×3 起每级 +0.5" },

  // ③ 速度类（让节奏变快）
  { id: "cooldown", name: "请求提速", category: "speed", maxLevel: 6, requiredLevel: 2, basePrice: 80, priceGrowth: 1.85, blurb: "新请求出现得更快，每级 -8% 间隔" },
  { id: "batch", name: "批量处理", category: "speed", maxLevel: 3, requiredLevel: 7, basePrice: 2800, priceGrowth: 2.2, blurb: "一次滑入可同时带走多张同类请求，每级 +1 张" },
  { id: "nodeSpeed", name: "设备提速", category: "speed", maxLevel: 6, requiredLevel: 9, basePrice: 5400, priceGrowth: 1.95, blurb: "你控制的电脑处理请求更快，每级 +12%" },
  { id: "parallel", name: "多线处理", category: "speed", maxLevel: 2, requiredLevel: 15, basePrice: 130000, priceGrowth: 2.4, blurb: "一台电脑能同时处理更多层级的请求，每级 +1 路" },

  // ④ 里程碑类（单次购买、高价、买下即解锁新作用域 = T 层级钥匙）
  { id: "sort", name: "多槽分拣", category: "milestone", maxLevel: 1, requiredLevel: 4, basePrice: 280, priceGrowth: 1, blurb: "解锁 T1：接口长出分类槽，按类型分拣", milestone: "tier1" },
  { id: "automation", name: "自动接驳", category: "milestone", maxLevel: 1, requiredLevel: 6, basePrice: 950, priceGrowth: 1, blurb: "解锁自动化：可入侵设备，让机器代你滑入", milestone: "automation" },
  { id: "chain", name: "连线串接", category: "milestone", maxLevel: 1, requiredLevel: 8, basePrice: 4600, priceGrowth: 1, blurb: "解锁 T2：一笔连多个请求一起送", milestone: "tier2" },
  { id: "charge", name: "蓄力滑入", category: "milestone", maxLevel: 1, requiredLevel: 13, basePrice: 46000, priceGrowth: 1, blurb: "解锁 T3：处理影响现实的高价值决策请求", milestone: "tier3" },
  { id: "network", name: "接口组网", category: "milestone", maxLevel: 1, requiredLevel: 20, basePrice: 650000, priceGrowth: 1, blurb: "解锁 T4：接口连成网络、滑动变派发（成为天网）", milestone: "tier4" }
];

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  feel: "手感",
  output: "产出",
  speed: "速度",
  milestone: "里程碑"
};

const MILESTONE_TIER: Record<Exclude<MilestoneKind, "automation">, Tier> = {
  tier1: 1,
  tier2: 2,
  tier3: 3,
  tier4: 4
};

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

export function skillPrice(def: SkillDef, currentLevel: number): number {
  return Math.round(def.basePrice * Math.pow(def.priceGrowth, currentLevel));
}

export interface DerivedSkills {
  computeMult: number; // 高效处理 + 稳健处理
  dataMult: number; // 数据榨取
  critChance: number; // 暴击处理
  critMult: number; // 暴击强化
  comboCoeff: number; // 连击增幅
  suctionBonus: number; // 磁吸接口（额外吸附半径，像素）
  comboKeep: number; // 连击护持（判错时保留的连击比例 0-0.8）
  nodeSpeedMult: number; // 设备提速
  nodeParallel: number; // 多线处理（节点可同时处理层数）
  batch: number; // 批量处理（一次携带请求数）
  spawnSpeedMult: number; // 请求提速（请求生成间隔倍率，<1 更快）
}

export function computeDerivedSkills(skills: Record<string, number>): DerivedSkills {
  const lv = (id: string): number => skills[id] ?? 0;

  return {
    computeMult: 1 + lv("efficient") * 0.14 + lv("steady") * 0.1,
    dataMult: 1 + lv("extract") * 0.16,
    critChance: Math.min(0.45, lv("crit") * 0.05),
    critMult: 3 + lv("critPower") * 0.5,
    comboCoeff: 0.04 + lv("comboAmp") * 0.015,
    suctionBonus: lv("magnet") * 16,
    comboKeep: Math.min(0.8, lv("comboGrace") * 0.25),
    nodeSpeedMult: 1 + lv("nodeSpeed") * 0.12,
    nodeParallel: 1 + lv("parallel"),
    batch: 1 + lv("batch"),
    spawnSpeedMult: 1 - Math.min(0.5, lv("cooldown") * 0.08)
  };
}

export function milestoneTierFor(kind: MilestoneKind): Tier | null {
  return kind === "automation" ? null : MILESTONE_TIER[kind];
}
