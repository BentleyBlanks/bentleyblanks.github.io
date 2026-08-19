// 《血战台儿庄》战场数据 —— 纯数据，**不许 import three**。
//
// 对标 Easy Red 2 的结构：一张开放战场 + 若干占领点 + 有限的兵员池，
// 而不是一串走廊关。史实剧情不丢，改成挂在占领点与战役阶段上。
//
// 世界坐标：X 向东，Z 向南。运河在南边（+Z），寨墙在北边（−Z）。
// 台儿庄实测东西 1.1 km、南北 1.0 km；浏览器里按 **1:2.2 缩尺**取 500×460 m，
// 街巷宽度与房屋尺寸保持 1:1 不缩 —— 缩的是街区数量，不是人和门的比例。
// 理由：巷战的体验尺度来自「门有多宽、墙有多高、隔一堵墙有多近」，
// 那一层缩了这仗就不像了；而八条街减到五条，玩家感觉不出来。

export const WORLD = {
  minX: -250, maxX: 250, minZ: -230, maxZ: 230,
  groundSize: 620,
  detailRadius: 170,          // 这个半径内出全细节院落，之外只出体块与屋顶剪影
};

/** 城的骨架：寨墙四面 + 六座门（门名取自旧志）。 */
export const TOWN = {
  wallHeight: 4.0,            // 砖包土坯，高约 4 m
  wallThickness: 2.6,         // 顶宽近 3 m，向内收分
  gateTowerHeight: 7.0,
  ramparts: [
    { id: "north", x: 0, z: -190, length: 470, ry: 0, ramps: [-120, 0, 120] },
    { id: "west", x: -232, z: 0, length: 380, ry: Math.PI / 2, ramps: [-60, 90] },
    { id: "east", x: 232, z: -10, length: 360, ry: Math.PI / 2, ramps: [40] },
  ],
  gates: [
    { id: "ZhongZheng", name: "中正门", note: "北门，日军主攻方向", x: -14, z: -190, ry: 0 },
    { id: "ChengEn", name: "小北门", note: "承恩湛露", x: 128, z: -190, ry: 0 },
    { id: "West", name: "西门", note: "城内守军对外的唯一通路", x: -232, z: 24, ry: Math.PI / 2 },
    { id: "YangSheng", name: "东门", note: "仰生", x: 232, z: 30, ry: Math.PI / 2 },
    { id: "HuiDiJi", name: "南门", note: "惠迪吉，出门是运河", x: -30, z: 196, ry: 0 },
    { id: "YingXiang", name: "小南门", note: "迎祥", x: 118, z: 196, ry: 0 },
  ],
  canal: { z: 232, width: 46 },                 // 大运河紧贴城南
  pontoon: { x: -30, z: 232, width: 5.5 },      // 唯一一道浮桥
};

/**
 * 占领点。ER2 式：占领条 + 驻守人数 + 可反夺。
 * 每一个都挂着一条史实 —— 拿下它会弹出对应的注记。
 */
export const OBJECTIVES = [
  {
    id: "NorthGate", name: "中正门", x: -14, z: -178, radius: 26,
    owner: "nra", value: 3, note: "Town",
    line: "北门是日军的主攻方向。三月二十四日起，飞机、重炮、战车往这一处砸。",
  },
  {
    id: "NorthEast", name: "东北角", x: 150, z: -160, radius: 24,
    owner: "nra", value: 2, note: null,
    line: "三月二十七日，日军先占了这里的城墙，一部突入城内。",
  },
  {
    id: "NorthWest", name: "西北角", x: -178, z: -132, radius: 24,
    owner: "nra", value: 4, note: "WestGate",
    line: "二十八日日军转攻西北角，要夺西门。西门一丢，城里这几千人就成了扎死的口袋。",
  },
  {
    id: "Mosque", name: "清真寺", x: 46, z: -54, radius: 28,
    owner: "nra", value: 5, note: "Mosque",
    line: "一八六团指挥所。中日双方在这座乾隆七年的院子里拉锯了七天七夜。",
  },
  {
    id: "WenchangPavilion", name: "文昌阁", x: -110, z: 20, radius: 22,
    owner: "nra", value: 3, note: "DareToDie",
    line: "王冠五派特务连七十二人来复文昌阁，殉国十四人。",
  },
  {
    id: "Station", name: "火车站", x: -160, z: 140, radius: 26,
    owner: "nra", value: 3, note: null,
    line: "台枣支线的终点，清光绪二十五年建。这一仗里烧掉了。",
  },
  {
    id: "GuandiTemple", name: "新关帝庙", x: 148, z: 96, radius: 26,
    owner: "nra", value: 4, note: null,
    line: "山西会馆，第三十一师师长池峰城的指挥所。退到这儿，身后就是运河了。",
  },
  {
    id: "SouthGate", name: "惠迪吉门", x: -30, z: 184, radius: 24,
    owner: "nra", value: 5, note: "Pontoon",
    line: "出了南门就是运河浮桥。全城唯一的退路与补给线。",
  },
];

