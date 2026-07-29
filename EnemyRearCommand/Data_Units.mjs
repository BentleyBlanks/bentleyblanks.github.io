// 《烽线 · 敌后指挥》 —— 部队、根据地区域与能力词条数据模块。
//
// 本模块导出四份静态数据与若干纯查询函数：
//   1. unitDefinitions      我方 10 种 + 敌方 8 种部队
//   2. districtDefinitions  根据地区域 12 种（修械所/被服厂/卫生所/夜校/粮站/交通站/兵站/
//                           地道口/电台室/靶场/农会/民兵训练场）
//   3. baseTierDefinitions  根据地三级：村 — 区 — 县
//   4. abilityDefinitions   能力词条的中文名与说明
//
// 数值口径（与 Script_Combat / Script_Rules 的约定）：
//   attack / defence  战力点，`ComputeStrength` 的基数，我方普遍低于日军，靠地形与伏击补
//   ambush            伏击加成系数（0..1），叠加在地形与群众预警之上
//   concealment       隐蔽度（0..1），决定 `hidden` 能否维持、被发现的难度
//   combat            战役级交战分层：firepower 火力准备 / assault 突击 /
//                     support 协同支援 / screen 掩护退路 / cohesion 抗压制 /
//                     supplyUse 弹粮消耗强度。它们不是第二套攻防值，而是决定
//                     同一支部队在火力、突击、包围和撤退阶段分别能做什么。
//   sight             视野半径（格）
//   cost              一次性投入 { ordnance, labor, cadre }；械是主要瓶颈，干部最贵
//   upkeep            每回合维持 { grain, ordnance }；不脱产的民兵维持为 0
//
// 红线（规格书第 7 节）：任何单位、区域都不会把平民伤亡 / 流离 / 焚村 / 被夺粮食
// 转化为资源或分数。敌方单位的 `Burn`、`Seize` 类能力只写入 `state.ledger` 代价账本。
//
// 纯逻辑模块：不引用 window / document / three / Math.random。

// ---------------------------------------------------------------------------
// 0. 能力词条
// ---------------------------------------------------------------------------

export const abilityDefinitions = Object.freeze({
  Ambush: {
    key: 'Ambush',
    name: '设伏',
    summary: '在林地、山地、隘口对道路或开阔地上的敌人发起伏击，先手一轮且缴获更多。',
    detail: '伏击要求本回合未移动或从隐蔽状态发起；打完必须转移，否则暴露度大涨。',
  },
  Sabotage: {
    key: 'Sabotage',
    name: '破袭',
    summary: '破坏铁路、公路、桥梁、电线，使敌军调动与补给中断若干回合。',
    detail: '破路不需要正面交战，但天亮前撤不干净就会被护路队咬住。',
  },
  Tunnel: {
    key: 'Tunnel',
    name: '地道',
    summary: '可在已连通的地道网内隐蔽移动，扫荡时能带着群众下洞。',
    detail: '需要该格或相邻格已有地道工事；战斗地道还可在洞内组织防御。',
  },
  Heal: {
    key: 'Heal',
    name: '救护',
    summary: '每回合为同格或相邻友军恢复兵员，消耗药。',
    detail: '药永远稀缺，救护队真正的作用是把伤员抬下来、抬得远。',
  },
  Organize: {
    key: 'Organize',
    name: '组织',
    summary: '在所在格开展群众工作，提升群众基础与情报覆盖，可发展新的根据地。',
    detail: '组织工作要花时间，一个陌生村子往往要住上一个季度。',
  },
  Siege: {
    key: 'Siege',
    name: '攻坚',
    summary: '对炮楼、据点、县城发起强攻，需要械与土工作业配合。',
    detail: '没有爆破或掷弹筒支援时，攻坚的伤亡代价极高。',
  },
  Recon: {
    key: 'Recon',
    name: '侦察',
    summary: '扩大视野与情报覆盖，能识破敌军的行动意图。',
    detail: '看清扫荡轴线，往往比多打一仗更有价值。',
  },
  Screen: {
    key: 'Screen',
    name: '掩护',
    summary: '为同格与相邻友军提供撤退掩护，降低被追击时的损失。',
    detail: '掩护的部队自己承担更高风险。',
  },
  Garrison: {
    key: 'Garrison',
    name: '守备',
    summary: '驻守村庄或据点，提高该格防御与治安，抑制不满。',
    detail: '守备部队机动性差，被合围时最难脱身。',
  },
  Pursue: {
    key: 'Pursue',
    name: '追击',
    summary: '击退敌人后可继续追击，或在敌军撤退时咬住不放。',
    detail: '日军与骑兵搜索队最擅长这一项，也正因如此「打了就走」才是纪律。',
  },
  Burn: {
    key: 'Burn',
    name: '焚毁',
    summary: '敌方能力：烧毁村庄与存粮、驱赶居民。造成的一切损失只计入代价账本。',
    detail: '本作不会把焚村、抢粮、屠杀转化为任何一方的资源或分数。',
  },
});

