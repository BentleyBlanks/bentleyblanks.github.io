// 《燎原 · 敌后1937》 —— 日伪军治安战 AI（分层决策）。
//
// 本模块是纯逻辑模块：不引用 window / document / three，不使用 Math.random，
// 全部随机数从 state.rngState 派生并在计划里写回，保证同种子可复现。
//
// AI 分三层：
//   战略层 —— 治安战方针（蚕食 Nibble / 扫荡 Sweep / 怀柔 Pacify / 囚笼 Cage / 收缩 Retrench），
//             按历史时期、玩家暴露度、根据地规模、破袭强度与自身兵力切换。
//   战役层 —— 扫荡规划：选目标、划多路合围轴线、从沿线据点真实抽调守备（据点 garrison 下降，
//             玩家可见），并留出 2 回合预警期，形成"敌进我进"的战略窗口。
//   战术层 —— 据点巡逻、修路筑炮楼、挖封锁沟、抢粮（只进代价账本）、追击暴露的我方部队、
//             铁路被破袭后派工兵抢修。
//
// AI 不开全图挂：它只根据自己"知道"的信息（未隐蔽的我方部队、控制区、警备度、
// 破袭痕迹、被扫荡过的残迹）做判断，难度差异来自兵力投入与决心，而不是视野作弊。
//
// 反"唯歼敌论"红线：AI 的征粮 / 焚毁行为只写入 state.ledger 代价账本，
// 绝不给玩家任何资源或分数；文案克制、事实性，不做猎奇渲染。

import {
  HexKey,
  ParseHexKey,
  HexDistance,
  HexNeighborKeys,
  HexRing,
  HexesInRange,
  HexLine,
  StepRng,
  HashString,
  Clamp,
  Clamp01,
  Lerp,
  WeightedPick,
} from './Script_Hex.mjs';

// ---------------------------------------------------------------------------
// 可选依赖：Data_Units / Data_Terrain / Script_Combat 由并行的其它模块提供。
// 全部"尝试导入 + 内置回退"，本模块必须能在这三者缺席时独立工作。
// ---------------------------------------------------------------------------

let externalUnitDefinitions = null;
let externalTerrainDefinitions = null;
let externalCombatModule = null;

try {
  const module = await import('./Data_Units.mjs');
  externalUnitDefinitions = module?.unitDefinitions ?? null;
} catch (error) {
  externalUnitDefinitions = null;
}

let externalWorkDefinitions = null;

try {
  const module = await import('./Data_Terrain.mjs');
  externalTerrainDefinitions = module?.terrainDefinitions ?? null;
  externalWorkDefinitions = module?.workDefinitions ?? null;
} catch (error) {
  externalTerrainDefinitions = null;
  externalWorkDefinitions = null;
}

try {
  const module = await import('./Script_Combat.mjs');
  externalCombatModule = module ?? null;
} catch (error) {
  externalCombatModule = null;
}

// ---------------------------------------------------------------------------
// 常量表
// ---------------------------------------------------------------------------

/** 时期划分（与规格书第 5 节一致）。 */
export const eraTurnRanges = Object.freeze([
  Object.freeze({ key: 'Opening', name: '开辟期', from: 0, to: 5 }),
  Object.freeze({ key: 'Growth', name: '发展期', from: 6, to: 13 }),
  Object.freeze({ key: 'Hardship', name: '困难期', from: 14, to: 21 }),
  Object.freeze({ key: 'Recovery', name: '恢复期', from: 22, to: 27 }),
  Object.freeze({ key: 'Counter', name: '反攻期', from: 28, to: 99 }),
]);

/** 三档难度。差异只体现在兵力投入、决心与反应速度，不给 AI 额外视野。 */
export const difficultyDefinitions = Object.freeze({
  Normal: Object.freeze({
    key: 'Normal',
    name: '普通',
    blurb: '守备队按部就班，扫荡前的调兵痕迹明显，抽调守备也留有余地。',
    sweepBias: 1.0,
    cageBias: 1.0,
    pacifyBias: 1.05,
    retrenchBias: 1.05,
    garrisonDrawRatio: 0.36,
    garrisonFloor: 2,
    axisCountBase: 2,
    axisCountBonus: 1,
    sweepCooldown: 4,
    pursuitRange: 3,
    patrolRadius: 2,
    buildBudget: 1,
    requisitionRate: 0.55,
    exposureReaction: 0.85,
    strengthScale: 1.0,
    harshness: 0.7,
    warningTurns: 2,
    reinforceRate: 0.34,
  }),
  Hard: Object.freeze({
    key: 'Hard',
    name: '困难',
    blurb: '华北方面军抽调野战部队参与治安战，扫荡更频繁，抽调守备更狠。',
    sweepBias: 1.35,
    cageBias: 1.2,
    pacifyBias: 0.95,
    retrenchBias: 0.95,
    garrisonDrawRatio: 0.44,
    garrisonFloor: 2,
    axisCountBase: 3,
    axisCountBonus: 1,
    sweepCooldown: 3,
    pursuitRange: 4,
    patrolRadius: 3,
    buildBudget: 2,
    requisitionRate: 0.7,
    exposureReaction: 1.15,
    strengthScale: 1.22,
    harshness: 0.85,
    warningTurns: 2,
    reinforceRate: 0.42,
  }),
  Brutal: Object.freeze({
    key: 'Brutal',
    name: '残酷',
    blurb: '铁壁合围与梳篦式清剿并用，据点几乎抽空也要凑齐合围兵力。',
    sweepBias: 1.75,
    cageBias: 1.45,
    pacifyBias: 0.88,
    retrenchBias: 0.9,
    garrisonDrawRatio: 0.52,
    garrisonFloor: 1,
    axisCountBase: 3,
    axisCountBonus: 2,
    sweepCooldown: 2,
    pursuitRange: 5,
    patrolRadius: 3,
    buildBudget: 2,
    requisitionRate: 0.88,
    exposureReaction: 1.45,
    strengthScale: 1.48,
    harshness: 1.0,
    warningTurns: 2,
    reinforceRate: 0.5,
  }),
});

/** 五种治安战方针。weights 是战术层各类动作的权重。 */
export const doctrineDefinitions = Object.freeze({
  Nibble: Object.freeze({
    key: 'Nibble',
    name: '蚕食',
    blurb: '以点线推进：修炮楼、通公路、划封锁沟，一步一步把根据地啃掉边缘。',
    weights: Object.freeze({
      sweep: 0.55, build: 1.6, patrol: 1.1, requisition: 0.7,
      pacify: 0.6, repair: 1.0, pursue: 0.8, garrison: 0.9, withdraw: 0.2,
    }),
    eraAffinity: Object.freeze({ Opening: 1.75, Growth: 2.05, Hardship: 1.0, Recovery: 2.45, Counter: 0.5 }),
    exposureSlope: -0.75,
    alertSlope: 0.15,
    baseScaleSlope: 0.1,
    sabotageSlope: -0.15,
    strengthSlope: 0.2,
    cooldownFactor: 1.1,
  }),
  Sweep: Object.freeze({
    key: 'Sweep',
    name: '扫荡',
    blurb: '集中兵力多路合围，力求捕捉主力；沿途据点被抽空，是"敌进我进"的窗口。',
    weights: Object.freeze({
      sweep: 1.9, build: 0.4, patrol: 0.6, requisition: 1.2,
      pacify: 0.2, repair: 0.6, pursue: 1.5, garrison: 0.4, withdraw: 0.2,
    }),
    eraAffinity: Object.freeze({ Opening: 0.3, Growth: 0.9, Hardship: 2.15, Recovery: 0.7, Counter: 0.2 }),
    exposureSlope: 1.9,
    alertSlope: 0.6,
    baseScaleSlope: 0.3,
    sabotageSlope: 0.9,
    strengthSlope: 0.55,
    // 合围最依赖情报：没有暴露、没有破袭痕迹就找不到该围谁。
    targetingWeight: 1.0,
    // 刚打完一次大扫荡，短期内转入巩固，不会连续合围。
    cooldownFactor: 0.45,
  }),
  Pacify: Object.freeze({
    key: 'Pacify',
    name: '治安强化',
    blurb: '扶植伪政权、发良民证、清查户口与经济封锁，用秩序而不是刺刀夺人心。',
    weights: Object.freeze({
      sweep: 0.28, build: 0.9, patrol: 1.3, requisition: 0.8,
      pacify: 1.9, repair: 0.9, pursue: 0.5, garrison: 1.2, withdraw: 0.3,
    }),
    eraAffinity: Object.freeze({ Opening: 2.6, Growth: 1.1, Hardship: 0.8, Recovery: 1.5, Counter: 0.6 }),
    exposureSlope: -1.1,
    alertSlope: -0.3,
    baseScaleSlope: -0.25,
    sabotageSlope: -0.25,
    strengthSlope: 0.15,
    cooldownFactor: 1.15,
  }),
  Cage: Object.freeze({
    key: 'Cage',
    name: '囚笼',
    blurb: '以铁路为柱、公路为链、碉堡为锁，把根据地切成互不相通的小块。',
    weights: Object.freeze({
      sweep: 1.15, build: 1.8, patrol: 1.0, requisition: 1.0,
      pacify: 0.7, repair: 1.5, pursue: 0.9, garrison: 1.1, withdraw: 0.2,
    }),
    eraAffinity: Object.freeze({ Opening: 0.25, Growth: 0.95, Hardship: 2.45, Recovery: 1.05, Counter: 0.3 }),
    exposureSlope: 0.55,
    alertSlope: 0.35,
    baseScaleSlope: 0.45,
    sabotageSlope: 0.55,
    strengthSlope: 0.35,
    // 囚笼是照着地图修的，但修在哪一段仍需要一点线索。
    targetingWeight: 0.35,
    // 扫荡刚过，正是修碉堡、挖封锁沟、把根据地切碎的时候。
    cooldownFactor: 1.25,
  }),
  Retrench: Object.freeze({
    key: 'Retrench',
    name: '收缩',
    blurb: '兵力被抽往正面战场，外围据点次第放弃，只守铁路沿线与县城。',
    weights: Object.freeze({
      sweep: 0.18, build: 0.4, patrol: 0.8, requisition: 1.1,
      pacify: 0.9, repair: 0.8, pursue: 0.35, garrison: 1.6, withdraw: 1.7,
    }),
    eraAffinity: Object.freeze({ Opening: 0.1, Growth: 0.2, Hardship: 0.3, Recovery: 0.55, Counter: 3.3 }),
    exposureSlope: -0.35,
    alertSlope: -0.1,
    baseScaleSlope: 0.1,
    sabotageSlope: 0.2,
    strengthSlope: -0.6,
    cooldownFactor: 1.05,
  }),
});

/**
 * 敌方单位内置回退数值。Data_Units.mjs 若提供同名定义则以其为准并逐字段合并；
 * 这里同时收录该模块的正式键名与本模块早期使用的简写别名，两套都能查到。
 */
const enemyUnitFallbacks = Object.freeze({
  JapaneseInfantryCompany: { key: 'JapaneseInfantryCompany', name: '日军步兵中队', attack: 16, defence: 14, maxHp: 150, maxMoves: 3, vision: 2, role: 'Line' },
  PunitiveColumn: { key: 'PunitiveColumn', name: '讨伐队', attack: 18, defence: 12, maxHp: 140, maxMoves: 4, vision: 2, role: 'Line' },
  PuppetGarrison: { key: 'PuppetGarrison', name: '伪军守备队', attack: 8, defence: 9, maxHp: 92, maxMoves: 3, vision: 2, role: 'Line' },
  KempeitaiAgents: { key: 'KempeitaiAgents', name: '宪兵特务班', attack: 7, defence: 7, maxHp: 60, maxMoves: 3, vision: 3, role: 'Pacify' },
  ArmoredCar: { key: 'ArmoredCar', name: '装甲汽车', attack: 15, defence: 16, maxHp: 110, maxMoves: 5, vision: 2, role: 'Road' },
  CavalryScouts: { key: 'CavalryScouts', name: '骑兵搜索队', attack: 11, defence: 8, maxHp: 80, maxMoves: 6, vision: 3, role: 'Pursuit' },
  EngineerDetachment: { key: 'EngineerDetachment', name: '铁道工兵队', attack: 5, defence: 8, maxHp: 80, maxMoves: 3, vision: 1, role: 'Engineer' },
  ArtillerySection: { key: 'ArtillerySection', name: '山炮小队', attack: 20, defence: 6, maxHp: 70, maxMoves: 2, vision: 2, role: 'Support' },
  // —— 早期简写别名，保证外部数据缺席时仍可用 ——
  JapaneseInfantry: { key: 'JapaneseInfantry', name: '日军步兵中队', attack: 16, defence: 14, maxHp: 150, maxMoves: 3, vision: 2, role: 'Line' },
  JapaneseCavalry: { key: 'JapaneseCavalry', name: '日军骑兵小队', attack: 11, defence: 8, maxHp: 80, maxMoves: 6, vision: 3, role: 'Pursuit' },
  PuppetInfantry: { key: 'PuppetInfantry', name: '伪军中队', attack: 8, defence: 9, maxHp: 92, maxMoves: 3, vision: 2, role: 'Line' },
  PuppetPolice: { key: 'PuppetPolice', name: '伪警备队', attack: 6, defence: 7, maxHp: 60, maxMoves: 2, vision: 2, role: 'Pacify' },
  Gendarme: { key: 'Gendarme', name: '宪兵特务班', attack: 7, defence: 7, maxHp: 60, maxMoves: 3, vision: 3, role: 'Pacify' },
  Engineer: { key: 'Engineer', name: '铁道工兵', attack: 5, defence: 8, maxHp: 80, maxMoves: 3, vision: 1, role: 'Engineer' },
  Artillery: { key: 'Artillery', name: '山炮小队', attack: 20, defence: 6, maxHp: 70, maxMoves: 2, vision: 2, role: 'Support' },
  SupplyColumn: { key: 'SupplyColumn', name: '辎重队', attack: 3, defence: 5, maxHp: 60, maxMoves: 2, vision: 1, role: 'Supply' },
});

