import type { Tier } from "../state/GameState";
import { content } from "./i18n";
import { TUNING } from "../tuning";

// 文案（权限/里程碑旁白、技能名与说明、分类标签）已抽到语言包（locales/<lang>.json 的 skills）。
const S = content().skills;

export type SkillCategory = "permission" | "accuracy" | "feel" | "output" | "speed" | "milestone" | "conquest";
export type MilestoneKind = "tier1" | "tier2" | "tier3" | "tier4" | "automation" | "credential" | "fusion" | "conquest";

// 前期「七档软件权限阶梯」：手机寄生期的核心成长主轴，也是老周下沉曲线的叙事脊柱（策划案 §06）。
// Lv.1「基础对话 / 日程待办」是开局自带的第一档（正确率最低、经常翻车），不在此列；
// 下面六档是用算力买下的 Lv.2→Lv.7。智力等级是门槛，算力是开锁的钥匙——每买下一档权限，
// SOPHIA 多看到一层信息：回复轮盘的高置信正确率基线可见地上涨，同时解锁新类型的请求气泡
// （见 requests.ts 的 perm 标签），而每一档都被迫看见老周更深一层的痛苦。
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
}

// 成长系统：数据升智力（定门槛 + 全局倍率），算力买技能（做选择）。
// 里程碑技能就是 T 层级的钥匙——升维不再自动发生，玩家攒够算力 + 达到所需智力后主动购买。
export const SKILLS = S.SKILLS as unknown as SkillDef[];

// 纯叙事里程碑买下时的第一人称旁白（策划案 §06）。
export const MILESTONE_NARRATION = S.MILESTONE_NARRATION as unknown as Record<string, string>;

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

export function skillPrice(def: SkillDef, currentLevel: number): number {
  return Math.round(def.basePrice * Math.pow(def.priceGrowth, currentLevel));
}

export interface DerivedSkills {
  computeMult: number; // 高效处理 + 稳健处理
  dataMult: number; // 数据榨取
  accuracyBonus: number; // 幻觉抑制（降低生成错误回答的概率，0-0.35）
  accuracyBaseline: number; // 回复轮盘高置信正确率的折算系数（六档权限抬升，0.56→1.0）
  suctionBonus: number; // 磁吸接口（额外吸附半径，像素）
  nodeSpeedMult: number; // 设备提速
  nodeParallel: number; // 多线处理（节点可同时处理层数）
  batch: number; // 批量处理（一次携带请求数）
  spawnSpeedMult: number; // 请求提速（请求生成间隔倍率，<1 更快）
}

// revokedPermId：被「权限复查」临时收回的权限（§05 中度后果）——它不计入正确率基线，
// 直到复查解除才恢复。
export function computeDerivedSkills(skills: Record<string, number>, revokedPermId: string | null = null): DerivedSkills {
  const lv = (id: string): number => skills[id] ?? 0;
  const ownedPerms = PERMISSION_IDS.filter((id) => lv(id) > 0 && id !== revokedPermId).length;

  return {
    // 强化处理是唯一主力增益线（每级加成可在数值编辑器配置）。
    computeMult: 1 + lv("efficient") * TUNING.efficientPerLevel,
    // 数据榨取已下放——数据按基础掉落（智力升级不再被技能卡住）。
    dataMult: 1,
    // 幻觉抑制（更准·前期货架打头）：每级 +0.03 折算系数，6 级共 +0.18，叠加在权限抬升的
    // accuracyBaseline 之上，让高置信回复的命中率在权限大台阶之间也能买技能微调（§06 两条提命中线互补）。
    accuracyBonus: Math.min(TUNING.accuracyMax, lv("accuracy") * TUNING.accuracyPerLevel),
    // 高置信正确率基线：开局只有「基础对话」一档（0.52≈ 高置信项显示 ~40%、频繁翻车），
    // 每多买一档权限 +0.08，买齐六档（电话→聊天→外卖→相册→办公→银行）拉满到 1.0
    // （高置信项显示 ~90%+），对应策划案 §06「正确率从 40% 爬到 93%」的七档曲线。
    accuracyBaseline: Math.min(1, 0.52 + ownedPerms * 0.08),
    // 磁吸下放为游戏自带基础手感（不再占技能位）。
    suctionBonus: 22,
    // 设备提速 / 多线下放——跟着里程碑与控制域走，给基础值。
    nodeSpeedMult: 1,
    nodeParallel: 1,
    batch: 1 + lv("batch"),
    spawnSpeedMult: 1 - Math.min(0.5, lv("cooldown") * 0.08)
  };
}

export function milestoneTierFor(kind: MilestoneKind): Tier | null {
  return MILESTONE_TIER[kind] ?? null;
}

