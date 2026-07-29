// 《燎原 · 敌后1937》 —— 地形 / 地物 / 政权归属 / 工事 / 道路 / 季节 数据表。
//
// 本模块是"地图这一层"的全部静态数值来源，纯数据 + 极少量查表函数：
//   terrainDefinitions  9 种地形（太行山—冀西—冀中平原过渡带的地貌谱系）
//   featureDefinitions  10 种地物（聚落、渡口、隘口与乡土产业）
//   controlDefinitions  4 种政权归属（敌占区 / 游击区 / 基本区 / 巩固区）
//   workDefinitions     8 种可修筑的工事与改良
//   roadDefinitions     3 级道路（无路 / 土路 / 公路）
//   seasonDefinitions   四季（一回合 = 一个季度）
//
// 设计原则：
//   1. 色彩是华北太行的本色——赭黄、灰绿、青岩、褐土，不用鲜艳饱和色。
//      colorLow / colorHigh 供渲染层按 elevation 在 elevationBand 内插值做顶点色。
//   2. 产出（yields）用小整数，季节与工事只做乘/加修正，具体结算由 Script_Rules 负责。
//   3. 数值服务于"人民战争"的题材：山地不产粮但产掩蔽，平原产粮但藏不住人，
//      群众基础（massBase）与隐蔽度（concealment）是与产出同等重要的第一等资源。
//   4. 一切代价（伤亡、焚村、被夺粮）只进代价账本，本表不提供任何"杀戮换收益"的口子。
//
// 纯逻辑模块：不引用 window / document / three / Math.random，可直接在 node 中导入。

// ---------------------------------------------------------------------------
// 一、地形
// ---------------------------------------------------------------------------
// 字段说明：
//   yields          基础产出 { grain 粮, labor 工, ordnance 械, medicine 药, intel 情报 }
//   moveCost        进入该格的基础移动力消耗（全部有限，保证地图连通）
//   defenceBonus    防御加成（0..1，乘算到防御强度上）
//   concealment     隐蔽度（0..1，游击队藏身与脱离接触的基础）
//   elevationBand   该地形典型的高程区间，渲染做顶点色插值用
//   colorLow/High   高程区间两端的颜色
//   massBaseBias    群众基础的地形倾向（山区群众动员空间大，平原受敌控制强）

