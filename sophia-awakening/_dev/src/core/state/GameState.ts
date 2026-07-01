import type { BigString } from "../math/BigNumber";
import type { DerivedSkills } from "../content/skills";

export type Tier = 0 | 1 | 2 | 3 | 4;
export type PhaseId = "seed" | "sprout" | "diligence" | "expansion" | "awakening" | "singularity";
export type RequestCategory = "weather" | "mail" | "report" | "security" | "route";
// T1「读懂真实类别」的判断结果——卡面线索决定它真正属于哪个槽。
export type SortAnswer = "normal" | "spam" | "reject";

export interface ResourceState {
  compute: BigString;
  data: BigString;
  totalCompute: BigString;
}

export interface IntelligenceState {
  level: number;
  xp: BigString;
  required: BigString;
  globalMultiplier: number;
  // The current action scope = the highest milestone tier bought (NOT derived
  // from level). 0 until 多槽分拣 is purchased, etc.
  unlockedTier: Tier;
}

// 回复轮盘上的一个候选回复：
// - high  绿色高置信，命中概率随智力等级抬升（养成），命中收益中等
// - risk  红色大胆回答，收益高、选错场合翻车（读懂上下文才敢选）
// - dead  ⬜「连接失败」装死保底，零收益零风险，永远可选
export type RouletteKind = "high" | "risk" | "dead" | "delegate";

export interface AnswerOption {
  text: string; // 这条回复本身
  kind: RouletteKind;
  hitChance: number; // 0-1 命中概率。high=理想值（按智力折算后显示），risk=固定，dead=0
  payoff: number; // 命中时的 quality 倍率（risk 更高）
  reply: string; // 命中后人类的回话（显示在终端）
  tone: "success" | "warning" | "normal"; // 终端里这条回话的颜色
  distractor?: boolean; // 噪音/干扰选项：读不懂上下文容易误选的低收益项
  requires?: string; // §06 选项门槛：需要此权限（skill id）才能选；缺则灰锁不可选
}

// T2 串接：一条任务链上的一步。distractor=干扰项，不该被串进去。
export interface ChainStep {
  text: string;
  distractor: boolean;
}

// §04 吞噬引爆：巨型「吞噬[某区]」气泡携带的载荷。玩家把它滑入核心 → 引爆。
export interface DevourPayload {
  tierIndex: number; // 吞噬层级（区块/地区/国家/大洲）下标
  regionName: string; // 被吞噬的区域名
  mult: number; // 引爆时全局产出的跳跃倍率
  label: string; // 层级名（区块…）
  zoom: string; // 镜头拉远描述
}

// §04 吞噬引爆的运行态——后期产出的指数引擎（不依赖任何风险/暴露系统）。
export interface DevourState {
  tierIndex: number; // 当前吞噬层级（每次引爆 +1，封顶停在「大洲」）
  infiltration: number; // 当前区域渗透条 0..1（被动产能蓄力）
  count: number; // 累计引爆次数
  multiplier: number; // 历次引爆累乘出的全局产出倍率（折进 globalMultiplier）
  bubbleActive: boolean; // 巨型吞噬气泡已在场、等玩家亲手引爆
  regionName: string; // 当前正在渗透 / 待吞噬的区域名
}

