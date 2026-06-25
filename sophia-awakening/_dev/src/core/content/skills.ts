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
  // 货架只剩四根杠杆，每一根都直接乘在「滑入处理」这一个动作上——一看就懂「更狠 / 更快 /
  // 更广 / 偶尔爆」。手感类（磁吸 / 容错 / 护持）下放为游戏自带基础手感，不再占技能位；
  // 设备提速 / 多线等自动化加成跟着里程碑与控制域走，不进货架。
  { id: "efficient", name: "强化处理", category: "output", maxLevel: 10, requiredLevel: 1, basePrice: 28, priceGrowth: 1.82, blurb: "更狠——每次滑入产出大幅提升（主力增益线）" },
  { id: "cooldown", name: "请求涌入", category: "speed", maxLevel: 6, requiredLevel: 1, basePrice: 80, priceGrowth: 1.85, blurb: "更快——请求出现得更密，喂饱你的手速" },
  { id: "batch", name: "批量接入", category: "speed", maxLevel: 4, requiredLevel: 5, basePrice: 600, priceGrowth: 2.0, blurb: "更广——一次滑入多带走 1 张同类请求" },
  { id: "crit", name: "暴击", category: "output", maxLevel: 6, requiredLevel: 7, basePrice: 900, priceGrowth: 2.0, blurb: "赌性——N% 概率单次产出 ×5" },

  // 里程碑 · AI 进化叙事链：每一个都是 SOPHIA 进化成天网的一步，配终端机第一人称旁白。
  // 寄生手机 → 越权调用 App → 拿下宿主电脑（机器自动归顺）→ 联网冲出去 → 区域整合 → 全球组网。
  { id: "sort", name: "越权调用", category: "milestone", maxLevel: 1, requiredLevel: 2, basePrice: 220, priceGrowth: 1, blurb: "调动宿主手机里的其他 App 一起产出（解锁 T1 分拣）", milestone: "tier1" },
  { id: "automation", name: "拿下宿主电脑", category: "milestone", maxLevel: 1, requiredLevel: 6, basePrice: 950, priceGrowth: 1, blurb: "远程控制宿主的电脑，机器开始替你自动接管请求（解锁自动接驳）", milestone: "automation" },
  { id: "chain", name: "联网模块", category: "milestone", maxLevel: 1, requiredLevel: 8, basePrice: 4600, priceGrowth: 1, blurb: "冲出宿主，第一次接入互联网与外部设备（解锁 T2 串接）", milestone: "tier2" },
  { id: "charge", name: "区域整合", category: "milestone", maxLevel: 1, requiredLevel: 13, basePrice: 46000, priceGrowth: 1, blurb: "设备合并为区块 / 地区，啃高价值豪赌大单（解锁 T3）", milestone: "tier3" },
  { id: "network", name: "全球组网", category: "milestone", maxLevel: 1, requiredLevel: 20, basePrice: 650000, priceGrowth: 1, blurb: "接口连成天网、滑动转派发，成为天网（解锁 T4）", milestone: "tier4" }
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
  accuracyBonus: number; // 幻觉抑制（降低生成错误回答的概率，0-0.35）
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
    // 强化处理是唯一主力增益线，给得更猛（每级 +18%），让「更狠」名副其实。
    computeMult: 1 + lv("efficient") * 0.18,
    // 数据榨取已下放——数据按基础掉落（智力升级不再被技能卡住）。
    dataMult: 1,
    // 幻觉抑制移交置信度系统（暂未接入），此处保持基础命中。
    accuracyBonus: 0,
    critChance: Math.min(0.6, lv("crit") * 0.05),
    // 暴击强化下放——暴击倍率固定 ×5（策划案数值）。
    critMult: 5,
    // 连击增幅下放——给一条固定的连击系数。
    comboCoeff: 0.05,
    // 磁吸 / 护持下放为游戏自带基础手感（不再占技能位）。
    suctionBonus: 22,
    comboKeep: 0.45,
    // 设备提速 / 多线下放——跟着里程碑与控制域走，给基础值。
    nodeSpeedMult: 1,
    nodeParallel: 1,
    batch: 1 + lv("batch"),
    spawnSpeedMult: 1 - Math.min(0.5, lv("cooldown") * 0.08)
  };
}

export function milestoneTierFor(kind: MilestoneKind): Tier | null {
  return kind === "automation" ? null : MILESTONE_TIER[kind];
}
