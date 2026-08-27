// 《滕县 一九三八》通用白刃 QTE 与专用测试章数据 —— 纯数据，**不许 import three**。
//
// 规则层只认这里的 pattern：正片日军冲锋与 ?melee=1 测试章走同一个
// Script_MeleeQte.MeleeQteDirector。测试章不是第八关，不进 Data_Battle.PHASES；
// 菜单把它与玩法靶场并列成沙盒，进度、继续、通关与史实时间线一概不知道它存在。
//
// QTE 的限时按**真实时间**结算；玩法世界在窗口内按 timeScale 慢放。
// 两个时钟故意分开：若用慢放后的 dt 递减提示，1.9 秒窗口会被放大到近七秒，
// 玩家看到的就不是“短时间反应”，而是全场站着等他按完。

export const MELEE_QTE_LEVEL_ID = "MeleeQte";

export const MELEE_QTE = Object.freeze({
  timeScale: 0.28,
  resolveTimeScale: 0.46,
  blockReachM: 2.15,
  executionReachM: 2.35,
  executionFacingDot: 0.18,
  executionReadyS: 5.0,
  blockFailDamage: 46,
  executionFailDamage: 24,
  blockResolveS: 0.72,
  executionResolveS: 1.05,
  executionKillAt: 0.48,
  trainingResetS: 3.0,
});

/** 三套格挡：连打、左右交替、短序列。全部只用原有战斗键。 */
export const MELEE_BLOCK_PATTERNS = Object.freeze([
  Object.freeze({
    id: "MashGuard",
    label: "格挡一 · 连击顶开",
    prompt: "快速按 V · 用刀背顶住刺刀",
    input: "mash",
    key: "KeyV",
    keyLabel: "V",
    target: 6,
    windowS: 1.95,
    style: 0,
  }),
  Object.freeze({
    id: "AlternateParry",
    label: "格挡二 · 左右拨架",
    prompt: "交替按 A / D · 把枪尖拨离中线",
    input: "alternate",
    keys: Object.freeze(["KeyA", "KeyD"]),
    keyLabels: Object.freeze(["A", "D"]),
    target: 6,
    windowS: 2.15,
    style: 1,
  }),
  Object.freeze({
    id: "RhythmCounter",
    label: "格挡三 · 节奏反击",
    prompt: "依次按 V → F → V → F",
    input: "sequence",
    sequence: Object.freeze(["KeyV", "KeyF", "KeyV", "KeyF"]),
    keyLabels: Object.freeze(["V", "F", "V", "F"]),
    target: 4,
    windowS: 2.20,
    style: 2,
  }),
]);

/**
 * 三套处决输入。动作的叙事结果一致：正/侧/抵枪三种踹法把人踹开，再用当前
 * 大刀或已装刺刀的长枪结束；差别同时落在输入、第一人称轨迹与敌人骨架姿态上。
 */
export const MELEE_EXECUTION_PATTERNS = Object.freeze([
  Object.freeze({
    id: "TimedFrontKick",
    label: "处决一 · 正踹直劈",
    prompt: "光圈进入亮区时按 V",
    input: "timed",
    key: "KeyV",
    keyLabel: "V",
    windowS: 2.20,
    sweetStart: 0.30,
    sweetEnd: 0.68,
    minResolveS: 0.66,
    style: 0,
  }),
  Object.freeze({
    id: "StepSideCut",
    label: "处决二 · 侧踹横斩",
    prompt: "依次按 A → D → V",
    input: "sequence",
    sequence: Object.freeze(["KeyA", "KeyD", "KeyV"]),
    keyLabels: Object.freeze(["A", "D", "V"]),
    target: 3,
    windowS: 2.30,
    minResolveS: 0.62,
    style: 1,
  }),
  Object.freeze({
    id: "BraceAndThrust",
    label: "处决三 · 抵枪突刺",
    prompt: "按住 V 蓄力，亮满后松开",
    input: "holdRelease",
    key: "KeyV",
    keyLabel: "V",
    holdS: 0.52,
    windowS: 2.45,
    minResolveS: 0.70,
    style: 2,
  }),
]);

