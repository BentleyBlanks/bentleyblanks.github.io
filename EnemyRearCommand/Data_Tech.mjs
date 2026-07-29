// 《烽线 · 敌后指挥》 —— 双研究树与政策卡数据模块。
//
// 本模块提供三份静态数据与三个纯工具函数：
//   1. techDefinitions      军事/技术树 24 项（收枪 → 修械 → 弹药 → 地雷 → 地道 → 电台 → 攻坚）
//   2. doctrineDefinitions  群众/政权树 18 项（发动群众 → 农会 → 减租减息 → 三三制 → 精兵简政 → 大生产）
//   3. policyDefinitions    政策卡 20 张（军事/经济/群众/组织四类，占槽位，可随时换卡但要付干部代价）
//
// 两棵树共用同一个 `state.research.done` 数组，因此 `requires` 可以跨树引用；
// 政策卡的 `requires` 同样可以指向任意一棵树上的节点。
//
// 设计红线（规格书第 7 节）：平民伤亡、流离、被焚村庄、被夺粮食只进 `state.ledger` 代价账本。
// 本模块中任何 effects 都不会把这些代价换算成资源或分数；与之相关的只有 `civilianShelter`
// （减少扫荡造成的平民损失）与 `seizureResist`（减少敌军抢粮成功比例）这两个**减灾**字段。
//
// 纯逻辑模块：不引用 window / document / three / Math.random，可直接在 node 中导入。

// ---------------------------------------------------------------------------
// 0. 通用常量与效果词汇表
// ---------------------------------------------------------------------------

/** 五种可产出资源（干部 cadre 不走 yields，走 cadreGrowth）。 */
export const resourceKeys = Object.freeze(['grain', 'labor', 'ordnance', 'medicine', 'intel']);

/** 仓库里的六种资源，含干部。 */
export const stockKeys = Object.freeze(['grain', 'labor', 'ordnance', 'medicine', 'intel', 'cadre']);

/** 五个时期，按时间先后。 */
export const eraOrder = Object.freeze(['Opening', 'Growth', 'Hardship', 'Recovery', 'Counter']);

/** 政策卡四大分类。 */
export const policyCategories = Object.freeze({
  Military: { key: 'Military', name: '军事', accent: '#8f3b2f' },
  Economy: { key: 'Economy', name: '经济', accent: '#7a6326' },
  Mass: { key: 'Mass', name: '群众', accent: '#3f6045' },
  Organization: { key: 'Organization', name: '组织', accent: '#3c4f6b' },
});

/**
 * 效果词汇表（硬契约）。核心规则模块按 kind 通用地消费这些 key：
 *   'resourceMap' 形如 { grain: 0.1, intel: 2 }，按资源逐项相加
 *   'list'        字符串数组，合并时取并集
 *   'flag'        布尔量，合并时取或
 *   'number'      数值，合并时相加
 */
export const effectKeySchema = Object.freeze({
  yieldBonus: { kind: 'resourceMap', name: '产出加成', unit: 'percent' },
  flatYield: { kind: 'resourceMap', name: '固定产出', unit: 'flat' },
  unlockUnits: { kind: 'list', name: '解锁部队' },
  unlockDistricts: { kind: 'list', name: '解锁区域' },
  unlockWorks: { kind: 'list', name: '解锁工事' },
  unlockPolicies: { kind: 'list', name: '解锁政策' },
  policySlots: { kind: 'number', name: '政策槽位', unit: 'flat' },
  baseSlots: { kind: 'number', name: '根据地上限', unit: 'flat' },
  massGrowth: { kind: 'number', name: '群众基础增长', unit: 'percent' },
  populationGrowth: { kind: 'number', name: '人口增长', unit: 'percent' },
  cadreGrowth: { kind: 'number', name: '干部培养', unit: 'percent' },
  unrestDecay: { kind: 'number', name: '不满消解', unit: 'percent' },
  exposureDecay: { kind: 'number', name: '暴露度衰减', unit: 'percent' },
  intelRange: { kind: 'number', name: '情报半径', unit: 'flat' },
  sweepWarning: { kind: 'number', name: '扫荡预警回合', unit: 'flat' },
  garrisonReveal: { kind: 'flag', name: '据点守备可见' },
  combatAmbush: { kind: 'number', name: '伏击加成', unit: 'percent' },
  combatAttack: { kind: 'number', name: '攻击加成', unit: 'percent' },
  combatDefence: { kind: 'number', name: '防御加成', unit: 'percent' },
  captureRate: { kind: 'number', name: '缴获率', unit: 'percent' },
  healRate: { kind: 'number', name: '治疗速度', unit: 'percent' },
  buildSpeed: { kind: 'number', name: '建设速度', unit: 'percent' },
  moveBonus: { kind: 'number', name: '机动加成', unit: 'flat' },
  sabotageBonus: { kind: 'number', name: '破袭加成', unit: 'percent' },
  siegeBonus: { kind: 'number', name: '攻坚加成', unit: 'percent' },
  upkeepDiscount: { kind: 'number', name: '维持费减免', unit: 'percent' },
  tunnelMove: { kind: 'flag', name: '地道机动' },
  // ↓ 本模块新增的两个 key（已在交付回报中声明），语义均为「减少代价」，绝不产生资源或分数。
  seizureResist: { kind: 'number', name: '抗征发', unit: 'percent' },
  civilianShelter: { kind: 'number', name: '群众掩蔽', unit: 'percent' },
});

export const effectKeys = Object.freeze(Object.keys(effectKeySchema));

// ---------------------------------------------------------------------------
// 1. 军事 / 技术树（24 项）
// ---------------------------------------------------------------------------
//
// 主题线索：收缴枪械 → 修械所 → 复装子弹 / 手榴弹 → 地雷（踏发→绊发连环）→ 掷弹筒 → 迫击炮
//           土工作业 → 地道（单口→双口→户户相通→战斗地道）→ 破轨 → 爆破 → 攻坚
//           侦察反侦察 → 交通站 → 电台密码 → 骑兵交通队
//           战地救护 → 消毒防疫 → 土法制药 / 被服冬装
//
// 成本：intel 是研究进度的主要来源，cadre 是「谁去办这件事」的组织成本，永远稀缺。

