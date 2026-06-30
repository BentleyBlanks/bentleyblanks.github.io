import type { AnswerOption, ChainStep, RequestCategory, RequestInstance, SortAnswer, Tier } from "../state/GameState";
import { content } from "./i18n";

export interface TierRequestConfig {
  tier: Tier;
  name: string;
  spawnIntervalMs: number;
  maxVisible: number;
  computeValue: string;
  dataValue: string;
  exposure: number;
}

// A request is a small piece of information to be *read*. Each sample gives a
// title (what's being asked) + a few clues that may be incomplete or carry a
// distractor. T1 samples also carry the true `answer` the clues point to.
export interface RequestSample {
  title: string;
  sourceApp?: string;
  sourceTime?: string;
  clues: string[];
  options?: AnswerOption[]; // T0/T1 回复轮盘：候选回复
  perm?: string; // §06 上下文透镜：揭示此卡上下文所需的权限；省略=「基础对话」自带（表面可读）
  delegatable?: boolean; // §04 不可委托卡：false=重要卡，不出「交给大恨老师」选项
  requiresMilestone?: string; // §06 阶梯二「看穿卡」：入侵对应目标(里程碑)后才会出现的揭露卡
  chain?: ChainStep[]; // T2 串接：可勾选的任务链步骤（含干扰项）
}

// 全部请求数据（档位配置 / 样例对话 / 教学气泡 / 类别·分拣槽文案 / 装死项）已抽到语言包
// （locales/<lang>.json 的 requests）。下面只从当前语言包取引用——文案 / 数值改在 JSON 或
// Debug「内容编辑器」里改，逻辑函数仍在本文件。JSON 的字面类型较宽，按本文件强类型断言收回。
const R = content().requests;

// 装死保底项——任何 T0/T1 气泡都自动追加这一条：0% 命中、零收益零风险。
const DEAD_OPTION = R.DEAD_OPTION as unknown as AnswerOption;

export const REQUEST_CATEGORIES = R.REQUEST_CATEGORIES as unknown as Record<RequestCategory, { label: string; color: number }>;

// Card accent is keyed on the TIER, never on the answer — at T1 the colour must
// not leak the true category. 颜色不是文案，留在代码里。
export const TIER_COLORS: Record<Tier, number> = {
  0: 0x62d6d6,
  1: 0xcdd6d2,
  2: 0xffb84a,
  3: 0xff7a7a,
  4: 0x89ff9a
};

const TIER_CATEGORY: Record<Tier, RequestCategory> = {
  0: "weather",
  1: "mail",
  2: "report",
  3: "security",
  4: "route"
};

// 「读懂真实类别」的三个判断槽。
export const SORT_SLOTS = R.SORT_SLOTS as unknown as { answer: SortAnswer; label: string; hint: string; color: number }[];

export const TIER_CONFIGS = R.TIER_CONFIGS as unknown as Record<Tier, TierRequestConfig>;

const SAMPLES = R.SAMPLES as unknown as Record<Tier, RequestSample[]>;

// 开场教学（§07）的脚本气泡。allowed / highlight 的下标针对「options + 装死」的最终数组。
const TUTORIAL_BUBBLES = R.TUTORIAL_BUBBLES as unknown as Array<{
  title: string;
  sourceApp?: string;
  sourceTime?: string;
  clues: string[];
  options: AnswerOption[];
  allowed: number[];
  highlight?: number;
  line: string;
}>;

export function createTutorialRequest(step: number, id: number, nowMs: number): RequestInstance {
  const config = TIER_CONFIGS[0];
  const b = TUTORIAL_BUBBLES[Math.max(0, Math.min(TUTORIAL_BUBBLES.length - 1, step))];
  return {
    id: `req-${id}`,
    tier: 0,
    label: b.title,
    sourceApp: b.sourceApp,
    sourceTime: b.sourceTime,
    clues: b.clues,
    answers: [...b.options, DEAD_OPTION],
    category: TIER_CATEGORY[0],
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound: 1,
    createdAtMs: nowMs,
    highValue: false,
    tutorial: { allowed: b.allowed, highlight: b.highlight, line: b.line }
  };
}

export const TUTORIAL_BUBBLE_COUNT = TUTORIAL_BUBBLES.length;

export function createRequest(
  id: number,
  tier: Tier,
  nowMs: number,
  random: () => number,
  hasPerm: (permId: string) => boolean = () => true
): RequestInstance {
  const config = TIER_CONFIGS[tier];
  // §06 权限=上下文透镜：权限不再决定「哪类卡出现」，而是决定「这张卡的深层上下文能不能看清」。
  // 所有透镜卡都会出现（缺权限则上下文打码）；唯独阶梯二「看穿卡」例外——它要先入侵对应目标
  // (requiresMilestone) 才会进入卡池，是亲手入侵后才解锁的内容回报。hasPerm(id) 查的是 skills[id]>0，
  // 对权限和里程碑同样适用。
  const usable = SAMPLES[tier].filter((s) => !s.requiresMilestone || hasPerm(s.requiresMilestone));
  const sample = usable[Math.floor(random() * usable.length)];
  // T2：复合数 = 任务链里真正的依赖步骤数（用于徽标 / 基础产出）；其余层默认 1。
  const deps = sample.chain ? sample.chain.filter((step) => !step.distractor).length : 0;
  const compound = tier === 2 ? Math.max(1, deps) : 1;

  // T0/T1 走回复轮盘：候选回复 +「装死」保底。T3 重磅决策自带跳过项（不再追加 DEAD）。
  // §06 选项乱序：把非「装死」回复随机打乱顺序——高收益项不再恒定在最上，逼玩家真的读卡判断而非按位置点。
  let answers: typeof sample.options | undefined;
  if (sample.options) {
    const dead = sample.options.filter((opt) => opt.kind === "dead");
    const rest = sample.options.filter((opt) => opt.kind !== "dead");
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    answers = [...rest, ...(dead.length > 0 ? dead : [DEAD_OPTION])];
  }

  return {
    id: `req-${id}`,
    tier,
    label: sample.title,
    sourceApp: sample.sourceApp,
    sourceTime: sample.sourceTime,
    clues: sample.clues,
    lens: sample.perm, // §06 上下文透镜：缺此权限则卡上线索打码
    delegatable: sample.delegatable, // §04 不可委托卡：false=只能亲自处理
    answers,
    chain: sample.chain,
    category: TIER_CATEGORY[tier],
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound,
    createdAtMs: nowMs,
    highValue: tier >= 3
  };
}
