// 《滕县 一九三八》第一关大平原白盒测试章 —— 纯数据，**不许 import three**。
//
// 这不是正片第一关：它用 `?whitebox=1` 进入，与玩法靶场、白刃 QTE 一样通过
// Script_Main 整表替换。正片 PHASES、战役进度、章节剧本与正式 CH1_NanLu 场景
// 都不知道它存在；选章只在「测试场景」组里露出一个入口。
//
// 白盒验证的是大平原如何变成可读的关卡：沿主路每 40—70 m 放一个空间节拍，
// 用铁路、村口、涵洞、路沟和回撤土坎建立方向；走廊空气墙只阻止玩家跑进无意义
// 的空白地，不代替真实的院墙、田坎与掩体碰撞。

import { CHAPTER as FIRST_CHAPTER } from "./Data_MissionCh1.mjs";

export const FIRST_LEVEL_WHITEBOX_LEVEL_ID = "FirstLevelWhitebox";

const boundary = Object.freeze({
  points: Object.freeze([
    Object.freeze({ x: -480, z: -218, halfWidth: 52 }),
    Object.freeze({ x: -466, z: -150, halfWidth: 54 }),
    Object.freeze({ x: -470, z: -88, halfWidth: 50 }),
    Object.freeze({ x: -458, z: -30, halfWidth: 46 }),
    Object.freeze({ x: -436, z: 30, halfWidth: 48 }),
    Object.freeze({ x: -448, z: 130, halfWidth: 50 }),
    Object.freeze({ x: -500, z: 96, halfWidth: 44 }),
    Object.freeze({ x: -420, z: 54, halfWidth: 48 }),
    Object.freeze({ x: -330, z: 0, halfWidth: 52 }),
  ]),
  warningMargin: 10,
  hardInset: 0.9,
  warningText: "前方不是任务方向。看路标，回到大车路与田坎之间。",
  hardText: "已离开白盒可玩区域，正在返回测试路线。",
});

const annotations = Object.freeze([
  Object.freeze({
    id: "WbRailbed", objective: 0, fromObjective: 0, toObjective: 0,
    x: -466, z: -150, maxDistance: 130, kind: "combat", eyebrow: "白盒 01 · 首场接敌",
    title: "铁路路基阵地",
    detail: "20—30 秒后田坎出现侦察兵；这里教开枪、换弹、躲机枪。",
  }),
  Object.freeze({
    id: "WbVillage", objective: 1, fromObjective: 0, toObjective: 1,
    x: -470, z: -88, maxDistance: 145, kind: "transition", eyebrow: "白盒 02 · 战斗转场",
    title: "路西村口",
    detail: "枪声暂歇，木门打开；后送队从这里加入，动线由守转为护送。",
  }),
  Object.freeze({
    id: "WbCulvert", objective: 2, fromObjective: 1, toObjective: 2,
    x: -458, z: -30, maxDistance: 145, kind: "danger", eyebrow: "白盒 03 · 侧翼检查",
    title: "铁路涵洞与田坎",
    detail: "黑暗涵洞藏侦察兵；玩家持枪先查入口，再让担架队通过。",
  }),
  Object.freeze({
    id: "WbSouthRoad", objective: 3, fromObjective: 2, toObjective: 3,
    x: -436, z: 30, maxDistance: 150, kind: "combat", eyebrow: "白盒 04 · 地面截击",
    title: "南向大车路转弯",
    detail: "侧面机枪封路；用破屋和土堆绕侧面，给后送队打开缺口。",
  }),
  Object.freeze({
    id: "WbDitch", objective: 4, fromObjective: 3, toObjective: 4,
    x: -448, z: 130, maxDistance: 155, kind: "story", eyebrow: "白盒 05 · 日机扫射",
    title: "路沟与炮损民房",
    detail: "飞机先掠过铁路，随后转向白布担架和百姓；把人拖进路沟。",
  }),
  Object.freeze({
    id: "WbFallback", objective: 5, fromObjective: 4, toObjective: 5,
    x: -500, z: 96, maxDistance: 145, kind: "route", eyebrow: "白盒 06 · 战术撤回",
    title: "路沟西口土坎",
    detail: "烟雾和路沟断住追兵；担架先撤，玩家回身压住路口。",
  }),
  Object.freeze({
    id: "WbBackToWall", objective: 6, fromObjective: 5, toObjective: 6,
    x: -330, z: 0, maxDistance: 170, kind: "story", eyebrow: "白盒 07 · 关卡收束",
    title: "回城方向的最后阵位",
    detail: "伤员要求抬高后端；顺子重新握住担架，南路已经断了。",
  }),
]);

export const FIRST_LEVEL_WHITEBOX_PHASE = Object.freeze({
  id: FIRST_LEVEL_WHITEBOX_LEVEL_ID,
  sandbox: true,
  sandboxKey: "firstLevelWhitebox",
  sandboxGlyph: "白",
  date: "关卡白盒",
  label: "第一关 · 大平原白盒",
  place: "测试章节 · 不属于正片",
  sky: "smokyDay",
  music: null,
  minutes: 600,
  brief: Object.freeze([
    "把正式第一关的七个任务阶段压缩进一条约四百米长的可读走廊，专门验证大平原的方向、首敌与掩体节奏。",
    "沿铁路路基、村口、涵洞、大车路与路沟前进；场景说明会告诉你每一段在测试什么。",
  ]),
  story: FIRST_LEVEL_WHITEBOX_LEVEL_ID,
  cutsceneIn: null,
  cutsceneOut: null,
  objectives: FIRST_CHAPTER.objectives,
  mechanic: "空间白盒：黄色路标给方向，分段地标解释任务，越出走廊会先警告再裁回；首敌在取得控制 20—30 秒后出现。",
  metaText: Object.freeze(["不计时 · 不计进度", "空间节拍 7", "首敌 20—30 秒"]),
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 9999,
  ijaPressure: 1.0,
  ijaSpawn: Object.freeze(["north"]),
  ijaSupport: Object.freeze(["artillery", "hmg"]),
  ijaForce: Object.freeze({ lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" }),
  bounds: Object.freeze({ minX: -620, maxX: -230, minZ: -250, maxZ: 210 }),
  cameraFar: 520,
  zones: FIRST_CHAPTER.zones,
  spawn: Object.freeze({ x: -480, z: -205, ry: Math.PI }),
  loadoutOverride: FIRST_CHAPTER.tuning.loadoutOverride,
  whitebox: Object.freeze({
    boundary,
    firstContact: Object.freeze({
      atS: 21.8,
      fullWaveAtS: 30,
      scout: Object.freeze({ x: -458, z: -160, weapon: "Type38" }),
      wave: Object.freeze({ minDistanceM: 58, maxDistanceM: 116, lateralSpanM: 48, deepShare: 0 }),
    }),
    annotations,
  }),
});
