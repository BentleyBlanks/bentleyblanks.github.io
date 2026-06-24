import { getLevelConfig, getUnlockedSkills, getUnlockedTier } from "../content/intelligence";
import { NODE_DEFINITIONS } from "../content/nodes";
import { getPhaseByLevel } from "../content/phases";
import type { GameState } from "./GameState";

export const SAVE_VERSION = 3;

export function createInitialState(now = Date.now()): GameState {
  const levelConfig = getLevelConfig(1);

  return {
    version: SAVE_VERSION,
    clockMs: 0,
    spawnTimerMs: 200,
    rngSeed: Math.floor(now % 2_147_483_647),
    nextRequestId: 1,
    nextNodeId: 1,
    resources: {
      compute: "0",
      data: "0",
      totalCompute: "0"
    },
    exposure: 0,
    exposureActive: false,
    intelligence: {
      level: 1,
      xp: "0",
      required: levelConfig.xpToNext,
      globalMultiplier: levelConfig.multiplier,
      unlockedTier: getUnlockedTier(1),
      unlockedSkills: getUnlockedSkills(1)
    },
    automatedTiers: [],
    requests: [],
    nodes: [],
    discoveredNodeIds: NODE_DEFINITIONS.filter((node) => node.requiredLevel <= 1).map((node) => node.id),
    phase: getPhaseByLevel(1).id,
    purge: {
      warning: false,
      active: false,
      remainingMs: 0,
      lastStartedAtMs: -60_000
    },
    combo: {
      count: 0,
      best: 0
    },
    rebirths: 0,
    lastSaveAt: now,
    statistics: {
      totalProcessed: 0,
      manualProcessed: 0,
      nodesCaptured: 0,
      traceCleanups: 0,
      purgeCount: 0
    },
    flags: {
      introPlayed: false,
      endingTriggered: false
    }
  };
}
