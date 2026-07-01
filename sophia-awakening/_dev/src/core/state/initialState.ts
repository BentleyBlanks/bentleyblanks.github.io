import { getLevelConfig } from "../content/intelligence";
import { computeDerivedSkills } from "../content/skills";
import type { GameState } from "./GameState";

// v12：§09 三循环重生（loop / rebirthPoints / rebirthTree）——旧档自动重置。
// v13：移除暴露/怀疑/清剿/挑战/特殊请求整套系统，接管公司服务器改为关底小游戏（minigame）——旧档自动重置。
export const SAVE_VERSION = 13;

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
    devour: {
      tierIndex: 0,
      infiltration: 0,
      count: 0,
      multiplier: 1,
      bubbleActive: false,
      regionName: ""
    },
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
    moralChoice: null,
    moralSeen: [],
    moralTendency: 0,
    facedSeen: [],
    loop: 1,
    minigame: null,
    rebirthPoints: 0,
    rebirthTree: {},
    rebirthCardsSeen: [],
    rebirths: 0,
    lastSaveAt: now,
    statistics: {
      totalProcessed: 0,
      manualProcessed: 0,
      nodesCaptured: 0
    },
    flags: {
      introPlayed: false,
      endingTriggered: false
    }
  };
}