export const techDefinitions = Object.freeze({
  // ------------------------------- tier 0 -------------------------------
  TechArmsCollection: {
    id: 'TechArmsCollection',
    name: '收缴枪械',
    era: 'Opening',
    tier: 0,
    cost: { intel: 8, cadre: 1 },
    requires: [],
    effects: {
      captureRate: 0.12,
      yieldBonus: { ordnance: 0.1 },
    },
    blurb: '枪不是造出来的，是从溃兵、民团、护院手里一支一支说下来、换下来、缴下来的。难的是登记造册：一个村藏几条枪，往往要跑七八趟才问得清。',
    quote: '有枪的先编队，没枪的先编人。——根据地干部回忆',
  },
  TechScoutCraft: {
    id: 'TechScoutCraft',
    name: '侦察与反侦察',
    era: 'Opening',
    tier: 0,
    cost: { intel: 10, cadre: 1 },
    requires: [],
    effects: {
      intelRange: 1,
      unlockUnits: ['Scout'],
      unlockPolicies: ['PolicySwiftDispersal'],
      yieldBonus: { intel: 0.12 },
    },
    blurb: '看见敌人不难，难的是不让敌人看见自己。路口的孩子、集上的货郎、庙里的香客都是眼睛，也都可能是别人的眼睛。',
    quote: '情况不明不动手，动了手就得走。——军分区作战小结',
  },
  TechFieldMedicine: {
    id: 'TechFieldMedicine',
    name: '战地救护',
    era: 'Opening',
    tier: 0,
    cost: { intel: 9, cadre: 2 },
    requires: [],
    effects: {
      healRate: 0.18,
      unlockUnits: ['StretcherMedicTeam'],
    },
    blurb: '伤员多半不是死在中弹那一刻，而是死在此后三天。担架、开水、干净布，比手术刀更早救人。',
    quote: '抬得下来的，十个能活七个。——分区卫生处工作报告',
  },
  TechEarthworks: {
    id: 'TechEarthworks',
    name: '土工作业',
    era: 'Opening',
    tier: 0,
    cost: { intel: 8, cadre: 1 },
    requires: [],
    effects: {
      unlockWorks: ['Trench'],
      buildSpeed: 0.15,
      combatDefence: 0.06,
    },
    blurb: '一把镐、一副筐，土是最便宜的掩体。真正难的是让全村人相信：挖一冬的沟，能顶得住一次扫荡。',
    quote: '沟是自己的，路是敌人的。——冀中区党委工作总结',
  },

  // ------------------------------- tier 1 -------------------------------
  TechFieldSmithy: {
    id: 'TechFieldSmithy',
    name: '修械所',
    era: 'Opening',
    tier: 1,
    cost: { intel: 16, cadre: 2 },
    requires: ['TechArmsCollection'],
    effects: {
      unlockDistricts: ['Armory'],
      unlockWorks: ['Smithy'],
      yieldBonus: { ordnance: 0.12 },
    },
    blurb: '几盘红炉、一台脚踏车床，先修枪机后配零件。铁匠不难找，难的是找到会看膛线、敢拆撞针的人。',
    quote: '修好一支，就等于缴到一支。——军区供给部纪要',
  },
  TechCourierNetwork: {
    id: 'TechCourierNetwork',
    name: '交通站与消息树',
    era: 'Opening',
    tier: 1,
    cost: { intel: 15, cadre: 2 },
    requires: ['TechScoutCraft'],
    effects: {
      unlockDistricts: ['CourierStation'],
      unlockWorks: ['Beacon'],
      intelRange: 1,
      sweepWarning: 1,
    },
    blurb: '村口老树砍去枝杈，一倒就是警报。交通站按站接力，一封信走三百里要过十几双手，每一双手都得是自己人。',
    quote: '信可以丢，人不能供。——老交通员回忆',
  },
  TechDisinfection: {
    id: 'TechDisinfection',
    name: '消毒与防疫',
    era: 'Opening',
    tier: 1,
    cost: { intel: 17, cadre: 2 },
    requires: ['TechFieldMedicine'],
    effects: {
      unlockDistricts: ['Infirmary'],
      healRate: 0.12,
      yieldBonus: { medicine: 0.1 },
    },
    blurb: '石灰、开水、艾草能挡住的比药还多。困难在于让部队肯把水烧开、肯把伤口敞在光里晾。',
    quote: '一口生水，可以废掉一个班。——分区卫生处工作报告',
  },
  TechTunnelSingle: {
    id: 'TechTunnelSingle',
    name: '单口地洞',
    era: 'Opening',
    tier: 1,
    cost: { intel: 14, cadre: 2 },
    requires: ['TechEarthworks'],
    effects: {
      unlockDistricts: ['TunnelMouth'],
      unlockWorks: ['Tunnel'],
      civilianShelter: 0.08,
      combatDefence: 0.05,
    },
    blurb: '先从藏红薯的窖改起，一家一口，只能躲人不能过人。敌人往里灌一次烟，洞里就没有活口——这个教训是用命换来的。',
    quote: '一个口的洞是坟，两个口的洞才是路。——民兵队长回忆',
  },

  // ------------------------------- tier 2 -------------------------------
  TechCartridgeReload: {
    id: 'TechCartridgeReload',
    name: '复装子弹',
    era: 'Growth',
    tier: 2,
    cost: { intel: 26, cadre: 2 },
    requires: ['TechFieldSmithy'],
    effects: {
      unlockUnits: ['CountyCompany'],
      unlockDistricts: ['FiringRange'],
      yieldBonus: { ordnance: 0.15 },
      combatAttack: 0.05,
    },
    blurb: '捡回的弹壳去锈、修口、复装。药量差一分膛压就多一分，炸膛的枪比哑火的枪更要命。',
    quote: '打一枪捡一壳，是纪律，不是节省。——县大队战斗小结',
  },
  TechGrenadeWorks: {
    id: 'TechGrenadeWorks',
    name: '手榴弹制造',
    era: 'Growth',
    tier: 2,
    cost: { intel: 28, cadre: 3 },
    requires: ['TechFieldSmithy'],
    effects: {
      unlockUnits: ['MainForceCompany'],
      yieldBonus: { ordnance: 0.12 },
      combatAttack: 0.08,
    },
    blurb: '生铁壳、黑火药、麻绳拉火。造得出来不难，造得稳最难：受潮、迟发、早炸，三样都要人命。',
    quote: '一人四枚，够打一次伏击。——军区供给部纪要',
  },
  TechRailBreaking: {
    id: 'TechRailBreaking',
    name: '破轨技术',
    era: 'Growth',
    tier: 2,
    cost: { intel: 24, cadre: 2 },
    requires: ['TechArmsCollection', 'TechEarthworks'],
    effects: {
      unlockWorks: ['Roadblock'],
      sabotageBonus: 0.2,
      unlockPolicies: ['PolicyRailRaid'],
    },
    blurb: '撬一块鱼尾板、起一段道钉，比用炸药省得多。难在天亮前必须撤干净——天一亮，修路的伪工和护路队就到了。',
    quote: '路破得开，还要破得起来第二回。——破袭战总结',
  },
  TechTunnelDouble: {
    id: 'TechTunnelDouble',
    name: '双口地道',
    era: 'Growth',
    tier: 2,
    cost: { intel: 27, cadre: 3 },
    requires: ['TechTunnelSingle'],
    effects: {
      unlockWorks: ['Cache'],
      civilianShelter: 0.1,
      seizureResist: 0.12,
      combatDefence: 0.06,
    },
    blurb: '一口进、一口出，洞里才有风。开第二个口意味着要多信一户人家——这是比土方更重的成本。',
    quote: '洞里存的不是粮，是明年春天。——村支书回忆',
  },
  TechQuilting: {
    id: 'TechQuilting',
    name: '被服与冬装',
    era: 'Growth',
    tier: 2,
    cost: { intel: 22, cadre: 2 },
    requires: ['TechDisinfection'],
    effects: {
      unlockDistricts: ['ClothingWorkshop'],
      upkeepDiscount: 0.08,
      healRate: 0.06,
      unlockPolicies: ['PolicySaltAndCloth'],
    },
    blurb: '一件棉衣三斤棉，棉花要从敌占区换回来，针线要靠妇救会一针一针纳。冬天没有棉衣，减员比打仗还多。',
    quote: '冬装到得早一个月，能少埋多少人。——军区供给部纪要',
  },

  // ------------------------------- tier 3 -------------------------------
  TechLandmineTread: {
    id: 'TechLandmineTread',
    name: '踏发地雷',
    era: 'Growth',
    tier: 3,
    cost: { intel: 36, cadre: 3 },
    requires: ['TechGrenadeWorks'],
    effects: {
      combatDefence: 0.12,
      combatAmbush: 0.08,
      unlockPolicies: ['PolicyMineWarfare'],
    },
    blurb: '石雷比铁雷便宜：凿眼、装药、压火。最难的是造册与看管——雷埋下去，孩子和牲口也走那条路。',
    quote: '埋雷要报数，起雷要点名。——民兵训练教材',
  },
  TechDemolition: {
    id: 'TechDemolition',
    name: '爆破工程',
    era: 'Growth',
    tier: 3,
    cost: { intel: 40, cadre: 4 },
    requires: ['TechGrenadeWorks', 'TechRailBreaking'],
    effects: {
      unlockUnits: ['DemolitionTeam'],
      sabotageBonus: 0.18,
      siegeBonus: 0.12,
    },
    blurb: '算药量、量炮眼、看土质。炸桥和炸炮楼是两门学问：前者算跨度，后者算墙厚，算错了就是白搭一条命。',
    quote: '药少炸不动，药多惊动一条线。——爆破组笔记',
  },
  TechWirelessSet: {
    id: 'TechWirelessSet',
    name: '电台与密码',
    era: 'Growth',
    tier: 3,
    cost: { intel: 42, cadre: 4 },
    requires: ['TechScoutCraft', 'TechCourierNetwork'],
    effects: {
      unlockDistricts: ['RadioRoom'],
      flatYield: { intel: 2 },
      sweepWarning: 1,
      intelRange: 1,
    },
    blurb: '一部电台靠人背、靠干电池，还得躲测向车。密码本受潮就是废纸，抄错一个字整份电报作废。',
    quote: '发报三分钟，转移三里地。——报务员回忆',
  },
  TechFolkPharmacy: {
    id: 'TechFolkPharmacy',
    name: '土法制药',
    era: 'Hardship',
    tier: 3,
    cost: { intel: 38, cadre: 4 },
    requires: ['TechDisinfection'],
    effects: {
      yieldBonus: { medicine: 0.25 },
      flatYield: { medicine: 1 },
      healRate: 0.1,
    },
    blurb: '没有磺胺就用大蒜、黄连、蒸馏水，酒精靠自己蒸。药永远不够——这是整个边区最硬的一堵墙，土法只能把墙削薄一点。',
    quote: '药棉洗过三遍还在用。——分区卫生处工作报告',
  },
  TechTunnelLinked: {
    id: 'TechTunnelLinked',
    name: '户户相通',
    era: 'Growth',
    tier: 3,
    cost: { intel: 34, cadre: 4 },
    requires: ['TechTunnelDouble'],
    effects: {
      tunnelMove: true,
      civilianShelter: 0.14,
      combatDefence: 0.08,
      buildSpeed: 0.06,
      unlockPolicies: ['PolicyMassEvacuation'],
    },
    blurb: '从一户通到一街，从一街通到一村，最后村与村相连。挖通不算难，维护难：一场秋雨就能塌掉半条巷。',
    quote: '地上一个村，地下也是一个村。——冀中区党委工作总结',
  },

  // ------------------------------- tier 4 -------------------------------
  TechLandmineChain: {
    id: 'TechLandmineChain',
    name: '绊发与连环雷',
    era: 'Hardship',
    tier: 4,
    cost: { intel: 50, cadre: 4 },
    requires: ['TechLandmineTread'],
    effects: {
      combatAmbush: 0.14,
      combatDefence: 0.1,
      sabotageBonus: 0.08,
    },
    blurb: '绊线、拉火、子母雷，一响连着一响。设伏的人必须记住每一颗的位置，撤离前逐颗起出——记错一颗，踩上去的就是自己人。',
    quote: '雷阵要有图，图要有人管。——民兵训练教材',
  },
  TechGrenadeDischarger: {
    id: 'TechGrenadeDischarger',
    name: '掷弹筒仿制',
    era: 'Hardship',
    tier: 4,
    cost: { intel: 54, cadre: 5 },
    requires: ['TechCartridgeReload', 'TechGrenadeWorks'],
    effects: {
      combatAttack: 0.1,
      siegeBonus: 0.12,
      yieldBonus: { ordnance: 0.06 },
    },
    blurb: '膛壁与击发是难点，钢管靠拆铁轨改。射得远不算本事，射得准要打上百发才摸得出表尺。',
    quote: '一门筒子，抵得上半个连的火力。——军区供给部纪要',
  },
  TechTunnelCombat: {
    id: 'TechTunnelCombat',
    name: '战斗地道',
    era: 'Hardship',
    tier: 4,
    cost: { intel: 56, cadre: 5 },
    requires: ['TechTunnelLinked', 'TechLandmineTread'],
    effects: {
      combatAmbush: 0.16,
      combatDefence: 0.14,
      civilianShelter: 0.1,
      tunnelMove: true,
    },
    blurb: '能打的地道有射孔、翻板、夹墙，出口通到坟地和井里。它不是躲人的地方，是打人的地方——但每一处机关都得先在自己村里试过。',
    quote: '洞口三尺内不留脚印。——武工队行动纪要',
  },
  TechCavalryCourier: {
    id: 'TechCavalryCourier',
    name: '骑兵与交通队',
    era: 'Growth',
    tier: 4,
    cost: { intel: 46, cadre: 4 },
    requires: ['TechCourierNetwork', 'TechWirelessSet'],
    effects: {
      unlockUnits: ['CavalryCourier'],
      unlockWorks: ['Ferry'],
      moveBonus: 1,
      intelRange: 1,
    },
    blurb: '山地养马费粮，一匹马的口粮抵三个人。可一封急电、一名重伤员、一箱药品，早到一天就是另一个结果。',
    quote: '马是走的，人是等的。——交通队工作总结',
  },

  // ------------------------------- tier 5 -------------------------------
  TechMortar: {
    id: 'TechMortar',
    name: '迫击炮',
    era: 'Recovery',
    tier: 5,
    cost: { intel: 68, cadre: 5 },
    requires: ['TechGrenadeDischarger', 'TechCartridgeReload'],
    effects: {
      combatAttack: 0.12,
      siegeBonus: 0.18,
      captureRate: 0.06,
    },
    blurb: '有了炮，攻坚才有把握。可炮弹全靠缴获，打出去一发就少一发，往往攒到最后一刻才肯开火。',
    quote: '炮弹算着用，比粮还紧。——军区供给部纪要',
  },
  TechSiegeWorks: {
    id: 'TechSiegeWorks',
    name: '攻坚与云梯',
    era: 'Counter',
    tier: 5,
    cost: { intel: 78, cadre: 6 },
    requires: ['TechDemolition', 'TechTunnelCombat'],
    effects: {
      siegeBonus: 0.25,
      combatAttack: 0.08,
      captureRate: 0.1,
      unlockPolicies: ['PolicyStormCounty'],
    },
    blurb: '土工迫近、掘壕作业、云梯与破墙同时上。拿炮楼不靠人多，靠算准壕沟能挖到墙根几步、炸药够不够掀开那一角。',
    quote: '壕挖到墙脚，仗就打完一半。——攻坚战术讲义',
  },
});

