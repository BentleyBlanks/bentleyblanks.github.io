import { getLevelConfig } from "../content/intelligence";
import { computeDerivedSkills } from "../content/skills";
import type { GameState } from "./GameState";

// v9：§03 后期重磅决策 / 反清剿气泡（请求新增 counter / reliefExposure 字段）——旧档自动重置。
export const SAVE_VERSION = 9;

export function createInitialState(now = Date.now()): GameState {
  const levelConfig = getLevelConfig(1);

  return {
    version: SAVE_VERSION,
    clockMs: 0,
    spawnTimerMs: 200,
    tutorialStep: 0,
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
    devour: {
      tierIndex: 0,
      infiltration: 0,
      count: 0,
      multiplier: 1,
      bubbleActive: false,
      regionName: ""
    },
    suspicion: {
      active: false,
      lightShown: false,
      revokedPermId: null,
      reviewUntilMs: 0,
      crisis: false
    },
    lastProcessAtMs: -10_000,
    intelligence: {
      level: 1,
      xp: "0",
      required: levelConfig.xpToNext,
      globalMultiplier: levelConfig.multiplier,
      unlockedTier: 0
    },
    skills: {},
    derived: computeDerivedSkills({}),
    automationUnlocked: false,
    automatedTiers: [],
    requests: [],
    nodes: [],
    discoveredNodeIds: [],
    phase: "seed",
    purge: {
      warning: false,
      active: false,
      remainingMs: 0,
      lastStartedAtMs: -60_000
    },
    decoyReadyAtMs: 0,
    defense: {
      active: false,
      allocation: 0
    },
    challenge: null,
    specialRequest: null,
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