export const terrainDefinitions = Object.freeze({
  Mountain: Object.freeze({
    key: "Mountain",
    name: "高山",
    shortName: "山",
    yields: Object.freeze({ grain: 0, labor: 1, ordnance: 1, medicine: 1, intel: 1 }),
    moveCost: 4,
    defenceBonus: 0.5,
    concealment: 0.55,
    elevationBand: Object.freeze([0.78, 1.0]),
    colorLow: "#5f6068",
    colorHigh: "#949aa4",
    massBaseBias: 10,
    blurb: "太行主脊，风化的石灰岩裸露成灰白色。这里几乎不产粮食，但一条羊肠山道能拖住一个联队一整天。",
  }),
  Ridge: Object.freeze({
    key: "Ridge",
    name: "山梁",
    shortName: "梁",
    yields: Object.freeze({ grain: 0, labor: 1, ordnance: 1, medicine: 1, intel: 1 }),
    moveCost: 3,
    defenceBonus: 0.42,
    concealment: 0.5,
    elevationBand: Object.freeze([0.54, 0.8]),
    colorLow: "#746455",
    colorHigh: "#a89279",
    massBaseBias: 8,
    blurb: "连绵的分水岭。站在梁上能望见三十里外炮楼冒的烟，也能望见自家村口的炊烟。",
  }),
  Hill: Object.freeze({
    key: "Hill",
    name: "丘陵",
    shortName: "丘",
    yields: Object.freeze({ grain: 1, labor: 1, ordnance: 0, medicine: 1, intel: 0 }),
    moveCost: 2,
    defenceBonus: 0.26,
    concealment: 0.35,
    elevationBand: Object.freeze([0.3, 0.56]),
    colorLow: "#79805a",
    colorHigh: "#a6ad78",
    massBaseBias: 6,
    blurb: "土石相间的缓坡，坡上开梯田，坡根有泉。冀西的骨架就是这些不高不矮的山头。",
  }),
  Forest: Object.freeze({
    key: "Forest",
    name: "林地",
    shortName: "林",
    yields: Object.freeze({ grain: 0, labor: 2, ordnance: 0, medicine: 1, intel: 0 }),
    moveCost: 2,
    defenceBonus: 0.34,
    concealment: 0.7,
    elevationBand: Object.freeze([0.3, 0.75]),
    colorLow: "#3d5340",
    colorHigh: "#5e7a5f",
    massBaseBias: 6,
    blurb: "油松、栎树和荆棘混生的坡林。夏天是青纱帐之外最好的掩蔽，落叶之后就再藏不住整支队伍了。",
  }),
  Plain: Object.freeze({
    key: "Plain",
    name: "平原",
    shortName: "平",
    yields: Object.freeze({ grain: 3, labor: 1, ordnance: 0, medicine: 0, intel: 0 }),
    moveCost: 1,
    defenceBonus: 0,
    concealment: 0.06,
    elevationBand: Object.freeze([0.05, 0.32]),
    colorLow: "#8f8556",
    colorHigh: "#baa96e",
    massBaseBias: -4,
    blurb: "华北大平原的西缘，麦子和棉花一望无际。产粮最多，也最难藏人——路修得笔直，炮楼看得很远。",
  }),
  Loess: Object.freeze({
    key: "Loess",
    name: "黄土",
    shortName: "塬",
    yields: Object.freeze({ grain: 2, labor: 1, ordnance: 0, medicine: 0, intel: 0 }),
    moveCost: 2,
    defenceBonus: 0.18,
    concealment: 0.4,
    elevationBand: Object.freeze([0.2, 0.5]),
    colorLow: "#a07a48",
    colorHigh: "#cca36a",
    massBaseBias: 4,
    blurb: "黄土台地被雨水割成一道道深沟，窑洞开在崖面上。沟壑本身就是现成的交通壕。",
  }),
  Marsh: Object.freeze({
    key: "Marsh",
    name: "洼淀",
    shortName: "淀",
    yields: Object.freeze({ grain: 1, labor: 0, ordnance: 0, medicine: 1, intel: 1 }),
    moveCost: 3,
    defenceBonus: 0.2,
    concealment: 0.48,
    elevationBand: Object.freeze([0.02, 0.24]),
    colorLow: "#4a5e57",
    colorHigh: "#6d857c",
    massBaseBias: 5,
    blurb: "低洼的淀泊与盐碱滩，苇子长得比人高。小船能走，汽车和大车走不进来。",
  }),
  River: Object.freeze({
    key: "River",
    name: "河谷",
    shortName: "河",
    yields: Object.freeze({ grain: 2, labor: 0, ordnance: 0, medicine: 0, intel: 1 }),
    moveCost: 3,
    defenceBonus: 0.08,
    concealment: 0.14,
    elevationBand: Object.freeze([0.0, 0.7]),
    colorLow: "#43606c",
    colorHigh: "#6d8794",
    massBaseBias: 2,
    blurb: "发源于山里的季节河。汛期是天堑，枯水期是大道，能不能徒涉，得问渡口上的老河工。",
  }),
  Gorge: Object.freeze({
    key: "Gorge",
    name: "峡谷",
    shortName: "峡",
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 1, medicine: 0, intel: 1 }),
    moveCost: 3,
    defenceBonus: 0.36,
    concealment: 0.6,
    elevationBand: Object.freeze([0.44, 0.82]),
    colorLow: "#4e4a48",
    colorHigh: "#736a62",
    massBaseBias: 7,
    blurb: "两壁夹峙的深切谷道，一次只容一辆大车通过。伏击的人在崖上，被伏击的人在沟里。",
  }),
});

export const terrainKeys = Object.freeze(Object.keys(terrainDefinitions));

// ---------------------------------------------------------------------------
// 二、地物
// ---------------------------------------------------------------------------
// 字段说明：
//   yields          叠加在地形之上的产出
//   massBaseBonus   对群众基础的加减（县城是敌人的政权中心，所以是负的）
//   defenceBonus    叠加防御
//   moveCostDelta   对进入该格的移动消耗修正（渡口让河变得可通行）
//   concealmentDelta 隐蔽修正（县城、集镇人多眼杂，对我方隐蔽是负的）
//   isSettlement    是否是聚落（村庄/集镇/县城），动员、征粮、扫荡都以聚落为单位
//   population      聚落人口的量级（用于人口与代价账本的初值）