export const abilityKeys = Object.freeze(Object.keys(abilityDefinitions));

/** 部队定位标签，UI 分组用。 */
export const unitRoleDefinitions = Object.freeze({
  Guerrilla: { key: 'Guerrilla', name: '游击', side: 'Player' },
  Militia: { key: 'Militia', name: '民兵', side: 'Player' },
  Local: { key: 'Local', name: '地方武装', side: 'Player' },
  Regular: { key: 'Regular', name: '主力', side: 'Player' },
  Engineer: { key: 'Engineer', name: '工兵', side: 'Any' },
  Recon: { key: 'Recon', name: '侦察', side: 'Any' },
  Support: { key: 'Support', name: '勤务', side: 'Any' },
  Courier: { key: 'Courier', name: '通信', side: 'Any' },
  Special: { key: 'Special', name: '特务工作', side: 'Player' },
  Line: { key: 'Line', name: '正规步兵', side: 'Enemy' },
  Sweep: { key: 'Sweep', name: '讨伐', side: 'Enemy' },
  Garrison: { key: 'Garrison', name: '警备', side: 'Enemy' },
  Security: { key: 'Security', name: '特务机关', side: 'Enemy' },
  Motor: { key: 'Motor', name: '机动车辆', side: 'Enemy' },
  Artillery: { key: 'Artillery', name: '炮兵', side: 'Enemy' },
});

// ---------------------------------------------------------------------------
// 1. 部队定义
// ---------------------------------------------------------------------------
//
// 我方 10 种：游击小组、民兵自卫队、侦察员、区小队、县大队、主力连、
//             爆破组、担架卫生队、骑兵通信、武工队
// 敌方 8 种：日军步兵中队、讨伐队、伪军警备队、宪兵特务、装甲汽车、
//             骑兵搜索队、工兵队、炮兵支队
//
// `requiresTech` 可以指向 techDefinitions 或 doctrineDefinitions 里的任一 id
// （两棵树共用 `state.research.done`）；为 null 表示开局即可编成。

