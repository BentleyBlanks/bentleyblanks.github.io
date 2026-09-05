// Data_MissionCh4.mjs — 第四关｜东关之夜 —— **暂时废弃场景（2026-09-06）**。
//
// 正片重制只保留序章；第一关到终章整体退出正片流程，在选章里归入
// 「暂时废弃场景」组、标「未完成」。这一份只剩**能把切片建出来**的那几样：
// 史料字段（章名、日期、简报）、切片范围与出生点、路标（LOD 焦点与 HUD 去向）。
// 台词、事件线（EVENTS）、语音行（VOICE_LINES）、过场与摆点全部删除 ——
// 旧内容在 git 历史里（13594c5ae 之前的本文件、Data_CutsceneCh4.mjs、
// Script_MissionSetpieces.SETPIECES.CH4_DongguanYe、Audio/vo_ch4_*.mp3）。
//
// 照明弹系统（Script_Flare）的两条预设仍以 `C4_FlareUp` 为默认信号名 ——
// 那是引擎侧的契约常量，不再依赖本文件的 EVENTS。
// 不许 import three，不许 Math.random。

export const CHAPTER = {
  id: "CH4_DongguanYe",
  title: "第四关 · 东关之夜",
  place: "B 区东关集结院 → 东关夜巷 → 城内 A 区主救护所",
  date: "一九三八年三月十六日 夜 — 十七日 凌晨",
  clock: "03-16 20:00 — 03-17 02:00",
  sky: "night",
  // 夜战旧曲整批未通过评审；新候选选定前只留夜风、脚步与远处枪炮。
  music: null,
  minutes: 18,
  pool: { start: 140, end: 96, label: "城里还站着的人", presumed: true },
  brief: [
    "暂时废弃场景 · 未完成：只建东关夜巷这一片切片（夜间天光），没有任务内容。",
    "史料：东关夜战中日军用照明弹照亮街巷，敌我突然暴露并爆发近距离交火。",
  ],
  objectives: [
    "B 区 · 东关集结院",
    "黑巷",
    "照明弹横巷",
    "窄巷 · 白刃",
    "东门 · 抬回城",
    "A 区 · 主救护所",
  ],
  zones: [
    // 挪到出生点北 47 m（同一条东关大街）：贴着出生点的话目标链开局就自己走一格。
    { id: "C4_Assembly", name: "B 区 · 东关集结院", x: 449, z: -175, radius: 24 },
    { id: "C4_DarkLane", name: "黑巷", x: 478, z: -89, radius: 22 },
    { id: "C4_FlareCross", name: "照明弹横巷", x: 449, z: -22, radius: 22 },
    { id: "C4_NarrowLane", name: "窄巷 · 白刃", x: 443, z: 121, radius: 22 },
    { id: "C4_CarryBack", name: "东门 · 抬回城", x: 296, z: -65, radius: 24 },
    { id: "C4_AidStation", name: "A 区 · 主救护所", x: 214, z: -18, radius: 30 },
  ],
  tuning: {
    bounds: { minX: 150, maxX: 600, minZ: -300, maxZ: 170 },
    spawn: { x: 456.6, z: -128, ry: Math.atan2(-48, -42.6) },
    // 夜里日军火力优势削掉一半。
    ijaPressure: 0.85, ijaSpawn: ["east"], ijaSupport: ["hmg"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300,
    nightRaid: true,
    // 夜袭携行走 Data_Weapons.LOADOUTS 的具名条目（一支长枪、一支短枪、肩背大刀）。
    loadout: "L3_WhiteTowel",
  },
  beats: [],
  cutsceneIn: null,
  cutsceneOut: null,
};

/** 本章已无剧情台词（废弃场景）。留空数组：Data_Voice 与组装层按空表拼接。 */
export const VOICE_LINES = [];
