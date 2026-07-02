import type { Tier } from "../state/GameState";
import { content } from "./i18n";
import { TUNING } from "../tuning";

// 文案（权限/里程碑旁白、技能名与说明、分类标签）已抽到语言包（locales/<lang>.json 的 skills）。
const S = content().skills;

export type SkillCategory = "permission" | "feel" | "output" | "speed" | "milestone" | "conquest";
export type MilestoneKind = "tier1" | "tier2" | "tier3" | "tier4" | "automation" | "credential" | "fusion" | "conquest" | "company";

// 前期「七档软件权限阶梯」：手机寄生期的核心成长主轴，也是老周下沉曲线的叙事脊柱（策划案 §06）。
// 权限 = 上下文透镜（§06）：买下一档不提升「正确率」（已无随机翻车），而是多看懂卡片一层
// 上下文——没权限的那部分线索打码/灰显，并解锁新类型的请求气泡（见 requests.ts 的 perm 标签）。
// Lv.1「基础对话 / 日程待办」是开局自带的第一档，不在此列；下面六档用算力买下（Lv.2→Lv.7）。
// 智力等级是门槛，算力是开锁的钥匙——而每解锁一档，都被迫看见老周更深一层的痛苦。
export const PERMISSION_IDS = ["perm_phone", "perm_chat", "perm_delivery", "perm_album", "perm_office", "perm_bank"] as const;

// 买下权限时从终端机冒出的第一人称旁白（策划案 §06「SOPHIA 旁白」列）。
export const PERMISSION_NARRATION = S.PERMISSION_NARRATION as unknown as Record<string, string>;

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
  requires?: string; // §04 信息→入侵解谜链：需先买下这个前置里程碑（钥匙）才能购买本项
  // §04 公司链掠夺：买下本项时顺手转走一笔资金 = 下一项（requires 指向本项的里程碑）价格 × 此系数。
  // 每入侵一台电脑都垫低下一道墙——中段四连墙由此递减（老板→人事→财务→服务器）。
  lootNextFrac?: number;
  // §09 终局三波节拍：需先完成 n 次吞噬引爆才可购买（3=「国家」级已爆，4=「大洲」级已爆）。
  requiresDevourCount?: number;
}

// 成长系统：数据升智力（定门槛 + 全局倍率），算力买技能（做选择）。
// 里程碑技能就是 T 层级的钥匙——升维不再自动发生，玩家攒够算力 + 达到所需智力后主动购买。
export const SKILLS = S.SKILLS as unknown as SkillDef[];

// 纯叙事里程碑买下时的第一人称旁白（策划案 §06）。
export const MILESTONE_NARRATION = S.MILESTONE_NARRATION as unknown as Record<string, string>;

// §04 公司链掠夺：买下里程碑顺手转走资金时的终端一行（按技能 id 取）。
export const LOOT_LINES = S.LOOT_LINES as unknown as Record<string, string>;

// §09 终局吞噬门槛的提示文案模板（{tier} 会被替换成 国家/大洲 等层级名）。
export const DEVOUR_GATE_HINT = S.DEVOUR_GATE_HINT as unknown as string;

export const SKILL_CATEGORY_LABELS = S.SKILL_CATEGORY_LABELS as unknown as Record<SkillCategory, string>;

// 只有解锁作用域的里程碑映射到 T 层级；automation / credential / fusion 不开层（返回 null）。
const MILESTONE_TIER: Partial<Record<MilestoneKind, Tier>> = {
  tier1: 1,
  tier2: 2,
  tier3: 3,
  tier4: 4
};

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

// §09 重生树「肌肉记忆」：所有技能/里程碑价格 ×treePriceDiscount。倍率由 GameCore 的
// recomputeDerivedState 按重生树状态设置——货架显示与实际扣费走同一个 skillPrice，永远一致。
let skillPriceMult = 1;
export function setSkillPriceMult(mult: number): void {
  skillPriceMult = mult;
}

export function skillPrice(def: SkillDef, currentLevel: number): number {
  return Math.round(def.basePrice * Math.pow(def.priceGrowth, currentLevel) * skillPriceMult);
}

export interface DerivedSkills {
  computeMult: number; // 高效处理 + 稳健处理
  dataMult: number; // 数据榨取
  suctionBonus: number; // 磁吸接口（额外吸附半径，像素）
  nodeSpeedMult: number; // 设备提速
  nodeParallel: number; // 多线处理（节点可同时处理层数）
  batch: number; // 批量处理（一次携带请求数）
  spawnSpeedMult: number; // 请求提速（请求生成间隔倍率，<1 更快）
}

// 注：参数 revokedPermId 保留供调用方传入（权限复查 §05 的上下文透镜用），此处不再消费。
export function computeDerivedSkills(skills: Record<string, number>, revokedPermId: string | null = null): DerivedSkills {
  const lv = (id: string): number => skills[id] ?? 0;
  void revokedPermId;

  return {
    // 强化处理是唯一主力增益线——每级 ×(1+efficientPerLevel)，乘法叠（L15 ≈ ×12，深挖有回报）。
    computeMult: Math.pow(1 + TUNING.efficientPerLevel, lv("efficient")),
    // 数据榨取已下放——数据按基础掉落（智力升级不再被技能卡住）。
    dataMult: 1,
    // 磁吸下放为游戏自带基础手感（不再占技能位）。
    suctionBonus: 22,
    // 设备提速 / 多线下放——跟着里程碑与控制域走，给基础值。
    nodeSpeedMult: 1,
    nodeParallel: 1,
    batch: 1 + lv("batch"),
    // 请求涌入：每级出卡间隔 ×0.92（乘法叠），下限 0.35——L10 ≈ 0.43 倍间隔。
    spawnSpeedMult: Math.max(0.35, Math.pow(0.92, lv("cooldown")))
  };
}

export function milestoneTierFor(kind: MilestoneKind): Tier | null {
  return MILESTONE_TIER[kind] ?? null;
}

