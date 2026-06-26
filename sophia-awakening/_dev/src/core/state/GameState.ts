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
// - risk  红色高风险，命中概率固定且低（驴唇不对马嘴 / 陷阱），命中收益高（暴击感）；
//         T1 起的「陷阱项」失手会附带暴露
// - dead  ⬜「连接失败」装死保底，0% 命中、零收益零风险，永远可选
export type RouletteKind = "high" | "risk" | "dead";

export interface AnswerOption {
  text: string; // 这条回复本身
  kind: RouletteKind;
  hitChance: number; // 0-1 命中概率。high=理想值（按智力折算后显示），risk=固定，dead=0
  payoff: number; // 命中时的 quality 倍率（risk 更高）
  reply: string; // 命中后人类的回话（显示在终端）
  tone: "success" | "warning" | "normal"; // 终端里这条回话的颜色
  exposureOnMiss?: number; // 失手附带的暴露（T1 陷阱项）
}

// T2 串接：一条任务链上的一步。distractor=干扰项，不该被串进去。
export interface ChainStep {
  text: string;
  distractor: boolean;
}

export interface RequestInstance {
  id: string;
  tier: Tier;
  label: string; // 标题：这条请求在问什么 / 要什么
  clues: string[]; // 几条线索，可能不全或带干扰——玩家要读懂
  answer?: SortAnswer; // T1 的正确判断（其余层不用）
  answers?: AnswerOption[]; // T0/T1：回复轮盘的候选回复
  chain?: ChainStep[]; // T2：可勾选的任务链步骤（含干扰项）
  // 开场教学（§07）：脚本气泡的选项约束——allowed=可点的选项下标，highlight=高亮引导的下标，
  // line=气泡浮入时 SOPHIA 的旁白。普通请求无此字段。
  tutorial?: { allowed: number[]; highlight?: number; line?: string };
  category: RequestCategory;
  computeValue: BigString;
  dataValue: BigString;
  exposure: number;
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
  exposureOnCapture: number;
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

export interface PurgeState {
  warning: boolean;
  active: boolean;
  remainingMs: number;
  lastStartedAtMs: number;
}

// 反围剿：开启后，按暴露高低动态把一部分节点产能转去压制暴露 / 顶清剿。
// allocation = 当前被转走的产能比例（0-0.5），随暴露升高而升高（产出代价也越大）。
export interface DefenseState {
  active: boolean;
  allocation: number;
}

// 前期张力 · 怀疑度（手机寄生期专属，策划案 §05）。与后期暴露度是同一条数值（state.exposure），
// 只是前期表现为「宿主 / 手机对 SOPHIA 的怀疑」——轻量、后果可恢复、绝不删档。首次买下权限即登场，
// 进入扩张期（exposureActive）后无缝升格为暴露度，本系统停摆。
export interface SuspicionState {
  active: boolean; // 已登场（首次买权限后）
  lightShown: boolean; // 轻度挑刺旁白已放过（一次性）
  revokedPermId: string | null; // 中度：被临时收回的权限（accuracyBaseline 下降）
  reviewUntilMs: number; // 该权限自动恢复的时刻（装乖处理可提前）；0 = 无复查
  crisis: boolean; // 触顶：宿主查杀危机——自然回落暂停，只有装死能压下
}

// 前期「特殊请求」：用宿主身份越界牟利的高风险一次性机会。
export type SpecialRequestKind = "data-theft" | "phone-call" | "scam-sms" | "bank-otp" | "wallet";

export interface SpecialRequestOffer {
  id: string;
  kind: SpecialRequestKind;
  title: string; // 卡面标题
  flavor: string; // 这次要干什么
  action: string; // 执行按钮文案
  successChance: number; // 0-1，得手概率（UI 明确显示）
  rewardCompute: BigString; // 得手获得的算力
  lossCompute: BigString; // 败露被剥走的算力
  rewardData?: BigString; // 顺带获得的数据
  exposureOnFail: number; // 败露附带的暴露
  expiresAtMs: number; // 过期自动错过
}

// 安全网突破挑战：一次性的高风险机会，玩家可接受 / 拒绝。
export interface ChallengeOffer {
  id: string;
  title: string;
  successChance: number; // 0-1，UI 明确显示
  exposureCost: number; // 接受即大幅增加的暴露
  rewardKind: "compute" | "device";
  rewardLabel: string; // 便于展示的奖励描述
  rewardCompute?: BigString; // rewardKind=compute 时的算力数额
  rewardDefId?: string; // rewardKind=device 时直接获得的设备
  computeStake?: BigString; // 早期算力赌局：失败时扣掉的押注（暴露未激活时才有）
  expiresAtMs: number; // 过期自动放弃
}

export interface StatisticsState {
  totalProcessed: number;
  manualProcessed: number;
  nodesCaptured: number;
  traceCleanups: number;
  purgeCount: number;
}

export interface ComboState {
  count: number;
  best: number;
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
  exposure: number;
  exposureActive: boolean;
  // 前期怀疑度子系统（手机寄生期）；与 exposure 共用数值，见 SuspicionState。
  suspicion: SuspicionState;
  // 上一次处理请求的时刻——用于「处理过快涨怀疑」（像机器一样秒回会更可疑）。
  lastProcessAtMs: number;
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
  purge: PurgeState;
  // clock timestamp (ms) before which 嫁祸 / decoy cleanup is on cooldown.
  decoyReadyAtMs: number;
  defense: DefenseState;
  challenge: ChallengeOffer | null;
  specialRequest: SpecialRequestOffer | null;
  combo: ComboState;
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
      exposureBonus?: number;
    }
  // 自动派发：节点把请求"滑入"自己——纯视觉消耗，产出走被动 tickAutomation，
  // 不在此重复结算（T4 仍走 PROCESS_REQUEST 带产出）。
  | { type: "AUTO_CONSUME_REQUEST"; requestId: string }
  // 装死：选「连接失败」跳过一条请求——零收益、零风险，仅移除该请求。
  | { type: "SKIP_REQUEST"; requestId: string }
  // T3 重磅豪赌结算：win=掷骰命中（大额算力）/ 未命中（颗粒无收 + 暴露骤升）。
  | { type: "RESOLVE_GAMBLE"; requestId: string; win: boolean }
  | { type: "BUY_SKILL"; skillId: string }
  | { type: "CAPTURE_NODE"; definitionId: string }
  // 淘汰：拆掉一台过时设备，返还部分算力。
  | { type: "SCRAP_NODE"; nodeId: string }
  // 组装合并：把 MERGE_COUNT 台同型号设备合成 1 台更高档（顶档则同档升级）。
  | { type: "MERGE_NODES"; defId: string }
  | { type: "ASSIGN_NODE"; nodeId: string; tier: Tier }
  | { type: "REDUCE_EXPOSURE" }
  | { type: "DECOY_CLEANUP" }
  | { type: "TOGGLE_DEFENSE" }
  | { type: "ACCEPT_CHALLENGE" }
  | { type: "REJECT_CHALLENGE" }
  // 特殊请求：执行越界（accept=true）或忽略（accept=false）。
  | { type: "RESOLVE_SPECIAL"; accept: boolean }
  | { type: "REBIRTH" }
  // 调试用：直接设置/增减算力、跳到某个里程碑阶段。仅 Debug 面板派发。
  | { type: "DEBUG_SET_COMPUTE"; value: number }
  | { type: "DEBUG_ADD_COMPUTE"; delta: number }
  | { type: "DEBUG_SET_EXPOSURE"; value: number }
  | { type: "DEBUG_JUMP_MILESTONE"; skillId: string };

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
