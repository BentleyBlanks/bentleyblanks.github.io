// 《滕县 一九三八》第一关策划白盒 —— 纯数据，**不许 import three**。
//
// 这张测试章不借正式城外场景，也不加载任何建筑、道路、植被或生活资产。
// 可见环境只有下表登记的长方体：地皮、围挡、房屋体块、掩体、涵洞、路沟与门。
// 渲染实现统一使用无贴图的纯白 MeshStandardMaterial，接受正片太阳、阴影与环境光。
//
// 空间目标不是“沿路每隔几十米摆一块说明牌”，而是一串不同横截面的战术问题：
// 开阔接敌 → 侧门揭示后送队 → 狭窄涵洞检查 → 开路/侧绕二选一 → 路沟躲空袭
// → 折返压制 → 新出口开启。正式 CH1 的人物、对白、护送、日机与担架摆点通过
// contentId 复用；白盒只换空间，不复制一套假的剧情规则。

import { CHAPTER as FIRST_CHAPTER } from "./Data_MissionCh1.mjs";

export const FIRST_LEVEL_WHITEBOX_LEVEL_ID = "FirstLevelWhitebox";

function Box(id, x, z, w, d, h, options = {}) {
  return Object.freeze({ id, x, z, w, d, h, y: options.y ?? h * 0.5,
    ry: options.ry ?? 0, solid: options.solid !== false, cover: options.cover || null,
    tag: options.tag || "whiteboxWall" });
}

function Gate(id, x, z, w, d, h, ry, signal) {
  return Object.freeze({ id, x, z, w, d, h, y: h * 0.5, ry, signal,
    tag: "whiteboxGate" });
}

const zones = Object.freeze([
  Object.freeze({ id: "C1_Railbed", name: "路基观察线", x: -480, z: -160, radius: 17 }),
  Object.freeze({ id: "C1_Village", name: "村口侧门", x: -462, z: -112, radius: 15 }),
  Object.freeze({ id: "C1_Culvert", name: "涵洞检查口", x: -438, z: -64, radius: 13 }),
  Object.freeze({ id: "C1_SouthRoad", name: "大车路截击段", x: -402, z: -8, radius: 18 }),
  Object.freeze({ id: "C1_Ditch", name: "路沟与担架队", x: -438, z: 60, radius: 19 }),
  Object.freeze({ id: "C1_Fallback", name: "折返压制位", x: -482, z: 50, radius: 17 }),
  Object.freeze({ id: "C1_BackToWall", name: "回城出口", x: -358, z: -8, radius: 18 }),
]);

/**
 * 全关只允许这一张体块表造静态环境。高度、转角与宽窄变化都直接可审计；
 * 不用随机数，不用 PCG，不用“远处再撒一点东西”补空。
 */