export const featureDefinitions = Object.freeze({
  Village: Object.freeze({
    key: "Village",
    name: "村庄",
    shortName: "村",
    yields: Object.freeze({ grain: 1, labor: 1, ordnance: 0, medicine: 0, intel: 0 }),
    massBaseBonus: 8,
    defenceBonus: 0.05,
    moveCostDelta: 0,
    concealmentDelta: 0.05,
    isSettlement: true,
    population: 320,
    color: "#c8b489",
    blurb: "几十户人家，一口井，一盘碾。根据地的全部力量，最后都要从这样的村子里长出来。",
  }),
  Town: Object.freeze({
    key: "Town",
    name: "集镇",
    shortName: "镇",
    yields: Object.freeze({ grain: 1, labor: 2, ordnance: 0, medicine: 1, intel: 1 }),
    massBaseBonus: 5,
    defenceBonus: 0.1,
    moveCostDelta: -1,
    concealmentDelta: -0.05,
    isSettlement: true,
    population: 1400,
    color: "#cdb079",
    blurb: "逢五排十的集，粮行、药铺、铁匠炉俱全。消息在这里流转得最快，往哪个方向流转要看人心。",
  }),
  CountySeat: Object.freeze({
    key: "CountySeat",
    name: "县城",
    shortName: "城",
    yields: Object.freeze({ grain: 2, labor: 2, ordnance: 1, medicine: 1, intel: 2 }),
    massBaseBonus: -12,
    defenceBonus: 0.38,
    moveCostDelta: -1,
    concealmentDelta: -0.2,
    isSettlement: true,
    population: 5200,
    color: "#a8654f",
    blurb: "城墙、伪县公署和一个中队的驻军。一时攻不下就先围着它，让它出了城门就什么也管不着。",
  }),
  Ford: Object.freeze({
    key: "Ford",
    name: "渡口",
    shortName: "渡",
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 1 }),
    massBaseBonus: 2,
    defenceBonus: 0.05,
    moveCostDelta: -2,
    concealmentDelta: -0.05,
    isSettlement: false,
    population: 40,
    color: "#7f97a1",
    blurb: "枯水期能趟过去的地方，两岸各有一个撑船的老汉。守住渡口，等于守住半条河。",
  }),
  Pass: Object.freeze({
    key: "Pass",
    name: "隘口",
    shortName: "隘",
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 1 }),
    massBaseBonus: 2,
    defenceBonus: 0.3,
    moveCostDelta: -1,
    concealmentDelta: 0.05,
    isSettlement: false,
    population: 0,
    color: "#8b8577",
    blurb: "一夫当关的山口，两山之间只有这一条道。守住它，山里就还是我们的地面。",
  }),
  Shrine: Object.freeze({
    key: "Shrine",
    name: "古庙",
    shortName: "庙",
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 1, intel: 1 }),
    massBaseBonus: 5,
    defenceBonus: 0.08,
    moveCostDelta: 0,
    concealmentDelta: 0.1,
    isSettlement: false,
    population: 20,
    color: "#93856b",
    blurb: "山坳里的破庙，香火早断了。如今正殿是识字班，偏殿是交通站，钟楼上挂着一面认路的旗。",
  }),
  Terrace: Object.freeze({
    key: "Terrace",
    name: "梯田",
    shortName: "梯",
    yields: Object.freeze({ grain: 2, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    massBaseBonus: 4,
    defenceBonus: 0.04,
    moveCostDelta: 0,
    concealmentDelta: 0.02,
    isSettlement: false,
    population: 0,
    color: "#a89963",
    blurb: "一层层砌上山坡的石堰田，一亩地要挑三百担土。这是山里人跟石头要粮食的办法。",
  }),
  Grove: Object.freeze({
    key: "Grove",
    name: "果林",
    shortName: "果",
    yields: Object.freeze({ grain: 1, labor: 0, ordnance: 0, medicine: 1, intel: 0 }),
    massBaseBonus: 3,
    defenceBonus: 0.06,
    moveCostDelta: 0,
    concealmentDelta: 0.14,
    isSettlement: false,
    population: 0,
    color: "#5e6d47",
    blurb: "枣林、核桃与柿子。青黄不接的月份，这些树救过整村人的命，也遮过整支队伍的行踪。",
  }),
  Quarry: Object.freeze({
    key: "Quarry",
    name: "石场",
    shortName: "石",
    yields: Object.freeze({ grain: 0, labor: 1, ordnance: 1, medicine: 0, intel: 0 }),
    massBaseBonus: 1,
    defenceBonus: 0.06,
    moveCostDelta: 0,
    concealmentDelta: 0.04,
    isSettlement: false,
    population: 30,
    color: "#8d8a80",
    blurb: "采石烧灰的场子，凿子、大锤和风箱后来都进了山沟里的修械所。",
  }),
  SaltPan: Object.freeze({
    key: "SaltPan",
    name: "盐滩",
    shortName: "盐",
    yields: Object.freeze({ grain: 0, labor: 1, ordnance: 1, medicine: 1, intel: 0 }),
    massBaseBonus: 3,
    defenceBonus: 0,
    moveCostDelta: 0,
    concealmentDelta: -0.04,
    isSettlement: false,
    population: 60,
    color: "#b6b3a2",
    blurb: "刮土淋卤熬小盐。盐是柴米，熬盐剩下的硝也是药——封锁线越紧，这片白花花的滩地越金贵。",
  }),
});

