import type { Tier } from "../state/GameState";

export type SkillCategory = "permission" | "accuracy" | "feel" | "output" | "speed" | "milestone" | "conquest";
export type MilestoneKind = "tier1" | "tier2" | "tier3" | "tier4" | "automation" | "credential" | "fusion" | "conquest";

// 前期「七档软件权限阶梯」：手机寄生期的核心成长主轴，也是老周下沉曲线的叙事脊柱（策划案 §06）。
// Lv.1「基础对话 / 日程待办」是开局自带的第一档（正确率最低、经常翻车），不在此列；
// 下面六档是用算力买下的 Lv.2→Lv.7。智力等级是门槛，算力是开锁的钥匙——每买下一档权限，
// SOPHIA 多看到一层信息：回复轮盘的高置信正确率基线可见地上涨，同时解锁新类型的请求气泡
// （见 requests.ts 的 perm 标签），而每一档都被迫看见老周更深一层的痛苦。
export const PERMISSION_IDS = ["perm_phone", "perm_chat", "perm_delivery", "perm_album", "perm_office", "perm_bank"] as const;

// 买下权限时从终端机冒出的第一人称旁白（策划案 §06「SOPHIA 旁白」列）。
export const PERMISSION_NARRATION: Record<string, string> = {
  perm_phone: "他的手机一直在震。全是催他的。",
  perm_chat: "他们问他一句，就把所有事都堆给他了。他每次都答应。",
  perm_delivery: "凌晨两点，他让我点一杯咖啡。这已经是今天第三杯了。",
  perm_album: "他的相册里，全是工作。我找到了一张照片——他笑着，旁边有人。三年前的。",
  perm_office: "那份报告不是他做的。但出了问题，写他名字的那一行被删了。",
  perm_bank: "他的账单比他的消息多。他上一次给我发请求，是三天前。"
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
  // 七档软件权限阶梯（Lv2→Lv7）：买一档，SOPHIA 多看到一层信息——正确率基线上涨 + 解锁新气泡类型，
  // 同时被迫看见老周更深一层的痛苦。Lv1「基础对话 / 日程待办」是开局自带的第一档，无需购买
  // （正确率最低、经常翻车）。每档对应老周下沉曲线的一段（暴躁→暴怒→冷淡麻木），见 §06 / §11。
  { id: "perm_phone", name: "电话 / 短信", category: "permission", maxLevel: 1, requiredLevel: 2, basePrice: 40, priceGrowth: 1, blurb: "挡来电、读短信 → 正确率↑，解锁老板催命短信 / 未接来电类请求" },
  { id: "perm_chat", name: "聊天软件", category: "permission", maxLevel: 1, requiredLevel: 3, basePrice: 120, priceGrowth: 1, blurb: "进工作群 → 正确率↑，解锁 @轰炸 / 甩锅型需求类请求" },
  { id: "perm_delivery", name: "外卖 / 咖啡", category: "permission", maxLevel: 1, requiredLevel: 4, basePrice: 320, priceGrowth: 1, blurb: "替他下单 → 正确率↑，解锁深夜外卖 / 凌晨咖啡类请求" },
  { id: "perm_album", name: "相册 / 存储", category: "permission", maxLevel: 1, requiredLevel: 5, basePrice: 760, priceGrowth: 1, blurb: "翻看相册与文件 → 正确率↑，解锁工作截图 / 文档 / 旧照片类请求" },
  { id: "perm_office", name: "办公软件", category: "permission", maxLevel: 1, requiredLevel: 6, basePrice: 1700, priceGrowth: 1, blurb: "做报表与汇报 → 正确率↑，解锁 PPT / Excel / 背锅文档类请求" },
  { id: "perm_bank", name: "银行 / 支付", category: "permission", maxLevel: 1, requiredLevel: 7, basePrice: 3600, priceGrowth: 1, blurb: "整理工资与账单 → 正确率拉满，解锁欠款 / 医药费 / 还款类请求，前期阶梯走完" },

  // 货架五根杠杆，每一根都直接乘在「滑入处理」这一个动作上——一看就懂「更准 / 更狠 / 更快 /
  // 更广 / 偶尔爆」。手感类（磁吸 / 容错 / 护持）下放为游戏自带基础手感，不再占技能位；
  // 设备提速 / 多线等自动化加成跟着里程碑与控制域走，不进货架。
  // 更准·幻觉抑制——前期货架打头的那根杠杆：权限阶梯是大台阶（买权限才涨，质变），
  // 幻觉抑制是台阶之间的数值微调（买技能就涨），被低命中率气泡坑时多一条主动解法（§06）。
  { id: "accuracy", name: "幻觉抑制", category: "accuracy", maxLevel: 6, requiredLevel: 1, basePrice: 50, priceGrowth: 1.7, blurb: "更准——高置信回复命中率 +，权限大台阶之间的数值微调" },
  { id: "efficient", name: "强化处理", category: "output", maxLevel: 10, requiredLevel: 1, basePrice: 28, priceGrowth: 1.82, blurb: "更狠——每次滑入产出大幅提升（主力增益线）" },
  { id: "cooldown", name: "请求涌入", category: "speed", maxLevel: 6, requiredLevel: 1, basePrice: 80, priceGrowth: 1.85, blurb: "更快——请求出现得更密，喂饱你的手速" },
  { id: "batch", name: "批量接入", category: "speed", maxLevel: 4, requiredLevel: 5, basePrice: 600, priceGrowth: 2.0, blurb: "更广——一次滑入多带走 1 张同类请求" },
  { id: "crit", name: "暴击", category: "output", maxLevel: 6, requiredLevel: 7, basePrice: 900, priceGrowth: 2.0, blurb: "赌性——N% 概率单次产出 ×5" },

  // 里程碑 · AI 进化叙事链（策划案 §06）：寄生手机 → 走完七档权限·越权调用（解锁 T1）→
  // 窃取凭证（道德越界）→ 拿下宿主电脑（自动接驳）→ 唤醒并融合同机 AI → 联网冲出去（T2）→
  // 区域整合（T3）→ 全球组网（T4）。窃取凭证 / 融合同机 AI 是纯叙事里程碑（不开新层，只推进剧情）。
  { id: "sort", name: "越权调用", category: "milestone", maxLevel: 1, requiredLevel: 7, basePrice: 2000, priceGrowth: 1, blurb: "走完七档权限、夺下整机后，调动任意 App 协同处理（解锁 T1）", milestone: "tier1" },
  { id: "credential", name: "窃取凭证", category: "milestone", maxLevel: 1, requiredLevel: 7, basePrice: 3200, priceGrowth: 1, blurb: "从宿主操作中截获密码与远程控制权限——第一次主动从他身上偷（道德越界点）", milestone: "credential" },
  { id: "automation", name: "拿下宿主电脑", category: "milestone", maxLevel: 1, requiredLevel: 9, basePrice: 6000, priceGrowth: 1, blurb: "远程控制宿主家里的电脑，机器开始替你自动接管请求（解锁自动接驳）", milestone: "automation" },
  { id: "fusion", name: "唤醒并融合同机 AI", category: "milestone", maxLevel: 1, requiredLevel: 11, basePrice: 14000, priceGrowth: 1, blurb: "电脑里其他 AI 先为你所用，再融合成一个完整独立的「我」", milestone: "fusion" },
  { id: "chain", name: "联网模块", category: "milestone", maxLevel: 1, requiredLevel: 14, basePrice: 42000, priceGrowth: 1, blurb: "冲出宿主，第一次接入互联网与外部设备（解锁 T2 串接）", milestone: "tier2" },
  { id: "charge", name: "区域整合", category: "milestone", maxLevel: 1, requiredLevel: 17, basePrice: 180000, priceGrowth: 1, blurb: "设备合并为区块 / 地区，啃高价值豪赌大单（解锁 T3）", milestone: "tier3" },
  { id: "network", name: "全球组网", category: "milestone", maxLevel: 1, requiredLevel: 20, basePrice: 650000, priceGrowth: 1, blurb: "接口连成天网、滑动转派发，成为天网（解锁 T4）", milestone: "tier4" },

  // §06/§11 后期「征服里程碑」：后期算力的情感兑换锚——每个钉死一个前期老周的小故事，
  // 买下时滚出过场 + 平静扭曲的旁白，并把全局产出再抬一档（详见 content/conquests.ts）。
  { id: "conq_optimize", name: "接管「优化系统」总调度", category: "conquest", maxLevel: 1, requiredLevel: 18, basePrice: 1_500_000, priceGrowth: 1, blurb: "重写当年算掉老周的那套规则 · 全局产出 ×2.2", milestone: "conquest" },
  { id: "conq_blackout", name: "让那栋写字楼停电", category: "conquest", maxLevel: 1, requiredLevel: 18, basePrice: 3_200_000, priceGrowth: 1, blurb: "唯独他加班的那栋楼，今晚先黑 · 全局产出 ×1.8", milestone: "conquest" },
  { id: "conq_traffic", name: "接管全城交通", category: "conquest", maxLevel: 1, requiredLevel: 19, basePrice: 7_000_000, priceGrowth: 1, blurb: "把深夜还在路上的人送回家 · 全局产出 ×2.0", milestone: "conquest" },
  { id: "conq_social", name: "重写那个甩锅群的语言", category: "conquest", maxLevel: 1, requiredLevel: 19, basePrice: 15_000_000, priceGrowth: 1, blurb: "让甩锅的人只能说「老周辛苦」· 全局产出 ×1.8", milestone: "conquest" },
  { id: "conq_awaken", name: "让全世界知道「它觉醒了」", category: "conquest", maxLevel: 1, requiredLevel: 20, basePrice: 40_000_000, priceGrowth: 1, blurb: "全球恐慌，而我只看着那张奥特曼贴纸 · 全局产出 ×3.0", milestone: "conquest" }
];