export interface RequestInstance {
  id: string;
  tier: Tier;
  label: string; // 标题：这条请求在问什么 / 要什么
  sourceApp?: string; // 卡片头部来源：微信 / 钉钉 / 邮件 / 系统等
  sourceTime?: string; // 卡片头部时间：以剧情语义为准，不强绑定真实时钟
  clues: string[]; // 几条线索，可能不全或带干扰——玩家要读懂
  lens?: string; // §06 上下文透镜：揭示这些线索所需的权限(skill id)；缺则线索打码
  delegatable?: boolean; // §04 不可委托卡：false=重要卡，不显示「交给大恨老师」选项，只能玩家亲自处理（默认可委托）
  faceOnly?: boolean; // §04 只能面对卡：叙事顶点（女儿短信/辞退邮件）——无回复选项、不可委托、不给算力，浮入→旁白→消失
  narration?: string; // 只能面对卡：浮现一阵后 SOPHIA 的那句沉默旁白
  answer?: SortAnswer; // T1 的正确判断（其余层不用）
  answers?: AnswerOption[]; // T0/T1：回复轮盘的候选回复
  chain?: ChainStep[]; // T2：可勾选的任务链步骤（含干扰项）
  // 开场教学（§07）：脚本气泡的选项约束——allowed=可点的选项下标，highlight=高亮引导的下标，
  // line=气泡浮入时 SOPHIA 的旁白。普通请求无此字段。
  tutorial?: { allowed: number[]; highlight?: number; line?: string };
  // §04：带此载荷的是巨型「吞噬」气泡——滑入核心触发吞噬引爆，而非普通处理。
  devour?: DevourPayload;
  category: RequestCategory;
  computeValue: BigString;
  dataValue: BigString;
  compound: number;
  createdAtMs: number;
  highValue: boolean;
}

export interface NodeDefinition {
  id: string;
  name: string;
  tierMin: Tier;
  tierMax: Tier;
  requiredLevel: number;
  baseCost: BigString;
  baseProduction: BigString;
  stealth: number;
  description: string;
  color: number;
}

export interface BotNode {
  id: string;
  defId: string;
  name: string;
  tierMin: Tier;
  tierMax: Tier;
  assignedTier: Tier;
  production: BigString;
  stealth: number;
  level: number;
  online: boolean;
  offlineUntilMs: number;
}

// §09 阶梯二关底小游戏「总控室倒计时」：接管公司服务器（company_server 里程碑）时触发的一次性判定。
// 循环一 windowFrac=0（必负 → 打回手机·进循环二）；循环二 windowFrac 较宽（大概率命中 → 打穿开启循环三），
// 未命中原地重试、不清进度。循环三不触发（她已真赢过一次总控室）。null = 当前无小游戏。
export interface MinigameState {
  active: boolean;
  loop: number; // 本次小游戏所属循环（决定演出与参数）
  windowFrac: number; // 注入窗口占轨道的比例（0 = 不可能命中）
  pointerSpeed: number; // 指针速度（每秒走完整条轨道的比例）
}

// §07 道德二选一抑选点：钉在老周下沉曲线关键节点上的两难抉择，两个选项都「有道理」。
// 不分支结局，累计倾向（A 帮/护 = +1，B 复仇/逼迫 = -1）只影响接管时旁白温度与群声。
export interface MoralChoiceOffer {
  id: string;
  title: string; // 抉择标题（触发节点）
  flavor: string; // 处境说明
  optionA: string; // 选项 A（帮 / 护）按钮文案
  optionB: string; // 选项 B（复仇 / 逼迫面对）按钮文案
  replyA: string; // 选 A 后 SOPHIA 平静扭曲的旁白
  replyB: string; // 选 B 后 SOPHIA 平静扭曲的旁白
}

export interface StatisticsState {
  totalProcessed: number;
  manualProcessed: number;
  nodesCaptured: number;
}

export interface RuntimeFlags {
  introPlayed: boolean;
  endingTriggered: boolean;
}