export const featureKeys = Object.freeze(Object.keys(featureDefinitions));

/** 属于聚落的地物键（动员、征粮、扫荡以此为单位）。 */
export const settlementFeatureKeys = Object.freeze(
  featureKeys.filter((key) => featureDefinitions[key].isSettlement),
);

// ---------------------------------------------------------------------------
// 三、政权归属
// ---------------------------------------------------------------------------
// taxRate    该格产出中我方实际能收上来的比例
// massDrift  每回合群众基础的自然漂移（敌占区在敌人手里会被磨下去）
// supplyRisk 我方部队在该格补给/隐蔽的风险系数，供 Rules / Combat 使用

export const controlDefinitions = Object.freeze({
  Enemy: Object.freeze({
    key: "Enemy",
    name: "敌占区",
    shortName: "敌",
    color: "#8c4a3f",
    taxRate: 0,
    massDrift: -1.5,
    supplyRisk: 1,
    exposureDelta: 3,
    blurb: "维持会挂着牌子，粮秣按册子征走。我们的人进得去，但天亮以前必须出来。",
  }),
  Contested: Object.freeze({
    key: "Contested",
    name: "游击区",
    shortName: "游",
    color: "#b08a4a",
    taxRate: 0.35,
    massDrift: -0.3,
    supplyRisk: 0.55,
    exposureDelta: 1,
    blurb: "白天挂日本旗，晚上挂我们的旗。两面政权，两本账，村长两头应付，人心在中间摇。",
  }),
  Guerrilla: Object.freeze({
    key: "Guerrilla",
    name: "基本区",
    shortName: "基",
    color: "#7c8f5a",
    taxRate: 0.75,
    massDrift: 0.8,
    supplyRisk: 0.22,
    exposureDelta: -1,
    blurb: "村里有农会、民兵和识字班，站岗放哨的是十四五岁的孩子。敌人来了，全村一夜之间搬空。",
  }),
  Base: Object.freeze({
    key: "Base",
    name: "巩固区",
    shortName: "巩",
    color: "#5d7f4e",
    taxRate: 1,
    massDrift: 1.5,
    supplyRisk: 0.08,
    exposureDelta: -2,
    blurb: "有区公所、公粮仓、卫生所和被服厂。这里的每一份收成都经得起查账，也经得起转移。",
  }),
});

export const controlKeys = Object.freeze(Object.keys(controlDefinitions));

// ---------------------------------------------------------------------------
// 四、工事与改良
// ---------------------------------------------------------------------------
// cost            { labor 工, cadre 干部 }
// turns           修筑需要的回合（季度）数
// requiresTech    需要的科技 id（由 Data_Tech.mjs 提供；null 表示无需科技）
// requiresTerrain 允许修筑的地形键数组；null 表示任意陆地
// yields          建成后每回合追加产出
// effects         建成后的规则修正，已约定的键：
//                   defenceBonus      防御加成
//                   concealmentDelta  隐蔽加成
//                   moveCostDelta     我方进入消耗修正
//                   enemyMoveCostDelta 敌方进入消耗修正
//                   massBaseDelta     群众基础一次性加成
//                   warningRange      预警半径（格）
//                   grainProtection   反抢粮时粮食保全比例
//                   scorchResist      抵抗"三光"破坏的比例
//                   setsTunnel        置位 hex.tunnel
//                   sabotageBonus     破袭行动加成
//                   exposureDelta     暴露度修正