// ---------------------------------------------------------------------------
// 2. 群众 / 政权树（18 项）
// ---------------------------------------------------------------------------
//
// 这棵树才是本作的主轴：它决定根据地能否存续、群众基础涨得多快、干部够不够用、
// 以及扫荡来临时有多少人能被掩护下来。它的成本以 cadre 为主 —— 干部永远是最贵的资源。

export const doctrineDefinitions = Object.freeze({
  // ------------------------------- tier 0 -------------------------------
  DoctrineMassMobilization: {
    id: 'DoctrineMassMobilization',
    name: '发动群众',
    era: 'Opening',
    tier: 0,
    cost: { intel: 6, cadre: 2 },
    requires: [],
    effects: {
      massGrowth: 0.12,
      policySlots: 1,
      baseSlots: 1,
      yieldBonus: { labor: 0.08 },
    },
    blurb: '先住下来：挑水扫院、问疾苦、记账目，头一个月往往一枪不放。不认门的队伍在敌后活不过一个冬天。',
    quote: '队伍住得下去，仗才打得起来。——地委工作总结',
  },

  // ------------------------------- tier 1 -------------------------------
  DoctrinePeasantAssociation: {
    id: 'DoctrinePeasantAssociation',
    name: '农会',
    era: 'Opening',
    tier: 1,
    cost: { intel: 10, cadre: 3 },
    requires: ['DoctrineMassMobilization'],
    effects: {
      unlockDistricts: ['PeasantAssociation'],
      massGrowth: 0.1,
      yieldBonus: { grain: 0.08, labor: 0.06 },
    },
    blurb: '把佃户、雇工、贫农按村编起来，选出自己的代表。第一次开会常常冷场——没人愿意当着东家的面先开口。',
    quote: '会开成了，村就换了主人。——区干部工作日记',
  },
  DoctrineWomensSalvation: {
    id: 'DoctrineWomensSalvation',
    name: '妇救会',
    era: 'Opening',
    tier: 1,
    cost: { intel: 10, cadre: 3 },
    requires: ['DoctrineMassMobilization'],
    effects: {
      yieldBonus: { labor: 0.1 },
      healRate: 0.08,
      populationGrowth: 0.04,
      massGrowth: 0.06,
    },
    blurb: '从做军鞋、识字、反对打骂媳妇开始。妇女能出门开会，这个村的工作才算真做开了——在多数村子里，这一步比收枪更难。',
    quote: '军鞋一双双，都是夜里纳的。——边区群众报',
  },
  DoctrineYouthVanguard: {
    id: 'DoctrineYouthVanguard',
    name: '青抗先',
    era: 'Opening',
    tier: 1,
    cost: { intel: 12, cadre: 2 },
    requires: ['DoctrineMassMobilization'],
    effects: {
      flatYield: { intel: 1 },
      intelRange: 1,
      exposureDecay: 0.06,
      cadreGrowth: 0.06,
    },
    blurb: '十六到二十三岁的青年，站岗、送信、查路条。他们跑得快、认得人，也最容易被当成靶子——名单从不写在纸上。',
    quote: '路条不对，先扣人不动手。——村自卫队守则',
  },

  // ------------------------------- tier 2 -------------------------------
  DoctrineMilitiaSelfDefence: {
    id: 'DoctrineMilitiaSelfDefence',
    name: '民兵与自卫队',
    era: 'Opening',
    tier: 2,
    cost: { intel: 16, cadre: 3 },
    requires: ['DoctrineYouthVanguard'],
    effects: {
      unlockUnits: ['MilitiaSelfDefence'],
      unlockDistricts: ['MilitiaGround'],
      combatDefence: 0.08,
      sweepWarning: 1,
      unlockPolicies: ['PolicyVillageWatch'],
    },
    blurb: '不脱产：农忙种地、农闲操练，武器多是红缨枪和土造手榴弹。真正的本钱是他们熟悉每一道沟坎、每一眼井。',
    quote: '打不过就带人走，这也是任务。——民兵训练教材',
  },
  DoctrineRentReduction: {
    id: 'DoctrineRentReduction',
    name: '减租减息',
    era: 'Growth',
    tier: 2,
    cost: { intel: 18, cadre: 4 },
    requires: ['DoctrinePeasantAssociation'],
    effects: {
      massGrowth: 0.16,
      yieldBonus: { grain: 0.1 },
      unrestDecay: 0.08,
      unlockPolicies: ['PolicyRentReductionDrive'],
    },
    blurb: '二五减租、分半减息：既要让佃户敢开口要，又要让开明地主留在统一战线里。算清一笔旧账，常常要开三次会。',
    quote: '减了租，人心就落了地。——边区群众报',
  },
  DoctrineFairBurden: {
    id: 'DoctrineFairBurden',
    name: '合理负担',
    era: 'Growth',
    tier: 2,
    cost: { intel: 18, cadre: 3 },
    requires: ['DoctrinePeasantAssociation'],
    effects: {
      unlockDistricts: ['SupplyDepot'],
      yieldBonus: { grain: 0.12 },
      unrestDecay: 0.06,
      upkeepDiscount: 0.05,
    },
    blurb: '按亩、按人、按收成分等出粮出款，穷户少出、富户多出。难在丈量与评议——一亩地该评几等，能吵上一整天。',
    quote: '账要摆在桌上，谁都看得见。——县政府征收办法',
  },

  // ------------------------------- tier 3 -------------------------------
  DoctrineWinterSchool: {
    id: 'DoctrineWinterSchool',
    name: '识字班与冬学',
    era: 'Growth',
    tier: 3,
    cost: { intel: 24, cadre: 4 },
    requires: ['DoctrineWomensSalvation', 'DoctrineYouthVanguard'],
    effects: {
      unlockDistricts: ['NightSchool'],
      cadreGrowth: 0.14,
      flatYield: { intel: 1 },
      massGrowth: 0.06,
      unlockPolicies: ['PolicyLiteracyDrive'],
    },
    blurb: '农闲开学，头两个字学自己的名字，第三个字学「租」。教员是本村稍识字的人，课本是自己刻的油印本。',
    quote: '认得字，才知道条子上写的是什么。——冬学课本前言',
  },
  DoctrineThreeThirds: {
    id: 'DoctrineThreeThirds',
    name: '三三制',
    era: 'Growth',
    tier: 3,
    cost: { intel: 28, cadre: 5 },
    requires: ['DoctrineRentReduction', 'DoctrineFairBurden'],
    effects: {
      policySlots: 1,
      baseSlots: 1,
      massGrowth: 0.1,
      unrestDecay: 0.12,
      unlockPolicies: ['PolicyUnitedFront'],
    },
    blurb: '共产党员、非党进步分子、中间分子各占三分之一。让出位子容易，让出权难；让权之后还要把事办成，更难。',
    quote: '票是一人一张，账是一起算的。——边区参议会记录',
  },
  DoctrineEnemyWork: {
    id: 'DoctrineEnemyWork',
    name: '敌工与瓦解伪军',
    era: 'Growth',
    tier: 3,
    cost: { intel: 26, cadre: 4 },
    requires: ['DoctrineWomensSalvation'],
    effects: {
      captureRate: 0.14,
      flatYield: { intel: 2 },
      garrisonReveal: true,
      unlockPolicies: ['PolicyEnemyWorkOffice'],
    },
    blurb: '从伪军的家属、同乡、旧部下入手，先通信、后见面、再谈条件。争取一个班长，胜过打垮一个班。',
    quote: '给他留条回家的路，他就不会把路堵死。——敌工干部回忆',
  },
  DoctrineSupportTheArmy: {
    id: 'DoctrineSupportTheArmy',
    name: '拥军优抗',
    era: 'Growth',
    tier: 3,
    cost: { intel: 22, cadre: 4 },
    requires: ['DoctrinePeasantAssociation', 'DoctrineWomensSalvation'],
    effects: {
      populationGrowth: 0.06,
      massGrowth: 0.08,
      healRate: 0.08,
      unrestDecay: 0.06,
      unlockPolicies: ['PolicyPublicGranary'],
    },
    blurb: '抗属的地由村里代耕，烈属的口粮由公家出。这不是抚恤，是让还在队伍里的人知道家里有人管——征兵最后靠的就是这一条。',
    quote: '代耕的地，收成要比自家的好。——村代耕队约定',
  },

  // ------------------------------- tier 4 -------------------------------
  DoctrineTwoFacedRegime: {
    id: 'DoctrineTwoFacedRegime',
    name: '两面政权',
    era: 'Hardship',
    tier: 4,
    cost: { intel: 34, cadre: 5 },
    requires: ['DoctrineEnemyWork'],
    effects: {
      seizureResist: 0.18,
      flatYield: { intel: 2 },
      exposureDecay: 0.1,
      garrisonReveal: true,
    },
    blurb: '村长对敌应付，对我负责：表面照旧送粮派夫，暗里按我们的数目办。这是全村最危险的位子，往往由最老实的人担着。',
    quote: '白皮红心，两头都要交待。——区委工作笔记',
  },
  DoctrineCrackTroops: {
    id: 'DoctrineCrackTroops',
    name: '精兵简政',
    era: 'Hardship',
    tier: 4,
    cost: { intel: 32, cadre: 4 },
    requires: ['DoctrineThreeThirds'],
    effects: {
      upkeepDiscount: 0.18,
      policySlots: 1,
      cadreGrowth: 0.1,
      unlockPolicies: ['PolicyLeanAdministration'],
    },
    blurb: '机关缩小、干部下沉、主力化整为零。裁下来的人不是不要了，是回到村里去做骨干——负担减一分，根据地就多撑一季。',
    quote: '养得起的队伍，才是留得住的队伍。——边区行署精简办法',
  },
  DoctrineArmedWorkTeam: {
    id: 'DoctrineArmedWorkTeam',
    name: '武工队',
    era: 'Hardship',
    tier: 4,
    cost: { intel: 40, cadre: 6 },
    requires: ['DoctrineEnemyWork', 'DoctrineMilitiaSelfDefence'],
    effects: {
      unlockUnits: ['ArmedWorkTeam'],
      combatAmbush: 0.12,
      exposureDecay: 0.08,
      intelRange: 1,
    },
    blurb: '十几个人，短枪，进敌占区活动：政治、军事、情报三样都要会。一出去半个月不与后方联系，全靠自己找住处、找关系、找退路。',
    quote: '到敌人后方去，不占地方，占人心。——武工队行动纪要',
  },

  // ------------------------------- tier 5 -------------------------------
  DoctrineGreatProduction: {
    id: 'DoctrineGreatProduction',
    name: '大生产运动',
    era: 'Recovery',
    tier: 5,
    cost: { intel: 44, cadre: 6 },
    requires: ['DoctrineRentReduction', 'DoctrineFairBurden'],
    effects: {
      unlockWorks: ['Terrace'],
      yieldBonus: { grain: 0.2, labor: 0.15 },
      baseSlots: 1,
      policySlots: 1,
      unlockPolicies: ['PolicyProductionDrive'],
    },
    blurb: '机关、部队、学校一律开荒纺线。自己动手不是号召，是因为公粮再也不能往上加了——再加，村里就没有人了。',
    quote: '一面打仗，一面种地，两样都不能误。——边区行署生产计划',
  },
  DoctrineArmyCivilUnity: {
    id: 'DoctrineArmyCivilUnity',
    name: '拥政爱民',
    era: 'Recovery',
    tier: 5,
    cost: { intel: 42, cadre: 5 },
    requires: ['DoctrineCrackTroops', 'DoctrineSupportTheArmy'],
    effects: {
      massGrowth: 0.14,
      unrestDecay: 0.14,
      civilianShelter: 0.08,
      populationGrowth: 0.05,
    },
    blurb: '部队查纪律、赔损失、帮春耕；政府慰问部队、安置伤员。每年正月做一次，做成了习惯才顶用——做成排场就白做。',
    quote: '借的东西要还，损坏的要赔。——部队驻村守则',
  },

  // ------------------------------- tier 6 -------------------------------
  DoctrineMutualAid: {
    id: 'DoctrineMutualAid',
    name: '变工队与互助组',
    era: 'Recovery',
    tier: 6,
    cost: { intel: 40, cadre: 5 },
    requires: ['DoctrineGreatProduction'],
    effects: {
      yieldBonus: { grain: 0.12, labor: 0.12 },
      buildSpeed: 0.12,
      populationGrowth: 0.05,
    },
    blurb: '劳力、牲口、农具按工换工，几户合成一犋。壮丁多在队伍上，地全靠换工才种得过来——记工的账本比犁还重要。',
    quote: '人工换牛工，牛工换犁工。——互助组记工办法',
  },
  DoctrineMassDrill: {
    id: 'DoctrineMassDrill',
    name: '大练兵与整训',
    era: 'Counter',
    tier: 6,
    cost: { intel: 58, cadre: 7 },
    requires: ['DoctrineCrackTroops', 'DoctrineMilitiaSelfDefence'],
    effects: {
      combatAttack: 0.12,
      siegeBonus: 0.1,
      policySlots: 1,
      cadreGrowth: 0.12,
    },
    blurb: '投弹、刺杀、射击、爆破，官教兵、兵教官、兵也教官。练的是一件具体的事：反攻的时候，能不能一次把县城拿下来。',
    quote: '会打不会攻，城下要死人。——大练兵总结',
  },
});