export const unitDefinitions = Object.freeze({
  // ============================== 我方 ==============================
  GuerrillaSquad: {
    key: 'GuerrillaSquad',
    name: '游击小组',
    side: 'Player',
    role: 'Guerrilla',
    era: 'Opening',
    cost: { ordnance: 6, labor: 2, cadre: 1 },
    upkeep: { grain: 1, ordnance: 0 },
    maxHp: 60,
    moves: 4,
    attack: 4,
    defence: 3,
    combat: { firepower: 0.32, assault: 0.54, support: 0.28, screen: 0.62, cohesion: 0.62, supplyUse: 0.35 },
    ambush: 0.35,
    concealment: 0.78,
    sight: 2,
    abilities: ['Ambush', 'Recon'],
    requiresTech: null,
    blurb: '七八个人、三四条枪，白天是种地的，夜里出去打冷枪、割电线。最缺的不是勇气是弹药——一次伏击能打的子弹，往往只够一个照面。',
  },
  MilitiaSelfDefence: {
    key: 'MilitiaSelfDefence',
    name: '民兵自卫队',
    side: 'Player',
    role: 'Militia',
    era: 'Opening',
    cost: { ordnance: 3, labor: 4, cadre: 1 },
    upkeep: { grain: 0, ordnance: 0 },
    maxHp: 72,
    moves: 2,
    attack: 3,
    defence: 6,
    combat: { firepower: 0.22, assault: 0.28, support: 0.35, screen: 0.68, cohesion: 0.56, supplyUse: 0.18 },
    ambush: 0.24,
    concealment: 0.62,
    sight: 1,
    abilities: ['Garrison', 'Tunnel', 'Organize'],
    requiresTech: 'DoctrineMilitiaSelfDefence',
    blurb: '不脱产，不吃公粮，农忙下地、农闲操练。红缨枪和土造手榴弹打不了硬仗，可他们熟悉每一道沟坎，扫荡来时是带群众下洞的人。',
  },
  Scout: {
    key: 'Scout',
    name: '侦察员',
    side: 'Player',
    role: 'Recon',
    era: 'Opening',
    cost: { ordnance: 2, labor: 1, cadre: 1 },
    upkeep: { grain: 1, ordnance: 0 },
    maxHp: 40,
    moves: 5,
    attack: 2,
    defence: 2,
    combat: { firepower: 0.12, assault: 0.12, support: 0.7, screen: 0.82, cohesion: 0.5, supplyUse: 0.12 },
    ambush: 0.2,
    concealment: 0.92,
    sight: 3,
    abilities: ['Recon', 'Screen'],
    requiresTech: 'TechScoutCraft',
    blurb: '换上短衣、挑一副担子进敌占区赶集，记下据点里换岗的人数、铁路上过的车次。带枪反而危险，多数时候身上只有一张路条。',
  },
  DistrictSquad: {
    key: 'DistrictSquad',
    name: '区小队',
    side: 'Player',
    role: 'Local',
    era: 'Opening',
    cost: { ordnance: 10, labor: 3, cadre: 2 },
    upkeep: { grain: 2, ordnance: 1 },
    maxHp: 86,
    moves: 3,
    attack: 6,
    defence: 5,
    combat: { firepower: 0.46, assault: 0.58, support: 0.48, screen: 0.62, cohesion: 0.66, supplyUse: 0.55 },
    ambush: 0.28,
    concealment: 0.6,
    sight: 2,
    abilities: ['Ambush', 'Garrison', 'Organize'],
    requiresTech: null,
    blurb: '一个区的常备力量，二三十人，归区委指挥。既要打小仗、护送干部，又要下村催粮、办案子——多数时间不在打仗，在做工作。',
  },
  CountyCompany: {
    key: 'CountyCompany',
    name: '县大队',
    side: 'Player',
    role: 'Local',
    era: 'Growth',
    cost: { ordnance: 18, labor: 4, cadre: 3 },
    upkeep: { grain: 3, ordnance: 1 },
    maxHp: 105,
    moves: 3,
    attack: 8,
    defence: 7,
    combat: { firepower: 0.6, assault: 0.7, support: 0.56, screen: 0.58, cohesion: 0.72, supplyUse: 0.72 },
    ambush: 0.22,
    concealment: 0.46,
    sight: 2,
    abilities: ['Ambush', 'Organize', 'Pursue'],
    requiresTech: 'TechCartridgeReload',
    blurb: '由几个区小队并起来，是县里唯一能集中使用的武装。装备参差：三八式、汉阳造、土枪各半，全县的复装子弹先紧着它。',
  },
  MainForceCompany: {
    key: 'MainForceCompany',
    name: '主力连',
    side: 'Player',
    role: 'Regular',
    era: 'Growth',
    cost: { ordnance: 30, labor: 5, cadre: 4 },
    upkeep: { grain: 5, ordnance: 2 },
    maxHp: 132,
    moves: 3,
    attack: 12,
    defence: 10,
    combat: { firepower: 0.82, assault: 0.9, support: 0.7, screen: 0.56, cohesion: 0.84, supplyUse: 1 },
    ambush: 0.15,
    concealment: 0.3,
    sight: 2,
    abilities: ['Pursue', 'Siege'],
    requiresTech: 'TechGrenadeWorks',
    blurb: '编制齐、训练过、能打正规仗的连队，也是最贵的一支：一个连的口粮抵得上三个区小队。用得起，未必养得起。',
  },
  DemolitionTeam: {
    key: 'DemolitionTeam',
    name: '爆破组',
    side: 'Player',
    role: 'Engineer',
    era: 'Growth',
    cost: { ordnance: 14, labor: 3, cadre: 2 },
    upkeep: { grain: 2, ordnance: 1 },
    maxHp: 66,
    moves: 3,
    attack: 5,
    defence: 3,
    combat: { firepower: 0.42, assault: 0.74, support: 0.62, screen: 0.42, cohesion: 0.58, supplyUse: 0.78 },
    ambush: 0.3,
    concealment: 0.7,
    sight: 2,
    abilities: ['Sabotage', 'Siege', 'Tunnel'],
    requiresTech: 'TechDemolition',
    blurb: '会算药量、会掏炮眼、会挖交通壕的十来个人。炸药多半是自造的黑火药与拆下来的地雷，受潮一次就要重新烘一整夜。',
  },
  StretcherMedicTeam: {
    key: 'StretcherMedicTeam',
    name: '担架卫生队',
    side: 'Player',
    role: 'Support',
    era: 'Opening',
    cost: { ordnance: 1, labor: 4, cadre: 2 },
    upkeep: { grain: 2, ordnance: 0 },
    maxHp: 56,
    moves: 3,
    attack: 0,
    defence: 2,
    combat: { firepower: 0, assault: 0, support: 0.88, screen: 0.78, cohesion: 0.5, supplyUse: 0.08 },
    ambush: 0.08,
    concealment: 0.66,
    sight: 1,
    abilities: ['Heal', 'Screen'],
    requiresTech: 'TechFieldMedicine',
    blurb: '担架多由民工轮换，一副担架四个人，走山路一夜三十里。药只有几样，真正救人的是把伤员抬出包围圈、送进老乡家的夹壁。',
  },
  CavalryCourier: {
    key: 'CavalryCourier',
    name: '骑兵通信',
    side: 'Player',
    role: 'Courier',
    era: 'Growth',
    cost: { ordnance: 12, labor: 3, cadre: 2 },
    upkeep: { grain: 4, ordnance: 0 },
    maxHp: 70,
    moves: 6,
    attack: 5,
    defence: 4,
    combat: { firepower: 0.28, assault: 0.5, support: 0.76, screen: 0.9, cohesion: 0.62, supplyUse: 0.32 },
    ambush: 0.1,
    concealment: 0.34,
    sight: 3,
    abilities: ['Recon', 'Screen', 'Pursue'],
    requiresTech: 'TechCavalryCourier',
    blurb: '几匹骡马，送急电、带地图、接伤员。一匹马的口粮抵三个人，山里还容易崴腿——可有些消息晚到一天就没有意义了。',
  },
  ArmedWorkTeam: {
    key: 'ArmedWorkTeam',
    name: '武工队',
    side: 'Player',
    role: 'Special',
    era: 'Hardship',
    cost: { ordnance: 16, labor: 2, cadre: 4 },
    upkeep: { grain: 2, ordnance: 1 },
    maxHp: 76,
    moves: 4,
    attack: 7,
    defence: 5,
    combat: { firepower: 0.48, assault: 0.66, support: 0.72, screen: 0.78, cohesion: 0.76, supplyUse: 0.58 },
    ambush: 0.4,
    concealment: 0.86,
    sight: 3,
    abilities: ['Ambush', 'Organize', 'Recon', 'Sabotage'],
    requiresTech: 'DoctrineArmedWorkTeam',
    blurb: '十几个人带短枪，长期在敌占区里活动：白天住老乡的夹壁，夜里开会、贴布告、找伪军谈话。挑的都是骨干，一次派出去就是拿最好的干部去冒险。',
  },

  // ============================== 敌方 ==============================
  JapaneseInfantryCompany: {
    key: 'JapaneseInfantryCompany',
    name: '日军步兵中队',
    side: 'Enemy',
    role: 'Line',
    era: 'Opening',
    cost: { ordnance: 40, labor: 0, cadre: 0 },
    upkeep: { grain: 6, ordnance: 3 },
    maxHp: 150,
    moves: 3,
    attack: 16,
    defence: 14,
    combat: { firepower: 0.94, assault: 0.88, support: 0.72, screen: 0.62, cohesion: 0.9, supplyUse: 1 },
    ambush: 0.05,
    concealment: 0.12,
    sight: 2,
    abilities: ['Pursue', 'Burn', 'Siege'],
    requiresTech: null,
    blurb: '一百多人，掷弹筒与轻机枪齐全，训练与火力都远在我方之上。它的弱点不在战场上：兵力有限，只能守点守线，出不了平原上的公路网太远。',
  },
  PunitiveColumn: {
    key: 'PunitiveColumn',
    name: '讨伐队',
    side: 'Enemy',
    role: 'Sweep',
    era: 'Growth',
    cost: { ordnance: 34, labor: 0, cadre: 0 },
    upkeep: { grain: 5, ordnance: 2 },
    maxHp: 128,
    moves: 4,
    attack: 14,
    defence: 11,
    combat: { firepower: 0.78, assault: 0.82, support: 0.78, screen: 0.82, cohesion: 0.78, supplyUse: 0.88 },
    ambush: 0.08,
    concealment: 0.15,
    sight: 3,
    abilities: ['Pursue', 'Burn', 'Screen', 'Recon'],
    requiresTech: null,
    blurb: '日伪混编、轻装快进的清剿部队，专找机关与后方。它带着向导和翻译，进山不再迷路——这是扫荡真正变可怕的那一年。',
  },
  PuppetGarrison: {
    key: 'PuppetGarrison',
    name: '伪军警备队',
    side: 'Enemy',
    role: 'Garrison',
    era: 'Opening',
    cost: { ordnance: 12, labor: 0, cadre: 0 },
    upkeep: { grain: 3, ordnance: 1 },
    maxHp: 92,
    moves: 2,
    attack: 6,
    defence: 6,
    combat: { firepower: 0.38, assault: 0.34, support: 0.32, screen: 0.3, cohesion: 0.4, supplyUse: 0.46 },
    ambush: 0.04,
    concealment: 0.1,
    sight: 1,
    abilities: ['Garrison'],
    requiresTech: null,
    blurb: '守炮楼、下乡催粮，多是本地人，家眷都在附近村里。战斗意志最弱，也最容易被争取——敌工工作的主要对象就是他们。',
  },
  KempeitaiAgents: {
    key: 'KempeitaiAgents',
    name: '宪兵特务',
    side: 'Enemy',
    role: 'Security',
    era: 'Growth',
    cost: { ordnance: 10, labor: 0, cadre: 0 },
    upkeep: { grain: 2, ordnance: 1 },
    maxHp: 58,
    moves: 3,
    attack: 5,
    defence: 4,
    combat: { firepower: 0.3, assault: 0.24, support: 0.66, screen: 0.5, cohesion: 0.52, supplyUse: 0.32 },
    ambush: 0.1,
    concealment: 0.55,
    sight: 3,
    abilities: ['Recon', 'Garrison'],
    requiresTech: null,
    blurb: '不靠人多，靠名册、路条与线人。它盯的是交通站、堡垒户和识字班的教员——被它盯上的村子，往往在扫荡之前就先出事。',
  },
  ArmoredCar: {
    key: 'ArmoredCar',
    name: '装甲汽车',
    side: 'Enemy',
    role: 'Motor',
    era: 'Growth',
    cost: { ordnance: 30, labor: 0, cadre: 0 },
    upkeep: { grain: 1, ordnance: 4 },
    maxHp: 110,
    moves: 6,
    attack: 12,
    defence: 17,
    combat: { firepower: 0.86, assault: 0.68, support: 0.52, screen: 0.9, cohesion: 0.88, supplyUse: 1.18 },
    ambush: 0,
    concealment: 0.08,
    sight: 2,
    abilities: ['Pursue', 'Screen'],
    requiresTech: null,
    blurb: '沿公路巡逻、押运、增援，机枪打不动它的钢板。可它离不开路：一段被撬掉的钢轨、一道两丈宽的破路沟，就能让它整天到不了。',
  },
  CavalryScouts: {
    key: 'CavalryScouts',
    name: '骑兵搜索队',
    side: 'Enemy',
    role: 'Recon',
    era: 'Opening',
    cost: { ordnance: 20, labor: 0, cadre: 0 },
    upkeep: { grain: 4, ordnance: 1 },
    maxHp: 84,
    moves: 6,
    attack: 9,
    defence: 7,
    combat: { firepower: 0.5, assault: 0.7, support: 0.74, screen: 0.94, cohesion: 0.7, supplyUse: 0.62 },
    ambush: 0.06,
    concealment: 0.14,
    sight: 3,
    abilities: ['Recon', 'Pursue', 'Screen'],
    requiresTech: null,
    blurb: '扫荡的耳目，也是最难摆脱的追兵。平原上转移被它咬住，往往走不到下一个村子——所以撤退路线要沿沟、沿林、沿夜色走。',
  },
  EngineerDetachment: {
    key: 'EngineerDetachment',
    name: '工兵队',
    side: 'Enemy',
    role: 'Engineer',
    era: 'Hardship',
    cost: { ordnance: 18, labor: 0, cadre: 0 },
    upkeep: { grain: 3, ordnance: 1 },
    maxHp: 82,
    moves: 2,
    attack: 4,
    defence: 8,
    combat: { firepower: 0.3, assault: 0.44, support: 0.72, screen: 0.36, cohesion: 0.74, supplyUse: 0.48 },
    ambush: 0,
    concealment: 0.1,
    sight: 2,
    abilities: ['Siege', 'Garrison'],
    requiresTech: null,
    blurb: '修路、架桥、垒炮楼、挖封锁沟，靠抓来的民夫干活。它不打仗，却是「囚笼」真正的建造者——每多一座炮楼，根据地就少一条通路。',
  },
  ArtillerySection: {
    key: 'ArtillerySection',
    name: '炮兵支队',
    side: 'Enemy',
    role: 'Artillery',
    era: 'Hardship',
    cost: { ordnance: 36, labor: 0, cadre: 0 },
    upkeep: { grain: 2, ordnance: 5 },
    maxHp: 70,
    moves: 2,
    attack: 18,
    defence: 5,
    combat: { firepower: 1.3, assault: 0.12, support: 0.86, screen: 0.22, cohesion: 0.58, supplyUse: 1.35 },
    ambush: 0,
    concealment: 0.1,
    sight: 2,
    abilities: ['Siege', 'Burn'],
    requiresTech: null,
    blurb: '山炮与步兵炮，用来轰开村墙和我方的野战工事。它自身笨重、护卫少，一旦脱离主力就是最值得打的目标——炮弹也是最好的缴获。',
  },
});