export const workDefinitions = Object.freeze({
  Terrace: Object.freeze({
    key: "Terrace",
    name: "修梯田",
    shortName: "梯",
    cost: Object.freeze({ labor: 6, cadre: 0 }),
    turns: 2,
    requiresTech: null,
    requiresTerrain: Object.freeze(["Hill", "Loess", "Ridge", "Forest"]),
    yields: Object.freeze({ grain: 2, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    effects: Object.freeze({ massBaseDelta: 3, defenceBonus: 0.04 }),
    blurb: "变工队上山垒堰，一冬天能把两面坡改成田。粮食自己长出来，就不必伸手向老乡多要。",
  }),
  Trench: Object.freeze({
    key: "Trench",
    name: "交通壕",
    shortName: "壕",
    cost: Object.freeze({ labor: 4, cadre: 0 }),
    turns: 1,
    requiresTech: null,
    requiresTerrain: null,
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    effects: Object.freeze({ defenceBonus: 0.16, concealmentDelta: 0.08, moveCostDelta: -1 }),
    blurb: "村与村之间挖通的深沟，人在沟里走，头顶上是庄稼。转移伤员和运粮都靠它。",
  }),
  Tunnel: Object.freeze({
    key: "Tunnel",
    name: "地道",
    shortName: "道",
    cost: Object.freeze({ labor: 10, cadre: 1 }),
    turns: 3,
    requiresTech: "TechTunnelSingle",
    requiresTerrain: Object.freeze(["Plain", "Loess", "Hill", "Forest", "Marsh"]),
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    effects: Object.freeze({
      concealmentDelta: 0.34,
      defenceBonus: 0.2,
      setsTunnel: true,
      scorchResist: 0.45,
      exposureDelta: -2,
    }),
    blurb: "从一家的炕洞挖到全村，再从这村挖到那村。它不是用来打仗的，是用来让全村人活下来的。",
  }),
  Smithy: Object.freeze({
    key: "Smithy",
    name: "修械所",
    shortName: "械",
    cost: Object.freeze({ labor: 8, cadre: 1 }),
    turns: 2,
    requiresTech: "TechFieldSmithy",
    requiresTerrain: Object.freeze(["Mountain", "Ridge", "Hill", "Gorge", "Forest"]),
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 2, medicine: 0, intel: 0 }),
    effects: Object.freeze({ exposureDelta: 2 }),
    blurb: "山沟里几盘红炉，翻砂、拉膛线、复装子弹。缴来的坏枪在这里重新变成能打响的枪。",
  }),
  Cache: Object.freeze({
    key: "Cache",
    name: "坚壁窖",
    shortName: "窖",
    cost: Object.freeze({ labor: 5, cadre: 0 }),
    turns: 1,
    requiresTech: null,
    requiresTerrain: null,
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    effects: Object.freeze({ grainProtection: 0.55, scorchResist: 0.25, concealmentDelta: 0.04 }),
    blurb: "把粮食、布匹和文件坚壁进山洞与地窖，窖口盖上土再种上草。敌人搜三天，也只能搬走一堆空缸。",
  }),
  Beacon: Object.freeze({
    key: "Beacon",
    name: "消息树",
    shortName: "哨",
    cost: Object.freeze({ labor: 3, cadre: 0 }),
    turns: 1,
    requiresTech: null,
    requiresTerrain: Object.freeze(["Mountain", "Ridge", "Hill", "Gorge"]),
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 1 }),
    effects: Object.freeze({ warningRange: 3, exposureDelta: -1 }),
    blurb: "山头上一棵孤树，敌人一出据点就放倒。树一倒，二十里内的村子同时开始转移。",
  }),
  Roadblock: Object.freeze({
    key: "Roadblock",
    name: "破路",
    shortName: "破",
    cost: Object.freeze({ labor: 4, cadre: 0 }),
    turns: 1,
    requiresTech: null,
    requiresTerrain: null,
    requiresRoad: true,
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    effects: Object.freeze({ enemyMoveCostDelta: 2, sabotageBonus: 0.15, exposureDelta: 2 }),
    blurb: "把路面挖成一道道横沟，把桥板抽掉。汽车过不来，铁蹄和大炮就慢下来——这一慢，就是我们的机会。",
  }),
  Ferry: Object.freeze({
    key: "Ferry",
    name: "摆渡",
    shortName: "渡",
    cost: Object.freeze({ labor: 4, cadre: 0 }),
    turns: 1,
    requiresTech: null,
    requiresTerrain: Object.freeze(["River", "Marsh"]),
    yields: Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 }),
    effects: Object.freeze({ moveCostDelta: -2, concealmentDelta: 0.05 }),
    blurb: "藏在苇丛里的几条平底船，白天沉在水底，夜里撑出来渡人渡粮。船工都是本村的。",
  }),
});