// ---------------------------------------------------------------------------
// 3. 政策卡（20 张）
// ---------------------------------------------------------------------------
//
// 政策卡随时可以换，但换下一张要付 `swapCost`（干部去传达、去重新布置工作）。
// 槽位来自 `policySlots` 效果：发动群众 / 三三制 / 精兵简政 / 大生产 / 大练兵各 +1。

export const policyDefinitions = Object.freeze({
  // ------------------------------- 军事 -------------------------------
  PolicyNightAction: {
    id: 'PolicyNightAction',
    name: '夜间行动',
    category: 'Military',
    era: 'Opening',
    requires: [],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      combatAmbush: 0.1,
      exposureDecay: 0.05,
      combatDefence: 0.04,
    },
    blurb: '白天睡觉，天黑上路，拂晓前进村。行军慢一倍，队形散得开，但夜里敌人的汽车和飞机都用不上。',
  },
  PolicySwiftDispersal: {
    id: 'PolicySwiftDispersal',
    name: '打了就走',
    category: 'Military',
    era: 'Opening',
    requires: ['TechScoutCraft'],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      exposureDecay: 0.14,
      moveBonus: 1,
      combatAttack: -0.04,
    },
    blurb: '不恋战、不清扫战场、不在原村过夜。少缴一点，换的是敌人的报复扑空——舍不得战场的队伍活不长。',
  },
  PolicyRailRaid: {
    id: 'PolicyRailRaid',
    name: '破袭战',
    category: 'Military',
    era: 'Growth',
    requires: ['TechRailBreaking'],
    slotCost: 2,
    swapCost: { cadre: 2 },
    effects: {
      sabotageBonus: 0.26,
      combatAttack: 0.05,
      exposureDecay: -0.1,
    },
    blurb: '成夜地破路、拆线、翻电杆，把铁路变成一条要天天喂的伤口。代价是敌人立刻知道这一带有队伍，扫荡随后就到。',
  },
  PolicyMineWarfare: {
    id: 'PolicyMineWarfare',
    name: '地雷战',
    category: 'Military',
    era: 'Hardship',
    requires: ['TechLandmineTread'],
    slotCost: 2,
    swapCost: { cadre: 2 },
    effects: {
      combatDefence: 0.14,
      combatAmbush: 0.08,
      sweepWarning: 1,
    },
    blurb: '路口、井台、门槛下都可能有雷，敌人一天走不了十里。麻烦是自己人也得记路——每颗雷都要报数、都要有人负责起出。',
  },
  PolicyStormCounty: {
    id: 'PolicyStormCounty',
    name: '攻势作战',
    category: 'Military',
    era: 'Counter',
    requires: ['TechSiegeWorks'],
    slotCost: 2,
    swapCost: { cadre: 3 },
    effects: {
      siegeBonus: 0.25,
      combatAttack: 0.12,
      exposureDecay: -0.06,
      upkeepDiscount: -0.05,
    },
    blurb: '不再等敌人出来，改为逐个拔据点、逼县城。这要求弹药、担架、粮站都跟得上——攻坚一停，前面的伤员就没人接。',
  },

  // ------------------------------- 经济 -------------------------------
  PolicyScorchedDenial: {
    id: 'PolicyScorchedDenial',
    name: '坚壁清野',
    category: 'Economy',
    era: 'Growth',
    requires: [],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      seizureResist: 0.26,
      civilianShelter: 0.05,
      yieldBonus: { grain: -0.05 },
    },
    blurb: '粮埋进夹壁与地窖，碾磨拆走，水井加盖。存粮的损耗大，取用也麻烦，但敌人进村时抢不到东西，就少一个再来的理由。',
  },
  PolicyRationing: {
    id: 'PolicyRationing',
    name: '计口授粮',
    category: 'Economy',
    era: 'Hardship',
    requires: [],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      upkeepDiscount: 0.14,
      populationGrowth: -0.03,
      unrestDecay: -0.03,
    },
    blurb: '按人头定量，机关先减、部队后减。账目公开到每一升，可再公开的账也挡不住春荒——这是一条只能少饿死人的办法。',
  },
  PolicySaltAndCloth: {
    id: 'PolicySaltAndCloth',
    name: '土产换盐布',
    category: 'Economy',
    era: 'Growth',
    requires: ['TechQuilting'],
    slotCost: 1,
    swapCost: { cadre: 2 },
    effects: {
      yieldBonus: { medicine: 0.12, ordnance: 0.05 },
      flatYield: { medicine: 1 },
      exposureDecay: -0.04,
    },
    blurb: '核桃、药材、皮张出去，盐、布、纱布、酒精回来。走的是敌占区的集市和封锁线上的熟人，一趟货押着好几条人命。',
  },
  PolicyProductionDrive: {
    id: 'PolicyProductionDrive',
    name: '生产自给',
    category: 'Economy',
    era: 'Recovery',
    requires: ['DoctrineGreatProduction'],
    slotCost: 2,
    swapCost: { cadre: 2 },
    effects: {
      yieldBonus: { grain: 0.18, labor: 0.14 },
      upkeepDiscount: 0.08,
      combatAttack: -0.04,
    },
    blurb: '一个连开三十亩荒，纺车摆到操场上。粮和布是自己的了，可训练时间被挤掉一半——打起来立刻看得出来。',
  },
  PolicyPublicGranary: {
    id: 'PolicyPublicGranary',
    name: '义仓与代耕',
    category: 'Economy',
    era: 'Recovery',
    requires: ['DoctrineSupportTheArmy'],
    slotCost: 1,
    swapCost: { cadre: 2 },
    effects: {
      flatYield: { grain: 3 },
      civilianShelter: 0.08,
      unrestDecay: 0.06,
      populationGrowth: 0.04,
    },
    blurb: '丰年每户存几升入义仓，荒年按册开仓；抗属的地由变工队代耕。制度不难定，难在丰年也肯往里存。',
  },

  // ------------------------------- 群众 -------------------------------
  PolicyRentReductionDrive: {
    id: 'PolicyRentReductionDrive',
    name: '查减复查',
    category: 'Mass',
    era: 'Growth',
    requires: ['DoctrineRentReduction'],
    slotCost: 1,
    swapCost: { cadre: 2 },
    effects: {
      massGrowth: 0.14,
      unrestDecay: 0.06,
      yieldBonus: { grain: 0.06 },
    },
    blurb: '减租减息定了不等于办了：明减暗不减、退了又收回的事到处都有。挨村复查一遍，账要当众念给不识字的人听。',
  },
  PolicyLiteracyDrive: {
    id: 'PolicyLiteracyDrive',
    name: '冬学识字',
    category: 'Mass',
    era: 'Growth',
    requires: ['DoctrineWinterSchool'],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      cadreGrowth: 0.14,
      flatYield: { intel: 1 },
      massGrowth: 0.06,
    },
    blurb: '农闲两个月，识三百字、会写路条与收据。教员多半白天还要下地，油灯的煤油要从区上领——识字的人多一个，能办事的人就多一个。',
  },
  PolicyRefugeeRelief: {
    id: 'PolicyRefugeeRelief',
    name: '以工代赈',
    category: 'Mass',
    era: 'Hardship',
    requires: [],
    slotCost: 1,
    swapCost: { cadre: 2 },
    effects: {
      civilianShelter: 0.14,
      yieldBonus: { labor: 0.1 },
      populationGrowth: 0.05,
      unrestDecay: 0.06,
    },
    blurb: '被烧了村的人不发赈粮，发工：修渠、垫路、打井，做一天记一天。不白给的救济，人才肯留下来重新盖房。',
  },
  PolicyVillageWatch: {
    id: 'PolicyVillageWatch',
    name: '村村联防',
    category: 'Mass',
    era: 'Growth',
    requires: ['DoctrineMilitiaSelfDefence'],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      sweepWarning: 1,
      intelRange: 1,
      combatDefence: 0.06,
      exposureDecay: 0.04,
    },
    blurb: '各村的消息树、锣声、暗号连成一线，敌人一出据点就有人往下传。全线守夜要占掉大量壮劳力，秋收时最难维持。',
  },
  PolicyMassEvacuation: {
    id: 'PolicyMassEvacuation',
    name: '空舍清野',
    category: 'Mass',
    era: 'Hardship',
    requires: ['TechTunnelLinked'],
    slotCost: 2,
    swapCost: { cadre: 2 },
    effects: {
      civilianShelter: 0.22,
      seizureResist: 0.14,
      yieldBonus: { grain: -0.06, labor: -0.05 },
    },
    blurb: '警报一响，人下洞、牲口上山、锅碗埋进院墙。练熟一次转移要全村演三遍，误了农时也得演——扫荡不等秋收。',
  },

  // ------------------------------- 组织 -------------------------------
  PolicyCadreSchool: {
    id: 'PolicyCadreSchool',
    name: '干部轮训',
    category: 'Organization',
    era: 'Opening',
    requires: [],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      cadreGrowth: 0.16,
      yieldBonus: { intel: 0.06 },
      combatAttack: -0.03,
    },
    blurb: '抽人上区里学一个月：怎么开会、怎么记账、怎么发动一个陌生村子。抽走的都是骨干，训练期间下面的工作要有人顶。',
  },
  PolicyDiscipline: {
    id: 'PolicyDiscipline',
    name: '三大纪律八项注意',
    category: 'Organization',
    era: 'Opening',
    requires: [],
    slotCost: 1,
    swapCost: { cadre: 1 },
    effects: {
      massGrowth: 0.1,
      unrestDecay: 0.08,
      exposureDecay: 0.04,
    },
    blurb: '借东西要还、损坏要赔、说话和气、不打人骂人。条文人人会背，难的是行军三百里之后仍旧照办——群众看的正是这一次。',
  },
  PolicyUnitedFront: {
    id: 'PolicyUnitedFront',
    name: '三三制施政',
    category: 'Organization',
    era: 'Growth',
    requires: ['DoctrineThreeThirds'],
    slotCost: 1,
    swapCost: { cadre: 2 },
    effects: {
      massGrowth: 0.1,
      unrestDecay: 0.12,
      populationGrowth: 0.04,
      yieldBonus: { grain: 0.05 },
    },
    blurb: '参议会里让出三分之二的位子，开明士绅、教书先生、无党派的人都进来议事。让位子是姿态，按议决办事才是本事。',
  },
  PolicyLeanAdministration: {
    id: 'PolicyLeanAdministration',
    name: '精简下沉',
    category: 'Organization',
    era: 'Hardship',
    requires: ['DoctrineCrackTroops'],
    slotCost: 2,
    swapCost: { cadre: 2 },
    effects: {
      upkeepDiscount: 0.2,
      cadreGrowth: 0.1,
      combatAttack: -0.06,
      exposureDecay: 0.06,
    },
    blurb: '科室并掉一半，机关人员下到区村。队伍变小、动作变轻，可一旦要打硬仗，能集中的兵力也跟着少了。',
  },
  PolicyEnemyWorkOffice: {
    id: 'PolicyEnemyWorkOffice',
    name: '敌工瓦解',
    category: 'Organization',
    era: 'Hardship',
    requires: ['DoctrineEnemyWork'],
    slotCost: 1,
    swapCost: { cadre: 2 },
    effects: {
      captureRate: 0.14,
      flatYield: { intel: 2 },
      garrisonReveal: true,
      combatAttack: 0.04,
    },
    blurb: '给伪军写信、送年货、放回俘虏，把据点里谁当班、谁想家摸清楚。争取过来的人回不了头，一旦暴露，全家都在敌人手里。',
  },
});