/**
 * 战役阶段：按史实日期推进。每一阶段有自己的天光、兵力与目标。
 * 阶段推进的条件是**时间 + 战况**，不是玩家杀够多少人。
 */
export const PHASES = [
  {
    id: "P1", date: "三月二十四日", label: "日军攻城", sky: "smokyDay",
    minutes: 4,
    ijaPressure: 1.0, ijaSpawn: ["north"], ijaSupport: ["launcher"],
    nraPool: 900, ijaPool: 700, loadout: "L0_Wall",
    brief: ["日军以飞机、重炮、战车猛攻寨墙。", "守北门的一八六团付出重大伤亡，几次把他们打下去。"],
    story: "P1_Wall",
  },
  {
    id: "P2", date: "三月二十七日 晨五时三十分", label: "突入城内", sky: "dawn",
    minutes: 5,
    ijaPressure: 1.35, ijaSpawn: ["north", "northeast"], ijaSupport: ["launcher", "hmg"],
    nraPool: 760, ijaPool: 720, loadout: "L1_Breach",
    brief: ["日军突入城内。守的不再是墙，是一间一间的房子。", "时人管它叫「室战墙战」。"],
    story: "P2_Breach",
  },
  {
    id: "P3", date: "三月二十八日", label: "西北角危局", sky: "smokyDay",
    minutes: 5,
    ijaPressure: 1.6, ijaSpawn: ["northwest", "north"], ijaSupport: ["launcher", "hmg", "tank"],
    nraPool: 600, ijaPool: 700, loadout: "L2_RoomWar",
    brief: ["日军转攻西北角，要夺西门。", "第二十七师一五八团三营的两个连翻城墙进来增援 —— 城门已经进不来了。"],
    story: "P3_NorthWest",
  },
  {
    id: "P4", date: "三月底 · 夜", label: "夜袭", sky: "night",
    minutes: 4,
    ijaPressure: 1.1, ijaSpawn: ["north", "northeast"], ijaSupport: ["hmg"],
    nraPool: 520, ijaPool: 620, loadout: "L3_WhiteTowel",
    nightRaid: true,
    brief: ["阵地白天丢，夜里夺回来。", "日军的飞机、坦克、大炮，夜里都不好使。", "白毛巾缠上，大刀背身后。"],
    story: "P4_Raid",
  },
  {
    id: "P5", date: "四月四日", label: "三分之二", sky: "burningStreet",
    minutes: 5,
    ijaPressure: 1.9, ijaSpawn: ["north", "northeast", "northwest"], ijaSupport: ["launcher", "hmg", "tank"],
    nraPool: 380, ijaPool: 640, loadout: "L4_LastFiveMinutes",
    brief: [
      "日军控制了三分之二到四分之三的市街，守军只剩西南一隅，背靠运河。",
      "孙连仲报伤亡逾十分之七，请求撤到运河南岸。",
      "李宗仁不准：胜负之数决定于最后五分钟。",
    ],
    story: "P5_LastFive",
  },
  {
    id: "P6", date: "四月六日 日没后 — 四月七日 凌晨一时", label: "全线反攻", sky: "night",
    minutes: 6,
    ijaPressure: 0.75, ijaSpawn: ["north"], ijaSupport: ["hmg"],
    nraPool: 520, ijaPool: 520, loadout: "L5_Morning",
    counterattack: true,
    brief: [
      "汤恩伯的第二十军团在外线压上来了。",
      "同一天，日军两个支队接到转进命令 —— 濑谷支队长甚至是独断离脱。",
      "两件事撞在一起。现在往北打。",
    ],
    story: "P6_Counter",
  },
];

/**
 * 兵员池：ER2 式的「死了换一个人接着打」。
 * 这不是无代价复活 —— 每换一个人，池子少一个，池子空了这仗就真的守不住。
 * 孙连仲那句命令原话就是这个机制：「士兵打完了，你自己填上去。你填过了，我来填。」
 */