export const FIRST_LEVEL_WHITEBOX_LAYOUT = Object.freeze({
  bounds: Object.freeze({ minX: -540, maxX: -330, minZ: -225, maxZ: 125 }),
  ground: Object.freeze({ x: -435, z: -50, w: 230, d: 370, h: 0.5, y: -0.25 }),
  sections: Object.freeze([
    Object.freeze({ id: "Contact", widthM: 38, verb: "观察并选择第一处掩体", change: "首敌暴露后村口方向解锁" }),
    Object.freeze({ id: "VillageReveal", widthM: 24, verb: "靠近真实侧门等待后送队", change: "白门升起，队伍从院内走出" }),
    Object.freeze({ id: "Culvert", widthM: 10, verb: "先查暗口再让队伍通过", change: "从封闭低顶转入开阔道路" }),
    Object.freeze({ id: "SouthRoad", widthM: 48, verb: "冒险压正面或沿破屋侧绕", change: "侧面火力被拔除，队伍重新移动" }),
    Object.freeze({ id: "Ditch", widthM: 18, verb: "在低墙间疏散并躲避航线", change: "飞机转向人群，安全方向反转" }),
    Object.freeze({ id: "Fallback", widthM: 28, verb: "回身压制并让担架先过", change: "南路断开，折返门解锁" }),
    Object.freeze({ id: "Return", widthM: 16, verb: "沿新揭示的斜向廊道撤回", change: "重新握住担架后端" }),
  ]),
  blocks: Object.freeze([
    // 外围体块只负责收画面与阻止越界；玩家永远看见真实墙，不撞隐形空气墙。
    Box("WestBoundary", -536, -50, 8, 350, 8),
    Box("EastBoundaryNorth", -334, -132, 8, 170, 8),
    Box("EastBoundarySouth", -334, 74, 8, 94, 8),
    Box("SpawnBackstop", -480, -220, 112, 6, 5),
    Box("SouthBackstopWest", -493, 119, 86, 6, 6),
    Box("SouthBackstopEast", -372, 119, 68, 6, 6),

    // 01｜出生与路基：前景框景 + 三个高度不同的可读掩体，正中保留首敌轮廓。
    Box("SpawnLeftWall", -516, -199, 26, 4, 2.6),
    Box("SpawnRightWall", -448, -199, 30, 4, 2.6),
    Box("SpawnLowCoverA", -499, -181, 9, 3, 1.05, { cover: { faceX: 0, faceZ: 1 } }),
    Box("SpawnLowCoverB", -468, -179, 8, 3, 0.78, { cover: { faceX: 0, faceZ: 1 } }),
    Box("RailbedLeft", -514, -147, 42, 5, 1.35, { cover: { faceX: 0, faceZ: 1 } }),
    Box("RailbedRight", -444, -147, 42, 5, 1.35, { cover: { faceX: 0, faceZ: 1 } }),
    Box("RailbedCommand", -497, -161, 8, 8, 2.1, { cover: { faceX: 1, faceZ: 0 } }),

    // 02｜村口：高体块遮住后半关。道路向东偏，西侧院门专门给后送队出场。
    Box("VillageWestMass", -511, -112, 36, 45, 8.5),
    Box("VillageEastMass", -414, -110, 34, 48, 10),
    Box("VillageNorthScreen", -452, -137, 34, 5, 4.8),
    Box("VillageSouthLeft", -500, -88, 25, 5, 4.2),
    Box("VillageSouthRight", -425, -87, 27, 5, 4.2),
    Box("EscortYardBack", -519, -111, 5, 34, 5.6),
    Box("EscortYardNorth", -500, -128, 34, 5, 5.6),
    Box("EscortYardSouth", -500, -94, 34, 5, 5.6),

    // 03｜涵洞：十米净宽、低顶、前后视线不贯通；两侧大体块是真碰撞。
    Box("CulvertWestBank", -474, -64, 38, 31, 5.8),
    Box("CulvertEastBank", -404, -61, 27, 34, 6.8),
    Box("CulvertWestPier", -449, -64, 4, 16, 4.3),
    Box("CulvertEastPier", -427, -64, 4, 16, 4.3),
    Box("CulvertRoof", -438, -64, 26, 18, 1.2, { y: 4.3, tag: "whiteboxCeiling" }),
    Box("CulvertNearCover", -456, -43, 7, 3, 1.15, { cover: { faceX: 0, faceZ: 1 } }),

    // 04｜南向道路：中路暴露但短；西侧破屋路线更长、掩体更多，形成真实选择。
    Box("SouthRoadEastBlock", -375, -8, 18, 70, 8.5),
    Box("SouthRoadWestBlockA", -471, -20, 27, 34, 6.4),
    Box("SouthRoadWestBlockB", -468, 24, 34, 28, 5.2),
    Box("FlankDividerA", -447, -17, 5, 23, 3.5),
    Box("FlankDividerB", -447, 17, 5, 19, 3.5),
    Box("CenterRoadCoverA", -416, -13, 8, 3, 0.92, { cover: { faceX: 0, faceZ: 1 } }),
    Box("CenterRoadCoverB", -395, 12, 10, 3, 1.25, { cover: { faceX: 0, faceZ: 1 } }),
    Box("MachineGunPlinth", -402, 35, 13, 5, 1.1, { cover: { faceX: 0, faceZ: -1 } }),

    // 05｜路沟：平行白盒墙把横向开阔收成十八米，缺口让玩家/担架分流。
    Box("DitchWestNorth", -463, 45, 4, 24, 1.45, { cover: { faceX: 1, faceZ: 0 } }),
    Box("DitchWestSouth", -463, 82, 4, 30, 1.45, { cover: { faceX: 1, faceZ: 0 } }),
    Box("DitchEastNorth", -413, 44, 4, 21, 1.45, { cover: { faceX: -1, faceZ: 0 } }),
    Box("DitchEastSouth", -413, 80, 4, 32, 1.45, { cover: { faceX: -1, faceZ: 0 } }),
    Box("DitchShelter", -435, 88, 27, 8, 2.2, { cover: { faceX: 0, faceZ: -1 } }),
    Box("FallbackWestCover", -497, 54, 18, 4, 1.3, { cover: { faceX: 0, faceZ: -1 } }),

    // 06/07｜折返：旧路被高墙切断；两条旋转盒组成新的斜向撤回廊道。
    Box("SouthCutWall", -438, 103, 47, 5, 5.5),
    Box("ReturnNorthWallA", -453, 35, 58, 4, 3.4, { ry: -0.316 }),
    Box("ReturnNorthWallB", -397, 17, 58, 4, 3.4, { ry: -0.316 }),
    Box("ReturnSouthWallA", -448, 52, 54, 4, 3.4, { ry: -0.316 }),
    Box("ReturnSouthWallB", -392, 34, 54, 4, 3.4, { ry: -0.316 }),
    Box("ReturnCoverA", -430, 37, 7, 3, 1.05, { ry: -0.316, cover: { faceX: -0.3, faceZ: -0.95 } }),
    Box("ReturnCoverB", -389, 23, 7, 3, 1.05, { ry: -0.316, cover: { faceX: -0.3, faceZ: -0.95 } }),
    Box("FinalEntryLeft", -378, 7, 18, 6, 5.5),
    Box("FinalEntryRight", -340, 7, 14, 6, 5.5),
    Box("FinalLandmark", -342, -15, 9, 9, 13),
  ]),
  gates: Object.freeze([
    // 侧门沿 Z 轴摆；EscortCall 真发生后升起，后送队从院内走到村口。
    Gate("EscortGate", -482, -111, 10, 1.2, 4.2, Math.PI / 2, "EscortCall"),
    // 折返廊道尽头是真正的实体封门；南路确认被截断后升起，出口才贯通。
    Gate("ReturnGate", -358, 7, 20, 1.2, 4.2, 0, "SouthCut"),
  ]),
});

