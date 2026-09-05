// Data_MissionCh2.mjs — 第二关｜手榴弹雨 —— **暂时废弃场景（2026-09-06）**。
//
// 正片重制只保留序章；第一关到终章整体退出正片流程，在选章里归入
// 「暂时废弃场景」组、标「未完成」。这一份只剩**能把切片建出来**的那几样：
// 史料字段（章名、日期、简报）、切片范围与出生点、路标（LOD 焦点与 HUD 去向）。
// 台词、事件线（EVENTS）、语音行（VOICE_LINES）、过场与摆点全部删除 ——
// 旧内容在 git 历史里（13594c5ae 之前的本文件、Data_CutsceneCh2.mjs、
// Script_MissionSetpieces.SETPIECES.CH2_Shouliudan、Audio/vo_ch2_*.mp3）。
//
// 组装层（Data_TengxianScript）按 DEPRECATED_CHAPTER_IDS 给它打 `deprecated` 标：
// 进章只建场、不装剧本、不摆点、不换关；从序章过场结束不会自动接进来。
// 不许 import three，不许 Math.random。

export const CHAPTER = {
  id: "CH2_Shouliudan",
  title: "第二关 · 手榴弹雨",
  place: "滕县东关 · 外壕、寨门、关厢院落、寺院地",
  date: "一九三八年三月十六日 十时三十分 — 十七时",
  clock: "03-16 10:30 — 17:00",
  sky: "smokyDay",
  music: "siege",
  minutes: 18,
  pool: { start: 208, end: 168, label: "城里还站着的人", presumed: true },
  brief: [
    "暂时废弃场景 · 未完成：只建东关外壕这一片切片，没有任务内容。",
    "史料：集中六七十人向壕沟内连续猛投二三百枚手榴弹。",
  ],
  objectives: [
    "东寨门",
    "外壕",
    "关厢院落",
    "后街街垒",
    "寺院地",
  ],
  zones: [
    { id: "C2_ZhaiGate", name: "东寨门", x: 480, z: -65, radius: 20 },
    { id: "C2_Ditch", name: "外壕", x: 500, z: -65, radius: 22 },
    { id: "C2_Courtyard", name: "关厢院落", x: 462, z: -19, radius: 26 },
    { id: "C2_BackStreet", name: "后街街垒", x: 449, z: -180, radius: 22 },
    { id: "C2_Temple", name: "寺院地", x: 427, z: -465, radius: 26 },
  ],
  tuning: {
    // 寺院地按布防图在东北延伸框（z=-465），切片必须把完整东侧 13 框一起纳入。
    // 东界放到 700：外壕以东那一带远端农院与农具布设（Data_Dressing_EastSuburb
    // 的 EastFarmFar 一组，x 到 681.5）只有本章离得最近 —— 不收进来它们就是
    // 一包没人建的数据（Script_TownDressingTest 的城外覆盖那一条会红）。
    bounds: { minX: 250, maxX: 700, minZ: -520, maxZ: 420 },
    spawn: { x: 446, z: -65, ry: -Math.PI / 2 },
    ijaPressure: 1.5, ijaSpawn: ["east"], ijaSupport: ["launcher", "hmg", "artillery"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 420,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 4,
      note: "随身六枚。",
    },
  },
  beats: [],
  cutsceneIn: null,
  cutsceneOut: null,
};

/** 本章已无剧情台词（废弃场景）。留空数组：Data_Voice 与组装层按空表拼接。 */
export const VOICE_LINES = [];