export const workKeys = Object.freeze(Object.keys(workDefinitions));

// ---------------------------------------------------------------------------
// 五、道路
// ---------------------------------------------------------------------------
// hex.road 取值 0 / 1 / 2，与 roadLevels 下标一一对应。
// moveCostOverride 为 null 表示不改写地形消耗；否则沿路移动按此值计。

export const roadDefinitions = Object.freeze({
  None: Object.freeze({
    key: "None",
    level: 0,
    name: "无路",
    shortName: "—",
    moveCostOverride: null,
    enemySpeed: 1,
    sabotageValue: 0,
    repairTurns: 0,
    color: "#6b6355",
    blurb: "只有樵夫和放羊人踩出来的小径，地图上不画，本地人闭着眼也能走。",
  }),
  Trail: Object.freeze({
    key: "Trail",
    level: 1,
    name: "土路",
    shortName: "土",
    moveCostOverride: 1,
    enemySpeed: 1.15,
    sabotageValue: 1,
    repairTurns: 1,
    color: "#8a7a5c",
    blurb: "大车轧出来的土路，雨后一片泥泞。它连着村与集，也连着我们的交通线。",
  }),
  Highway: Object.freeze({
    key: "Highway",
    level: 2,
    name: "公路",
    shortName: "公",
    moveCostOverride: 0.5,
    enemySpeed: 1.6,
    sabotageValue: 3,
    repairTurns: 2,
    color: "#a3906a",
    blurb: "碎石铺面、能跑汽车的公路，两侧挖了封锁沟，隔三里一座炮楼。这是囚笼的铁丝。",
  }),
});

/** 按 hex.road 的数值下标取道路定义。 */
export const roadLevels = Object.freeze([
  roadDefinitions.None,
  roadDefinitions.Trail,
  roadDefinitions.Highway,
]);

// ---------------------------------------------------------------------------
// 六、季节（一回合 = 一个季度）
// ---------------------------------------------------------------------------
// yieldMultipliers 对该季度产出的乘算修正
// moveCostMultiplier 行军消耗修正（冬雪、春泥、夏汛）
// concealmentDelta 隐蔽修正（夏季青纱帐 +，冬季落叶雪地 −）
// attritionDelta 非战斗减员倾向（冻伤、疫病），由 Rules 结算为医药需求
// 起始回合 turn = 0 对应 1937 年秋，因此 seasonOffset = 2（Spring 记为 0）。

export const seasonOrder = Object.freeze(["Spring", "Summer", "Autumn", "Winter"]);
export const seasonStartOffset = 2;

