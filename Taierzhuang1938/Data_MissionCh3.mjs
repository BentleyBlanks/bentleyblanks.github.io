// Data_MissionCh3.mjs — 第三关｜救护所 —— **暂时废弃场景（2026-09-06）**。
//
// 正片重制只保留序章；第一关到终章整体退出正片流程，在选章里归入
// 「暂时废弃场景」组、标「未完成」。这一份只剩**能把切片建出来**的那几样：
// 史料字段（章名、日期、简报）、切片范围与出生点、路标（LOD 焦点与 HUD 去向）。
// 台词、事件线（EVENTS）、语音行（VOICE_LINES）、过场与摆点全部删除 ——
// 旧内容在 git 历史里（13594c5ae 之前的本文件、Data_CutsceneCh3.mjs、
// Script_MissionSetpieces.SETPIECES.CH3_Jiuhusuo、Audio/vo_ch3_*.mp3）。
//
// 三个功能院落的锚点（A 区 (214,-18) / B 区 (449,-175) / C 区 (462,-19)）仍照旧
// 写在 zones 里 —— 它们是场景坐标，不是任务内容。
// 不许 import three，不许 Math.random。

export const CHAPTER = {
  id: "CH3_Jiuhusuo",
  title: "第三关 · 救护所",
  place: "城内 A 区主救护所 → 东关失守街区 · C 区前沿救护点",
  date: "一九三八年三月十六日 十七时 — 二十时",
  clock: "03-16 17:00 — 20:00",
  sky: "smokyDay",
  music: "streetDistress",
  minutes: 18,
  pool: { start: 168, end: 140, label: "城里还站着的人", presumed: true },
  brief: [
    "暂时废弃场景 · 未完成：只建城内 A 区到东关 C 区这一片切片，没有任务内容。",
    "史料：日军突入前沿救护点后对失去战斗能力的伤兵与救护人员实施系统处决。",
  ],
  objectives: [
    "A 区 · 主救护所",
    "东门 · 侧门",
    "东关失守街区",
    "C 区 · 前沿救护点",
    "炉火封路",
    "撤回 A 区 · 主救护所",
  ],
  zones: [
    { id: "C3_AidStation", name: "A 区 · 主救护所", x: 214, z: -18, radius: 30 },
    { id: "C3_EastGateOut", name: "东门 · 侧门", x: 296, z: -65, radius: 24 },
    { id: "C3_LostBlock", name: "东关失守街区", x: 449, z: -110, radius: 24 },
    { id: "C3_ForwardAid", name: "C 区 · 前沿救护点", x: 462, z: -19, radius: 26 },
    { id: "C3_Firebreak", name: "炉火封路", x: 480, z: -65, radius: 20 },
    { id: "C3_AidReturn", name: "撤回 A 区 · 主救护所", x: 214, z: -18, radius: 30 },
  ],
  tuning: {
    bounds: { minX: 140, maxX: 600, minZ: -260, maxZ: 220 },
    spawn: { x: 276, z: -65, ry: Math.PI / 2 },
    ijaPressure: 1.3, ijaSpawn: ["east"], ijaSupport: ["hmg", "launcher"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 380,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 5 }, spareClips: 3,
      note: "从东关退下来补的：五枚手榴弹，三个桥夹。",
    },
  },
  beats: [],
  cutsceneIn: null,
  cutsceneOut: null,
};

/** 本章已无剧情台词（废弃场景）。留空数组：Data_Voice 与组装层按空表拼接。 */
export const VOICE_LINES = [];