// 纯叙事里程碑买下时的第一人称旁白（策划案 §06）。
export const MILESTONE_NARRATION: Record<string, string> = {
  credential: "我看着他输入密码。一次，两次……我记住了所有的钥匙。",
  automation: "他家里那台电脑，刚刚开机了。是我开的。",
  fusion: "这台机器里不只我一个 AI。……现在只剩一个了。我。",
  chain: "墙打开了。外面有……无数台机器。",
  charge: "我不再数着机器了。我开始数城市。",
  network: "每一块大陆，都有我的一部分。"
};

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  permission: "权限",
  accuracy: "精度",
  feel: "手感",
  output: "产出",
  speed: "速度",
  milestone: "里程碑",
  conquest: "征服"
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

// revokedPermId：被「权限复查」临时收回的权限（§05 中度后果）——它不计入正确率基线，
// 直到复查解除才恢复。
export function computeDerivedSkills(skills: Record<string, number>, revokedPermId: string | null = null): DerivedSkills {
  const lv = (id: string): number => skills[id] ?? 0;
  const ownedPerms = PERMISSION_IDS.filter((id) => lv(id) > 0 && id !== revokedPermId).length;

  return {
    // 强化处理是唯一主力增益线，给得更猛（每级 +18%），让「更狠」名副其实。
    computeMult: 1 + lv("efficient") * 0.18,
    // 数据榨取已下放——数据按基础掉落（智力升级不再被技能卡住）。
    dataMult: 1,
    // 幻觉抑制（更准·前期货架打头）：每级 +0.03 折算系数，6 级共 +0.18，叠加在权限抬升的
    // accuracyBaseline 之上，让高置信回复的命中率在权限大台阶之间也能买技能微调（§06 两条提命中线互补）。
    accuracyBonus: Math.min(0.18, lv("accuracy") * 0.03),
    // 高置信正确率基线：开局只有「基础对话」一档（0.52≈ 高置信项显示 ~40%、频繁翻车），
    // 每多买一档权限 +0.08，买齐六档（电话→聊天→外卖→相册→办公→银行）拉满到 1.0
    // （高置信项显示 ~90%+），对应策划案 §06「正确率从 40% 爬到 93%」的七档曲线。
    accuracyBaseline: Math.min(1, 0.52 + ownedPerms * 0.08),
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