const genericEnemyStats = Object.freeze({
  key: 'Unknown', name: '敌一部', attack: 10, defence: 9, maxHp: 90, maxMoves: 3, vision: 2, role: 'Line',
});

/** 我方单位的回退防御数值，只用于内置简化结算（Script_Combat 就位时优先用它）。 */
const genericPlayerStats = Object.freeze({
  key: 'Unknown', name: '我一部', attack: 8, defence: 9, maxHp: 60, concealment: 0.3,
});

/** 地形内置回退（Data_Terrain.mjs 若提供则合并）。 */
const terrainFallbacks = Object.freeze({
  Mountain: { moveCost: 3.0, defenceBonus: 0.35, concealment: 0.7 },
  Ridge: { moveCost: 2.5, defenceBonus: 0.3, concealment: 0.6 },
  Hill: { moveCost: 1.6, defenceBonus: 0.2, concealment: 0.4 },
  Forest: { moveCost: 1.8, defenceBonus: 0.18, concealment: 0.8 },
  Plain: { moveCost: 1.0, defenceBonus: 0.0, concealment: 0.1 },
  Loess: { moveCost: 1.2, defenceBonus: 0.08, concealment: 0.3 },
  Marsh: { moveCost: 2.6, defenceBonus: 0.1, concealment: 0.6 },
  River: { moveCost: 2.2, defenceBonus: 0.05, concealment: 0.2 },
  Gorge: { moveCost: 3.4, defenceBonus: 0.25, concealment: 0.7 },
});

const featureLabels = Object.freeze({
  Village: '村庄', Town: '集镇', CountySeat: '县城', Ford: '渡口', Pass: '隘口',
  Shrine: '庙宇', Terrace: '梯田', Grove: '林场', Quarry: '石场', SaltPan: '盐滩',
});

// 地形中文名以 Data_Terrain 为唯一来源。此前这里维护了一份副本，
// 于是战报写「山脊(5,5)」而点开格子显示「山梁」，同一块地两个名字。
const terrainLabelFallback = Object.freeze({
  Mountain: '高山', Ridge: '山梁', Hill: '丘陵', Forest: '林地', Plain: '平原',
  Loess: '黄土塬', Marsh: '洼淀', River: '河谷', Gorge: '峡谷',
});

function TerrainLabel(key) {
  return externalTerrainDefinitions?.[key]?.name || terrainLabelFallback[key] || key;
}

const intentLabels = Object.freeze({
  Patrol: '巡逻', Pursue: '追击', Sweep: '扫荡', Garrison: '驻防', Build: '筑垒',
  Repair: '抢修', Requisition: '征发', Withdraw: '回撤', Pacify: '宣抚', Stage: '集结',
});

const compassNames = Object.freeze(['东', '东北', '北', '西北', '西', '西南', '南', '东南']);

const buildKindProfiles = Object.freeze({
  Blockhouse: { key: 'Blockhouse', name: '炮楼', turns: 2, garrison: 4 },
  Road: { key: 'Road', name: '公路', turns: 2, garrison: 0 },
  Trench: { key: 'Trench', name: '封锁沟', turns: 1, garrison: 0 },
  Wire: { key: 'Wire', name: '鹿砦铁丝网', turns: 1, garrison: 0 },
});

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

function ResolveEraKey(state) {
  if (state && typeof state.eraKey === 'string' && state.eraKey) return state.eraKey;
  return EraKeyForTurn(state ? state.turn : 0);
}

export function EraKeyForTurn(turn) {
  const value = Math.max(0, Number(turn) || 0);
  for (const range of eraTurnRanges) {
    if (value >= range.from && value <= range.to) return range.key;
  }
  return 'Counter';
}

function MapHexes(state) {
  return (state && state.map && state.map.hexes) ? state.map.hexes : {};
}

function MapOrder(state) {
  if (state && state.map && Array.isArray(state.map.order) && state.map.order.length) return state.map.order;
  return Object.keys(MapHexes(state));
}

function GetHex(state, key) {
  if (!key) return null;
  return MapHexes(state)[key] || null;
}

/**
 * 读取 AI 的跨回合记忆（扫荡冷却、在建工程、守备欠账、上一回合方针）。
 *
 * 契约缺口说明：Script_Rules.RunEnemyTurn 把 ApplyEnemyTurn 的结果搬回它自己的 state 时，
 * 只搬 map / units / enemies / strongholds / bases / sweep / rngState / alert / exposure / ledger，
 * 并不搬 aiMemory。因此本模块把记忆同时挂在 state.aiMemory 与 state.map.aiMemory 两处，
 * map 是会被搬运的，这样无论谁来驱动回合，AI 的记忆都不会每回合被清空。
 */
function ReadAiMemory(state) {
  if (!state) return null;
  if (state.aiMemory) return state.aiMemory;
  if (state.map && state.map.aiMemory) return state.map.aiMemory;
  return null;
}

function SafeList(value) {
  return Array.isArray(value) ? value : [];
}

function KeysInRange(key, radius) {
  const center = ParseHexKey(key);
  return HexesInRange(center, radius).map((cell) => HexKey(cell.q, cell.r));
}

function HexLabel(state, key) {
  const hex = GetHex(state, key);
  if (!hex) return `未知地段(${key})`;
  const name = featureLabels[hex.feature] || TerrainLabel(hex.terrain) || '荒地';
  return `${name}(${key})`;
}

/** 由 from 指向 to 的八方位中文名（世界坐标 +q 向东、+r 向南）。 */
function CompassLabel(fromKey, toKey) {
  const from = ParseHexKey(fromKey);
  const to = ParseHexKey(toKey);
  const east = 1.5 * (to.q - from.q);
  const south = Math.sqrt(3) * ((to.r - from.r) + (to.q - from.q) / 2);
  if (Math.abs(east) < 1e-6 && Math.abs(south) < 1e-6) return '原地';
  let angle = Math.atan2(-south, east); // 屏幕上 -south 即北
  if (angle < 0) angle += Math.PI * 2;
  const index = Math.round(angle / (Math.PI / 4)) % 8;
  return compassNames[index];
}

function TerrainProfile(terrainKey) {
  const fallback = terrainFallbacks[terrainKey] || terrainFallbacks.Plain;
  const external = externalTerrainDefinitions ? externalTerrainDefinitions[terrainKey] : null;
  if (!external) return fallback;
  return {
    moveCost: Number.isFinite(external.moveCost) ? external.moveCost : fallback.moveCost,
    defenceBonus: Number.isFinite(external.defenceBonus) ? external.defenceBonus : fallback.defenceBonus,
    concealment: Number.isFinite(external.concealment) ? external.concealment : fallback.concealment,
  };
}

function PickNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

/** 敌方单位数值：外部 Data_Units 优先，缺失字段用内置回退补齐。 */
export function ResolveEnemyStats(type) {
  const fallback = enemyUnitFallbacks[type] || genericEnemyStats;
  const external = externalUnitDefinitions ? externalUnitDefinitions[type] : null;
  if (!external) return { ...fallback, key: type || fallback.key };
  return {
    key: type || fallback.key,
    name: external.name || fallback.name,
    attack: PickNumber(external.attack, fallback.attack),
    defence: PickNumber(external.defence, fallback.defence),
    maxHp: PickNumber(external.maxHp, external.hp, fallback.maxHp),
    maxMoves: PickNumber(external.maxMoves, external.moves, fallback.maxMoves),
    // Data_Units 用 sight，本模块内部叫 vision，两个名字都认。
    vision: PickNumber(external.vision, external.sight, fallback.vision),
    role: external.role || fallback.role,
  };
}

/** 我方单位数值：只用于内置简化结算；Script_Combat 就位后由它接管。 */
function ResolvePlayerStats(type) {
  const external = externalUnitDefinitions ? externalUnitDefinitions[type] : null;
  if (!external) return { ...genericPlayerStats, key: type || genericPlayerStats.key };
  return {
    key: type || genericPlayerStats.key,
    name: external.name || genericPlayerStats.name,
    attack: PickNumber(external.attack, genericPlayerStats.attack),
    defence: PickNumber(external.defence, genericPlayerStats.defence),
    maxHp: PickNumber(external.maxHp, external.hp, genericPlayerStats.maxHp),
    concealment: PickNumber(external.concealment, genericPlayerStats.concealment),
  };
}

function MoveCostFor(hex) {
  if (!hex) return 99;
  const profile = TerrainProfile(hex.terrain);
  let cost = profile.moveCost;
  if (hex.road >= 2) cost = Math.min(cost, 0.6);
  else if (hex.road === 1) cost = Math.min(cost, 1.1);
  if (hex.feature === 'Ford' || hex.feature === 'Pass') cost = Math.min(cost, 1.4);
  if (hex.blockade > 0) cost = Math.max(0.5, cost - 0.2);
  // 我方的破路与路障真实迟滞敌军机动——这是破交战对扫荡的直接牵制作用，
  // 必须体现在敌方的行军消耗上，否则「破路」这项工事对 AI 完全无感。
  cost += WorkEnemyMoveCostFor(hex);
  return cost;
}

/** 该格我方工事给敌军增加的行军消耗（破路、路障）。 */
function WorkEnemyMoveCostFor(hex) {
  const works = Array.isArray(hex && hex.works) ? hex.works : [];
  if (!works.length || !externalWorkDefinitions) return 0;
  let extra = 0;
  for (const work of works) {
    extra += Number(externalWorkDefinitions[work]?.effects?.enemyMoveCostDelta) || 0;
  }
  return Math.max(0, extra);
}

function CreateRngCursor(seedState) {
  let cursor = (Number(seedState) >>> 0) || 0x9e3779b9;
  return {
    Next() {
      const step = StepRng(cursor);
      cursor = step.state;
      return step.value;
    },
    Chance(probability) {
      return this.Next() < probability;
    },
    Range(low, high) {
      return low + this.Next() * (high - low);
    },
    IntBetween(low, high) {
      return low + Math.floor(this.Next() * (high - low + 1));
    },
    Pick(list) {
      if (!list || !list.length) return null;
      return list[Math.floor(this.Next() * list.length)];
    },
    get state() {
      return cursor;
    },
  };
}

function ResolveDifficulty(state, options) {
  const requested = (options && options.difficulty)
    || (state && state.difficulty)
    || (state && state.options && state.options.difficulty)
    || 'Normal';
  return difficultyDefinitions[requested] || difficultyDefinitions.Normal;
}

// ---------------------------------------------------------------------------
// AI 的情报模型：它只知道该知道的东西
// ---------------------------------------------------------------------------

const knowledgeCache = new WeakMap();

function BuildKnowledge(state) {
  if (!state || typeof state !== 'object') {
    return { knownUnits: [], knownByKey: new Map(), strongholdKeys: [], baseKeys: [], railBroken: [], exposure: 0, alert: 0 };
  }
  const cached = knowledgeCache.get(state);
  if (cached) return cached;

  const exposure = Clamp(Number(state.exposure) || 0, 0, 100);
  const alert = Clamp(Number(state.alert) || 0, 0, 100);
  const strongholds = SafeList(state.strongholds);
  const strongholdKeys = strongholds.map((item) => item.key).filter(Boolean);

  // 据点视野：据点周围 patrol 半径内是"看得见"的。
  const watched = new Set();
  for (const stronghold of strongholds) {
    if (!stronghold.key) continue;
    const radius = stronghold.type === 'CountySeat' ? 3 : 2;
    for (const key of KeysInRange(stronghold.key, radius)) watched.add(key);
  }
  for (const enemy of SafeList(state.enemies)) {
    if (!enemy.key || (enemy.hp ?? 1) <= 0) continue;
    const stats = ResolveEnemyStats(enemy.type);
    for (const key of KeysInRange(enemy.key, stats.vision)) watched.add(key);
  }

  // 已知的我方部队。AI 没有全图视野：
  //   · 未隐蔽的部队若进入据点/巡逻队视界，或在据点"风声半径"内（暴露度越高传得越远），才会被掌握；
  //   · 隐蔽的部队只有在据点眼皮底下、且警备度足够时才有机会被察觉。
  const knownUnits = [];
  const knownByKey = new Map();
  const rumorRange = 3 + Math.round(exposure / 25);
  for (const unit of SafeList(state.units)) {
    if (!unit || !unit.key || (unit.hp ?? 1) <= 0) continue;
    const inSight = watched.has(unit.key);
    const detectionRoll = (HashString(`${state.seed || 0}:${state.turn || 0}:${unit.id || unit.key}`) % 1000) / 1000;
    const detectChance = Clamp01(0.04 + alert / 400 + exposure / 500);
    const spotted = unit.hidden
      ? (inSight && detectionRoll < detectChance)
      : (inSight || NearestStrongholdDistance(state, unit.key) <= rumorRange);
    if (!spotted) continue;
    const record = {
      id: unit.id,
      key: unit.key,
      type: unit.type,
      strength: Clamp(Number(unit.hp) || 10, 1, 200),
      confirmed: !unit.hidden && inSight,
    };
    knownUnits.push(record);
    const bucket = knownByKey.get(unit.key) || [];
    bucket.push(record);
    knownByKey.set(unit.key, bucket);
  }

  const baseKeys = [];
  const railBroken = [];
  for (const key of MapOrder(state)) {
    const hex = MapHexes(state)[key];
    if (!hex) continue;
    if (hex.control === 'Base' || hex.control === 'Guerrilla') baseKeys.push(key);
    if ((hex.railBroken || 0) > 0) railBroken.push(key);
  }

  const knowledge = { knownUnits, knownByKey, watched, strongholdKeys, baseKeys, railBroken, exposure, alert };
  knowledgeCache.set(state, knowledge);
  return knowledge;
}