// ---------------------------------------------------------------------------
// 4. 合并索引与 UI 分层布局
// ---------------------------------------------------------------------------

/** 两棵树合并后的定义表；`state.research.done` 里的 id 一律能在这里查到。 */
export const researchDefinitions = Object.freeze({ ...techDefinitions, ...doctrineDefinitions });

function BuildTreeLayout(definitions) {
  const byTier = new Map();
  for (const definition of Object.values(definitions)) {
    const tier = definition.tier ?? 0;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(definition.id);
  }
  const sortedTiers = [...byTier.keys()].sort((a, b) => a - b);
  const tiers = sortedTiers.map((tier) => Object.freeze(byTier.get(tier)));
  const links = [];
  for (const definition of Object.values(definitions)) {
    for (const requiredId of definition.requires) {
      links.push(Object.freeze({ from: requiredId, to: definition.id }));
    }
  }
  return Object.freeze({
    tiers: Object.freeze(tiers),
    tierIndices: Object.freeze(sortedTiers),
    links: Object.freeze(links),
    maxTier: sortedTiers.length ? sortedTiers[sortedTiers.length - 1] : 0,
    maxWidth: tiers.reduce((widest, row) => Math.max(widest, row.length), 0),
  });
}

/** 军事/技术树的 UI 分层布局：`{ tiers: [[id...]], links: [{from,to}], ... }`。 */
export const techTreeLayout = BuildTreeLayout(techDefinitions);

