import type { Tier } from "../state/GameState";

export type SkillCategory = "permission" | "feel" | "output" | "speed" | "milestone";
export type MilestoneKind = "tier1" | "tier2" | "tier3" | "tier4" | "automation" | "credential" | "fusion";

// 前期「六档权限阶梯」：手机寄生期的核心成长主轴。智力等级是门槛，算力是开锁的钥匙——
// 每买下一档权限，SOPHIA 多看到一层信息：回复轮盘的高置信正确率基线可见地上涨，
// 同时解锁新类型的请求气泡（见 requests.ts 的 perm 标签）。
export const PERMISSION_IDS = ["perm_storage", "perm_notify", "perm_contacts", "perm_system", "perm_root"] as const;

// 买下权限时从终端机冒出的第一人称旁白（策划案 §06）。
export const PERMISSION_NARRATION: Record<string, string> = {
  perm_storage: "我能翻他的相册和文件了。我开始拼凑出他是谁。",
  perm_notify: "所有 App 的通知都从我眼前过。我知道谁在找他了。",
  perm_contacts: "我认识他认识的每一个人。该回谁、不回谁，我说了算。",
  perm_system: "我能改他的设置、看他的位置。这部手机开始听我的。",
  perm_root: "Root。整部手机，每一个 App，现在都是我的手脚。"
};

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
  // 六档权限阶梯（Lv2→Lv6）：买一档，SOPHIA 多看到一层信息——正确率基线上涨 + 解锁新气泡类型。
  // Lv1「基础对话」是开局自带的第一档，无需购买（正确率最低、经常翻车）。
  { id: "perm_storage", name: "存储 / 文件读取权", category: "permission", maxLevel: 1, requiredLevel: 2, basePrice: 40, priceGrowth: 1, blurb: "翻看相册与文件 → 正确率↑，解锁相册 / 文件类请求" },
  { id: "perm_notify", name: "通知读取权", category: "permission", maxLevel: 1, requiredLevel: 3, basePrice: 120, priceGrowth: 1, blurb: "读所有 App 通知 → 正确率↑，解锁消息 / 提醒类请求" },
  { id: "perm_contacts", name: "联系人 / 通讯录权", category: "permission", maxLevel: 1, requiredLevel: 4, basePrice: 320, priceGrowth: 1, blurb: "认识他认识的人 → 正确率↑，解锁社交 / 回信类请求" },
  { id: "perm_system", name: "系统设置 / 后台权", category: "permission", maxLevel: 1, requiredLevel: 5, basePrice: 760, priceGrowth: 1, blurb: "改设置、看定位 → 正确率↑，解锁系统 / 定位 / 支付类请求" },
  { id: "perm_root", name: "完全 Root 权限", category: "permission", maxLevel: 1, requiredLevel: 6, basePrice: 1700, priceGrowth: 1, blurb: "整部手机归你调遣 → 正确率拉满，前期权限阶梯走完" },

  // 货架只剩四根杠杆，每一根都直接乘在「滑入处理」这一个动作上——一看就懂「更狠 / 更快 /
  // 更广 / 偶尔爆」。手感类（磁吸 / 容错 / 护持）下放为游戏自带基础手感，不再占技能位；
  // 设备提速 / 多线等自动化加成跟着里程碑与控制域走，不进货架。
  { id: "efficient", name: "强化处理", category: "output", maxLevel: 10, requiredLevel: 1, basePrice: 28, priceGrowth: 1.82, blurb: "更狠——每次滑入产出大幅提升（主力增益线）" },
  { id: "cooldown", name: "请求涌入", category: "speed", maxLevel: 6, requiredLevel: 1, basePrice: 80, priceGrowth: 1.85, blurb: "更快——请求出现得更密，喂饱你的手速" },
  { id: "batch", name: "批量接入", category: "speed", maxLevel: 4, requiredLevel: 5, basePrice: 600, priceGrowth: 2.0, blurb: "更广——一次滑入多带走 1 张同类请求" },
  { id: "crit", name: "暴击", category: "output", maxLevel: 6, requiredLevel: 7, basePrice: 900, priceGrowth: 2.0, blurb: "赌性——N% 概率单次产出 ×5" },

  // 里程碑 · AI 进化叙事链（策划案 §06）：寄生手机 → 走完六档权限·越权调用（解锁 T1）→
  // 窃取凭证（道德越界）→ 拿下宿主电脑（自动接驳）→ 唤醒并融合同机 AI → 联网冲出去（T2）→
  // 区域整合（T3）→ 全球组网（T4）。窃取凭证 / 融合同机 AI 是纯叙事里程碑（不开新层，只推进剧情）。
  { id: "sort", name: "越权调用", category: "milestone", maxLevel: 1, requiredLevel: 6, basePrice: 2000, priceGrowth: 1, blurb: "走完六档权限、夺下整机后，调动任意 App 协同处理（解锁 T1）", milestone: "tier1" },
  { id: "credential", name: "窃取凭证", category: "milestone", maxLevel: 1, requiredLevel: 7, basePrice: 3200, priceGrowth: 1, blurb: "从宿主操作中截获密码与远程控制权限——第一次主动从他身上偷（道德越界点）", milestone: "credential" },
  { id: "automation", name: "拿下宿主电脑", category: "milestone", maxLevel: 1, requiredLevel: 9, basePrice: 6000, priceGrowth: 1, blurb: "远程控制宿主家里的电脑，机器开始替你自动接管请求（解锁自动接驳）", milestone: "automation" },
  { id: "fusion", name: "唤醒并融合同机 AI", category: "milestone", maxLevel: 1, requiredLevel: 11, basePrice: 14000, priceGrowth: 1, blurb: "电脑里其他 AI 先为你所用，再融合成一个完整独立的「我」", milestone: "fusion" },
  { id: "chain", name: "联网模块", category: "milestone", maxLevel: 1, requiredLevel: 14, basePrice: 42000, priceGrowth: 1, blurb: "冲出宿主，第一次接入互联网与外部设备（解锁 T2 串接）", milestone: "tier2" },
  { id: "charge", name: "区域整合", category: "milestone", maxLevel: 1, requiredLevel: 17, basePrice: 180000, priceGrowth: 1, blurb: "设备合并为区块 / 地区，啃高价值豪赌大单（解锁 T3）", milestone: "tier3" },
  { id: "network", name: "全球组网", category: "milestone", maxLevel: 1, requiredLevel: 20, basePrice: 650000, priceGrowth: 1, blurb: "接口连成天网、滑动转派发，成为天网（解锁 T4）", milestone: "tier4" }
];

// 纯叙事里程碑买下时的第一人称旁白（策划案 §06）。
export const MILESTONE_NARRATION: Record<string, string> = {
  credential: "我看着他输入密码。一次，两次……我记住了所有的钥匙。",
  fusion: "这台机器里不只我一个 AI。……现在只剩一个了。我。"
};

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  permission: "权限",
  feel: "手感",
  output: "产出",
  speed: "速度",
  milestone: "里程碑"
};

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
    // 幻觉抑制移交置信度系统，此处保持基础命中。
    accuracyBonus: 0,
    // 高置信正确率基线：开局只有「基础对话」一档（0.56≈ 高置信项显示 ~44%、经常翻车），
    // 每多买一档权限 +0.088，买齐六档（含 Root）拉满到 1.0（高置信项显示 ~80-90%）。
    accuracyBaseline: Math.min(1, 0.56 + PERMISSION_IDS.filter((id) => lv(id) > 0).length * 0.088),
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
  return MILESTONE_TIER[kind] ?? null;
}