function NearestStrongholdDistance(state, key) {
  const strongholds = SafeList(state.strongholds);
  if (!strongholds.length) return 12;
  const here = ParseHexKey(key);
  let best = 99;
  for (const stronghold of strongholds) {
    if (!stronghold.key) continue;
    const distance = HexDistance(here, ParseHexKey(stronghold.key));
    if (distance < best) best = distance;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 估值：威胁与价值
// ---------------------------------------------------------------------------

/** 该格对敌方构成的游击威胁（0..100），基于 AI 已知信息。 */
export function EvaluateThreat(state, key) {
  const hex = GetHex(state, key);
  if (!hex) return 0;
  const knowledge = BuildKnowledge(state);

  let threat = 0;
  if (hex.control === 'Base') threat += 34;
  else if (hex.control === 'Guerrilla') threat += 22;
  else if (hex.control === 'Contested') threat += 10;
  else threat += 2;

  threat += (Clamp(Number(hex.massBase) || 0, 0, 100) / 100) * 22;

  const profile = TerrainProfile(hex.terrain);
  threat += profile.concealment * 13;
  if (hex.tunnel && ((hex.scorch || 0) > 15 || knowledge.alert > 55)) threat += 9;

  const here = ParseHexKey(key);
  for (const unit of knowledge.knownUnits) {
    const distance = HexDistance(here, ParseHexKey(unit.key));
    if (distance > 3) continue;
    const falloff = 1 - distance / 4;
    threat += falloff * (6 + unit.strength * 0.22) * (unit.confirmed ? 1 : 0.55);
  }

  for (const brokenKey of knowledge.railBroken) {
    if (HexDistance(here, ParseHexKey(brokenKey)) <= 2) threat += 6;
  }

  threat += knowledge.exposure * 0.12;
  threat += knowledge.alert * 0.05;
  threat += Clamp(12 - NearestStrongholdDistance(state, key) * 2, 0, 12);

  return Clamp(threat, 0, 100);
}

/** 该格对敌方的价值（交通 / 资源 / 政治），0..100。 */
export function EvaluateValue(state, key) {
  const hex = GetHex(state, key);
  if (!hex) return 0;

  let value = 0;
  // 交通
  if (hex.railway) value += 26;
  if (hex.road >= 2) value += 14;
  else if (hex.road === 1) value += 6;
  if (hex.feature === 'Ford') value += 8;
  if (hex.feature === 'Pass') value += 10;

  // 资源
  const yields = hex.yields || {};
  value += Clamp((Number(yields.grain) || 0) * 5, 0, 20);
  value += Clamp((Number(yields.ordnance) || 0) * 3, 0, 8);
  if (hex.feature === 'Quarry') value += 8;
  if (hex.feature === 'SaltPan') value += 8;
  if (hex.feature === 'Terrace') value += 4;

  // 政治
  if (hex.feature === 'CountySeat') value += 26;
  else if (hex.feature === 'Town') value += 14;
  else if (hex.feature === 'Village') value += 7;
  if (hex.feature === 'Shrine') value += 4;

  if (hex.control === 'Base') value += 12;
  else if (hex.control === 'Guerrilla') value += 8;
  else if (hex.control === 'Contested') value += 5;

  value += ((100 - Clamp(Number(hex.massBase) || 0, 0, 100)) / 100) * 6;
  value += Clamp(10 - NearestStrongholdDistance(state, key) * 2, 0, 10);
  value -= Clamp((Number(hex.scorch) || 0) / 12, 0, 8);

  return Clamp(value, 0, 100);
}

// ---------------------------------------------------------------------------
// 战略层：方针选择
// ---------------------------------------------------------------------------

function MeasureBaseScale(state) {
  const order = MapOrder(state);
  if (!order.length) return 0;
  const knowledge = BuildKnowledge(state);
  const denominator = Math.max(12, order.length * 0.28);
  return Clamp01(knowledge.baseKeys.length / denominator);
}

function CountRailBroken(state) {
  return BuildKnowledge(state).railBroken.length;
}

function MeasureEnemyStrength(state) {
  let total = 0;
  for (const stronghold of SafeList(state.strongholds)) total += Math.max(0, Number(stronghold.garrison) || 0);
  for (const enemy of SafeList(state.enemies)) {
    if ((enemy.hp ?? 0) <= 0) continue;
    total += Math.max(1, (Number(enemy.hp) || 0) / 4);
  }
  const memory = ReadAiMemory(state) || {};
  const baseline = Number(memory.strengthBaseline) > 0 ? Number(memory.strengthBaseline) : total;
  if (baseline <= 0) return 1;
  return Clamp(total / baseline, 0, 1.6);
}

function ScoreDoctrines(state, difficulty) {
  const eraKey = ResolveEraKey(state);
  const knowledge = BuildKnowledge(state);
  const exposure = knowledge.exposure / 100;
  const alert = knowledge.alert / 100;
  const baseScale = MeasureBaseScale(state);
  const sabotage = Clamp01(CountRailBroken(state) / 6);
  const strength = MeasureEnemyStrength(state);

  const cooling = ((ReadAiMemory(state) || {}).sweepCooldown || 0) > 0;

  // 合围必须先有目标。玩家滴水不漏时，日军手上没有任何可供定位的线索，
  // 再高的难度也只能去修炮楼、办良民证，而不是对着空山扑一场大扫荡。
  const intelSignal = Clamp01(exposure / 0.6 + alert / 2.4 + sabotage * 0.6);
  const targetingFactor = 0.35 + 0.65 * intelSignal;

  const scores = {};
  for (const key of Object.keys(doctrineDefinitions)) {
    const definition = doctrineDefinitions[key];
    let score = definition.eraAffinity[eraKey] ?? 0.4;
    score += definition.exposureSlope * exposure * difficulty.exposureReaction;
    score += definition.alertSlope * alert;
    score += definition.baseScaleSlope * baseScale;
    score += definition.sabotageSlope * sabotage;
    score += definition.strengthSlope * strength;
    score *= Lerp(1, targetingFactor, definition.targetingWeight ?? 0);
    if (cooling) score *= definition.cooldownFactor ?? 1;
    scores[key] = Math.max(0.01, score);
  }
  scores.Sweep *= difficulty.sweepBias;
  scores.Cage *= difficulty.cageBias;
  scores.Pacify *= difficulty.pacifyBias;
  scores.Retrench *= difficulty.retrenchBias;
  return scores;
}

/** 当前治安战方针。纯读函数，不消耗随机数。 */
export function GetEnemyDoctrine(state, options) {
  const difficulty = ResolveDifficulty(state, options);
  if (options && options.doctrineKey && doctrineDefinitions[options.doctrineKey]) {
    const forced = doctrineDefinitions[options.doctrineKey];
    return {
      key: forced.key, name: forced.name, blurb: forced.blurb, weights: forced.weights,
      scores: null, forced: true, naturalKey: forced.key,
    };
  }

  const scores = ScoreDoctrines(state, difficulty);
  let bestKey = 'Nibble';
  let bestScore = -Infinity;
  for (const key of Object.keys(scores)) {
    if (scores[key] > bestScore + 1e-9) {
      bestScore = scores[key];
      bestKey = key;
    }
  }
  // 迟滞：上一回合的方针只要不落后太多就保持，避免逐回合摇摆。
  // 但跨入新时期时迟滞失效——治安战方针本来就是随战局阶段重新拟定的。
  const memory = ReadAiMemory(state) || {};
  const previous = memory.lastDoctrineKey || null;
  const sameEra = memory.lastEraKey ? memory.lastEraKey === ResolveEraKey(state) : true;
  if (sameEra && previous && doctrineDefinitions[previous] && scores[previous] >= bestScore * 0.92) {
    bestKey = previous;
  }
  const naturalKey = bestKey;

  // 合围已经启动时，前台方针一律显示为"扫荡"；但记忆里保存的仍是底层方针，
  // 否则一次扫荡会把 AI 永久锁死在 Sweep 上。
  if (state && state.sweep && Number(state.sweep.turnsUntil) >= 0) bestKey = 'Sweep';

  const chosen = doctrineDefinitions[bestKey];
  return {
    key: chosen.key, name: chosen.name, blurb: chosen.blurb, weights: chosen.weights,
    scores, forced: false, naturalKey,
  };
}

// ---------------------------------------------------------------------------
// 战役层：扫荡规划
// ---------------------------------------------------------------------------

function SweepPressure(state, difficulty, doctrineKey) {
  const knowledge = BuildKnowledge(state);
  const eraKey = ResolveEraKey(state);
  const eraBias = { Opening: 0.35, Growth: 0.85, Hardship: 1.35, Recovery: 0.8, Counter: 0.4 }[eraKey] ?? 0.8;
  const doctrineBias = { Sweep: 1.9, Cage: 1.1, Nibble: 0.35, Pacify: 0.15, Retrench: 0.1 }[doctrineKey] ?? 0.5;
  // 常数项刻意压得很低：没有暴露就没有情报，没有情报就没有合围。
  const raw = 0.02
    + (knowledge.exposure / 100) * 0.5 * difficulty.exposureReaction
    + (knowledge.alert / 100) * 0.1
    + Clamp01(knowledge.railBroken.length / 6) * 0.14
    + MeasureBaseScale(state) * 0.06;
  return Clamp(raw * difficulty.sweepBias * eraBias * doctrineBias, 0, 0.65);
}

function ChooseSweepTarget(state) {
  const knowledge = BuildKnowledge(state);
  const candidates = knowledge.baseKeys;
  if (!candidates.length) return null;

  const scoreByKey = new Map();
  for (const key of candidates) {
    scoreByKey.set(key, EvaluateThreat(state, key) * 0.62 + EvaluateValue(state, key) * 0.38);
  }
  let bestKey = null;
  let bestScore = -Infinity;
  for (const key of candidates) {
    // 以 2 环邻域聚合，找"根据地核心"而不是孤立一格。
    let cluster = 0;
    for (const neighborKey of KeysInRange(key, 2)) {
      cluster += scoreByKey.get(neighborKey) || 0;
    }
    const distance = NearestStrongholdDistance(state, key);
    if (distance > 13) continue;
    const reach = Clamp(1.2 - distance * 0.05, 0.5, 1.2);
    const total = cluster * reach;
    if (total > bestScore + 1e-9 || (Math.abs(total - bestScore) <= 1e-9 && bestKey && key < bestKey)) {
      bestScore = total;
      bestKey = key;
    }
  }
  return bestKey ? { key: bestKey, score: bestScore } : null;
}

/** 从目标周围选出多路合围轴线（沿公路 / 河谷从各据点向核心），并抽调守备。 */
function BuildSweepAxes(state, targetKey, difficulty, doctrine, rng) {
  const strongholds = SafeList(state.strongholds)
    .filter((item) => item.key && GetHex(state, item.key))
    .map((item) => ({
      stronghold: item,
      distance: HexDistance(ParseHexKey(item.key), ParseHexKey(targetKey)),
      bearing: CompassLabel(item.key, targetKey),
      garrison: Math.max(0, Number(item.garrison) || 0),
    }))
    .filter((entry) => entry.distance >= 1 && entry.distance <= 14)
    .sort((a, b) => (a.distance - b.distance) || (a.stronghold.id < b.stronghold.id ? -1 : 1));

  if (!strongholds.length) return null;

  const wanted = difficulty.axisCountBase + (rng.Chance(0.5) ? difficulty.axisCountBonus : 0);
  const usedBearings = new Set();
  const axes = [];
  // 优先挑不同方位的据点，形成真正的多路合围而不是一条线。
  for (const entry of strongholds) {
    if (axes.length >= wanted) break;
    if (entry.garrison < 4) continue;
    if (usedBearings.has(entry.bearing) && axes.length > 0) continue;
    usedBearings.add(entry.bearing);
    const line = HexLine(ParseHexKey(entry.stronghold.key), ParseHexKey(targetKey))
      .map((cell) => HexKey(cell.q, cell.r))
      .filter((key) => GetHex(state, key));
    if (line.length < 2) continue;
    const draw = Math.min(
      Math.max(1, Math.ceil(entry.garrison * difficulty.garrisonDrawRatio)),
      Math.max(0, entry.garrison - difficulty.garrisonFloor),
    );
    if (draw <= 0) continue;
    axes.push({
      strongholdId: entry.stronghold.id,
      fromKey: entry.stronghold.key,
      bearing: entry.bearing,
      keys: line,
      draw,
      garrisonBefore: entry.garrison,
    });
  }
  if (!axes.length) {
    // 方位受限时退而求其次：只要有兵可抽就凑一路。
    for (const entry of strongholds) {
      if (entry.garrison < 4) continue;
      const line = HexLine(ParseHexKey(entry.stronghold.key), ParseHexKey(targetKey))
        .map((cell) => HexKey(cell.q, cell.r))
        .filter((key) => GetHex(state, key));
      const draw = Math.min(
        Math.max(1, Math.ceil(entry.garrison * difficulty.garrisonDrawRatio)),
        Math.max(0, entry.garrison - difficulty.garrisonFloor),
      );
      if (draw <= 0 || line.length < 2) continue;
      axes.push({
        strongholdId: entry.stronghold.id,
        fromKey: entry.stronghold.key,
        bearing: entry.bearing,
        keys: line,
        draw,
        garrisonBefore: entry.garrison,
      });
      break;
    }
  }
  if (!axes.length) return null;

  const axisKeys = [];
  const seen = new Set();
  for (const axis of axes) {
    for (const key of axis.keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      axisKeys.push(key);
    }
  }

  const drawnTotal = axes.reduce((sum, axis) => sum + axis.draw, 0);
  const fieldSupport = SafeList(state.enemies).filter((enemy) => (enemy.hp ?? 0) > 0).length;
  const strength = Math.round((drawnTotal * 3 + fieldSupport * 2 + 4) * difficulty.strengthScale
    * (doctrine.key === 'Sweep' ? 1.15 : 1));

  return { axes, axisKeys, strength: Math.max(6, strength), drawnTotal };
}

function PlanSweep(state, difficulty, doctrine, rng) {
  const memory = ReadAiMemory(state) || {};
  const cooldown = Math.max(0, Number(memory.sweepCooldown) || 0);
  if (state.sweep) return null;
  if (cooldown > 0) return null;
  const eraKey = ResolveEraKey(state);
  if (eraKey === 'Opening' && (Number(state.turn) || 0) < 2) return null;

  const pressure = SweepPressure(state, difficulty, doctrine.key);
  if (!rng.Chance(pressure)) return null;

  const target = ChooseSweepTarget(state);
  if (!target) return null;
  const composed = BuildSweepAxes(state, target.key, difficulty, doctrine, rng);
  if (!composed) return null;

  return {
    id: `sweep_${state.turn}_${(HashString(`${state.seed || 0}:${state.turn || 0}:${target.key}`) % 9973)}`,
    targetKey: target.key,
    turnsUntil: difficulty.warningTurns,
    strength: composed.strength,
    axisKeys: composed.axisKeys,
    axes: composed.axes,
    declaredTurn: Number(state.turn) || 0,
    doctrineKey: doctrine.key,
    difficultyKey: difficulty.key,
    drawnTotal: composed.drawnTotal,
  };
}

// ---------------------------------------------------------------------------
// 战术层：单位命令与工程
// ---------------------------------------------------------------------------

/** 贪心步进：朝目标走，尽量沿路，走不近就停。 */
function StepPath(state, fromKey, targetKey, movePoints, blocked) {
  const path = [fromKey];
  let current = fromKey;
  let budget = Math.max(0, movePoints);
  const targetPos = ParseHexKey(targetKey);
  for (let guard = 0; guard < 16; guard += 1) {
    if (budget <= 0 || current === targetKey) break;
    const currentDistance = HexDistance(ParseHexKey(current), targetPos);
    let best = null;
    let bestScore = Infinity;
    for (const neighborKey of HexNeighborKeys(current)) {
      const hex = GetHex(state, neighborKey);
      if (!hex) continue;
      if (blocked && blocked.has(neighborKey)) continue;
      const cost = MoveCostFor(hex);
      if (cost > budget + 1e-6) continue;
      const distance = HexDistance(ParseHexKey(neighborKey), targetPos);
      if (distance >= currentDistance) continue;
      const score = distance * 10 + cost - (hex.road || 0) * 0.6 - (hex.railway ? 0.4 : 0);
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = { key: neighborKey, cost };
      }
    }
    if (!best) break;
    budget -= best.cost;
    current = best.key;
    path.push(current);
  }
  return { path, endKey: current, spent: Math.max(0, movePoints - budget) };
}

function ChoosePatrolWaypoint(state, enemy, difficulty, rng) {
  const homeKey = FindHomeKey(state, enemy) || enemy.key;
  const ring = KeysInRange(homeKey, difficulty.patrolRadius).filter((key) => {
    const hex = GetHex(state, key);
    if (!hex) return false;
    return MoveCostFor(hex) <= 2.8;
  });
  if (!ring.length) return enemy.key;
  // 巡逻优先去价值高、威胁不至于太大的格。
  let bestKey = ring[0];
  let bestScore = -Infinity;
  for (const key of ring) {
    const score = EvaluateValue(state, key) - EvaluateThreat(state, key) * 0.35 + rng.Next() * 6;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

function FindHomeKey(state, enemy) {
  if (!enemy) return null;
  const stronghold = SafeList(state.strongholds).find((item) => item.id === enemy.homeStrongholdId);
  if (stronghold && stronghold.key) return stronghold.key;
  const first = SafeList(state.strongholds).find((item) => item.key);
  return first ? first.key : enemy.key;
}

function FindPursuitTarget(state, enemy, difficulty) {
  const knowledge = BuildKnowledge(state);
  if (!knowledge.knownUnits.length) return null;
  const here = ParseHexKey(enemy.key);
  let best = null;
  let bestScore = -Infinity;
  for (const unit of knowledge.knownUnits) {
    const distance = HexDistance(here, ParseHexKey(unit.key));
    if (distance > difficulty.pursuitRange) continue;
    const hex = GetHex(state, unit.key);
    const profile = TerrainProfile(hex ? hex.terrain : 'Plain');
    // 追进林地山地要吃亏，AI 会犹豫。
    const score = (unit.confirmed ? 12 : 5) - distance * 2.2 - profile.concealment * 7
      + (hex && hex.road ? 3 : 0) + (hex && hex.control === 'Enemy' ? 3 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = unit;
    }
  }
  if (!best || bestScore < -4) return null;
  return best;
}

function FindRequisitionTarget(state, enemy, difficulty) {
  const candidates = KeysInRange(enemy.key, 2).filter((key) => {
    const hex = GetHex(state, key);
    if (!hex) return false;
    if (!hex.feature) return false;
    if (hex.feature !== 'Village' && hex.feature !== 'Town' && hex.feature !== 'Terrace') return false;
    if ((hex.scorch || 0) > 70) return false;
    return (hex.yields && (hex.yields.grain || 0) > 0);
  });
  if (!candidates.length) return null;
  let bestKey = null;
  let bestScore = -Infinity;
  for (const key of candidates) {
    const hex = GetHex(state, key);
    const score = (hex.yields.grain || 0) * 6 - (hex.scorch || 0) * 0.15
      - EvaluateThreat(state, key) * 0.2 - HexDistance(ParseHexKey(enemy.key), ParseHexKey(key)) * 2;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

function FindRepairTarget(state, enemy) {
  const knowledge = BuildKnowledge(state);
  if (!knowledge.railBroken.length) return null;
  const here = ParseHexKey(enemy.key);
  let bestKey = null;
  let bestDistance = Infinity;
  for (const key of knowledge.railBroken) {
    const distance = HexDistance(here, ParseHexKey(key));
    if (distance < bestDistance - 1e-9) {
      bestDistance = distance;
      bestKey = key;
    }
  }
  if (bestDistance > 6) return null;
  return bestKey;
}

/** 工程规划：炮楼 / 公路 / 封锁沟，按方针权重与难度预算。 */
function PlanConstruction(state, difficulty, doctrine, rng) {
  const budget = difficulty.buildBudget + (doctrine.key === 'Cage' || doctrine.key === 'Nibble' ? 1 : 0);
  const memory = ReadAiMemory(state) || {};
  const queue = SafeList(memory.construction);
  const projects = [];

  // 先推进在建工程。
  for (const project of queue) {
    projects.push({ ...project, turnsLeft: Math.max(0, (Number(project.turnsLeft) || 0) - 1), advanced: true });
  }

  const openSlots = Math.max(0, budget - projects.filter((item) => item.turnsLeft > 0).length);
  if (openSlots <= 0 || doctrine.key === 'Retrench') return projects;

  // 找边缘格：敌我交界处（自己控制或争夺中，且紧邻根据地）。
  const knowledge = BuildKnowledge(state);
  const frontier = [];
  const occupied = new Set(projects.map((item) => item.key));
  for (const stronghold of SafeList(state.strongholds)) occupied.add(stronghold.key);
  for (const key of MapOrder(state)) {
    if (occupied.has(key)) continue;
    const hex = MapHexes(state)[key];
    if (!hex) continue;
    if (hex.control === 'Base') continue;
    let touchesBase = false;
    for (const neighborKey of HexNeighborKeys(key)) {
      const neighbor = MapHexes(state)[neighborKey];
      if (neighbor && (neighbor.control === 'Base' || neighbor.control === 'Guerrilla')) {
        touchesBase = true;
        break;
      }
    }
    if (!touchesBase) continue;
    if (NearestStrongholdDistance(state, key) > 6) continue;
    frontier.push(key);
  }
  if (!frontier.length) return projects;

  frontier.sort((a, b) => {
    const scoreA = EvaluateValue(state, a) * 0.6 + EvaluateThreat(state, a) * 0.4;
    const scoreB = EvaluateValue(state, b) * 0.6 + EvaluateThreat(state, b) * 0.4;
    if (Math.abs(scoreA - scoreB) > 1e-9) return scoreB - scoreA;
    return a < b ? -1 : 1;
  });

  const weights = doctrine.key === 'Cage'
    ? { Blockhouse: 3, Road: 2.4, Trench: 2.6, Wire: 1.0 }
    : { Blockhouse: 3, Road: 1.6, Trench: 1.0, Wire: 0.8 };

  for (let slot = 0; slot < openSlots && slot < frontier.length; slot += 1) {
    const key = frontier[slot];
    const hex = MapHexes(state)[key];
    let kind = WeightedPick(weights, rng.Next());
    if (kind === 'Road' && (hex.road || 0) >= 2) kind = 'Blockhouse';
    if (kind === 'Trench' && (hex.blockade || 0) >= 3) kind = 'Wire';
    const profile = buildKindProfiles[kind] || buildKindProfiles.Blockhouse;
    projects.push({
      id: `build_${state.turn}_${key}_${kind}`,
      key,
      kind,
      name: profile.name,
      turnsLeft: profile.turns,
      totalTurns: profile.turns,
      advanced: false,
    });
  }
  return projects;
}

// ---------------------------------------------------------------------------
// 计划：PlanEnemyTurn
// ---------------------------------------------------------------------------

/**
 * 规划敌方一个回合。纯函数：不修改 state，随机数从 state.rngState 派生，
 * 计划里带回 rngState 供 ApplyEnemyTurn 续用，保证"同种子同计划 → 同结果"。
 */
export function PlanEnemyTurn(state, options = {}) {
  const difficulty = ResolveDifficulty(state, options);
  const doctrine = GetEnemyDoctrine(state, options);
  const rng = CreateRngCursor(state && state.rngState);
  const turn = Number(state && state.turn) || 0;

  const orders = [];
  const garrisonShifts = [];

  // ---- 战役层：扫荡 ----
  let sweep = null;
  let sweepPhase = 'None';
  if (state && state.sweep) {
    const remaining = Math.max(0, (Number(state.sweep.turnsUntil) || 0) - 1);
    sweep = { ...state.sweep, turnsUntil: remaining, axisKeys: [...SafeList(state.sweep.axisKeys)] };
    sweepPhase = remaining <= 0 ? 'Execute' : 'Prepare';
  } else if (options.forceSweep || (!options.noSweep)) {
    const declared = options.forceSweep
      ? (PlanSweep({ ...state, aiMemory: { ...(ReadAiMemory(state) || {}), sweepCooldown: 0 } }, difficulty, doctrineDefinitions.Sweep, rng)
        || PlanSweep(state, difficulty, doctrine, rng))
      : PlanSweep(state, difficulty, doctrine, rng);
    if (declared) {
      sweep = declared;
      sweepPhase = 'Declare';
      for (const axis of declared.axes) {
        garrisonShifts.push({
          strongholdId: axis.strongholdId,
          key: axis.fromKey,
          delta: -axis.draw,
          before: axis.garrisonBefore,
          after: Math.max(0, axis.garrisonBefore - axis.draw),
          reason: 'SweepDraft',
          note: `抽调守备编入向${axis.bearing}方向的合围支队`,
        });
      }
    }
  }

  // ---- 守备恢复：扫荡结束后逐步补回被抽走的兵 ----
  const memory = ReadAiMemory(state) || {};
  for (const debt of SafeList(memory.garrisonDebt)) {
    if ((Number(debt.turnsLeft) || 0) <= 0) continue;
    if (sweepPhase === 'Declare' || sweepPhase === 'Prepare') continue;
    const stronghold = SafeList(state.strongholds).find((item) => item.id === debt.strongholdId);
    if (!stronghold) continue;
    const back = Math.max(1, Math.round((Number(debt.amount) || 0) * difficulty.reinforceRate));
    garrisonShifts.push({
      strongholdId: debt.strongholdId,
      key: stronghold.key,
      delta: back,
      before: Number(stronghold.garrison) || 0,
      after: (Number(stronghold.garrison) || 0) + back,
      reason: 'Reinforce',
      note: '扫荡部队归建，守备回补',
    });
  }

  // ---- 战术层：逐单位下达命令 ----
  const enemies = SafeList(state && state.enemies).filter((enemy) => (enemy.hp ?? 1) > 0);
  const playerKeys = new Set(SafeList(state && state.units).filter((unit) => (unit.hp ?? 1) > 0).map((unit) => unit.key));
  const assignedSweepUnits = new Set();

  if (sweep && (sweepPhase === 'Prepare' || sweepPhase === 'Execute')) {
    // 参与合围的部队：离轴线最近的若干支。
    const axisSet = new Set(sweep.axisKeys);
    const sorted = enemies
      .map((enemy) => ({
        enemy,
        distance: Math.min(...sweep.axisKeys.map((key) => HexDistance(ParseHexKey(enemy.key), ParseHexKey(key))), 99),
      }))
      .filter((entry) => entry.distance <= 8)
      .sort((a, b) => (a.distance - b.distance) || (a.enemy.id < b.enemy.id ? -1 : 1));
    const quota = Math.max(2, Math.min(sorted.length, difficulty.axisCountBase + difficulty.axisCountBonus + 2));
    for (let index = 0; index < quota && index < sorted.length; index += 1) {
      assignedSweepUnits.add(sorted[index].enemy.id);
    }
    void axisSet;
  }

  for (const enemy of enemies) {
    const stats = ResolveEnemyStats(enemy.type);
    const movePoints = Math.max(1, Number(enemy.moves) > 0 ? Number(enemy.moves) : stats.maxMoves);
    const doctrineWeights = doctrine.weights;

    // 收缩方针 / 重伤：撤回据点。
    const hurt = (enemy.hp ?? 10) <= (enemy.maxHp ?? 10) * 0.35;
    if (hurt || (doctrine.key === 'Retrench' && rng.Chance(0.45))) {
      const homeKey = FindHomeKey(state, enemy);
      const walk = StepPath(state, enemy.key, homeKey, movePoints, playerKeys);
      orders.push(MakeOrder('Withdraw', enemy.id, enemy.key, walk.endKey, {
        path: walk.path,
        reason: hurt ? '减员过半，撤回据点整补' : '兵力被抽调，外围据点收缩',
        intent: 'Withdraw',
        targetKey: homeKey,
      }));
      continue;
    }

    // 扫荡执行 / 集结。
    if (sweep && assignedSweepUnits.has(enemy.id)) {
      const walk = StepPath(state, enemy.key, sweep.targetKey, movePoints, null);
      orders.push(MakeOrder('Sweep', enemy.id, enemy.key, walk.endKey, {
        path: walk.path,
        targetKey: sweep.targetKey,
        phase: sweepPhase,
        intent: sweepPhase === 'Execute' ? 'Sweep' : 'Stage',
        etaTurns: sweep.turnsUntil,
        sweepId: sweep.id,
      }));
      continue;
    }

    // 追击已暴露的我方部队。
    const pursuit = doctrineWeights.pursue > 0.4 ? FindPursuitTarget(state, enemy, difficulty) : null;
    if (pursuit) {
      const distance = HexDistance(ParseHexKey(enemy.key), ParseHexKey(pursuit.key));
      if (distance <= 1) {
        orders.push(MakeOrder('Attack', enemy.id, enemy.key, pursuit.key, {
          targetUnitId: pursuit.id,
          strength: stats.attack,
          intent: 'Pursue',
        }));
      } else {
        const walk = StepPath(state, enemy.key, pursuit.key, movePoints, playerKeys);
        orders.push(MakeOrder('Move', enemy.id, enemy.key, walk.endKey, {
          path: walk.path,
          targetKey: pursuit.key,
          intent: 'Pursue',
          etaTurns: Math.max(1, Math.ceil((distance - 1) / Math.max(1, movePoints))),
        }));
      }
      continue;
    }

    // 工兵抢修铁路。
    const repairKey = (stats.role === 'Engineer' || doctrineWeights.repair >= 1.2) ? FindRepairTarget(state, enemy) : null;
    if (repairKey) {
      if (repairKey === enemy.key) {
        orders.push(MakeOrder('Repair', enemy.id, enemy.key, repairKey, { kind: 'RailRepair', intent: 'Repair' }));
      } else {
        const walk = StepPath(state, enemy.key, repairKey, movePoints, playerKeys);
        orders.push(MakeOrder('Move', enemy.id, enemy.key, walk.endKey, {
          path: walk.path,
          targetKey: repairKey,
          intent: 'Repair',
        }));
      }
      continue;
    }

    // 征粮 / 经济封锁。
    if (rng.Chance(Clamp01(doctrineWeights.requisition * 0.32 * difficulty.requisitionRate))) {
      const grainKey = FindRequisitionTarget(state, enemy, difficulty);
      if (grainKey) {
        if (grainKey === enemy.key) {
          orders.push(MakeOrder('Requisition', enemy.id, enemy.key, grainKey, {
            harshness: difficulty.harshness * (doctrine.key === 'Pacify' ? 0.55 : 1),
            intent: 'Requisition',
            pacify: doctrine.key === 'Pacify',
          }));
        } else {
          const walk = StepPath(state, enemy.key, grainKey, movePoints, playerKeys);
          orders.push(MakeOrder('Move', enemy.id, enemy.key, walk.endKey, {
            path: walk.path,
            targetKey: grainKey,
            intent: 'Requisition',
          }));
        }
        continue;
      }
    }

    // 驻防：伤亡后或据点空虚时留守。
    const homeKey = FindHomeKey(state, enemy);
    if (homeKey === enemy.key && rng.Chance(Clamp01(doctrineWeights.garrison * 0.28))) {
      orders.push(MakeOrder('Garrison', enemy.id, enemy.key, enemy.key, {
        intent: doctrine.key === 'Pacify' ? 'Pacify' : 'Garrison',
        note: doctrine.key === 'Pacify' ? '清查户口、核发良民证' : '据点守备',
      }));
      continue;
    }

    // 默认：巡逻。
    const waypoint = ChoosePatrolWaypoint(state, enemy, difficulty, rng);
    const walk = StepPath(state, enemy.key, waypoint, movePoints, playerKeys);
    orders.push(MakeOrder('Patrol', enemy.id, enemy.key, walk.endKey, {
      path: walk.path,
      targetKey: waypoint,
      intent: doctrine.key === 'Pacify' ? 'Pacify' : 'Patrol',
    }));
  }

  // ---- 工程 ----
  const construction = PlanConstruction(state, difficulty, doctrine, rng);
  for (const project of construction) {
    if (project.advanced) continue;
    orders.push(MakeOrder('Build', null, project.key, project.key, {
      kind: project.kind,
      name: project.name,
      projectId: project.id,
      turns: project.totalTurns,
      intent: 'Build',
    }));
  }

  const forecast = sweep
    ? {
      targetKey: sweep.targetKey,
      turnsUntil: sweep.turnsUntil,
      strength: sweep.strength,
      axisKeys: [...sweep.axisKeys],
      confidence: 1,
      phase: sweepPhase,
    }
    : null;

  return {
    version: 1,
    turn,
    doctrineKey: doctrine.key,
    doctrineName: doctrine.name,
    naturalDoctrineKey: doctrine.naturalKey || doctrine.key,
    difficultyKey: difficulty.key,
    orders,
    sweep: sweep ? { ...sweep, phase: sweepPhase } : null,
    garrisonShifts,
    construction,
    forecast,
    rngState: rng.state,
  };
}

function MakeOrder(kind, unitId, fromKey, toKey, payload) {
  return { kind, unitId: unitId ?? null, fromKey: fromKey ?? null, toKey: toKey ?? null, payload: payload || {} };
}

// ---------------------------------------------------------------------------
// 执行：ApplyEnemyTurn（不可变更新）
// ---------------------------------------------------------------------------

function CloneAiMemory(memory) {
  const source = memory || {};
  return {
    sweepCooldown: Number(source.sweepCooldown) || 0,
    sweepCount: Number(source.sweepCount) || 0,
    lastDoctrineKey: source.lastDoctrineKey || null,
    lastEraKey: source.lastEraKey || null,
    doctrineHistory: SafeList(source.doctrineHistory).slice(-40),
    construction: SafeList(source.construction).map((item) => ({ ...item })),
    garrisonDebt: SafeList(source.garrisonDebt).map((item) => ({ ...item })),
    strengthBaseline: Number(source.strengthBaseline) || 0,
    contactSeeded: Boolean(source.contactSeeded),
  };
}

function CloneState(state) {
  return {
    ...state,
    map: { ...(state.map || {}), hexes: { ...MapHexes(state) } },
    bases: SafeList(state.bases).map((item) => ({ ...item })),
    units: SafeList(state.units).map((item) => ({ ...item })),
    enemies: SafeList(state.enemies).map((item) => ({ ...item })),
    strongholds: SafeList(state.strongholds).map((item) => ({ ...item })),
    stock: { ...(state.stock || {}) },
    ledger: { ...(state.ledger || {}) },
    log: SafeList(state.log).slice(),
    sweep: state.sweep ? { ...state.sweep, axisKeys: [...SafeList(state.sweep.axisKeys)] } : null,
    aiMemory: CloneAiMemory(ReadAiMemory(state)),
  };
}

function MutateHex(next, key, changes) {
  const hex = next.map.hexes[key];
  if (!hex) return null;
  const clone = {
    ...hex,
    yields: { ...(hex.yields || {}) },
    works: SafeList(hex.works).slice(),
  };
  Object.assign(clone, changes);
  next.map.hexes[key] = clone;
  return clone;
}

function AppendLog(next, entry) {
  next.log.push({
    turn: Number(next.turn) || 0,
    side: 'Enemy',
    kind: entry.kind || 'Enemy',
    key: entry.key || null,
    text: entry.text,
  });
}

function AddLedger(next, field, amount) {
  if (!amount) return;
  const current = Number(next.ledger[field]) || 0;
  next.ledger[field] = current + amount;
}

function FindEnemy(next, unitId) {
  return next.enemies.find((enemy) => enemy.id === unitId) || null;
}

function FindPlayerUnit(next, unitId) {
  return next.units.find((unit) => unit.id === unitId) || null;
}

/** 我方视野：单位 2 环、根据地 3 环、情报覆盖 ≥55 的格。 */
function ComputePlayerVision(state) {
  const visible = new Set();
  for (const unit of SafeList(state.units)) {
    if (!unit.key || (unit.hp ?? 1) <= 0) continue;
    const radius = unit.type === 'Scout' || unit.type === 'Recon' ? 3 : 2;
    for (const key of KeysInRange(unit.key, radius)) visible.add(key);
  }
  for (const base of SafeList(state.bases)) {
    if (!base.key) continue;
    for (const key of KeysInRange(base.key, 3)) visible.add(key);
  }
  for (const key of MapOrder(state)) {
    const hex = MapHexes(state)[key];
    if (hex && (Number(hex.intel) || 0) >= 55) visible.add(key);
  }
  return visible;
}

function RefreshEnemyVisibility(next) {
  const visible = ComputePlayerVision(next);
  for (let index = 0; index < next.enemies.length; index += 1) {
    const enemy = next.enemies[index];
    if ((enemy.hp ?? 1) <= 0) continue;
    const seen = visible.has(enemy.key);
    if (enemy.visibleToPlayer !== seen) {
      next.enemies[index] = { ...enemy, visibleToPlayer: seen };
    }
  }
  return visible;
}

/**
 * 第 1 回合可见性红线（硬性）：
 * 执行完敌方回合后，玩家必须看得见 ≥2 支敌军，且 ≥1 个可攻击目标在我方行动范围内。
 * 做法不是给玩家开图，而是把最近的敌军巡逻队真的调到我方警戒哨眼前——
 * 落点一律取自"玩家真实视野集合"，保证 RefreshEnemyVisibility 复算后仍然可见。
 */
function EnsureOpeningContact(next, difficulty) {
  const playerUnits = next.units.filter((unit) => (unit.hp ?? 1) > 0 && unit.key);
  const living = next.enemies.filter((enemy) => (enemy.hp ?? 1) > 0);
  if (!playerUnits.length || !living.length) return;

  const visible = ComputePlayerVision(next);
  const anchor = playerUnits[0];
  const anchorPos = ParseHexKey(anchor.key);
  const reach = Math.max(2, Number(anchor.moves) || Number(anchor.maxMoves) || 2);
  const occupied = new Set(playerUnits.map((unit) => unit.key));

  // 候选落点：玩家看得见、且在其行动半径内的格。优先距离 2（看得见也打得着）、优先沿路与村落。
  const BuildSlots = (allowRough) => Array.from(visible)
    .filter((key) => {
      const hex = next.map.hexes[key];
      if (!hex || occupied.has(key)) return false;
      if (!allowRough && MoveCostFor(hex) > 3.0) return false;
      const distance = HexDistance(anchorPos, ParseHexKey(key));
      return distance >= 1 && distance <= reach + 1;
    })
    .sort((a, b) => {
      const hexA = next.map.hexes[a];
      const hexB = next.map.hexes[b];
      const rankA = Math.abs(HexDistance(anchorPos, ParseHexKey(a)) - 2) * 10
        - ((hexA.road || 0) * 2 + (hexA.feature ? 1 : 0));
      const rankB = Math.abs(HexDistance(anchorPos, ParseHexKey(b)) - 2) * 10
        - ((hexB.road || 0) * 2 + (hexB.feature ? 1 : 0));
      if (rankA !== rankB) return rankA - rankB;
      return a < b ? -1 : 1;
    });

  let slots = BuildSlots(false);
  if (slots.length < 2) slots = BuildSlots(true);
  if (!slots.length) return;

  const seenIds = new Set(living.filter((enemy) => visible.has(enemy.key)).map((enemy) => enemy.id));
  const usedSlots = new Set(living.filter((enemy) => seenIds.has(enemy.id)).map((enemy) => enemy.key));

  const ordered = living
    .map((enemy) => ({ enemy, distance: HexDistance(anchorPos, ParseHexKey(enemy.key)) }))
    .sort((a, b) => (a.distance - b.distance) || (a.enemy.id < b.enemy.id ? -1 : 1));

  const PlaceEnemy = (enemy, targetKey) => {
    const index = next.enemies.findIndex((item) => item.id === enemy.id);
    if (index < 0) return;
    usedSlots.add(targetKey);
    next.enemies[index] = {
      ...next.enemies[index],
      key: targetKey,
      visibleToPlayer: true,
      intent: 'Patrol',
      intentDetail: {
        kind: 'Patrol',
        targetKey,
        etaTurns: 0,
        note: '沿路例行搜索，与我警戒哨遭遇',
        doctrineKey: 'Nibble',
      },
    };
    MutateHex(next, targetKey, { explored: true });
    seenIds.add(enemy.id);
    AppendLog(next, {
      kind: 'Contact',
      key: targetKey,
      text: `敌${ResolveEnemyStats(enemy.type).name}出现在 ${HexLabel(next, targetKey)}，距我警戒哨 ${HexDistance(anchorPos, ParseHexKey(targetKey))} 格。`,
    });
  };

  for (const entry of ordered) {
    if (seenIds.size >= 2) break;
    if (seenIds.has(entry.enemy.id)) continue;
    const targetKey = slots.find((key) => !usedSlots.has(key));
    if (!targetKey) break;
    PlaceEnemy(entry.enemy, targetKey);
  }

  // 至少 1 个可攻击目标（敌军单位或据点）落在行动范围内。
  const inReach = (key) => HexDistance(anchorPos, ParseHexKey(key)) <= reach + 1;
  const hasTarget = next.enemies.some((enemy) => (enemy.hp ?? 1) > 0 && enemy.visibleToPlayer && inReach(enemy.key))
    || next.strongholds.some((item) => item.key && inReach(item.key));
  if (!hasTarget) {
    const targetKey = slots.find((key) => !usedSlots.has(key)) || slots[0];
    const candidate = ordered.length ? ordered[0].enemy : null;
    if (targetKey && candidate) PlaceEnemy(candidate, targetKey);
  }
  next.aiMemory.contactSeeded = true;
  void difficulty;
}

// --- 单条命令的执行 ---------------------------------------------------------

function ApplyMoveLike(next, order, report) {
  const enemy = FindEnemy(next, order.unitId);
  if (!enemy || (enemy.hp ?? 1) <= 0) return;
  const index = next.enemies.findIndex((item) => item.id === enemy.id);
  const destination = order.toKey && next.map.hexes[order.toKey] ? order.toKey : enemy.key;
  const intentKind = order.payload.intent || (order.kind === 'Sweep' ? 'Sweep' : 'Patrol');
  next.enemies[index] = {
    ...enemy,
    key: destination,
    moves: 0,
    intent: intentKind,
    intentDetail: {
      kind: intentKind,
      targetKey: order.payload.targetKey || destination,
      etaTurns: Number(order.payload.etaTurns) || 0,
      note: order.payload.reason || order.payload.note || '',
      doctrineKey: report.doctrineKey,
    },
  };
  report.moved += destination === enemy.key ? 0 : 1;
}

/** 我方单位在某格的防御分。用于内置简化结算，与具体血量刻度无关。 */
function DefenceScoreFor(next, unit, rng) {
  const stats = ResolvePlayerStats(unit.type);
  const hex = next.map.hexes[unit.key];
  const profile = TerrainProfile(hex ? hex.terrain : 'Plain');
  const massCover = ((Number(hex && hex.massBase) || 0) / 100) * 0.3;
  return Math.max(1, stats.defence
    * (1 + profile.defenceBonus + (hex && hex.tunnel ? 0.35 : 0) + (unit.hidden ? 0.5 : 0) + massCover)
    * (0.8 + rng.Next() * 0.5));
}

/**
 * 内置简化战斗结算（Script_Combat 缺席、拒绝敌方发起的攻击或抛错时使用）。
 * 伤害一律按目标 maxHp 的比例计算，因此不依赖任何一套具体的血量刻度。
 */
function ResolveSimpleAttack(next, enemy, target, rng, difficulty) {
  const stats = ResolveEnemyStats(enemy.type);
  const attackScore = Math.max(1, stats.attack * difficulty.strengthScale * (0.8 + rng.Next() * 0.5));
  const defenceScore = DefenceScoreFor(next, target, rng);
  const share = attackScore / (attackScore + defenceScore);
  const targetMaxHp = Math.max(1, PickNumber(target.maxHp, target.hp, ResolvePlayerStats(target.type).maxHp));
  const enemyMaxHp = Math.max(1, PickNumber(enemy.maxHp, enemy.hp, stats.maxHp));
  return {
    damage: Math.max(0, Math.round(targetMaxHp * Clamp(share * 0.34, 0.015, 0.35))),
    backlash: Math.max(0, Math.round(enemyMaxHp * Clamp((1 - share) * 0.16, 0, 0.2))),
  };
}

function ApplyAttack(next, order, rng, difficulty, report, options) {
  const enemy = FindEnemy(next, order.unitId);
  if (!enemy || (enemy.hp ?? 1) <= 0) return;
  const targetId = order.payload.targetUnitId;
  const target = targetId ? FindPlayerUnit(next, targetId) : null;
  if (!target || (target.hp ?? 1) <= 0) {
    ApplyMoveLike(next, { ...order, kind: 'Move' }, report);
    return;
  }

  // 优先尝试外部战斗模块（若已就位）。注意 Script_Combat.ResolveAttack 是"我方发起攻击"的
  // 结算入口，敌方发起时它会返回 valid:false —— 这种情况必须落到内置结算，否则等于打了个空拳。
  const combat = (options && options.combat) || externalCombatModule;
  let outcome = null;
  if (combat && typeof combat.ResolveAttack === 'function') {
    try {
      const result = combat.ResolveAttack(next, enemy.id, target.key, { side: 'Enemy', attackerIsEnemy: true });
      const accepted = result && result.report ? result.report.valid !== false : Boolean(result);
      if (accepted && result.nextState && result.nextState !== next
        && result.nextState.map && Array.isArray(result.nextState.units)) {
        const adopted = result.nextState;
        next.map = adopted.map;
        next.units = adopted.units.map((item) => ({ ...item }));
        next.enemies = SafeList(adopted.enemies).map((item) => ({ ...item }));
        if (adopted.rngState !== undefined) next.rngState = adopted.rngState;
        outcome = { external: true };
        report.attacks += 1;
      }
    } catch (error) {
      outcome = null;
    }
  }

  if (!outcome) {
    const simple = ResolveSimpleAttack(next, enemy, target, rng, difficulty);
    const targetIndex = next.units.findIndex((item) => item.id === target.id);
    const nextHp = Math.max(0, (Number(target.hp) || 0) - simple.damage);
    next.units[targetIndex] = { ...target, hp: nextHp, hidden: false, fatigue: (Number(target.fatigue) || 0) + 1 };
    const enemyIndex = next.enemies.findIndex((item) => item.id === enemy.id);
    next.enemies[enemyIndex] = {
      ...enemy,
      hp: Math.max(0, (Number(enemy.hp) || 0) - simple.backlash),
      moves: 0,
      intent: 'Pursue',
      intentDetail: { kind: 'Pursue', targetKey: target.key, etaTurns: 0, note: '与我部接火', doctrineKey: report.doctrineKey },
    };
    report.attacks += 1;
    report.playerHpLost += simple.damage;
    AppendLog(next, {
      kind: 'Combat',
      key: target.key,
      text: `敌${ResolveEnemyStats(enemy.type).name}在 ${HexLabel(next, target.key)} 咬住我一部，我减员 ${simple.damage}。`,
    });
    if (nextHp <= 0) {
      AddLedger(next, 'cadreLost', 1);
      AppendLog(next, { kind: 'Combat', key: target.key, text: `我一部在 ${HexLabel(next, target.key)} 被打散，骨干失散。` });
    }
  }
}

function ApplyBuild(next, order, report) {
  // 建造只在完成时落地，进度由 aiMemory.construction 管理。
  const project = next.aiMemory.construction.find((item) => item.id === order.payload.projectId);
  if (!project) return;
  report.builds += 1;
  void order;
}

function CompleteConstruction(next, project, report) {
  const hex = next.map.hexes[project.key];
  if (!hex) return;
  if (project.kind === 'Blockhouse') {
    const exists = next.strongholds.some((item) => item.key === project.key);
    if (!exists) {
      next.strongholds.push({
        id: `sh_${project.key}_${next.turn}`,
        key: project.key,
        type: 'Blockhouse',
        garrison: buildKindProfiles.Blockhouse.garrison,
        supply: 3,
        alarm: 0,
      });
    }
    MutateHex(next, project.key, { control: hex.control === 'Base' ? 'Contested' : 'Enemy' });
    AppendLog(next, { kind: 'Build', key: project.key, text: `敌在 ${HexLabel(next, project.key)} 筑成炮楼一座，视界压到我村口。` });
  } else if (project.kind === 'Road') {
    MutateHex(next, project.key, { road: Math.min(2, (hex.road || 0) + 1) });
    AppendLog(next, { kind: 'Build', key: project.key, text: `敌修通 ${HexLabel(next, project.key)} 一段公路，汽车可直达。` });
  } else if (project.kind === 'Trench') {
    MutateHex(next, project.key, { blockade: Math.min(3, (hex.blockade || 0) + 1) });
    AppendLog(next, { kind: 'Build', key: project.key, text: `敌在 ${HexLabel(next, project.key)} 挖出封锁沟，两岸往来断绝。` });
    AddLedger(next, 'displaced', 4);
  } else if (project.kind === 'Wire') {
    MutateHex(next, project.key, { blockade: Math.min(3, (hex.blockade || 0) + 1) });
    AppendLog(next, { kind: 'Build', key: project.key, text: `敌在 ${HexLabel(next, project.key)} 架起鹿砦铁丝网。` });
  }
  report.completedBuilds += 1;
  report.headlines.push(`${HexLabel(next, project.key)} 敌工事竣工：${project.name}`);
}

function ApplyRepair(next, order, rng, report) {
  const key = order.toKey;
  const hex = next.map.hexes[key];
  if (!hex) return;
  if ((hex.railBroken || 0) <= 0) return;
  // 我方部队在旁 / 群众基础高 → 抢修受阻。
  const guarded = next.units.some((unit) => (unit.hp ?? 1) > 0 && HexDistance(ParseHexKey(unit.key), ParseHexKey(key)) <= 1);
  const resistance = Clamp01((Number(hex.massBase) || 0) / 220 + (guarded ? 0.45 : 0));
  if (rng.Next() < resistance) {
    AppendLog(next, { kind: 'Repair', key, text: `敌工兵在 ${HexLabel(next, key)} 抢修铁路，被我民兵与群众迟滞，未能通车。` });
    report.repairsBlocked += 1;
    return;
  }
  MutateHex(next, key, { railBroken: Math.max(0, (hex.railBroken || 0) - 1) });
  report.repairs += 1;
  AppendLog(next, { kind: 'Repair', key, text: `敌抢修 ${HexLabel(next, key)} 铁路一段，路轨复位。` });
  const enemy = FindEnemy(next, order.unitId);
  if (enemy) {
    const index = next.enemies.findIndex((item) => item.id === enemy.id);
    next.enemies[index] = {
      ...enemy,
      moves: 0,
      intent: 'Repair',
      intentDetail: { kind: 'Repair', targetKey: key, etaTurns: 0, note: '抢修被破袭路段', doctrineKey: report.doctrineKey },
    };
  }
}

function ApplyRequisition(next, order, rng, difficulty, report) {
  const key = order.toKey;
  const hex = next.map.hexes[key];
  if (!hex) return;
  const harshness = Clamp(Number(order.payload.harshness) || difficulty.harshness, 0.2, 1.2);
  const grain = Math.max(1, Math.round(((hex.yields && hex.yields.grain) || 1) * (2 + rng.Next() * 4) * harshness));
  // 红线：抢粮只进代价账本，玩家不得到任何资源。
  AddLedger(next, 'grainSeized', grain);
  const displaced = Math.round(grain * 0.35 * harshness);
  AddLedger(next, 'displaced', displaced);
  if (harshness > 0.85 && rng.Chance(0.22)) {
    AddLedger(next, 'villagesBurned', 1);
    AddLedger(next, 'civilianDeaths', 2 + Math.round(rng.Next() * 4));
    MutateHex(next, key, { scorch: Clamp((hex.scorch || 0) + 18, 0, 100) });
    AppendLog(next, { kind: 'Requisition', key, text: `${HexLabel(next, key)} 被纵火，房屋成排烧毁，村民流散。` });
    report.villagesBurned += 1;
  } else {
    MutateHex(next, key, { scorch: Clamp((hex.scorch || 0) + 5, 0, 100) });
    AppendLog(next, { kind: 'Requisition', key, text: `敌在 ${HexLabel(next, key)} 征发粮秣 ${grain} 石，村中口粮见底。` });
  }
  // 强征反使民心倒向我方；怀柔式"以粮换良民证"则相反。
  const updated = next.map.hexes[key];
  const massDelta = order.payload.pacify ? -3 : Math.round(2 + harshness * 3);
  MutateHex(next, key, { massBase: Clamp((Number(updated.massBase) || 0) + massDelta, 0, 100) });
  report.grainSeized += grain;
  const enemy = FindEnemy(next, order.unitId);
  if (enemy) {
    const index = next.enemies.findIndex((item) => item.id === enemy.id);
    next.enemies[index] = {
      ...enemy,
      moves: 0,
      intent: 'Requisition',
      intentDetail: { kind: 'Requisition', targetKey: key, etaTurns: 0, note: '就地征发', doctrineKey: report.doctrineKey },
    };
  }
}

function ApplyGarrison(next, order, report) {
  const enemy = FindEnemy(next, order.unitId);
  if (!enemy) return;
  const index = next.enemies.findIndex((item) => item.id === enemy.id);
  const intentKind = order.payload.intent || 'Garrison';
  next.enemies[index] = {
    ...enemy,
    moves: 0,
    intent: intentKind,
    intentDetail: {
      kind: intentKind,
      targetKey: enemy.key,
      etaTurns: 0,
      note: order.payload.note || '守备',
      doctrineKey: report.doctrineKey,
    },
  };
  if (intentKind === 'Pacify') {
    const hex = next.map.hexes[enemy.key];
    if (hex) {
      MutateHex(next, enemy.key, { massBase: Clamp((Number(hex.massBase) || 0) - 2, 0, 100) });
      report.pacified += 1;
    }
  }
  report.garrisoned += 1;
}

function ApplyWithdraw(next, order, report) {
  ApplyMoveLike(next, order, report);
  report.withdrawals += 1;
}

// --- 扫荡结算 --------------------------------------------------------------

function ResolveSweepOutcome(next, sweep, rng, difficulty, report, options) {
  const combat = (options && options.combat) || externalCombatModule;
  if (combat && typeof combat.ResolveSweepBattle === 'function') {
    try {
      const result = combat.ResolveSweepBattle(next, sweep);
      const accepted = result && result.report ? result.report.valid !== false : Boolean(result);
      if (accepted && result.nextState && result.nextState !== next && result.nextState.map) {
        const adopted = result.nextState;
        next.map = adopted.map;
        next.units = SafeList(adopted.units).map((item) => ({ ...item }));
        next.enemies = SafeList(adopted.enemies).map((item) => ({ ...item }));
        next.ledger = { ...(adopted.ledger || next.ledger) };
        if (Number.isFinite(adopted.exposure)) next.exposure = adopted.exposure;
        if (Number.isFinite(adopted.alert)) next.alert = adopted.alert;
        report.sweepResolvedExternally = true;
        report.sweepsExecuted += 1;
        report.headlines.push(`大扫荡：${HexLabel(next, sweep.targetKey)}`);
        return;
      }
    } catch (error) {
      report.sweepResolvedExternally = false;
    }
  }

  // 内置结算：合围圈 = 目标 2 环。
  const ringKeys = KeysInRange(sweep.targetKey, 2).filter((key) => next.map.hexes[key]);
  const caught = [];
  let evaded = 0;
  for (const unit of next.units) {
    if ((unit.hp ?? 1) <= 0 || !ringKeys.includes(unit.key)) continue;
    const hex = next.map.hexes[unit.key];
    const profile = TerrainProfile(hex ? hex.terrain : 'Plain');
    // 隐蔽 + 地道 + 群众掩护 = 跳出合围圈。
    const escapeChance = Clamp01(
      0.2 + (unit.hidden ? 0.3 : 0) + (hex && hex.tunnel ? 0.22 : 0)
      + profile.concealment * 0.2 + ((Number(hex && hex.massBase) || 0) / 100) * 0.2
      - difficulty.strengthScale * 0.12,
    );
    if (rng.Next() < escapeChance) {
      evaded += 1;
      continue;
    }
    caught.push(unit);
  }

  const strength = Math.max(4, Number(sweep.strength) || 8);
  const pressure = strength / Math.max(1, caught.length);
  let inflicted = 0;
  for (const unit of caught) {
    const index = next.units.findIndex((item) => item.id === unit.id);
    // 同样按 maxHp 比例结算，兼容任何血量刻度。
    const defenceScore = DefenceScoreFor(next, unit, rng);
    const share = pressure / (pressure + defenceScore);
    const unitMaxHp = Math.max(1, PickNumber(unit.maxHp, unit.hp, ResolvePlayerStats(unit.type).maxHp));
    const damage = Math.max(1, Math.round(unitMaxHp * Clamp(share * 0.72, 0.05, 0.6) * (0.6 + rng.Next() * 0.6)));
    const nextHp = Math.max(0, (Number(unit.hp) || 0) - damage);
    next.units[index] = { ...unit, hp: nextHp, hidden: false, fatigue: (Number(unit.fatigue) || 0) + 2 };
    inflicted += damage;
    if (nextHp <= 0) AddLedger(next, 'cadreLost', 1);
  }
  report.playerHpLost += inflicted;

  // 对根据地的破坏：三光在困难期与高难度下最重。
  const eraKey = ResolveEraKey(next);
  const severity = difficulty.harshness * (eraKey === 'Hardship' ? 1.35 : 1) * (0.7 + rng.Next() * 0.6);
  let flipped = 0;
  for (const key of ringKeys) {
    const hex = next.map.hexes[key];
    if (!hex) continue;
    const scorchDelta = Math.round(8 * severity);
    const massDelta = -Math.round(4 * severity);
    let control = hex.control;
    if (control === 'Base' && rng.Next() < 0.28 * severity) control = 'Contested';
    else if (control === 'Guerrilla' && rng.Next() < 0.34 * severity) control = 'Contested';
    else if (control === 'Contested' && rng.Next() < 0.2 * severity) control = 'Enemy';
    if (control !== hex.control) flipped += 1;
    MutateHex(next, key, {
      scorch: Clamp((hex.scorch || 0) + scorchDelta, 0, 100),
      massBase: Clamp((Number(hex.massBase) || 0) + massDelta, 0, 100),
      control,
    });
    if (hex.feature === 'Village' && rng.Next() < 0.22 * severity) {
      AddLedger(next, 'villagesBurned', 1);
      AddLedger(next, 'civilianDeaths', Math.round(3 + rng.Next() * 8 * severity));
      AddLedger(next, 'displaced', Math.round(12 + rng.Next() * 24 * severity));
      report.villagesBurned += 1;
    } else {
      AddLedger(next, 'displaced', Math.round(3 * severity));
    }
  }
  report.hexesLost += flipped;
  report.sweepsExecuted += 1;

  const failed = caught.length === 0;
  if (failed) {
    // 扑空：群众掩护成功，敌军疲于奔命。
    for (const key of ringKeys) {
      const hex = next.map.hexes[key];
      if (!hex) continue;
      MutateHex(next, key, { massBase: Clamp((Number(hex.massBase) || 0) + 3, 0, 100) });
    }
    AppendLog(next, {
      kind: 'Sweep',
      key: sweep.targetKey,
      text: `敌以 ${sweep.axes ? sweep.axes.length : 1} 路合围 ${HexLabel(next, sweep.targetKey)}，我部提前转移，合围圈内只剩空村。`,
    });
    report.headlines.push(`扫荡扑空：${HexLabel(next, sweep.targetKey)}`);
    next.exposure = Clamp((Number(next.exposure) || 0) - 18, 0, 100);
  } else {
    AppendLog(next, {
      kind: 'Sweep',
      key: sweep.targetKey,
      text: `敌合围 ${HexLabel(next, sweep.targetKey)}，我 ${caught.length} 部被咬住、${evaded} 部跳出合围圈，减员 ${inflicted}。`,
    });
    report.headlines.push(`大扫荡：${HexLabel(next, sweep.targetKey)}（我被围 ${caught.length} 部）`);
    next.exposure = Clamp((Number(next.exposure) || 0) - 12, 0, 100);
  }
  next.alert = Clamp((Number(next.alert) || 0) + 8, 0, 100);
}

// --- 主入口 ----------------------------------------------------------------

/** 执行敌方回合。返回全新的 state，绝不修改传入对象。 */
export function ApplyEnemyTurn(state, plan, options = {}) {
  const workingPlan = plan || PlanEnemyTurn(state, options);
  const difficulty = difficultyDefinitions[workingPlan.difficultyKey] || ResolveDifficulty(state, options);
  const next = CloneState(state);
  const rng = CreateRngCursor(workingPlan.rngState !== undefined ? workingPlan.rngState : state.rngState);
  const logStart = next.log.length;

  const report = {
    turn: Number(next.turn) || 0,
    doctrineKey: workingPlan.doctrineKey,
    doctrineName: workingPlan.doctrineName,
    difficultyKey: difficulty.key,
    headlines: [],
    moved: 0,
    attacks: 0,
    builds: 0,
    completedBuilds: 0,
    repairs: 0,
    repairsBlocked: 0,
    garrisoned: 0,
    pacified: 0,
    withdrawals: 0,
    grainSeized: 0,
    villagesBurned: 0,
    playerHpLost: 0,
    hexesLost: 0,
    sweepsExecuted: 0,
    sweepDeclared: false,
    sweepResolvedExternally: false,
    garrisonSummary: [],
    visibleEnemyCount: 0,
    orderCount: SafeList(workingPlan.orders).length,
  };

  // 兵力基线（首次执行时确定，供收缩判定用）。
  if (!next.aiMemory.strengthBaseline) {
    let total = 0;
    for (const stronghold of next.strongholds) total += Math.max(0, Number(stronghold.garrison) || 0);
    for (const enemy of next.enemies) if ((enemy.hp ?? 0) > 0) total += Math.max(1, (Number(enemy.hp) || 0) / 4);
    next.aiMemory.strengthBaseline = Math.max(1, total);
  }

  // ---- 守备调动（扫荡抽调 / 归建回补），玩家可见 ----
  for (const shift of SafeList(workingPlan.garrisonShifts)) {
    const index = next.strongholds.findIndex((item) => item.id === shift.strongholdId);
    if (index < 0) continue;
    const stronghold = next.strongholds[index];
    const before = Math.max(0, Number(stronghold.garrison) || 0);
    const after = Math.max(0, before + (Number(shift.delta) || 0));
    next.strongholds[index] = { ...stronghold, garrison: after, alarm: Clamp((Number(stronghold.alarm) || 0) + (shift.delta < 0 ? 1 : 0), 0, 5) };
    report.garrisonSummary.push({
      strongholdId: shift.strongholdId,
      key: stronghold.key,
      before,
      after,
      delta: after - before,
      reason: shift.reason,
      note: shift.note,
    });
    if (shift.delta < 0) {
      AppendLog(next, {
        kind: 'Garrison',
        key: stronghold.key,
        text: `${HexLabel(next, stronghold.key)} 据点守备由 ${before} 减至 ${after}，${shift.note || '兵力外调'}。`,
      });
      next.aiMemory.garrisonDebt.push({
        strongholdId: shift.strongholdId,
        amount: before - after,
        turnsLeft: 3,
      });
    } else if (shift.delta > 0) {
      next.aiMemory.garrisonDebt = next.aiMemory.garrisonDebt
        .map((debt) => (debt.strongholdId === shift.strongholdId
          ? { ...debt, amount: Math.max(0, debt.amount - (after - before)), turnsLeft: debt.turnsLeft - 1 }
          : debt))
        .filter((debt) => debt.amount > 0 && debt.turnsLeft > 0);
    }
  }

  // ---- 工程队列推进 ----
  const advanced = [];
  for (const project of SafeList(workingPlan.construction)) {
    const entry = { ...project };
    delete entry.advanced;
    if (entry.turnsLeft <= 0) {
      CompleteConstruction(next, entry, report);
      continue;
    }
    advanced.push(entry);
  }
  next.aiMemory.construction = advanced;

  // ---- 逐条命令执行 ----
  for (const order of SafeList(workingPlan.orders)) {
    switch (order.kind) {
      case 'Move':
      case 'Patrol':
      case 'Sweep':
        ApplyMoveLike(next, order, report);
        break;
      case 'Attack':
        ApplyAttack(next, order, rng, difficulty, report, options);
        break;
      case 'Build':
        ApplyBuild(next, order, report);
        break;
      case 'Repair':
        ApplyRepair(next, order, rng, report);
        break;
      case 'Requisition':
        ApplyRequisition(next, order, rng, difficulty, report);
        break;
      case 'Garrison':
        ApplyGarrison(next, order, report);
        break;
      case 'Withdraw':
        ApplyWithdraw(next, order, report);
        break;
      default:
        break;
    }
  }

  // ---- 扫荡状态推进 ----
  const planSweep = workingPlan.sweep;
  if (planSweep && planSweep.phase === 'Declare') {
    next.sweep = {
      id: planSweep.id,
      targetKey: planSweep.targetKey,
      turnsUntil: planSweep.turnsUntil,
      strength: planSweep.strength,
      axisKeys: [...SafeList(planSweep.axisKeys)],
      axes: SafeList(planSweep.axes).map((axis) => ({ ...axis, keys: [...axis.keys] })),
      declaredTurn: planSweep.declaredTurn,
      doctrineKey: planSweep.doctrineKey,
    };
    report.sweepDeclared = true;
    report.headlines.push(`敌正向 ${HexLabel(next, planSweep.targetKey)} 方向调兵，沿线据点守备骤减。`);
    AppendLog(next, {
      kind: 'SweepPlan',
      key: planSweep.targetKey,
      text: `据交通站与内线报告：敌自 ${planSweep.axes.length} 个方向抽调守备 ${planSweep.drawnTotal} 部，疑将合围 ${HexLabel(next, planSweep.targetKey)}。`,
    });
    next.alert = Clamp((Number(next.alert) || 0) + 6, 0, 100);
  } else if (planSweep && planSweep.phase === 'Prepare') {
    next.sweep = { ...next.sweep, turnsUntil: planSweep.turnsUntil };
    AppendLog(next, {
      kind: 'SweepPlan',
      key: planSweep.targetKey,
      text: `敌集结未止，距合围发起约 ${planSweep.turnsUntil} 回合。`,
    });
  } else if (planSweep && planSweep.phase === 'Execute') {
    ResolveSweepOutcome(next, planSweep, rng, difficulty, report, options);
    next.sweep = null;
    next.aiMemory.sweepCooldown = difficulty.sweepCooldown;
    next.aiMemory.sweepCount += 1;
    next.aiMemory.garrisonDebt = next.aiMemory.garrisonDebt.map((debt) => ({ ...debt, turnsLeft: Math.max(1, debt.turnsLeft) }));
  }

  if (next.aiMemory.sweepCooldown > 0 && !report.sweepDeclared && (!planSweep || planSweep.phase === 'None')) {
    next.aiMemory.sweepCooldown = Math.max(0, next.aiMemory.sweepCooldown - 1);
  }

  // ---- 反攻期：兵力被抽往正面战场 ----
  if (ResolveEraKey(next) === 'Counter') {
    if (rng.Chance(0.45)) {
      const index = next.strongholds.findIndex((item) => (Number(item.garrison) || 0) > 1 && item.type !== 'CountySeat');
      if (index >= 0) {
        const stronghold = next.strongholds[index];
        const before = Number(stronghold.garrison) || 0;
        const after = Math.max(0, before - Math.max(1, Math.round(before * 0.25)));
        next.strongholds[index] = { ...stronghold, garrison: after };
        AppendLog(next, {
          kind: 'Garrison',
          key: stronghold.key,
          text: `${HexLabel(next, stronghold.key)} 据点又被抽走一部，守备只剩 ${after}。`,
        });
      }
    }
  }

  // ---- 暴露度自然回落 / 警备度随接触上升 ----
  const decay = ResolveEraKey(next) === 'Hardship' ? 2 : 4;
  next.exposure = Clamp((Number(next.exposure) || 0) - decay, 0, 100);
  if (report.attacks > 0) next.alert = Clamp((Number(next.alert) || 0) + report.attacks * 2, 0, 100);
  else next.alert = Clamp((Number(next.alert) || 0) - 1, 0, 100);

  // ---- 意图落位：没有下达命令的部队也要有可侦察的意图 ----
  for (let index = 0; index < next.enemies.length; index += 1) {
    const enemy = next.enemies[index];
    if ((enemy.hp ?? 1) <= 0) continue;
    if (!enemy.intent) {
      next.enemies[index] = {
        ...enemy,
        intent: 'Garrison',
        intentDetail: { kind: 'Garrison', targetKey: enemy.key, etaTurns: 0, note: '据点守备', doctrineKey: report.doctrineKey },
      };
    }
    if (next.sweep && next.enemies[index].intent === 'Stage') {
      next.enemies[index] = {
        ...next.enemies[index],
        intentDetail: { ...(next.enemies[index].intentDetail || {}), etaTurns: next.sweep.turnsUntil, targetKey: next.sweep.targetKey },
      };
    }
  }

  // ---- 可见性 + 第 1 回合红线 ----
  RefreshEnemyVisibility(next);
  if ((Number(next.turn) || 0) <= 1 && options.ensureOpeningContact !== false) {
    EnsureOpeningContact(next, difficulty);
  }
  RefreshEnemyVisibility(next);
  for (const enemy of next.enemies) {
    if ((enemy.hp ?? 1) > 0 && enemy.visibleToPlayer) report.visibleEnemyCount += 1;
  }

  // ---- 记忆与随机数写回 ----
  next.aiMemory.lastDoctrineKey = workingPlan.naturalDoctrineKey || workingPlan.doctrineKey;
  next.aiMemory.lastEraKey = ResolveEraKey(next);
  next.aiMemory.doctrineHistory = [...next.aiMemory.doctrineHistory, { turn: report.turn, key: workingPlan.doctrineKey }].slice(-40);
  next.rngState = rng.state;
  // 记忆镜像进 map：只搬运 map 的调用方（Script_Rules.RunEnemyTurn）才不会每回合把 AI 记忆清空。
  next.map = { ...next.map, aiMemory: next.aiMemory };

  // Script_Rules 只认 report.lines / report.effects，这里把本回合新增的日志转成它要的形状。
  const freshLog = next.log.slice(logStart);
  report.lines = freshLog.map((entry) => entry.text);
  report.effects = freshLog.filter((entry) => entry.key).map((entry) => ({ kind: entry.kind, key: entry.key }));
  report.logEntries = freshLog;

  report.pressure = {
    playerHpLost: report.playerHpLost,
    hexesLost: report.hexesLost,
    grainSeized: report.grainSeized,
    villagesBurned: report.villagesBurned,
    sweepsExecuted: report.sweepsExecuted,
  };
  report.forecast = ForecastSweep(next);

  return { nextState: next, report };
}

// ---------------------------------------------------------------------------
// 情报：扫荡预警与敌军意图
// ---------------------------------------------------------------------------

function SweepIntelCoverage(state, sweep) {
  const keys = [sweep.targetKey, ...SafeList(sweep.axisKeys)];
  if (!keys.length) return 0;
  let total = 0;
  let counted = 0;
  for (const key of keys) {
    const hex = GetHex(state, key);
    if (!hex) continue;
    total += Clamp(Number(hex.intel) || 0, 0, 100);
    counted += 1;
  }
  if (!counted) return 0;
  const average = total / counted / 100;
  const stockBonus = Clamp01(((state.stock && Number(state.stock.intel)) || 0) / 240);
  return Clamp01(average * 0.8 + stockBonus * 0.35);
}

/**
 * 玩家侧的扫荡预警。精度取决于情报网覆盖：
 * 覆盖低时目标与时间都是模糊的，覆盖高时给出确切目标、回合与合围轴线。
 */
export function ForecastSweep(state) {
  if (!state || !state.sweep) return null;
  const sweep = state.sweep;
  const confidence = SweepIntelCoverage(state, sweep);
  if (confidence < 0.12) return null;

  const trueTurns = Math.max(0, Number(sweep.turnsUntil) || 0);
  const noise = (HashString(`${state.seed || 0}:${state.turn || 0}:${sweep.targetKey}`) % 1000) / 1000;

  let reportedKey = sweep.targetKey;
  if (confidence < 0.55) {
    // 情报稀薄：只报出大致方位，落到目标 1–2 环上的某一格。
    const radius = confidence < 0.3 ? 2 : 1;
    const ring = HexRing(ParseHexKey(sweep.targetKey), radius)
      .map((cell) => HexKey(cell.q, cell.r))
      .filter((key) => GetHex(state, key));
    if (ring.length) reportedKey = ring[Math.floor(noise * ring.length)];
  }

  let reportedTurns = trueTurns;
  if (confidence < 0.45) reportedTurns = Math.max(0, trueTurns + (noise < 0.5 ? -1 : 1));

  const revealCount = Math.max(1, Math.round(SafeList(sweep.axisKeys).length * Clamp01(confidence * 1.15)));
  const axisKeys = SafeList(sweep.axisKeys).slice(0, revealCount);

  const strength = Number(sweep.strength) || 0;
  const strengthBand = confidence >= 0.7
    ? `约 ${strength} 个战斗单位`
    : (confidence >= 0.4 ? `${Math.round(strength * 0.6)}–${Math.round(strength * 1.4)} 个战斗单位` : '兵力不详');

  return {
    targetKey: reportedKey,
    turnsUntil: reportedTurns,
    strength: confidence >= 0.4 ? strength : 0,
    axisKeys,
    confidence: Number(confidence.toFixed(3)),
    strengthBand,
    axisCount: SafeList(sweep.axes).length || axisKeys.length,
    label: confidence >= 0.7
      ? `敌将于 ${reportedTurns} 回合后合围 ${HexLabel(state, reportedKey)}`
      : (confidence >= 0.4
        ? `敌似在准备扫荡，方向指向 ${HexLabel(state, reportedKey)} 一带`
        : '各交通站均报敌调动频繁，去向不明'),
  };
}

/**
 * 敌军意图的可侦察描述。intelLevel：
 *   0 = 动向不明；1 = 模糊方向；2 = 明确目标与时间。
 */
export function DescribeIntent(state, enemyUnitId, intelLevel = 0) {
  const enemy = SafeList(state && state.enemies).find((item) => item.id === enemyUnitId);
  if (!enemy) {
    return { label: '无记录', detail: '各交通站均无该部的报告。', certainty: 0 };
  }
  const level = Clamp(Math.round(Number(intelLevel) || 0), 0, 2);
  const stats = ResolveEnemyStats(enemy.type);
  const detail = enemy.intentDetail || { kind: enemy.intent || 'Garrison', targetKey: enemy.key, etaTurns: 0, note: '' };
  const kindLabel = intentLabels[detail.kind] || intentLabels[enemy.intent] || '不明';

  if (level <= 0) {
    return {
      label: '动向不明',
      detail: `${stats.name}近日有出动迹象，村民只见其沿路而行，去向无从判断。`,
      certainty: 0.15,
    };
  }

  const bearing = detail.targetKey && detail.targetKey !== enemy.key
    ? CompassLabel(enemy.key, detail.targetKey)
    : '原地';

  if (level === 1) {
    const vague = bearing === '原地'
      ? `${stats.name}停留在 ${HexLabel(state, enemy.key)} 一带未动。`
      : `${stats.name}自 ${HexLabel(state, enemy.key)} 向${bearing}移动，用意不明。`;
    return {
      label: bearing === '原地' ? '原地未动' : `向${bearing}移动`,
      detail: vague,
      certainty: 0.5,
    };
  }

  const eta = Math.max(0, Number(detail.etaTurns) || 0);
  const targetLabel = detail.targetKey ? HexLabel(state, detail.targetKey) : HexLabel(state, enemy.key);
  const timing = eta > 0 ? `预计 ${eta} 回合后到位` : '本回合即可到位';
  const note = detail.note ? `（${detail.note}）` : '';
  return {
    label: `${kindLabel} · ${targetLabel}`,
    detail: `内线证实：${stats.name}此行意在${kindLabel}，目标 ${targetLabel}，${timing}${note}。`,
    certainty: 0.9,
  };
}

// ---------------------------------------------------------------------------
// 供 UI / 测试使用的只读辅助
// ---------------------------------------------------------------------------

/** 玩家当前看得见的敌军摘要（含意图标签）。 */
export function SummarizeVisibleEnemies(state, intelLevel = 1) {
  return SafeList(state && state.enemies)
    .filter((enemy) => (enemy.hp ?? 1) > 0 && enemy.visibleToPlayer)
    .map((enemy) => {
      const intent = DescribeIntent(state, enemy.id, intelLevel);
      return {
        id: enemy.id,
        key: enemy.key,
        type: enemy.type,
        name: ResolveEnemyStats(enemy.type).name,
        hp: enemy.hp,
        intent: enemy.intent,
        intentLabel: intent.label,
        certainty: intent.certainty,
      };
    });
}

/** 据点守备变化的摘要，用于 UI 提示"敌进我进"的窗口。 */
export function SummarizeGarrisons(state) {
  return SafeList(state && state.strongholds).map((stronghold) => ({
    id: stronghold.id,
    key: stronghold.key,
    type: stronghold.type,
    garrison: Number(stronghold.garrison) || 0,
    alarm: Number(stronghold.alarm) || 0,
    weakened: SafeList(ReadAiMemory(state) && ReadAiMemory(state).garrisonDebt)
      .some((debt) => debt.strongholdId === stronghold.id && debt.amount > 0),
  }));
}

export const aiModuleInfo = Object.freeze({
  name: 'Script_Ai',
  version: 1,
  externalUnits: Boolean(externalUnitDefinitions),
  externalTerrain: Boolean(externalTerrainDefinitions),
  externalCombat: Boolean(externalCombatModule),
});