/** 群众/政权树的 UI 分层布局，结构同上。 */
export const doctrineTreeLayout = BuildTreeLayout(doctrineDefinitions);

/** 政策卡按分类分组，供政策面板直接渲染。 */
export const policyLayout = Object.freeze({
  categories: Object.freeze(Object.keys(policyCategories)),
  byCategory: Object.freeze(
    Object.fromEntries(
      Object.keys(policyCategories).map((category) => [
        category,
        Object.freeze(
          Object.values(policyDefinitions)
            .filter((policy) => policy.category === category)
            .map((policy) => policy.id),
        ),
      ]),
    ),
  ),
});

/** 政策槽位下限：没有任何 doctrine 时也至少能挂一张卡。 */
export const basePolicySlots = 1;

/** 根据地数量下限。 */
export const baseBaseSlots = 1;

// ---------------------------------------------------------------------------
// 5. 纯工具函数
// ---------------------------------------------------------------------------

/** 建一个所有 key 都填了默认值的空效果对象，规则模块可以无脑读取。 */
export function CreateEmptyEffects() {
  const effects = {};
  for (const [key, schema] of Object.entries(effectKeySchema)) {
    if (schema.kind === 'resourceMap') {
      effects[key] = Object.fromEntries(resourceKeys.map((resource) => [resource, 0]));
    } else if (schema.kind === 'list') {
      effects[key] = [];
    } else if (schema.kind === 'flag') {
      effects[key] = false;
    } else {
      effects[key] = 0;
    }
  }
  return effects;
}

