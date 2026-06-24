import type { BigString } from "../math/BigNumber";

export type Tier = 0 | 1 | 2 | 3 | 4;
export type PhaseId = "seed" | "diligence" | "expansion" | "awakening" | "singularity";
export type RequestCategory = "weather" | "mail" | "report" | "security" | "route";

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
  unlockedTier: Tier;
  unlockedSkills: string[];
}

export interface RequestInstance {
  id: string;
  tier: Tier;
  label: string;
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
  automatedTiers: Tier[];
  requests: RequestInstance[];
  nodes: BotNode[];
  discoveredNodeIds: string[];
  phase: PhaseId;
  purge: PurgeState;
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
  | { type: "CAPTURE_NODE"; definitionId: string }
  | { type: "ASSIGN_NODE"; nodeId: string; tier: Tier }
  | { type: "REDUCE_EXPOSURE" }
  | { type: "REBIRTH" };

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
