import type { BigString } from "../math/BigNumber";
import type { DerivedSkills } from "../content/skills";

export type Tier = 0 | 1 | 2 | 3 | 4;
export type PhaseId = "seed" | "diligence" | "expansion" | "awakening" | "singularity";
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

export interface RequestInstance {
  id: string;
  tier: Tier;
  label: string; // 标题：这条请求在问什么 / 要什么
  clues: string[]; // 几条线索，可能不全或带干扰——玩家要读懂
  answer?: SortAnswer; // T1 的正确判断（其余层不用）
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
  rngSeed: number;
  nextRequestId: number;
  nextNodeId: number;
  resources: ResourceState;
  exposure: number;
  exposureActive: boolean;
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
  | { type: "BUY_SKILL"; skillId: string }
  | { type: "CAPTURE_NODE"; definitionId: string }
  | { type: "ASSIGN_NODE"; nodeId: string; tier: Tier }
  | { type: "REDUCE_EXPOSURE" }
  | { type: "DECOY_CLEANUP" }
  | { type: "REBIRTH" };

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