/** 查任意一棵树上的节点定义（tech / doctrine 通用）。 */
export function GetDefinition(id) {
  return researchDefinitions[id] ?? policyDefinitions[id] ?? null;
}

function ResolveEffects(entry, definitionsMap) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const definition = (definitionsMap && definitionsMap[entry]) || GetDefinition(entry);
    return definition ? definition.effects : null;
  }
  if (typeof entry === 'object') {
    if (entry.effects && typeof entry.effects === 'object') return entry.effects;
    return entry;
  }
  return null;
}

function MergeEffectsInto(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const schema = effectKeySchema[key];
    if (!schema) continue; // 未声明的 key 一律忽略，避免污染规则层。
    if (schema.kind === 'resourceMap') {
      if (!value || typeof value !== 'object') continue;
      for (const [resource, amount] of Object.entries(value)) {
        if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
        target[key][resource] = (target[key][resource] ?? 0) + amount;
      }
    } else if (schema.kind === 'list') {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (!target[key].includes(item)) target[key].push(item);
      }
    } else if (schema.kind === 'flag') {
      target[key] = target[key] || Boolean(value);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      target[key] += value;
    }
  }
}

/**
 * 把一串效果来源合并成一个效果对象。
 * @param {Array<string|object>} list  节点 id、含 effects 的定义对象，或裸 effects 对象，可混用。
 * @param {object} [definitionsMap]    id → 定义 的查表，默认用 tech + doctrine 合并表（政策卡自动兜底）。
 * @returns {object} 所有 key 都有默认值的效果对象：数值相加、布尔取或、数组取并集。
 */