export const FIRST_LEVEL_WHITEBOX_PHASE = Object.freeze({
  id: FIRST_LEVEL_WHITEBOX_LEVEL_ID,
  /** 环境 id 与内容 id 分开：场景是白盒，人物/剧情/摆点仍是真正的第一章。 */
  contentId: FIRST_CHAPTER.id,
  sandbox: true,
  sandboxKey: "firstLevelWhitebox",
  sandboxGlyph: "白",
  date: "关卡策划白盒",
  label: "第一关 · 全新策划白盒",
  place: "测试章节 · 纯白体块",
  // 白色材质仍是 0xffffff；专用中性光只负责把明面/背面/投影压进可读曝光段。
  sky: "whiteboxDay",
  ambience: "smokyDay",
  music: null,
  minutes: FIRST_CHAPTER.minutes,
  brief: Object.freeze([
    "只用接受光照的白色方盒子验证第一章：每一段必须带来新的动作、选择或世界变化。",
    "跟随在场的人和正在发生的事情前进；黄色标记只保留当前去向，不再解释未来剧情。",
  ]),
  level: FIRST_CHAPTER,
  roster: FIRST_CHAPTER.roster,
  mechanics: FIRST_CHAPTER.mechanics,
  objectives: FIRST_CHAPTER.objectives,
  mechanic: "实体引导：首敌、侧门、后送队、涵洞、双路线、日机与折返出口共同推进目标。",
  metaText: Object.freeze(["纯白盒体", "真实第一章事件", "无说明牌 / 无空气墙"]),
  nraPool: FIRST_CHAPTER.pool.start,
  poolGain: 0,
  ijaPool: FIRST_CHAPTER.tuning.ijaPool,
  ijaPressure: 0.72,
  ijaSpawn: FIRST_CHAPTER.tuning.ijaSpawn,
  ijaSupport: FIRST_CHAPTER.tuning.ijaSupport,
  ijaForce: FIRST_CHAPTER.tuning.ijaForce,
  bounds: FIRST_LEVEL_WHITEBOX_LAYOUT.bounds,
  cameraFar: 430,
  zones,
  spawn: Object.freeze({ x: -480, z: -205, ry: Math.PI }),
  loadoutOverride: FIRST_CHAPTER.tuning.loadoutOverride,
  whitebox: Object.freeze({
    layout: FIRST_LEVEL_WHITEBOX_LAYOUT,
    firstContact: Object.freeze({
      atS: 21.8,
      fullWaveAtS: 30,
      scout: Object.freeze({ x: -474, z: -169, weapon: "Type38" }),
      wave: Object.freeze({ minDistanceM: 42, maxDistanceM: 82, lateralSpanM: 38, deepShare: 0 }),
    }),
    escortWaypoints: Object.freeze([
      Object.freeze({ x: -502, z: -111 }),
      Object.freeze({ zone: "C1_Village" }),
      Object.freeze({ zone: "C1_Culvert" }),
      Object.freeze({ zone: "C1_SouthRoad" }),
      Object.freeze({ zone: "C1_Ditch" }),
    ]),
    objectiveGates: Object.freeze([
      Object.freeze({ minTimeS: 24, minEnemyDeaths: 1, reason: "先确认并处理田坎上的威胁" }),
      Object.freeze({ signal: "EscortCall", reason: "等村口侧门打开，后送队出来" }),
      Object.freeze({ minEnemyDeaths: 2, reason: "先检查涵洞并清掉尾随敌兵" }),
      Object.freeze({ minEnemyDeaths: 4, reason: "先压住道路火力，给后送队打开缺口" }),
      Object.freeze({ signal: "AircraftTurnCrowd", reason: "先看清日机转向人群" }),
      Object.freeze({ signal: "SouthCut", reason: "南路仍在交火，确认撤回命令" }),
      Object.freeze({ voice: "ch1_shangbing_04", reason: "先把担架上的伤员带回入口" }),
    ]),
  }),
});