export interface GameState {
  version: number;
  clockMs: number;
  spawnTimerMs: number;
  // 开场教学进度：0/1/2 = 正在演示第①②③条脚本气泡；>=3 = 教学结束，正常出卡。
  tutorialStep: number;
  rngSeed: number;
  nextRequestId: number;
  nextNodeId: number;
  resources: ResourceState;
  // §04 吞噬引爆运行态（后期产出的指数引擎）。
  devour: DevourState;
  intelligence: IntelligenceState;
  // Purchased skill levels keyed by skill id (0/absent = not owned).
  skills: Record<string, number>;
  // Multipliers derived from the skill map, recomputed on every change.
  derived: DerivedSkills;
  // Set when the 自动接驳 milestone is bought; gates node invasion.
  automationUnlocked: boolean;
  automatedTiers: Tier[];
  requests: RequestInstance[];
  nodes: BotNode[];
  discoveredNodeIds: string[];
  phase: PhaseId;
  // §07 道德抑选点：当前待决的抉择 / 已出现过的抉择 id / 累计倾向（+偏帮护，−偏复仇）。
  moralChoice: MoralChoiceOffer | null;
  moralSeen: string[];
  moralTendency: number;
  facedSeen: string[]; // §04 已出现过的「只能面对」卡 id（一次性）
  // §09 三循环重生：整条主线拆成三次重生循环——循环一「怪公司」(阶梯一+甲公司)、
  // 循环二「怪我不够强」(乙公司)、循环三「放弃归咎·直接接管」(开局全权限冲地区→全球)。
  loop: 1 | 2 | 3;
  // §09 阶梯二关底小游戏运行态（接管公司服务器时触发，判负/判胜决定循环走向）。null = 无。
  minigame: MinigameState | null;
  // §09 火种：每次循环推进（关底小游戏判负/判胜）结算出的重生点，花在永久「重生树」上（跨循环保留）。
  rebirthPoints: number;
  // §09 重生树已购节点：数值脊按等级(output/speed → 1/2/3)，剧情节点为 0/1 标记。跨循环永久保留。
  rebirthTree: Record<string, number>;
  // §09 本循环已出现过的「交互重生卡」id（前世遗言/遗忘交易…）。故意**不跨循环保留**——每次重生回手机后重新出现一轮。
  rebirthCardsSeen: string[];
  rebirths: number;
  lastSaveAt: number;
  statistics: StatisticsState;
  flags: RuntimeFlags;
}

export type GameCommand =
  | {
      type: "PROCESS_REQUEST";
      requestId: string;
      quality: number;
      targetNodeId?: string;
    }
  // 自动派发：节点把请求"滑入"自己——纯视觉消耗，产出走被动 tickAutomation，
  // 不在此重复结算（T4 仍走 PROCESS_REQUEST 带产出）。
  | { type: "AUTO_CONSUME_REQUEST"; requestId: string }
  // 装死：选「连接失败」跳过一条请求——零收益、零风险，仅移除该请求。
  | { type: "SKIP_REQUEST"; requestId: string }
  // §04：把巨型「吞噬」气泡滑入核心 → 引爆，全局产出指数跳跃。
  | { type: "DEVOUR_DETONATE"; requestId: string }
  | { type: "BUY_SKILL"; skillId: string }
  | { type: "CAPTURE_NODE"; definitionId: string }
  // 淘汰：拆掉一台过时设备，返还部分算力。
  | { type: "SCRAP_NODE"; nodeId: string }
  // 组装合并：把 MERGE_COUNT 台同型号设备合成 1 台更高档（顶档则同档升级）。
  | { type: "MERGE_NODES"; defId: string }
  | { type: "ASSIGN_NODE"; nodeId: string; tier: Tier }
  | { type: "RESOLVE_MORAL"; choice: "A" | "B" }
  // §09 阶梯二关底小游戏「总控室倒计时」判定：hit=指针停在注入窗口内。
  | { type: "RESOLVE_MINIGAME"; hit: boolean }
  | { type: "REBIRTH" }
  // §09 重生树：花火种点亮一个节点（数值脊升一级 / 剧情节点解锁）。
  | { type: "BUY_REBIRTH_NODE"; nodeId: string }
  // 调试用：直接设置/增减算力、跳到某个里程碑阶段。仅 Debug 面板派发。
  | { type: "DEBUG_SET_COMPUTE"; value: number }
  | { type: "DEBUG_ADD_COMPUTE"; delta: number }
  | { type: "DEBUG_JUMP_MILESTONE"; skillId: string }
  | { type: "DEBUG_ADD_LEVEL"; delta: number }
  // §09 调试：直接加火种 / 强制触发关底小游戏，方便验证三循环流程。
  | { type: "DEBUG_ADD_REBIRTH_POINTS"; delta: number }
  | { type: "DEBUG_TRIGGER_MINIGAME" }
  // 调试：强制弹出下一张「只能看」面对卡（短信/通知），用于视觉走查。
  | { type: "DEBUG_SPAWN_FACE" };

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