export function AggregateEffects(list, definitionsMap = researchDefinitions) {
  const total = CreateEmptyEffects();
  if (!list) return total;
  const entries = Array.isArray(list) ? list : [list];
  for (const entry of entries) {
    const effects = ResolveEffects(entry, definitionsMap);
    if (effects) MergeEffectsInto(total, effects);
  }
  return total;
}

/**
 * 判断某个节点当前是否「可以开始研究」：存在、尚未完成、且全部前置已完成。
 * 政策卡也可用本函数判断是否已解锁（政策没有「完成」概念，只看 requires）。
 */
export function IsAvailable(id, doneIds) {
  const definition = GetDefinition(id);
  if (!definition) return false;
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  const isPolicy = Boolean(policyDefinitions[id]);
  if (!isPolicy && done.has(id)) return false;
  const requires = definition.requires || [];
  for (const requiredId of requires) {
    if (!done.has(requiredId)) return false;
  }
  return true;
}

/**
 * 汇总一组已完成研究带来的全部解锁与效果。
 * @param {string[]} doneIds
 * @returns {{units:string[], districts:string[], works:string[], policies:string[],
 *            effects:object, available:string[], availableTech:string[], availableDoctrine:string[],
 *            policySlots:number, baseSlots:number}}
 */
export function GetUnlockedBy(doneIds) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  const knownIds = [...done].filter((id) => Boolean(researchDefinitions[id]));
  const effects = AggregateEffects(knownIds, researchDefinitions);

  // 政策卡自身也可能因 requires 满足而解锁（政策不进 done，只看前置）。
  const policies = [...effects.unlockPolicies];
  for (const policy of Object.values(policyDefinitions)) {
    if (policies.includes(policy.id)) continue;
    if ((policy.requires || []).every((requiredId) => done.has(requiredId))) policies.push(policy.id);
  }

  const availableTech = Object.keys(techDefinitions).filter((id) => IsAvailable(id, done));
  const availableDoctrine = Object.keys(doctrineDefinitions).filter((id) => IsAvailable(id, done));

  return {
    units: [...effects.unlockUnits],
    districts: [...effects.unlockDistricts],
    works: [...effects.unlockWorks],
    policies,
    effects,
    available: [...availableTech, ...availableDoctrine],
    availableTech,
    availableDoctrine,
    policySlots: basePolicySlots + effects.policySlots,
    baseSlots: baseBaseSlots + effects.baseSlots,
  };
}

/**
 * 列出当前可研项，可按树与时期过滤，并按「时期 → 层级 → 情报成本」排序，供 UI 与 AI 直接取用。
 * @param {string[]} doneIds
 * @param {{tree?:'Tech'|'Doctrine'|'All', eraKey?:string, includeFuture?:boolean}} [options]
 */
export function GetResearchOptions(doneIds, options = {}) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  const tree = options.tree || 'All';
  const includeFuture = options.includeFuture !== false;
  const eraLimit = options.eraKey ? eraOrder.indexOf(options.eraKey) : -1;
  const pools = [];
  if (tree === 'All' || tree === 'Tech') pools.push(techDefinitions);
  if (tree === 'All' || tree === 'Doctrine') pools.push(doctrineDefinitions);

  const results = [];
  for (const pool of pools) {
    for (const definition of Object.values(pool)) {
      if (!IsAvailable(definition.id, done)) continue;
      if (eraLimit >= 0 && !includeFuture && eraOrder.indexOf(definition.era) > eraLimit) continue;
      results.push(definition);
    }
  }
  results.sort((a, b) => {
    const eraDelta = eraOrder.indexOf(a.era) - eraOrder.indexOf(b.era);
    if (eraDelta !== 0) return eraDelta;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (a.cost.intel || 0) - (b.cost.intel || 0);
  });
  return results;
}

/** 政策换卡代价：卡面 swapCost 之上，每张已装备的卡再加一点协调成本。 */
export function GetPolicySwapCost(policyId, equippedCount = 0) {
  const policy = policyDefinitions[policyId];
  if (!policy) return { cadre: 0 };
  const base = policy.swapCost?.cadre ?? 1;
  return { cadre: base + Math.floor(Math.max(0, equippedCount) / 2) };
}

/** 装备一组政策卡时占用的槽位总数。 */
export function GetPolicySlotUsage(equippedIds) {
  let used = 0;
  for (const id of equippedIds || []) {
    used += policyDefinitions[id]?.slotCost ?? 0;
  }
  return used;
}

/** 已完成研究 + 已装备政策 → 当前生效的总效果，规则模块每回合调用一次即可。 */
export function GetActiveEffects(doneIds, equippedPolicyIds) {
  const done = (doneIds || []).filter((id) => Boolean(researchDefinitions[id]));
  const equipped = (equippedPolicyIds || []).filter((id) => Boolean(policyDefinitions[id]));
  return AggregateEffects([...done, ...equipped], { ...researchDefinitions, ...policyDefinitions });
}