/** 专用测试章的六个工位：前三个格挡、后三个处决。 */
export const MELEE_QTE_STATIONS = Object.freeze([
  Object.freeze({ id: "BlockMash", name: "格挡一 · 连击", kind: "block", pattern: 0, x: 1350, z: 1462, radius: 4.5, ry: 0 }),
  Object.freeze({ id: "BlockAlternate", name: "格挡二 · 拨架", kind: "block", pattern: 1, x: 1370, z: 1462, radius: 4.5, ry: 0 }),
  Object.freeze({ id: "BlockRhythm", name: "格挡三 · 节奏", kind: "block", pattern: 2, x: 1390, z: 1462, radius: 4.5, ry: 0 }),
  Object.freeze({ id: "ExecuteTimed", name: "处决一 · 正踹", kind: "execution", pattern: 0, x: 1410, z: 1462, radius: 4.5, ry: 0 }),
  Object.freeze({ id: "ExecuteSide", name: "处决二 · 侧踹", kind: "execution", pattern: 1, x: 1430, z: 1462, radius: 4.5, ry: 0 }),
  Object.freeze({ id: "ExecuteBrace", name: "处决三 · 抵枪", kind: "execution", pattern: 2, x: 1450, z: 1462, radius: 4.5, ry: 0 }),
]);

/** 每个工位面前一具正式 ija Actor；测试标记只决定触发样式，不改伤害/死亡链。 */
export const MELEE_QTE_TARGETS = Object.freeze(MELEE_QTE_STATIONS.map((station, index) => Object.freeze({
  id: `Q${index + 1}`,
  station: station.id,
  kind: station.kind,
  pattern: station.pattern,
  x: station.x,
  z: station.z - (station.kind === "block" ? 2.0 : 1.75),
  yaw: Math.PI,
})));

export const MELEE_QTE_PHASE = Object.freeze({
  id: MELEE_QTE_LEVEL_ID,
  sandbox: true,
  sandboxKey: "melee",
  sandboxGlyph: "刃",
  date: "机制测试章",
  label: "白刃战 QTE 测试场",
  place: "开发专用 · 不属于正片",
  sky: "overcast",
  music: null,
  minutes: 600,
  brief: Object.freeze([
    "左侧三个工位依次体验连击顶开、左右拨架、节奏反击；右侧三个工位依次体验正踹直劈、侧踹横斩、抵枪突刺。",
    "格挡成功后的同一名日军会短暂进入可处决状态；测试处决工位则常态满足特殊条件。",
  ]),
  story: MELEE_QTE_LEVEL_ID,
  cutsceneIn: null,
  cutsceneOut: null,
  objectives: Object.freeze([
    "格挡一：快速连按 V",
    "格挡二：交替按 A / D",
    "格挡三：按提示完成 V / F 节奏",
    "处决一：亮区内按 V",
    "处决二：完成 A / D / V 短序列",
    "处决三：按住 V 蓄满后松开",
  ]),
  mechanic: "敌军刺刀冲锋在贴身时触发真实时间 QTE 与短时慢动作；F 处决只在格挡后、重伤/强压制或训练目标上出现。",
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 9999,
  ijaPressure: 0,
  ijaSpawn: Object.freeze([]),
  ijaSupport: Object.freeze([]),
  ijaForce: Object.freeze({ lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" }),
  bounds: Object.freeze({ minX: 1332, maxX: 1468, minZ: 1390, maxZ: 1495 }),
  cameraFar: 220,
  zones: MELEE_QTE_STATIONS,
  spawn: Object.freeze({ x: 1400, z: 1480, ry: 0 }),
  loadoutOverride: Object.freeze({
    primary: "HanYang",
    secondary: "Mauser96",
    melee: "Dadao",
    throwables: Object.freeze({ Grenade: 2 }),
    spareClips: 6,
    note: "测试携行：汉阳造（入场自动上刺刀）、盒子炮、大刀；1 / 3 可切换两种处决武器。",
  }),
});

