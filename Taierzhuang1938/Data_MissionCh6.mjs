// Data_MissionCh6.mjs — 终章｜最后一封 —— **暂时废弃场景（2026-09-06）**。
//
// 正片重制只保留序章；第一关到终章整体退出正片流程，在选章里归入
// 「暂时废弃场景」组、标「未完成」。这一份只剩**能把切片建出来**的那几样：
// 史料字段（章名、日期、简报）、切片范围与出生点、路标（LOD 焦点与 HUD 去向）。
// 台词、事件线（EVENTS）、语音行（VOICE_LINES）、两场关中过场、playerCast（玩家＝小秦）
// 与摆点全部删除 —— 旧内容在 git 历史里（13594c5ae 之前的本文件、Data_CutsceneCh6.mjs、
// Script_MissionSetpieces.SETPIECES.CH6_Zuihou、Audio/vo_ch6_*.mp3）。
//
// 发报系统（Script_Telegraph）的默认信号名（WireFirst / WireBreak / WireSent）是引擎侧
// 契约常量，不再依赖本文件的 EVENTS。
// 编剧红线照旧写在这里备忘：**不演王铭章举枪自尽**（理由见 Data_CutsceneWangMingzhang 头注）。
// 不许 import three，不许 Math.random。

export const CHAPTER = {
  id: "CH6_Zuihou",
  title: "终章 · 最后一封",
  place: "城内临时师部 → 西门大街 → 西关电灯厂",
  date: "一九三八年三月十七日 午后 — 黄昏",
  clock: "03-17 15:00 — 18:00",
  sky: "burningStreet",
  music: "exodus",
  minutes: 10,
  pool: { start: 44, end: 12, label: "城里还站着的人", presumed: true },
  brief: [
    "暂时废弃场景 · 未完成：只建城内师部到西关电灯厂这一片切片，没有任务内容。",
    "史料：王铭章师部原设城外电灯厂，十六日接死守命令后迁入城内；十七日殉国。",
  ],
  objectives: [
    "城内临时师部",
    "西门里大街",
    "西门里",
    "西门瓮城",
    "西关大街",
    "西关电灯厂",
  ],
  zones: [
    { id: "C6_DivisionHq", name: "城内临时师部", x: -58, z: -55, radius: 30 },
    { id: "C6_WestStreet", name: "西门里大街", x: -160, z: 0, radius: 24 },
    { id: "C6_GateInner", name: "西门里", x: -278, z: 0, radius: 20 },
    { id: "C6_Barbican", name: "西门瓮城", x: -322, z: 0, radius: 16 },
    { id: "C6_WestOuter", name: "西关大街", x: -380, z: 0, radius: 24 },
    { id: "C6_PowerPlant", name: "西关电灯厂", x: -410, z: 69, radius: 34 },
  ],
  tuning: {
    bounds: { minX: -480, maxX: 100, minZ: -190, maxZ: 150 },
    cameraFar: 460,
    spawn: { x: 62, z: 0, ry: Math.PI / 2 },
    ijaPressure: 1.2, ijaSpawn: ["west", "south"], ijaSupport: ["hmg", "artillery"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 320,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 2 }, spareClips: 1,
      note: "通信兵的枪。两枚手榴弹，一个桥夹。",
    },
  },
  beats: [],
  cutsceneIn: null,
  cutsceneOut: null,
};

/** 本章已无剧情台词（废弃场景）。留空数组：Data_Voice 与组装层按空表拼接。 */
export const VOICE_LINES = [];
