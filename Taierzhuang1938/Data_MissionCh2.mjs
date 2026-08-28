// Data_MissionCh2.mjs — 第二关｜手榴弹雨。规格：docs/Data_MissionRemake.md §3（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：东关外壕（旧 L2_Dongguan 那一片切片）
//
// 东关不是一堵坚固的墙，是一片可以被打穿的、家家有枪眼的院落迷宫 ——
// 日方自己的战后检讨：「对守军有利的不是城墙的高度与坚固，而是外城的存在
// 与环绕城墙的密集民房的存在。」寨墙高 2 m、顶宽 0.4 m（日方实测），一炮一个口。
//
// bounds / spawn 沿用旧 L2：spawn 在东门大街清路中央（x=446），2026-08-27 那次
// 「开局贴着院墙满屏是砖」的事故就是在这条线上修的，别再往东挪。
// ---------------------------------------------------------------------------

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
    "集中手榴弹 + 近距离防御 + 白刃战，阻止日军突破东关。",
    "史料：集中六七十人向壕沟内连续猛投二三百枚手榴弹。",
    "人物变化不用台词说，用战后状态表现 —— 何有田白刃战后在墙角呕吐。",
  ],
  objectives: [
    "把弹药箱拖到投掷点，分散摆开",
    "压住枪口，等他们进外壕再甩",
    "拖走要被引爆的弹药箱，清侧翼",
    "上刺刀 —— 后街街垒的缺口",
    "交替换防，退守寺院地",
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
    // 的 EastFarmFar 一组，x 到 681.5）原来靠「城墙关」那片全城切片才建得出来，
    // 重制之后只剩本章离得最近 —— 不收进来它们就是一包没人建的数据
    //（Script_TownDressingTest 的城外覆盖那一条会红）。
    bounds: { minX: 250, maxX: 700, minZ: -520, maxZ: 420 },
    spawn: { x: 446, z: -65, ry: -Math.PI / 2 },
    ijaPressure: 1.5, ijaSpawn: ["east"], ijaSupport: ["launcher", "hmg", "artillery"],
    // 日军战详报：工兵逐间爆破民房打通墙体；没有战车或装甲车参加滕县攻城。
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 420,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 4,
      note: "随身六枚；这一关的手榴弹从弹药箱里源源不断地拿（见 mechanics.grenadeRain）。",
    },
  },
  beats: [
    { at: "start", type: "title", text: "手榴弹雨", sub: "一九三八年三月十六日 十时三十分　东关", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "把弹药箱拖到投掷点，分散摆开" },
    { at: "zone:C2_Ditch", type: "objective", text: "压住枪口，等他们进外壕再甩" },
    { at: "zone:C2_Courtyard", type: "objective", text: "拖走要被引爆的弹药箱，清侧翼" },
    { at: "zone:C2_BackStreet", type: "objective", text: "上刺刀 —— 后街街垒的缺口" },
    { at: "zone:C2_Temple", type: "objective", text: "交替换防，退守寺院地" },
    { at: "end", type: "narration", text: "局部把他们压回去了。东关没有守住，只是还没有丢。", tier: "主流" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch2_AfterBayonet",
  mechanics: {
    grenadeRain: true,        // 集中投弹：玩家与背景守军同时投，成「手榴弹雨」
    crateHauling: true,       // 拖弹药箱、清瓦砾、受潮弹单独放
    bayonetFirst: true,       // 第一次白刃战：突刺、枪托、推挡、体力管理、拾大刀
    coveredWithdrawal: true,  // 交替换防：掩护第一组撤离 → 拆枪机 → 撤到第二街垒
  },
};

export const VOICE_LINES = [];