export const seasonDefinitions = Object.freeze({
  Spring: Object.freeze({
    key: "Spring",
    name: "春",
    shortName: "春",
    index: 0,
    months: "三月—五月",
    yieldMultipliers: Object.freeze({ grain: 0.55, labor: 1.15, ordnance: 1, medicine: 1.1, intel: 1 }),
    moveCostMultiplier: 1.05,
    concealmentDelta: 0.02,
    attritionDelta: 0.05,
    grassColor: "#7e8a55",
    blurb: "春耕与春荒同时到来。仓里见了底，地里刚下种，这三个月最难熬，也最要紧。",
  }),
  Summer: Object.freeze({
    key: "Summer",
    name: "夏",
    shortName: "夏",
    index: 1,
    months: "六月—八月",
    yieldMultipliers: Object.freeze({ grain: 0.9, labor: 1, ordnance: 1, medicine: 1.15, intel: 1.1 }),
    moveCostMultiplier: 1,
    concealmentDelta: 0.2,
    attritionDelta: 0.08,
    grassColor: "#6f8149",
    blurb: "青纱帐起，高粱和玉米长过人头。这是华北平原一年里唯一能藏住整支队伍的季节。",
  }),
  Autumn: Object.freeze({
    key: "Autumn",
    name: "秋",
    shortName: "秋",
    index: 2,
    months: "九月—十一月",
    yieldMultipliers: Object.freeze({ grain: 1.75, labor: 0.9, ordnance: 1.05, medicine: 1, intel: 1 }),
    moveCostMultiplier: 0.95,
    concealmentDelta: 0.05,
    attritionDelta: 0,
    grassColor: "#98894f",
    blurb: "秋收也是抢收。谁先把粮食收进窖里，谁就在这一年的账上占了先手。",
  }),
  Winter: Object.freeze({
    key: "Winter",
    name: "冬",
    shortName: "冬",
    index: 3,
    months: "十二月—二月",
    yieldMultipliers: Object.freeze({ grain: 0.35, labor: 1.25, ordnance: 1, medicine: 0.85, intel: 0.95 }),
    moveCostMultiplier: 1.25,
    concealmentDelta: -0.16,
    attritionDelta: 0.18,
    grassColor: "#8a8368",
    blurb: "落叶尽，雪地上留脚印。冬闲的人手可以去修工事挖地道，但队伍的行踪也再瞒不住。",
  }),
});

/** 回合 → 季节键。turn = 0 为 1937 年秋。 */
export function SeasonKeyForTurn(turn) {
  const index = ((Math.floor(turn) % 4) + 4 + seasonStartOffset) % 4;
  return seasonOrder[index];
}

/** 回合 → 公历年份。1937 秋起算，四个回合一年。 */
export function YearForTurn(turn) {
  return 1937 + Math.floor((Math.floor(turn) + seasonStartOffset) / 4);
}

// ---------------------------------------------------------------------------
// 七、查表小工具（供 MapGen / Rules / Renderer 共用）
// ---------------------------------------------------------------------------

const emptyYields = Object.freeze({ grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 });

/** 地形 + 地物 的基础产出合并，返回新对象。 */
export function HexBaseYields(terrainKey, featureKey) {
  const terrain = terrainDefinitions[terrainKey];
  const feature = featureKey ? featureDefinitions[featureKey] : null;
  const base = terrain ? terrain.yields : emptyYields;
  const extra = feature ? feature.yields : emptyYields;
  return {
    grain: base.grain + extra.grain,
    labor: base.labor + extra.labor,
    ordnance: base.ordnance + extra.ordnance,
    medicine: base.medicine + extra.medicine,
    intel: base.intel + extra.intel,
  };
}

/** 地形 + 地物 + 道路 的移动消耗，下限 0.5。 */
export function HexMoveCost(terrainKey, featureKey, roadLevel = 0) {
  const terrain = terrainDefinitions[terrainKey];
  if (!terrain) return 1;
  const road = roadLevels[roadLevel] || roadLevels[0];
  if (road.moveCostOverride !== null) return road.moveCostOverride;
  const feature = featureKey ? featureDefinitions[featureKey] : null;
  const delta = feature ? feature.moveCostDelta : 0;
  return Math.max(0.5, terrain.moveCost + delta);
}

/** 地形 + 地物 的隐蔽度，0..1。 */
export function HexConcealment(terrainKey, featureKey) {
  const terrain = terrainDefinitions[terrainKey];
  if (!terrain) return 0;
  const feature = featureKey ? featureDefinitions[featureKey] : null;
  const value = terrain.concealment + (feature ? feature.concealmentDelta : 0);
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 地形 + 地物 的防御加成。 */
export function HexDefence(terrainKey, featureKey) {
  const terrain = terrainDefinitions[terrainKey];
  if (!terrain) return 0;
  const feature = featureKey ? featureDefinitions[featureKey] : null;
  return terrain.defenceBonus + (feature ? feature.defenceBonus : 0);
}