export const REINFORCE = {
  poolLabel: "能拿枪的人",
  respawnDelayS: 4.5,
  // ER2 的票池在打赢一个阶段后会按剩余量做橡皮筋补给，防止一次崩盘就没得玩。
  // 这里照抄，但补给量按史实压得很紧 —— 第 2 集团军最后是伤亡逾十分之七收的场。
  phaseRefill: (current, max) => current + Math.round(max * 0.12 + (max - current) * 0.18),
  // 信息不对称：只有站在占领区里才看得见对面还剩多少人。
  intelRequiresZone: true,
  // 阵亡卡片：全屏黑底白字两秒半，然后接管另一个人。
  // 这一条几乎零性能成本、情绪回报最高 —— 而且孙连仲的命令原话就是这个机制：
  //「士兵打完了，你自己填上去。你填过了，我来填。」
  deathCardSeconds: 2.6,
  // 池子见底时，后方的担架兵、炊事兵、伙夫也编进来 —— 这是四月四日真下过的命令
  lastDitchAt: 0.12,
  lastDitchLine: "担架兵、炊事兵、伙夫，能拿枪的都上来了。团部现在没有后方了。",
};

/** 姓名池：籍贯按第 2 集团军的实际构成（河北、河南、陕西为主，鲁南本地补充）。 */
export const NAME_POOL = {
  surnames: ["李", "刘", "王", "张", "赵", "孙", "马", "秦", "郭", "杨", "陈", "冯", "韩", "宋", "崔", "曹", "范", "石", "邓", "牛"],
  given: ["长根", "振海", "四喜", "怀山", "有福", "德胜", "小改", "金锁", "文才", "起山",
    "二柱", "满仓", "保成", "秉山", "三省", "顺子", "留柱", "来喜", "存孝", "根生",
    "秃子", "拴住", "银锁", "五斤", "老憨", "喜元", "永泰", "满堂", "占奎", "俊卿"],
  origins: [
    { place: "河北雄县", weight: 3 }, { place: "河北景县", weight: 3 }, { place: "河北沧县", weight: 2 },
    { place: "河南尉氏", weight: 3 }, { place: "河南商丘", weight: 2 }, { place: "河南南阳", weight: 2 },
    { place: "陕西泾阳", weight: 2 }, { place: "陕西石泉", weight: 1 }, { place: "陕西三原", weight: 2 },
    { place: "山东峄县", weight: 2 }, { place: "山东滕县", weight: 1 }, { place: "山西平遥", weight: 1 },
  ],
  // 杂牌部队的枪：中正式最少，汉阳造最多 —— 这个比例本身就是史实
  weapons: [
    { id: "HanYang", weight: 5 },
    { id: "ZhongZheng", weight: 3 },
    { id: "Zb26", weight: 1 },
  ],
};

/** 战场规模三档。开局跑一次性能探针自动推荐。 */
export const SCALE_PRESETS = {
  small: { label: "小（40 人）", maxAlive: 40, vfxBudget: 2200, shadow: 2048 },
  medium: { label: "中（70 人）", maxAlive: 70, vfxBudget: 3400, shadow: 2048 },
  large: { label: "大（110 人）", maxAlive: 110, vfxBudget: 4200, shadow: 4096, warn: "需要较好的设备" },
};

/**
 * 玩家能下的命令。按住 Tab 出**径向轮盘**（Script_Wheel，纯 Canvas 2D，零 3D 开销），
 * 推鼠标指方向、松手下令；轮盘打开期间按 Digit1-8 直选，作为兜底与可访问性通道。
 *
 * 八条对齐 ER2 的十二条指令表里我们够得着的那些。key 字段既是数字键，
 * 也是轮盘上那一格右下角印的数字 —— 两者必须是同一个数，别各写一份。
 */
export const ORDERS = [
  { id: "follow", key: "1", label: "跟我来", hint: "跟在你身后，不主动脱离" },
  { id: "advance", key: "2", label: "向前", hint: "向你瞄的方向逐段跃进" },
  { id: "hold", key: "3", label: "固守", hint: "就地找掩体，不再前进" },
  { id: "spread", key: "4", label: "散开", hint: "拉开间距，防掷弹筒" },
  { id: "flank", key: "5", label: "绕过去", hint: "从侧面兜过去，别正面顶" },
  { id: "charge", key: "6", label: "上刺刀", hint: "白刃冲锋，最后一手" },
  // 潜行 = ER2 的 Covert Movements：全班照班长的姿态走，而且不开枪。
  // 你趴他们也趴 —— 加上"卧倒的人四十五米外看不见"，夜袭那一关才真的是夜袭。
  { id: "covert", key: "7", label: "潜行", hint: "照你的姿态走，不许开枪" },
  // 要炮不走 IssueOrder（那是给弟兄下令的通道），装配层单独分流到 CallMortar。
  // F 键腾给通用交互之后，这是叫炮唯一的入口。
  { id: "callFire", key: "8", label: "要炮", hint: "往你瞄的地方打一发迫击炮" },
];

