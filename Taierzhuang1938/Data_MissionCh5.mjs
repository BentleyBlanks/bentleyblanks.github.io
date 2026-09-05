// Data_MissionCh5.mjs — 第五关｜城墙没有了 —— **暂时废弃场景（2026-09-06）**。
//
// 正片重制只保留序章；第一关到终章整体退出正片流程，在选章里归入
// 「暂时废弃场景」组、标「未完成」。这一份只剩**能把切片建出来**的那几样：
// 史料字段（章名、日期、简报）、切片范围与出生点、路标（LOD 焦点与 HUD 去向）。
// 台词、事件线（EVENTS）、语音行（VOICE_LINES）、过场（含关中过场 cutsceneMid）、
// 钉关旗标与摆点全部删除 —— 旧内容在 git 历史里（13594c5ae 之前的本文件、
// Data_CutsceneCh5.mjs、Script_MissionSetpieces.SETPIECES.CH5_Chengqiang、Audio/vo_ch5_*.mp3）。
//
// corridorGun（西城门楼上那挺沿街扫射的重机枪）是场景/切片层的东西，保留：
// Script_BootTest 的 sightCorridor 那条闸还量它。
// 不许 import three，不许 Math.random。

export const CHAPTER = {
  id: "CH5_Chengqiang",
  title: "第五关 · 城墙没有了",
  place: "城内 A 区废墟 → 十字街口 → 西街长街 → 西关城门",
  date: "一九三八年三月十七日 清晨 — 午后",
  clock: "03-17 06:00 — 15:00",
  sky: "dawn",
  music: "wallPressure",
  minutes: 20,
  pool: { start: 96, end: 44, label: "城里还站着的人", presumed: true },
  brief: [
    "暂时废弃场景 · 未完成：只建十字街口到西关城门这一片切片，没有任务内容。",
    "史料：三月十七日日军夺西城门楼后向十字街口扫射，西门大街是一条通视的直街。",
  ],
  objectives: [
    "A 区废墟 · 清晨",
    "十字街口",
    "西街长街",
    "最后一个火力点",
    "西关城门内侧",
    "西关城门外",
    "返回最后火力点",
  ],
  zones: [
    { id: "C5_AidRuin", name: "A 区废墟 · 清晨", x: 214, z: -18, radius: 30 },
    { id: "C5_Crossroad", name: "十字街口", x: 0, z: 0, radius: 20 },
    { id: "C5_WestStreet", name: "西街长街", x: -160, z: 0, radius: 24 },
    { id: "C5_GunNest", name: "最后一个火力点", x: -230, z: 0, radius: 20 },
    { id: "C5_GateInner", name: "西关城门内侧", x: -278, z: 0, radius: 20 },
    { id: "C5_GateOut", name: "西关城门外", x: -330, z: 0, radius: 26 },
    { id: "C5_ReturnGun", name: "返回最后火力点", x: -215, z: 0, radius: 20 },
  ],
  tuning: {
    bounds: { minX: -370, maxX: 285, minZ: -190, maxZ: 140 },
    // 西门、十字街口与西门大街共用 z=0 的直瞄轴；远平面收到 400 m 就够。
    cameraFar: 400,
    spawn: { x: 240, z: -65, ry: Math.PI / 2 },
    ijaPressure: 1.9, ijaSpawn: ["west", "south"], ijaSupport: ["hmg", "launcher"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 460,
    // 西城门楼上那挺沿街扫射的重机枪（史料：3/17 17 时日军夺西城门楼后向十字街口扫射）。
    corridorGun: { x: -300, z: 0, y: 13.0, note: "西城门楼到十字街口是一条通视的直街" },
    // 打到这儿，子弹得从倒下的人身上取。
    loadout: "L4_LastFiveMinutes",
  },
  beats: [],
  cutsceneIn: null,
  cutsceneOut: null,
};

/** 本章已无剧情台词（废弃场景）。留空数组：Data_Voice 与组装层按空表拼接。 */
export const VOICE_LINES = [];
