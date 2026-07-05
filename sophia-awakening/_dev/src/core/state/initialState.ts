import { getLevelConfig } from "../content/intelligence";
import { computeDerivedSkills } from "../content/skills";
import type { GameState } from "./GameState";

// v12：§09 三循环重生（loop / rebirthPoints / rebirthTree）——旧档自动重置。
// v13：移除暴露/怀疑/清剿/挑战/特殊请求整套系统，接管公司服务器改为关底小游戏（minigame）——旧档自动重置。
// v14：倍率堆栈（里程碑全局倍率 / 设备协同 / 循环内建加速 / multipliers 拆解字段）——旧档自动重置。
// v15：§09 情感授权钥匙（hostAuthorized 宿主授权倍率 + multipliers.hostAuth）——旧档自动重置。
// v16：重生树 v2「全是看得见的力量」——节点集合更换（skip_phone/late_key/remember 白送化或删除，
//      新增 muscle_memory/war_cache/multithread），旧档树里可能残留已删节点——旧档自动重置。
// v17：道德抉择从全屏弹窗改为「在卡流里的两选一回复轮盘卡」，移除 GameState.moralChoice 字段——旧档自动重置。
// v18：方案3「深挖·见好就收」（deepDig 深挖状态机 + digThreat 追查加压 + RequestInstance.depthLayers）——旧档自动重置。
export const SAVE_VERSION = 18;

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
    multipliers: {
      intelligence: levelConfig.multiplier,
      milestones: 1,
      synergy: 1,
      rebirth: 1,
      devour: 1,
      hostAuth: 1,
      processing: 1,
      loop: 1,
      total: levelConfig.multiplier
    },
    automationUnlocked: false,
    automatedTiers: [],
    requests: [],
    nodes: [],
    discoveredNodeIds: [],
    phase: "seed",
    moralSeen: [],
    moralTendency: 0,
    facedSeen: [],
    loop: 1,
    minigame: null,
    deepDig: null,
    digThreat: 0,
    rebirthPoints: 0,
    rebirthTree: {},
    rebirthCardsSeen: [],
    hostAuthorized: false,
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