/**
 * 支援。**不对称是史实**：
 * 中方只有稀缺的二十年式 82 mm 迫击炮，没有空中支援，没有重炮；
 * 日方有掷弹筒、九二式重机、战车、野战重炮。
 */
export const SUPPORT = {
  nra: [
    {
      id: "mortar", name: "迫击炮", weapon: "二十年式 82 mm",
      uses: 2, cooldownS: 150, delayS: 9, radius: 14, damage: 95,
      note: "全集团军的迫击炮都是数得过来的。打完这两发就没有了。",
    },
    {
      id: "runner", name: "传令兵", weapon: "两条腿",
      uses: 3, cooldownS: 70, delayS: 14, radius: 0, damage: 0,
      effect: "reinforceSquad",
      note: "没有无线电。要人只能派人跑回去要。",
    },
  ],
  ija: [
    { id: "launcher", name: "掷弹筒", intervalS: 14, radius: 5, damage: 110, warnS: 1.6 },
    { id: "artillery", name: "野战重炮", intervalS: 42, radius: 11, damage: 160, warnS: 2.6 },
  ],
};

/**
 * 压制与伤口的数值。
 * 这里**没有士气**：屏幕上出现一条「中国守军士气条」在立场上是灾难。
 * 原来的 moraleBreakAt 定义了却全仓库一行没读，已删；班组密度那个量改叫
 * Soldier.cohesion，留在 AI 内部，永不出 UI。
 */
export const COMBAT = {
  suppressPerNearMiss: 0.16,
  suppressRadius: 2.6,
  suppressDecayPerS: 0.55,
  suppressAccuracyPenalty: 1.3,       // 散布乘数上限
  bleedPerWound: { head: 6, torso: 2.6, arm: 1.4, leg: 1.4 },
  bandages: 2,
  aiReactionS: [0.35, 0.9],
  aiAccuracyBase: 0.55,
  aiAccuracySuppressed: 0.18,
};

/**
 * 难度。**一个对象被所有系统读取，绝不把难度硬编码进各处逻辑。**
 *
 * 这一批只接了跟"枪的手感三件套"直接相关的几项（弹道重力、自由瞄准、铁瞄偏心、
 * 过热），其余字段先立在这里占位，等做难度面板那一批再逐条接上去 ——
 * 立在这里是为了让后人往同一个地方加，而不是又在七处写死一个魔法数。
 *
 * 两条写死的：
 *  · autoSurrender 恒 false 且不给用户开。ER2 写实档下玩家会被系统判定投降，
 *    我们不做 —— 孙连仲那句「有敢退过运河的，杀无赦」是这个游戏的命门，
 *    玩家被系统判定投降会直接摧毁它。（ER2 自己也提供了关掉这条的开关。）
 *  · freeAimDeg 的 0 档只有在**弹道、视差、后坐**三条都落地之后才可用，
 *    否则会得到"枪很稳但打不中"这个最糟的组合。这一批三条都落地了，所以 0 档开放。
 */
export const FREE_AIM_STEPS = [0, 1.2, 2.0, 3.5];

export const DIFFICULTY_PRESETS = {
  experience: {
    id: "experience", label: "体验",
    aiAccuracy: 0.70, playerDamage: 0.80, suppressionScale: 0.6,
    bulletGravity: 0.5, freeAimDeg: 3.5, ironSightOffset: 0.0,
    staminaSeconds: 12, overheat: true, autoSurrender: false,
    showCrosshair: true, enemyMarkers: true,
  },
  standard: {
    id: "standard", label: "标准",
    aiAccuracy: 1.0, playerDamage: 1.0, suppressionScale: 1.0,
    bulletGravity: 1.0, freeAimDeg: 2.0, ironSightOffset: 1.0,
    staminaSeconds: 8, overheat: true, autoSurrender: false,
    showCrosshair: false, enemyMarkers: false,
  },
  realistic: {
    id: "realistic", label: "写实",
    aiAccuracy: 1.15, playerDamage: 1.25, suppressionScale: 1.3,
    bulletGravity: 1.0, freeAimDeg: 1.2, ironSightOffset: 1.4,
    staminaSeconds: 5, overheat: true, autoSurrender: false,
    showCrosshair: false, enemyMarkers: false,
  },
};

/** 运行时那一份（可被难度面板改写）。默认标准档。 */
export const DIFFICULTY = { ...DIFFICULTY_PRESETS.standard };

/** 换档。autoSurrender 永远被强按回 false —— 不接受任何预设把它打开。 */
export function ApplyDifficulty(presetId) {
  const preset = DIFFICULTY_PRESETS[presetId];
  if (!preset) return DIFFICULTY;
  Object.assign(DIFFICULTY, preset);
  DIFFICULTY.autoSurrender = false;
  return DIFFICULTY;
}
