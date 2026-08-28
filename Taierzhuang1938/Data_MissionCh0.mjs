// Data_MissionCh0.mjs — 序章｜出川。规格：docs/Data_MissionRemake.md §1（正文）与 §10（契约）。
// 本文件由基建批建骨架、序章内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 本章的形态：**过场承载章（cutsceneOnly）**
//
// 序章不建自己的战场切片：进 CH0 即播 cutsceneIn（车厢序章），播完由装配层
// 自动 AdvanceLevel 进 CH1。所以 EnterLevel 对本章**不 BuildField、不撒兵、
// 不 Respawn**（见 Script_Main.EnterLevel 里 phase.cutsceneOnly 那一支）。
//
// 但**开机直跳**（?phase=0、BootTest、出图）仍然要有一片地皮才起得来引擎
// （玩家胶囊、物理、导航、AI 都挂在 battlefield 上）。所以本章借 CH1 的切片：
//   tuning.fieldFrom = "CH1_NanLu"
// BuildField 会用这个 id 去查 OUTFIELD_SCENES / 外部布设 / tzm 饰件三张表，
// 于是「序章那一片」与「第一关那一片」逐个网格相同 —— 不会多生成一座城，
// 也不会出现「序章是一张空地皮」。zones 只作 HUD 与 LOD 焦点用。
//
// 车厢本身是过场自带的 standalone 布景（setOrigin 远离城心），底下铺的是哪片
// 地皮它不关心 —— 这也是能借片的原因。
//
// 后续序章内容批要做的是把 CS_Chuchuan 改成新策划案的 ≤45 秒版本＋车厢自由段落，
// 本文件的流程接线不用动。
// ---------------------------------------------------------------------------
//
// 兵员池曲线（全七章，逐章递减，登记在 Data_TengxianScript.PRESUMED_STAGING）：
//   序章 240→240（**不耗**）→ 一 240→208 → 二 208→168 → 三 168→140
//   → 四 140→96 → 五 96→44 → 终 44→12
// 序章不耗是刻意的：还没到滕县，「城里还站着的人」这个数在序章里只是先亮个相。

export const CHAPTER = {
  id: "CH0_Chuchuan",
  title: "序章 · 出川",
  place: "军列车厢 → 兵站月台",
  date: "一九三八年三月 · 军列南下",
  clock: "军列南下途中",
  sky: "chuchuanDay",
  // 车厢里没有音乐，只有车轮与人声（环境档见下面的 ambience）。
  music: null,
  // 天空档名与环境音档名不同名时用这一条显式指定（Script_Main 读 ambience ?? sky）。
  ambience: "trainInterior",
  minutes: 3,
  pool: { start: 240, end: 240, label: "城里还站着的人", presumed: true },
  brief: [
    "第二十二集团军是川军。军服式样不一，草鞋，步枪型号杂乱，三分之一以上没有枪。",
    "前头两个战区都不肯收；第五战区肯接，还给了枪弹。",
    "顺子背包底藏着一件民用短褂 —— 他打算借后送伤兵的差事走人。",
  ],
  objectives: [
    "在车厢里等命令",
    "透过车门看兵站补给",
    "下车 —— 前头是滕县",
  ],
  zones: [
    // 三个路标只当 HUD 去向与 LOD 焦点用（本章不建切片、不走路），坐标取 CH1 那片
    // 原野上津浦路路基一线，保证它们落在借来的切片里、也落在可通行地面上。
    // 离出生点都在 40 m 以上：路标圈套住出生点的话，目标链会在开局第一帧
    // 自己推进（进而触发换关结算），出图与开机冒烟会莫名其妙地换到下一章。
    { id: "C0_Carriage", name: "军列车厢", x: -478, z: -140, radius: 24 },
    { id: "C0_Depot", name: "兵站月台", x: -466, z: -95, radius: 24 },
    { id: "C0_Door", name: "车门", x: -452, z: -55, radius: 24 },
  ],
  tuning: {
    // 借 CH1 的切片（见文件头）。bounds 必须与 CH1 一致，否则借来的内容会被裁掉半边。
    bounds: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    fieldFrom: "CH1_NanLu",
    cutsceneOnly: true,
    spawn: { x: -480, z: -205, ry: Math.PI },
    // 车上没有仗打。撒兵那一条在 cutsceneOnly 下根本不会被调到，这里写 0 是为了
    // 万一有人拿 ?phase=0 直跳进来调试时也不会凭空冒出一条战线。
    ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
    ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 0,
    loadoutOverride: {
      primary: null, secondary: null, melee: null,
      throwables: {}, spareClips: 0,
      note: "枪弹要到兵站才发。车上只有一条布袋、一双草鞋，和背包底那件短褂。",
    },
  },
  // 骨架级 beats：title 卡 + 三条阶段提示 + 关末一条。
  // **完整台词由序章内容批填**（§1 的空间语音、兵站军官、顺子与幺娃那段计划）。
  // 触发式只用 start/delay —— 本章不走路，zone: 永远等不到。
  beats: [
    { at: "start", type: "title", text: "出川", sub: "一九三八年三月　军列南下", tier: "主流" },
    { at: "delay:4.0", type: "objective", text: "在车厢里等命令" },
    { at: "delay:6.0", type: "objective", text: "透过车门看兵站补给" },
    { at: "delay:6.0", type: "objective", text: "下车 —— 前头是滕县" },
    { at: "end", type: "narration", text: "山东 · 滕县。一九三八年三月。", tier: "主流" },
  ],
  cutsceneIn: "CS_Chuchuan",
  cutsceneOut: null,
  // 本章特有机制（声明式；引擎侧由后续系统批实现，这里只留接口）
  mechanics: {
    cutsceneOnly: true,       // 过场承载章：播完自动进下一章
    freeLookCarriage: true,   // 车厢主体保持第一人称可转动视角，不做长镜头特写
    hiddenShirt: true,        // 背包底那件民用短褂（三关撕掉它）
  },
};

// 本章新增台词语音行（结构同 Data_Voice.mjs 现有行；key 形如 ch0_shunzi_01）。
export const VOICE_LINES = [];
