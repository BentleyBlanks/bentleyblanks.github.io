// 《滕县 一九三八》玩法测试靶场 —— 纯数据，**不许 import three**。
//
// 这不是正片的一关：它是 ?range=1 进入的**人机共同测试沙盒**（docs/Data_TestRange.md）。
// 人手动进来试枪感，agent 从 window.Taierzhuang.Debug.Range 取证 —— 两边用的是
// 同一片场景、同一批木桩兵，所以「人觉得不对」与「测试断言红了」指向同一处。
//
// 为什么不进 Data_Battle.PHASES：那张表是七关正片（史料字段逐条来自
// Data_TengxianScript.LEVELS），BootTest 的「七关逐关量」、菜单选章、通关冒烟
// 全都按它数。靶场混进去，每一处消费者都要多学一条"这一关不算数"的例外。
// 所以靶场自带一份 phase 形状相同的配置，由 Script_Main 在 ?range=1 时整表替换。
//
// 坐标：沿用全局约定（X 向东、Z 向南、Y 向上，米）。整片场地放在 (1400, 1400)
// 一带 —— 远离滕县城（±620）与界河（z -1620…-900），否则 AddExternalProps 的
// TownDressingFor(bounds) 会按世界坐标把城内的家什捞进靶场。
// 射击方向一律朝北（-Z）：出生朝向 ry=0 就是正对靶道。

/** 关卡 id。Script_Main.WORLD_CLASSES 按它挑 Script_RangeField。 */
export const RANGE_LEVEL_ID = "Range";

/** 这张图的地皮边界（语义同 Data_Battle.WORLD / Script_JieheField.JIEHE_WORLD）。 */
export const RANGE_WORLD = {
  minX: 1290, maxX: 1510, minZ: 1300, maxZ: 1510,
  groundLimit: 2100,
};

/** 相机远平面。整片场地对角不到 300 m，比城的 620 收得多是白赚的剔除。 */
export const RANGE_CAMERA_FAR = 320;

/**
 * 三个工位。id 同时是 HUD 路标名与 Debug.Range.GoTo 的参数；
 * ry 是站上去之后的朝向（0 = 朝北，正对各自的靶道）。
 */
export const RANGE_STATIONS = [
  { id: "RangeRifle", name: "步枪位", x: 1400, z: 1466, radius: 5, ry: 0 },
  { id: "RangeGrenade", name: "投弹位", x: 1368, z: 1466, radius: 5, ry: 0 },
  { id: "RangeMelee", name: "白刃位", x: 1434, z: 1466, radius: 5, ry: 0 },
];

/**
 * 木桩兵（带骨骼的整具 ija Actor，走正式的命中/伤害/倒地链路，只是不 Think）。
 * station 对应上面的工位；靶名里的数字是**到工位沙袋线的名义距离**（米）。
 * 步枪道四个靶横向错开，近靶不挡远靶；投弹位三个靶铺成 16—28 m 的纵深带 ——
 * 木柄弹 radiusM 6.5，无论落在带内哪一点都至少罩住一个靶。
 */
export const RANGE_TARGETS = [
  { id: "R10", station: "RangeRifle", x: 1396, z: 1450 },
  { id: "R25", station: "RangeRifle", x: 1400, z: 1435 },
  { id: "R50", station: "RangeRifle", x: 1404, z: 1410 },
  { id: "R100", station: "RangeRifle", x: 1408, z: 1360 },
  { id: "G16", station: "RangeGrenade", x: 1368, z: 1450 },
  { id: "G22", station: "RangeGrenade", x: 1366, z: 1444 },
  { id: "G28", station: "RangeGrenade", x: 1370, z: 1438 },
  { id: "M1", station: "RangeMelee", x: 1432, z: 1459 },
  { id: "M2", station: "RangeMelee", x: 1436, z: 1459 },
  { id: "M3", station: "RangeMelee", x: 1434, z: 1455 },
];

/** 木桩兵倒下后过多久自动复位（秒）。给人看清「打倒了」，也给测试留取证窗口。 */
export const RANGE_RESPAWN_S = 6;

/**
 * 靶场的 phase 配置。**形状与 Data_Battle.PHASES 的元素一致**（消费者是同一批），
 * sandbox: true 是靶场专属标记：SeedSmokeColumns 不挂烟、RespawnPlayer 永远回工位；
 * 不换关由 Script_Main 在进场时 state.pinned = true 兜底。
 */
export const RANGE_PHASE = {
  id: RANGE_LEVEL_ID,
  sandbox: true,
  date: "测试靶场",
  label: "玩法测试靶场",
  place: "开发专用 · 不属于正片",
  sky: "overcast",                // SKY_PRESETS 与 AMBIENCE_PRESETS 都有这一档
  music: null,
  minutes: 600,
  brief: [
    "步枪位试开枪与开镜，投弹位试手榴弹，白刃位试大刀与刺刀（X 上刺刀）。木桩兵不还手，倒了自己会站回来。",
  ],
  story: RANGE_LEVEL_ID,          // 没有剧本，Story 会打一条 warn，属预期
  cutsceneIn: null,
  cutsceneOut: null,
  objectives: ["步枪位：开枪与开镜", "投弹位：手榴弹", "白刃位：大刀与刺刀"],
  mechanic: "靶场沙盒：不换关、不结算，木桩兵自动复位。",
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 9999,
  ijaPressure: 0,
  ijaSpawn: [],
  ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  bounds: { minX: 1300, maxX: 1500, minZ: 1310, maxZ: 1500 },
  cameraFar: RANGE_CAMERA_FAR,
  zones: RANGE_STATIONS,
  spawn: { x: 1400, z: 1466, ry: 0 },
  loadoutOverride: {
    primary: "HanYang",           // bayonet: true —— X 上刺刀在这支枪上验
    secondary: "Mauser96",
    melee: "Dadao",
    throwables: { Grenade: 12 },
    spareClips: 12,
    note: "测试携行：汉阳造（可上刺刀）、盒子炮、大刀、木柄手榴弹十二枚。",
  },
};
