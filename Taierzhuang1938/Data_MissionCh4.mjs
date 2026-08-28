// Data_MissionCh4.mjs — 第四关｜东关之夜。规格：docs/Data_MissionRemake.md §5（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：B 区集结院 ＋ 东关夜巷（旧 L3_Fanji 夜战切片为底）＋ A 区
//
//   B 区 · 东关临时集结院 (449, -140)  东关大街北段的一处普通民居院。
//        第五关玩家再次路过时它已坍塌（弹药箱烧黑、碎碗纸灰），无旁白也能认出。
//   A 区 · 城内主救护所   (214, -30)   与三关、五关**同一个院子**（口径见 Data_MissionCh3 头注）。
//
// spawn 沿用旧 L3 那个点：第二区纵向巷（生成器 x≈456 的明确车道）上，离寺院院墙
// 30 m 以上 —— 旧版曾把出生点压在寺院檐下，出图上是一条横贯全屏的黑带。
//
// 夜战：nightRaid 打开，日军火力优势削掉一半（张宣武回忆，标为回忆不是通则）。
// 照明弹是本章的招牌机制，熄灭后战场重新变暗。
// ---------------------------------------------------------------------------

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
    "照明弹、火光与黑暗中的短距离巷战与白刃战。全员心理已经变了。",
    "不同番号在集结院里重新编组：会打机枪的去右边，会甩手榴弹的守院墙。",
    "东关夜战中日军用照明弹照亮街巷，敌我突然暴露并爆发近距离交火。这一段不许弱化。",
  ],
  objectives: [
    "在集结院分弹药、接电话、确认口令",
    "摸黑接敌 —— 看不到就听",
    "第一枚照明弹：贴墙，打屋顶",
    "窄巷白刃，跟住自己人",
    "掩护罗班长撤离，把人抬回城",
    "回到主救护所",
  ],
  zones: [
    // 挪到出生点北 47 m（同一条东关大街）：贴着出生点的话目标链开局就自己走一格。
    { id: "C4_Assembly", name: "B 区 · 东关集结院", x: 449, z: -175, radius: 24 },
    { id: "C4_DarkLane", name: "黑巷", x: 478, z: -89, radius: 22 },
    { id: "C4_FlareCross", name: "照明弹横巷", x: 449, z: -22, radius: 22 },
    { id: "C4_NarrowLane", name: "窄巷 · 白刃", x: 443, z: 121, radius: 22 },
    { id: "C4_CarryBack", name: "东门 · 抬回城", x: 296, z: -65, radius: 24 },
    { id: "C4_AidStation", name: "A 区 · 主救护所", x: 214, z: -30, radius: 30 },
  ],
  tuning: {
    bounds: { minX: 150, maxX: 600, minZ: -300, maxZ: 170 },
    spawn: { x: 456.6, z: -128, ry: Math.atan2(-48, -42.6) },
    // 夜里日军火力优势削掉一半 —— 全局唯一一次玩家在交换比上占便宜的时段
    ijaPressure: 0.85, ijaSpawn: ["east"], ijaSupport: ["hmg"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300,
    nightRaid: true,
    // 夜袭携行走 Data_Weapons.LOADOUTS 的具名条目（一支长枪、一支短枪、肩背大刀）。
    loadout: "L3_WhiteTowel",
  },
  beats: [
    { at: "start", type: "title", text: "东关之夜", sub: "一九三八年三月十六日 夜　东关", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "在集结院分弹药、接电话、确认口令" },
    { at: "zone:C4_DarkLane", type: "objective", text: "摸黑接敌 —— 看不到就听" },
    { at: "zone:C4_FlareCross", type: "objective", text: "第一枚照明弹：贴墙，打屋顶" },
    { at: "zone:C4_NarrowLane", type: "objective", text: "窄巷白刃，跟住自己人" },
    { at: "zone:C4_CarryBack", type: "objective", text: "掩护罗班长撤离，把人抬回城" },
    { at: "zone:C4_AidStation", type: "objective", text: "回到主救护所" },
    { at: "end", type: "narration", text: "那封回信最后一行停在「等我回来……」。他说打完再写。", tier: "虚构" },
  ],
  cutsceneIn: "CS_Ch4_UnfinishedLetter",
  cutsceneOut: "CS_Ch4_AidStation",
  mechanics: {
    flares: true,             // 照明弹：横巷突然照亮 → 熄灭后重新变暗
    darkNavigation: true,     // 靠脚步/拉栓声/日语口令/远处火光/屋顶轮廓判位
    friendlyFireRisk: true,   // 友军报错口令的短暂混乱：枪口莫对到自己人
    bayonetNight: true,       // 第二枚照明弹与白刃战：熄灭后辨敌我、拾大刀
    squadRegroup: true,       // 不同番号重新编组（机枪 / 手榴弹 / 步枪三组）
    carryLeader: true,        // 掩护罗班长撤离：拖/抬，玩家压制追兵（与一关松手反差）
    letterDictation: true,    // 罗班长的半封回信（玩家边装弹夹边听）
  },
};

export const VOICE_LINES = [];
