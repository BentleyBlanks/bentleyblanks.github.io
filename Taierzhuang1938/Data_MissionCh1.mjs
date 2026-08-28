// Data_MissionCh1.mjs — 第一关｜往南的路。规格：docs/Data_MissionRemake.md §2（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：TengxianField（城外原野）
//
// 津浦路路基 + 路西村庄 + 南向大车路那一片内容由
// Script_TengxianOutfield.OUTFIELD_SCENES["CH1_NanLu"] 生成（河堤、土坎、散兵胸墙、
// 坟头、光秃乔木、麦田与田埂、村落、铁路路基）。**那张表按 levelId 取**，
// 所以本章 id 改了，那边的键也跟着改了 —— 两处要一起看。
//
// 借位：史料里的界河在城北约 20 km、北沙河约 8 km，本作把城外战场就近借位到
// 城外一公里内的原野上（既有做法，见 Script_TengxianOutfield 头注与 PRESUMED_OUTFIELD）。
// 「往南」在这片地上是 +Z 方向：路基阵地在北（z=-180），大车路一路向南（z→+130），
// 南路被截断之后折回西门（-330, 0）。
//
// bounds 与 spawn 沿用旧 L1_Beishahe 那一片（出生点通行已由 BootTest 的 spawnRun 验过）。
// ---------------------------------------------------------------------------

export const CHAPTER = {
  id: "CH1_NanLu",
  title: "第一关 · 往南的路",
  place: "滕县城外 · 津浦路路基、路西村庄、南向大车路",
  date: "一九三八年三月十四日 拂晓 — 午后",
  clock: "03-14 拂晓 — 午后",
  sky: "smokyDay",
  music: "fieldLament",
  minutes: 20,
  pool: { start: 240, end: 208, label: "城里还站着的人", presumed: true },
  brief: [
    "取得控制二三十秒就有敌情，一分钟内开枪 —— 这是玩家的第一场仗。",
    "打完外围，无缝转入护送伤兵南下的差事：顺子自己抢的差事。",
    "日机认出白布担架、医护与撤离百姓之后仍主动转向扫射。这一段不许弱化。",
  ],
  objectives: [
    "守住路基，顶住正面试探",
    "退进村庄外围，靠田坎顶住",
    "跟随后送队过涵洞，沿大车路向南",
    "打退截路的日军小股",
    "日机转向伤员与百姓 —— 把人拖进路沟",
    "南路断了，把能走的带回城",
  ],
  // 选点两条硬约束（都是实测逼出来的）：
  //   · **离出生点远于自己的半径**：圈罩住出生点的话，目标链会在开局第一帧
  //     自己推进一格（出图与开机冒烟会莫名其妙换到下一章）；
  //   · **别把圈心压在津浦路路基的中心线（x=-480）上**：Player.Spawn 先问
  //     physics.FindFreeSpot「这儿站得下人吗」，站不下就把人往外挪；
  //     圈心落在路基里、圈又开得小，人就被挪到圈外，目标链一辈子推不动
  //     （PlayTest「走进路标圈里目标链会推进」那条就是这么红的）。
  zones: [
    { id: "C1_Railbed", name: "津浦路路基阵地", x: -466, z: -150, radius: 30 },
    { id: "C1_Village", name: "路西村庄外围", x: -470, z: -95, radius: 28 },
    { id: "C1_Culvert", name: "涵洞与田坎", x: -458, z: -30, radius: 26 },
    { id: "C1_SouthRoad", name: "南向大车路", x: -436, z: 30, radius: 28 },
    { id: "C1_Ditch", name: "路沟与炮损民房", x: -448, z: 130, radius: 28 },
    { id: "C1_BackToWall", name: "带回城 · 西门外", x: -330, z: 0, radius: 26 },
  ],
  tuning: {
    bounds: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    spawn: { x: -480, z: -205, ry: Math.PI },
    ijaPressure: 1.0, ijaSpawn: ["north"], ijaSupport: ["artillery", "hmg"],
    // 城外这一段没有工兵爆破，也没有战车：34 辆九四式在临城方向，不进本作。
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 3,
      note: "兵站发的汉阳造，桥夹三个；木柄手榴弹六枚 —— 日方记川军各带手榴弹约六发。",
    },
  },
  // 骨架级 beats：title 卡 ＋ 每个 zone 一条 objective ＋ 关末一条。
  // 台词（搬弹药、日机扫射后的全队变化、松手与沟内那场吵、结尾伤员那句
  // 「后头抬高点，腿莫擦地」）由章节内容批填。
  // **触发式只用 start / delay / zone / end**：event: 的判定表在 Script_Story.LEVEL_CUES，
  // 那份还没有新章的键（F2 批负责补），现在用 event: 只会等超时兜底。
  beats: [
    { at: "start", type: "title", text: "往南的路", sub: "一九三八年三月十四日　滕县城外", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "守住路基，顶住正面试探" },
    { at: "zone:C1_Village", type: "objective", text: "退进村庄外围，靠田坎顶住" },
    { at: "zone:C1_Culvert", type: "objective", text: "跟随后送队过涵洞，沿大车路向南" },
    { at: "zone:C1_SouthRoad", type: "objective", text: "打退截路的日军小股" },
    { at: "zone:C1_Ditch", type: "objective", text: "日机转向伤员与百姓 —— 把人拖进路沟" },
    { at: "zone:C1_BackToWall", type: "objective", text: "南路断了，把能走的带回城" },
    { at: "end", type: "narration", text: "往南的路断了。担架上的人还活着 —— 他只说了一句「后头抬高点」。", tier: "虚构" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch1_RoadCut",
  mechanics: {
    aircraftStrafe: true,     // 日机沿路扫射，第二轮弹线追人群（系统批实现）
    stretcherCarry: true,     // 接替担架：搬运态 20—30 s，减速、不能用枪、可主动放下
    stretcherRelease: true,   // 顺子松手：提示【扑入路沟】，不躲则击倒重来
    escortColumn: true,       // 武装后送队（2 担架 + 4 担架员 + 2 护卫 + 可行走伤兵 + 百姓）
    ammoResupply: true,       // 给机枪组补弹、搜废弃阵地补弹
  },
};

export const VOICE_LINES = [];
