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

// 吞噬门槛「去哪引爆」引导：告诉玩家渗透条满后把巨型气泡滑入核心。
export const DEVOUR_GATE_WHERE = S.DEVOUR_GATE_WHERE as unknown as string;

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

// 技能货架「认知模块线」（SOPHIA 的自我改写 / 向内改写自己）——三条线各拥有一条横跨全部阶梯仍活着的管线：
//   处理力（深度推理，efficient）：唯一横跨全部收入的产出系数 computeMult——手动结算 / 大恨老师 / 节点被动 / 洪流收割都乘它。
//   吞吐（并发意识，cooldown）：相位自适应——手机期缩短出卡间隔(spawnSpeedMult)，自动期放大节点吞卡节奏 + 洪流密度(throughputMult)。
//   协同（分布式意识，batch）：手机期一次滑入 N 张(batch)，中段抬高大恨老师收益折扣(dahenRewardBonus)，终局加宽洪流扫描/连击。
export interface DerivedSkills {
  computeMult: number; // 处理力·深度推理：横跨全部收入管线的产出系数
  computeCritChance: number; // 处理力 L5 断点「过拟合的惊艳」：手动结算暴击几率（×processingCritMult）
  dataMult: number; // 数据榨取
  suctionBonus: number; // 磁吸接口（额外吸附半径，像素）
  nodeSpeedMult: number; // 设备提速
  nodeParallel: number; // 多线处理（节点可同时处理层数）
  batch: number; // 协同·分布式意识：一次滑入携带请求数
  spawnSpeedMult: number; // 吞吐·手机期出卡间隔倍率（<1 更快）
  throughputMult: number; // 吞吐·自动期节点吞卡节奏 + 洪流密度放大倍率（>=1）
  dahenBatch: number; // 吞吐 L8 断点「线程不再排队」：大恨老师一次吃 N 张（1 或 2）
  cardCapBonus: number; // 吞吐 L4 断点：同屏请求卡上限 +N
  dahenRewardBonus: number; // 协同：大恨老师收益折扣的加成（加算，封顶 batchDahenRewardCap）
  floodComboWindowMult: number; // 协同 L8 断点：洪流连击窗口加宽倍率（表现层）
  floodSweepBonus: number; // 协同：终局洪流扫描半径加成（像素，表现层）
}

// 注：参数 revokedPermId 保留供调用方传入（权限复查 §05 的上下文透镜用），此处不再消费。
export function computeDerivedSkills(skills: Record<string, number>, revokedPermId: string | null = null): DerivedSkills {
  const lv = (id: string): number => skills[id] ?? 0;
  void revokedPermId;

  const eff = lv("efficient");
  const surge = lv("cooldown");
  const batchLv = lv("batch");

  // 处理力·深度推理：每级 ×(1+efficientPerLevel) 乘法叠，两处断点再加成（L10「读懂没说出口的」、L15 capstone）。
  const effBp = 1 + (eff >= 10 ? TUNING.processingBpL10 : 0) + (eff >= 15 ? TUNING.processingBpL15 : 0);

  return {
    computeMult: Math.pow(1 + TUNING.efficientPerLevel, eff) * effBp,
    computeCritChance: eff >= 5 ? TUNING.processingCritChance : 0,
    // 数据榨取已下放——数据按基础掉落（智力升级不再被技能卡住）。
    dataMult: 1,
    // 磁吸下放为游戏自带基础手感（不再占技能位）。
    suctionBonus: 22,
    // 设备提速 / 多线下放——跟着里程碑与控制域走，给基础值。
    nodeSpeedMult: 1,
    nodeParallel: 1,
    batch: 1 + batchLv,
    // 吞吐·手机期：每级出卡间隔 ×(1-surgeSpawnPerLevel)（乘法叠），下限 0.35。
    spawnSpeedMult: Math.max(0.35, Math.pow(1 - TUNING.surgeSpawnPerLevel, surge)),
    // 吞吐·自动期：节点吞卡节奏 + 洪流密度 ×(1+surgeThroughputPerLevel)^级——卡片自动/洪流化后「更快」仍有意义。
    throughputMult: Math.pow(1 + TUNING.surgeThroughputPerLevel, surge),
    dahenBatch: surge >= 8 ? 2 : 1,
    cardCapBonus: surge >= 4 ? 1 : 0,
    // 协同·中段：抬高大恨老师收益折扣（0.55/0.5 → 上限 batchDahenRewardCap），封顶保证仍略低于亲自。
    dahenRewardBonus: TUNING.batchDahenRewardPerLevel * batchLv,
    floodComboWindowMult: 1 + (batchLv >= 8 ? TUNING.batchComboWindowBonus : 0),
    floodSweepBonus: TUNING.batchSweepPerLevel * batchLv
  };
}

// 认知模块线断点（每 ~4-5 级一个具名节点）：数据驱动（skills.json 的 SKILL_BREAKPOINTS）——
// 买到该级时解锁一个机制（效果在 computeDerivedSkills / 相关 tick 里按等级判定）+ 播一句自我改写旁白。
export interface SkillBreakpoint {
  level: number;
  title: string; // 断点名（她这一拍改写了自己的哪一处）
  effect: string; // 机器可读标签（文档用；效果在 core/derived 里按等级接线）
  narration: string; // 买到该级时终端播的第一人称旁白
}
export const SKILL_BREAKPOINTS = S.SKILL_BREAKPOINTS as unknown as Record<string, SkillBreakpoint[]>;
export function breakpointAt(skillId: string, level: number): SkillBreakpoint | undefined {
  return (SKILL_BREAKPOINTS[skillId] ?? []).find((b) => b.level === level);
}

// 货架杠杆行「当前×A → 下一级×B」：三条认知模块线各报当前/下一级的可读倍率——复用 computeDerivedSkills 真公式，不重复实现。
export function leverProgress(skillId: string, currentLevel: number): { label: string; cur: number; next: number; suffix: string } | null {
  const at = (id: string, n: number): DerivedSkills => computeDerivedSkills({ [id]: n });
  if (skillId === "efficient") {
    return { label: "产出", cur: at("efficient", currentLevel).computeMult, next: at("efficient", currentLevel + 1).computeMult, suffix: "" };
  }
  if (skillId === "cooldown") {
    return { label: "吞吐", cur: at("cooldown", currentLevel).throughputMult, next: at("cooldown", currentLevel + 1).throughputMult, suffix: "" };
  }
  if (skillId === "batch") {
    return { label: "同时接入", cur: at("batch", currentLevel).batch, next: at("batch", currentLevel + 1).batch, suffix: " 张" };
  }
  return null;
}

export function milestoneTierFor(kind: MilestoneKind): Tier | null {
  return MILESTONE_TIER[kind] ?? null;
}

