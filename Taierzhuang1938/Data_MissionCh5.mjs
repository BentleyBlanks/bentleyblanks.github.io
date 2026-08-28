// Data_MissionCh5.mjs — 第五关｜城墙没有了。规格：docs/Data_MissionRemake.md §6（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：A 区废墟 → 西街长街 → 西关城门
//
//   A 区 · 城内主救护所 (214, -30) —— 与三关、四关**同一个院子**（口径见
//        Data_MissionCh3 头注），这一次是废墟：一侧房屋坍塌、罗班长遗体盖白布、
//        电话断线、药箱大多空、门板担架仍在、熟人缺席。
//   西街长街 = 西门大街那条 z=0 的通视直街（城内唯一一条从城心一眼望到西城门楼的走廊）。
//   西关城门 = 怀古门 (-305, 0)，1938 年唯一的活口。
//
// **本章的验收结果之一**（§0 第 5 条）：玩家必须明确知道顺子真的有生路 ——
// 军令（不用再回来）＋ 打开的西关城门 ＋ 城外道路后送队 ＋ HUD 任务【撤出滕县】
// ＋ 玩家真的走到城门内侧。之后顺子才主动转身。所以目标链里
// C5_GateOut（城门外）与 C5_ReturnGun（返回机枪位）**两条都要有**，缺一条这件事就不成立。
//
// bounds 比旧 L5 往西多让 45 m：西关城门外那一段（-330）要在切片里，
// 否则玩家「走到门口」时门外是空地皮。cameraFar 沿用旧 L5 的 400。
// ---------------------------------------------------------------------------

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
    "建制消失，岗位不断有人补上：炊事兵被临时拉上机枪位，原射手只来得及交代两句。",
    "负伤排长下的是明确军令：出了西关，跟他们一起往临城方向走，不用再回来。",
    "玩家真正看见生路之后，顺子才主动放弃它。",
  ],
  objectives: [
    "在废墟里醒来，领撤离命令",
    "护送后送队穿过十字街口",
    "带队进西街长街",
    "接过最后一个火力点的机枪，掩护最后一副担架",
    "撤到西关城门内侧",
    "撤出滕县 —— 通过西关",
    "返回最后火力点",
  ],
  zones: [
    { id: "C5_AidRuin", name: "A 区废墟 · 清晨", x: 214, z: -30, radius: 30 },
    { id: "C5_Crossroad", name: "十字街口", x: 0, z: 0, radius: 20 },
    { id: "C5_WestStreet", name: "西街长街", x: -160, z: 0, radius: 24 },
    { id: "C5_GunNest", name: "最后一个火力点", x: -230, z: 0, radius: 20 },
    { id: "C5_GateInner", name: "西关城门内侧", x: -278, z: 0, radius: 20 },
    { id: "C5_GateOut", name: "西关城门外 · 生路", x: -330, z: 0, radius: 26 },
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
  beats: [
    { at: "start", type: "title", text: "城墙没有了", sub: "一九三八年三月十七日 清晨　城内", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "在废墟里醒来，领撤离命令" },
    { at: "zone:C5_Crossroad", type: "objective", text: "护送后送队穿过十字街口" },
    { at: "zone:C5_WestStreet", type: "objective", text: "带队进西街长街" },
    { at: "zone:C5_GunNest", type: "objective", text: "接过最后一个火力点的机枪，掩护最后一副担架" },
    { at: "zone:C5_GateInner", type: "objective", text: "撤到西关城门内侧" },
    { at: "zone:C5_GateOut", type: "objective", text: "撤出滕县 —— 通过西关" },
    { at: "zone:C5_ReturnGun", type: "objective", text: "返回最后火力点" },
    { at: "end", type: "narration", text: "后送队消失在西关方向。落地的时候，远处还有中国军队的枪声。", tier: "虚构" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch5_TurnBack",
  mechanics: {
    emplacedGun: true,        // 接管机枪位：控过热、优先打掷弹筒、封两侧院门
    gunJam: true,             // 机枪失效：卡壳/弹尽 → 改步枪 + 手榴弹
    escortConvoy: true,       // 分段护送战：掩护担架过路口、帮机枪组重新架枪
    escapeOffered: true,      // 三重确认生路：军令 + 打开的城门与城外道路 + HUD 任务
    turnBack: true,           // 身后火力停止 → 顺子主动折返（任务更新【返回最后火力点】）
    lastBayonet: true,        // 最终白刃战：两侧夹击、体力不回满、活动空间缩小
    povChain: true,           // 视角接替三段：机枪副射手 → 电话兵 → 小秦
  },
};

export const VOICE_LINES = [];