export const playerUnitKeys = Object.freeze(
  Object.values(unitDefinitions).filter((unit) => unit.side === 'Player').map((unit) => unit.key),
);

export const enemyUnitKeys = Object.freeze(
  Object.values(unitDefinitions).filter((unit) => unit.side === 'Enemy').map((unit) => unit.key),
);

// ---------------------------------------------------------------------------
// 2. 根据地区域（12 种）
// ---------------------------------------------------------------------------
//
// `requiresTerrain` 为 null 表示不挑地形；否则必须是根据地所在格的地形之一。
// `minBaseTier` 表示需要根据地升到几级才能修（村=1、区=2、县=3）。
// `maxPerBase` 是同一根据地内的数量上限。

export const districtDefinitions = Object.freeze({
  Armory: {
    key: 'Armory',
    name: '修械所',
    cost: { labor: 8, cadre: 2 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 0, ordnance: 2, medicine: 0, intel: 0 },
    requiresTech: 'TechFieldSmithy',
    requiresTerrain: ['Mountain', 'Ridge', 'Hill', 'Gorge', 'Forest'],
    minBaseTier: 1,
    maxPerBase: 1,
    effects: { yieldBonus: { ordnance: 0.1 }, captureRate: 0.04 },
    blurb: '设在山沟里的几盘红炉与一台脚踏车床，修枪、复装、翻造零件。要藏得住烟、听得见警报，还要随时能把机器抬进洞里。',
  },
  ClothingWorkshop: {
    key: 'ClothingWorkshop',
    name: '被服厂',
    cost: { labor: 6, cadre: 1 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 1, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: 'TechQuilting',
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 1,
    effects: { upkeepDiscount: 0.06, healRate: 0.05 },
    blurb: '十几台缝纫机加上全村妇女的针线，一冬要出几千套棉衣。棉花靠从敌占区一包一包换回来，路上损失多半算在人身上。',
  },
  Infirmary: {
    key: 'Infirmary',
    name: '卫生所',
    cost: { labor: 5, cadre: 2 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 1, intel: 0 },
    requiresTech: 'TechDisinfection',
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 1,
    effects: { healRate: 0.16 },
    blurb: '几间民房、一口大锅烧开水，重伤员分散住在老乡家里。医生常常只有一位，最缺的不是床位是药——纱布洗过三遍还在用。',
  },
  NightSchool: {
    key: 'NightSchool',
    name: '夜校',
    cost: { labor: 4, cadre: 2 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 1 },
    requiresTech: 'DoctrineWinterSchool',
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 1,
    effects: { cadreGrowth: 0.1, massGrowth: 0.05 },
    blurb: '一盏煤油灯、一块门板刷黑当黑板，教员是本村稍识字的人。学会写自己的名字和收据，村里的账才有人看得懂。',
  },
  GrainStore: {
    key: 'GrainStore',
    name: '粮站',
    cost: { labor: 5, cadre: 1 },
    upkeep: { grain: 0 },
    yields: { grain: 2, labor: 0, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: null,
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 2,
    effects: { seizureResist: 0.08 },
    blurb: '公粮不进一个大仓，而是分散存在几十户的夹壁、地窖和坟地里，账在县里、粮在村里。集中好管，分散才保得住。',
  },
  CourierStation: {
    key: 'CourierStation',
    name: '交通站',
    cost: { labor: 4, cadre: 2 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 1 },
    requiresTech: 'TechCourierNetwork',
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 2,
    effects: { intelRange: 1, exposureDecay: 0.04 },
    blurb: '表面是骡马店、油坊或杂货铺，实际是文件、干部与伤员的中转站。站长只认单线联系的上下家，多认一个人就多一分风险。',
  },
  SupplyDepot: {
    key: 'SupplyDepot',
    name: '兵站',
    cost: { labor: 7, cadre: 2 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 1, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: 'DoctrineFairBurden',
    requiresTerrain: null,
    minBaseTier: 2,
    maxPerBase: 1,
    effects: { upkeepDiscount: 0.1, healRate: 0.05 },
    blurb: '管粮秣、弹药、担架与过路部队的食宿，账目按合理负担的册子走。兵站一断，前面的部队三天之内就得散开就食。',
  },
  TunnelMouth: {
    key: 'TunnelMouth',
    name: '地道口',
    cost: { labor: 6, cadre: 1 },
    upkeep: { grain: 0 },
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: 'TechTunnelSingle',
    requiresTerrain: ['Plain', 'Loess', 'Hill'],
    minBaseTier: 1,
    maxPerBase: 3,
    effects: { tunnelMove: true, combatDefence: 0.1, civilianShelter: 0.12 },
    blurb: '开在锅台下、碾盘旁、驴槽底与井壁上，翻板一合与地面无异。挖不难，难在维护：一场秋雨就可能塌掉一整条巷。',
  },
  RadioRoom: {
    key: 'RadioRoom',
    name: '电台室',
    cost: { labor: 5, cadre: 3 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 2 },
    requiresTech: 'TechWirelessSet',
    requiresTerrain: null,
    minBaseTier: 2,
    maxPerBase: 1,
    effects: { intelRange: 2, sweepWarning: 1 },
    blurb: '一部电台、一箱干电池、一本受不得潮的密码本，天线夜里才挂上去。发报超过三分钟就要转移——测向车比讨伐队来得快。',
  },
  FiringRange: {
    key: 'FiringRange',
    name: '靶场',
    cost: { labor: 5, cadre: 1 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: 'TechCartridgeReload',
    requiresTerrain: ['Mountain', 'Ridge', 'Hill', 'Gorge', 'Loess'],
    minBaseTier: 1,
    maxPerBase: 1,
    effects: { combatAttack: 0.07, captureRate: 0.03 },
    blurb: '选一道背风的沟，土坡当挡弹墙。新兵入伍多半只能打三发实弹，其余靠空枪瞄准与投掷石头练——子弹比时间贵得多。',
  },
  PeasantAssociation: {
    key: 'PeasantAssociation',
    name: '农会',
    cost: { labor: 3, cadre: 2 },
    upkeep: { grain: 0 },
    yields: { grain: 1, labor: 1, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: 'DoctrinePeasantAssociation',
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 2,
    effects: { massGrowth: 0.08, unrestDecay: 0.06, populationGrowth: 0.03 },
    blurb: '借祠堂或场院办公，管评议负担、调解纠纷、组织变工。它不是办事处，是村里第一个由佃户和雇工自己选出来的机构。',
  },
  MilitiaGround: {
    key: 'MilitiaGround',
    name: '民兵训练场',
    cost: { labor: 4, cadre: 2 },
    upkeep: { grain: 1 },
    yields: { grain: 0, labor: 1, ordnance: 0, medicine: 0, intel: 0 },
    requiresTech: 'DoctrineMilitiaSelfDefence',
    requiresTerrain: null,
    minBaseTier: 1,
    maxPerBase: 1,
    effects: { combatDefence: 0.08, cadreGrowth: 0.05, sweepWarning: 1 },
    blurb: '打谷场兼训练场，练投弹、埋雷、站岗与转移。真正要练熟的是一件事：警报响起后，全村多久能进洞、牲口多久能上山。',
  },
});

export const districtKeys = Object.freeze(Object.keys(districtDefinitions));

// ---------------------------------------------------------------------------
// 3. 根据地三级：村 — 区 — 县
// ---------------------------------------------------------------------------

export const baseTierDefinitions = Object.freeze({
  1: {
    tier: 1,
    key: 'Village',
    name: '村根据地',
    populationCap: 1200,
    districtSlots: 3,
    garrison: 2,
    unrestCap: 60,
    yieldMultiplier: 1,
    upgradeCost: { labor: 12, cadre: 3 },
    upgradePopulation: 900,
    effects: { massGrowth: 0.02 },
    blurb: '一个村的党支部、农会与自卫队，公粮记在一本账上。它小到可以整体转移，也小到一次扫荡就可能被打散。',
  },
  2: {
    tier: 2,
    key: 'District',
    name: '区根据地',
    populationCap: 4200,
    districtSlots: 5,
    garrison: 4,
    unrestCap: 70,
    yieldMultiplier: 1.15,
    upgradeCost: { labor: 26, cadre: 6 },
    upgradePopulation: 3200,
    effects: { massGrowth: 0.04, policySlots: 0, buildSpeed: 0.05 },
    blurb: '十几个村连成一片，有区公所、区小队和固定的交通线。到这一级才谈得上「后方」：伤员有地方住，公粮有地方存。',
  },
  3: {
    tier: 3,
    key: 'County',
    name: '县根据地',
    populationCap: 11000,
    districtSlots: 8,
    garrison: 7,
    unrestCap: 80,
    yieldMultiplier: 1.3,
    upgradeCost: null,
    upgradePopulation: null,
    effects: { massGrowth: 0.06, buildSpeed: 0.1, cadreGrowth: 0.06, baseSlots: 1 },
    blurb: '完整的县委、县政府、县大队与后勤系统，能自己训练干部、自己造弹药、自己办报。也因此成为敌人合围时首选的目标。',
  },
});

export const baseTierOrder = Object.freeze([1, 2, 3]);

// ---------------------------------------------------------------------------
// 4. 纯查询函数
// ---------------------------------------------------------------------------

export function GetUnitDefinition(key) {
  return unitDefinitions[key] ?? null;
}

export function GetDistrictDefinition(key) {
  return districtDefinitions[key] ?? null;
}

export function GetBaseTierDefinition(tier) {
  return baseTierDefinitions[tier] ?? baseTierDefinitions[1];
}

export function GetUnitsForSide(side) {
  return Object.values(unitDefinitions).filter((unit) => unit.side === side);
}

export function HasAbility(unitKey, abilityKey) {
  const definition = unitDefinitions[unitKey];
  return Boolean(definition && definition.abilities.includes(abilityKey));
}

/** 某单位是否已经解锁（requiresTech 可指向技术树或政权树上的任一 id）。 */
export function IsUnitUnlocked(unitKey, doneIds) {
  const definition = unitDefinitions[unitKey];
  if (!definition) return false;
  if (!definition.requiresTech) return true;
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  return done.has(definition.requiresTech);
}

/** 列出当前可以编成的我方部队。 */
export function GetAvailableUnits(doneIds, side = 'Player') {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  return Object.values(unitDefinitions).filter(
    (unit) => unit.side === side && IsUnitUnlocked(unit.key, done),
  );
}

/**
 * 某区域是否可以在给定根据地上修建。
 * @param {string} districtKey
 * @param {{doneIds?:string[], tier?:number, terrain?:string, existing?:Array<{type:string}>}} context
 * @returns {{ok:boolean, reason:string|null}}
 */
export function CanBuildDistrict(districtKey, context = {}) {
  const definition = districtDefinitions[districtKey];
  if (!definition) return { ok: false, reason: 'UnknownDistrict' };
  const done = context.doneIds instanceof Set ? context.doneIds : new Set(context.doneIds || []);
  if (definition.requiresTech && !done.has(definition.requiresTech)) {
    return { ok: false, reason: 'MissingResearch' };
  }
  const tier = context.tier ?? 1;
  if (tier < (definition.minBaseTier ?? 1)) return { ok: false, reason: 'BaseTierTooLow' };
  if (definition.requiresTerrain && context.terrain && !definition.requiresTerrain.includes(context.terrain)) {
    return { ok: false, reason: 'WrongTerrain' };
  }
  const existing = context.existing || [];
  const built = existing.filter((entry) => (entry.type ?? entry) === districtKey).length;
  if (built >= (definition.maxPerBase ?? 1)) return { ok: false, reason: 'LimitReached' };
  const tierDefinition = GetBaseTierDefinition(tier);
  if (existing.length >= tierDefinition.districtSlots) return { ok: false, reason: 'NoSlot' };
  return { ok: true, reason: null };
}

/** 列出当前根据地可修的区域定义。 */
export function GetAvailableDistricts(context = {}) {
  return Object.values(districtDefinitions).filter(
    (definition) => CanBuildDistrict(definition.key, context).ok,
  );
}

/** 汇总一组已建区域每回合的产出（未乘根据地等级倍率）。 */
export function SumDistrictYields(districtTypes) {
  const total = { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 };
  for (const entry of districtTypes || []) {
    const key = entry && typeof entry === 'object' ? entry.type : entry;
    const definition = districtDefinitions[key];
    if (!definition) continue;
    for (const resource of Object.keys(total)) {
      total[resource] += definition.yields[resource] ?? 0;
    }
  }
  return total;
}

/** 汇总一组已建区域每回合的粮食维持。 */
export function SumDistrictUpkeep(districtTypes) {
  let grain = 0;
  for (const entry of districtTypes || []) {
    const key = entry && typeof entry === 'object' ? entry.type : entry;
    const definition = districtDefinitions[key];
    if (!definition) continue;
    grain += definition.upkeep.grain ?? 0;
  }
  return { grain };
}

/** 汇总一支部队序列每回合的维持（upkeepDiscount 由规则层另行折扣）。 */
export function SumUnitUpkeep(unitKeys) {
  const total = { grain: 0, ordnance: 0 };
  for (const entry of unitKeys || []) {
    const key = entry && typeof entry === 'object' ? entry.type ?? entry.key : entry;
    const definition = unitDefinitions[key];
    if (!definition) continue;
    total.grain += definition.upkeep.grain ?? 0;
    total.ordnance += definition.upkeep.ordnance ?? 0;
  }
  return total;
}

/** 部队的战斗基线，供 Script_Combat 的 ComputeStrength 取用。 */
export function GetUnitCombatProfile(unitKey) {
  const definition = unitDefinitions[unitKey];
  if (!definition) return null;
  return {
    key: definition.key,
    attack: definition.attack,
    defence: definition.defence,
    ambush: definition.ambush,
    concealment: definition.concealment,
    sight: definition.sight,
    moves: definition.moves,
    maxHp: definition.maxHp,
    abilities: definition.abilities,
    firepower: definition.combat?.firepower ?? 0.5,
    assault: definition.combat?.assault ?? 0.5,
    support: definition.combat?.support ?? 0.5,
    screen: definition.combat?.screen ?? 0.5,
    cohesion: definition.combat?.cohesion ?? 0.6,
    supplyUse: definition.combat?.supplyUse ?? 0.6,
  };
}
