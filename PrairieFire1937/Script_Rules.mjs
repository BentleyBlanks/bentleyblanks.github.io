// 《燎原 · 敌后1937》 —— 核心规则与状态机。
//
// 本模块是全项目的集成骨架：建局、回合结算、资源与产出、群众基础、建设、科技/政策、
// 情报与视野、扫荡应对、存档、终局评定。纯逻辑，可在 node 中直接导入做冒烟测试。
//
// 设计原则：
//   1. 对外不可变——所有会改变局面的函数都先 CloneState，再在副本上推进，返回新 state。
//   2. 对并行编写的数据模块采取「命名空间导入 + 缺失回退」的健壮策略，任一数据模块
//      字段有出入也不会导致整局崩溃。
//   3. 平民代价只进 ledger 账本，绝不转化为资源或分数（见 Spec 第 7 节红线）。

import {
  HexKey,
  ParseHexKey,
  HexDistance,
  HexDistanceKeys,
  HexNeighborKeys,
  HexesInRange,
  StepRng,
  HashString,
  Clamp,
  Clamp01,
  Lerp,
} from "./Script_Hex.mjs";

import * as DataTerrain from "./Data_Terrain.mjs";
import * as DataTech from "./Data_Tech.mjs";
import * as DataUnits from "./Data_Units.mjs";
import * as DataHistory from "./Data_History.mjs";
import * as MapGen from "./Script_MapGen.mjs";
import * as Combat from "./Script_Combat.mjs";
import * as Ai from "./Script_Ai.mjs";

export const saveVersion = 3;
export const saveKey = "prairiefire1937_campaign_v1";
export const maxTurns = 32;

export const resourceKeys = ["grain", "labor", "ordnance", "medicine", "intel", "cadre"];

export const resourceLabels = Object.freeze({
  grain: "粮",
  labor: "工",
  ordnance: "械",
  medicine: "药",
  intel: "情报",
  cadre: "干部",
});

export const ledgerKeys = ["civilianDeaths", "displaced", "villagesBurned", "cadreLost", "grainSeized"];

export const ledgerLabels = Object.freeze({
  civilianDeaths: "平民伤亡",
  displaced: "流离失所",
  villagesBurned: "被焚村庄",
  cadreLost: "骨干损失",
  grainSeized: "被夺粮食",
});

/** 五个时期的回合边界（与 Data_History 对齐，此处为内置回退）。 */
const fallbackEras = [
  { key: "Opening", name: "开辟期", turnRange: [0, 5] },
  { key: "Growth", name: "发展期", turnRange: [6, 13] },
  { key: "Hardship", name: "困难期", turnRange: [14, 21] },
  { key: "Recovery", name: "恢复期", turnRange: [22, 27] },
  { key: "Counter", name: "反攻期", turnRange: [28, 31] },
];

const seasonNames = ["春", "夏", "秋", "冬"];

/** 控制归属对产出的乘数。 */
const controlYieldMultiplier = { Base: 1, Guerrilla: 0.55, Contested: 0.2, Enemy: 0 };

/** 根据地三级的工作半径与区域槽位（Data_Units 缺失时的回退）。 */
const fallbackBaseTiers = {
  1: { name: "村级支点", workRadius: 1, districtSlots: 2, populationCap: 900, garrison: 2 },
  2: { name: "区级根据地", workRadius: 2, districtSlots: 4, populationCap: 2600, garrison: 4 },
  3: { name: "县级根据地", workRadius: 3, districtSlots: 7, populationCap: 6200, garrison: 7 },
};

export const ruleConstants = Object.freeze({
  startingStock: { grain: 46, labor: 22, ordnance: 14, medicine: 7, intel: 6, cadre: 3 },
  // 暴露度唯一的一处自然衰减（AI 侧不再重复扣减），按存量比例：
  // 高位回落快（避免一次战斗就整局锁死），低位回落慢（打了就是打了）。
  // 目标是主动玩家在 15~60 区间波动：节制地打可持续，滞留连打则失控。
  exposureDecayRateByEra: Object.freeze({ Opening: 0.16, Growth: 0.16, Hardship: 0.1, Recovery: 0.13, Counter: 0.16 }),
  exposureDecayFloor: 1,
  exposureSweepThreshold: 58,
  // 警备度的时期基线下限：治安战的常态压力，扫荡日历的底色。
  alertFloorByEra: Object.freeze({ Opening: 8, Growth: 14, Hardship: 26, Recovery: 18, Counter: 12 }),
  alertGrowthPerBase: 1.4,
  massDriftBase: 2.1,
  massDriftEnemy: -2.6,
  grainPerPopulation: 0.0016,
  mobilizeGain: 14,
  mobilizeCadreCost: 0,
  reconIntelGain: 26,
  foundBaseCadreCost: 2,
  foundBaseLaborCost: 12,
  famineThreshold: 0,
  // 饥荒按连续断粮季数累进（上限 4 级）：一季是紧张，连年断粮是灾难。
  // 这些全部是代价方向的后果，不产生任何收益。
  famineSeverityCap: 4,
  famineMassHitPerLevel: 0.4,
  famineDisplacedPerVillage: 0.8,
  researchBase: 4,
  // 据点初始补给按类型给定，与 Script_Combat 的围困经济同一量纲
  //（曾经播种 100 而战斗层按 6~12 设计，围困 32 回合都断不了粮）。
  strongholdSupplyByType: Object.freeze({ Blockhouse: 6, Garrison: 8, RailStation: 9, CountySeat: 12 }),
  // 经济配平：地块产出必须乘上这个系数才进国库。没有它，产出随「根据地格数 ×
  // 科技乘数」超线性膨胀，几十回合后所有资源都以千计，一切取舍失去意义。
  hexYieldScale: 0.3,
  // 科技/政策的产出加成上限。允许成长，但不允许指数化。
  yieldBonusCap: 1.2,
  // territory upkeep：每一块被根据地实际经营的地块都要养人、跑交通、办公粮。
  // 这是让「战线拉长有代价」成立的关键，也是防止收入无限膨胀的形状性约束。
  hexUpkeepGrain: 0.34,
  hexUpkeepLabor: 0.1,
  cadreIncomeScale: 2.6,
  // 各资源的地产系数，把设计意图写进数值：
  // 粮是主粮、工次之；械主要靠缴获而不是种出来的（0.08 让种田产械
  // 低于一次像样的伏击，否则"械主要靠缴获"就是一句空话）；药在敌后永远稀缺。
  resourceYieldScale: Object.freeze({ grain: 1, labor: 0.75, ordnance: 0.08, medicine: 0.26, intel: 0.8 }),
});

// ---------------------------------------------------------------------------
// 数据模块的健壮解析（并行编写，字段以契约为准，缺失时回退）
// ---------------------------------------------------------------------------

function Definitions(namespace, name) {
  const value = namespace?.[name];
  return value && typeof value === "object" ? value : {};
}

const terrainDefinitions = () => Definitions(DataTerrain, "terrainDefinitions");
const featureDefinitions = () => Definitions(DataTerrain, "featureDefinitions");
const workDefinitions = () => Definitions(DataTerrain, "workDefinitions");
const seasonDefinitions = () => Definitions(DataTerrain, "seasonDefinitions");
const techDefinitions = () => Definitions(DataTech, "techDefinitions");
const doctrineDefinitions = () => Definitions(DataTech, "doctrineDefinitions");
const policyDefinitions = () => Definitions(DataTech, "policyDefinitions");
const unitDefinitions = () => Definitions(DataUnits, "unitDefinitions");
const districtDefinitions = () => Definitions(DataUnits, "districtDefinitions");
const baseTierDefinitions = () => {
  const provided = Definitions(DataUnits, "baseTierDefinitions");
  return Object.keys(provided).length ? provided : fallbackBaseTiers;
};

export function GetEraList() {
  const provided = Definitions(DataHistory, "eraDefinitions");
  const list = Object.values(provided).filter((era) => era && Array.isArray(era.turnRange));
  return list.length === 5 ? list.slice().sort((a, b) => a.turnRange[0] - b.turnRange[0]) : fallbackEras;
}

export function GetEraForTurn(turn) {
  const eras = GetEraList();
  for (const era of eras) {
    if (turn >= era.turnRange[0] && turn <= era.turnRange[1]) return era;
  }
  return eras[eras.length - 1];
}

/** 回合 → 中文日期。回合 0 = 1937 年秋，一回合一个季度。 */
export function FormatTurnDate(turn) {
  const formatter = DataHistory?.FormatTurnDate;
  if (typeof formatter === "function") {
    try {
      const text = formatter(turn);
      if (typeof text === "string" && text.length) return text;
    } catch (error) {
      // 回退到内置实现
    }
  }
  const absolute = turn + 2; // 0 → 1937 秋（索引 2 = 秋）
  const year = 1937 + Math.floor(absolute / 4);
  return `${year}年 ${seasonNames[absolute % 4]}`;
}

export function GetSeasonKey(turn) {
  return seasonNames[(turn + 2) % 4];
}

function SeasonModifier(turn) {
  const provided = seasonDefinitions();
  const season = GetSeasonKey(turn);
  const entry = Object.values(provided).find((item) => item?.name === season || item?.key === season);
  const yieldScale = entry?.yieldScale;
  if (yieldScale && typeof yieldScale === "object") return yieldScale;
  if (season === "春") return { grain: 0.85, labor: 1.1 };
  if (season === "夏") return { grain: 1.0, labor: 1.05 };
  if (season === "秋") return { grain: 1.45, labor: 1.0 };
  return { grain: 0.6, labor: 0.8, medicine: 0.85 };
}

// ---------------------------------------------------------------------------
// 状态构造
// ---------------------------------------------------------------------------

function EmptyStock() {
  const stock = {};
  for (const key of resourceKeys) stock[key] = 0;
  return stock;
}

function EmptyLedger() {
  const ledger = {};
  for (const key of ledgerKeys) ledger[key] = 0;
  return ledger;
}

export function CloneState(state) {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

function NextRandom(state) {
  const stepped = StepRng(state.rngState);
  state.rngState = stepped.state;
  return stepped.value;
}

function MakeId(state, prefix) {
  state.idCounter = (state.idCounter || 0) + 1;
  return `${prefix}${state.idCounter}`;
}

function FallbackMap(seed, width, height) {
  // MapGen 不可用时的最小可玩地图，保证整局不会因单个模块缺席而无法启动。
  const hexes = {};
  const order = [];
  let rngState = seed >>> 0;
  const roll = () => {
    const stepped = StepRng(rngState);
    rngState = stepped.state;
    return stepped.value;
  };
  for (let q = 0; q < width; q += 1) {
    for (let row = 0; row < height; row += 1) {
      const r = row - (q >> 1);
      const key = HexKey(q, r);
      const west = 1 - q / Math.max(1, width - 1);
      const elevation = Clamp01(west * 0.8 + roll() * 0.2);
      const terrain = elevation > 0.72 ? "Mountain" : elevation > 0.55 ? "Hill" : elevation > 0.38 ? "Loess" : "Plain";
      hexes[key] = MakeHex(q, r, {
        terrain,
        elevation,
        moisture: Clamp01(0.3 + roll() * 0.5),
        feature: roll() > 0.86 ? "Village" : null,
      });
      order.push(key);
    }
  }
  const startKey = order[Math.floor(order.length * 0.25)];
  return { width, height, hexes, order, startKey, strongholdSeeds: [], countySeatKeys: [], railwayKeys: [], riverKeys: [], regions: [] };
}

function MakeHex(q, r, patch = {}) {
  return {
    q,
    r,
    key: HexKey(q, r),
    terrain: "Plain",
    feature: null,
    road: 0,
    railway: false,
    railBroken: 0,
    blockade: 0,
    elevation: 0.3,
    moisture: 0.4,
    yields: { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 },
    massBase: 0,
    control: "Contested",
    tunnel: false,
    works: [],
    baseId: null,
    explored: false,
    visibility: 0,
    intel: 0,
    scorch: 0,
    ...patch,
  };
}

/** 地块的基础产出（地形 + 特性 + 工事 + 道路），不含控制/群众/季节修正。 */
export function GetHexBaseYields(hex) {
  const total = { grain: 0, labor: 0, ordnance: 0, medicine: 0, intel: 0 };
  const addFrom = (source) => {
    if (!source || typeof source !== "object") return;
    for (const key of Object.keys(total)) total[key] += Number(source[key]) || 0;
  };
  addFrom(hex.yields);
  addFrom(terrainDefinitions()[hex.terrain]?.yields);
  if (hex.feature) addFrom(featureDefinitions()[hex.feature]?.yields);
  for (const work of hex.works || []) addFrom(workDefinitions()[work]?.yields);
  if (hex.road >= 1) total.labor += 0.2 * hex.road;
  return total;
}

export function CreateInitialState(options = {}) {
  const seed = (typeof options.seed === "number" ? options.seed : HashString(String(options.seed ?? "燎原1937"))) >>> 0;
  const width = options.width ?? 26;
  const height = options.height ?? 20;
  const difficulty = options.difficulty ?? "Normal";

  let generated = null;
  if (typeof MapGen.GenerateMap === "function") {
    try {
      generated = MapGen.GenerateMap(seed, width, height);
    } catch (error) {
      generated = null;
    }
  }
  if (!generated || !generated.hexes || !generated.order?.length) {
    generated = FallbackMap(seed, width, height);
  }

  // 统一补齐 hex 字段，容忍地图模块返回的精简对象。
  const hexes = {};
  for (const key of generated.order) {
    const raw = generated.hexes[key];
    if (!raw) continue;
    const parsed = ParseHexKey(key);
    hexes[key] = MakeHex(parsed.q, parsed.r, raw);
  }

  const state = {
    version: saveVersion,
    seed,
    difficulty,
    turn: 0,
    maxTurns,
    idCounter: 0,
    rngState: seed >>> 0,
    eraKey: GetEraForTurn(0).key,
    map: {
      width: generated.width ?? width,
      height: generated.height ?? height,
      hexes,
      order: generated.order.filter((key) => hexes[key]),
      regions: generated.regions ?? [],
      railwayKeys: generated.railwayKeys ?? [],
      riverKeys: generated.riverKeys ?? [],
      countySeatKeys: generated.countySeatKeys ?? [],
    },
    startKey: hexes[generated.startKey] ? generated.startKey : generated.order[0],
    bases: [],
    units: [],
    enemies: [],
    strongholds: [],
    stock: { ...ruleConstants.startingStock },
    income: EmptyStock(),
    upkeep: EmptyStock(),
    research: { done: [], currentId: null, progress: 0, currentDoctrineId: null, doctrineProgress: 0 },
    policy: { slots: 1, equipped: [] },
    exposure: 8,
    alert: 12,
    sweep: null,
    sabotageTotal: 0,
    ledger: EmptyLedger(),
    // 代价账本逐条记录：{ turn, kind, key, text, delta }，只记录、不折算（红线）。
    ledgerLog: [],
    // 被打散的部队：{ type, name, key, returnTurn }，靠群众基础数回合后减员归队。
    scattered: [],
    famineTurns: 0,
    counterDrawdownDone: false,
    initialPopulation: 0,
    events: { fired: [], pending: null },
    log: [],
    over: false,
    result: null,
  };

  SeedStartingForces(state, generated);
  SeedEnemyForces(state, generated);
  // 县域人口基准：按聚落规模折算，用于终局"人口恢复"口径（终局治下人口 / 县域基准）。
  state.initialPopulation = state.map.order.reduce((sum, key) => {
    const feature = state.map.hexes[key]?.feature;
    return sum + (feature === "CountySeat" ? 2400 : feature === "Town" ? 1200 : feature === "Village" ? 620 : 0);
  }, 0);
  RecomputeMassAndControl(state);
  RecomputeVisibility(state);
  RecomputeEconomy(state);
  PushLog(state, "系统", `${FormatTurnDate(0)}，工作队进入${RegionNameAt(state, state.startKey)}。`);
  return state;
}

function RegionNameAt(state, key) {
  const region = (state.map.regions || []).find((item) => item?.keys?.includes(key));
  return region?.name || "太行东麓";
}

function SeedStartingForces(state, generated) {
  const startKey = state.startKey;
  const startHex = state.map.hexes[startKey];
  if (startHex) {
    startHex.explored = true;
    startHex.massBase = Math.max(startHex.massBase, 42);
    startHex.control = "Guerrilla";
  }

  const startingUnits = ["GuerrillaSquad", "GuerrillaSquad", "Scout", "WorkTeam"];
  const neighbors = HexNeighborKeys(startKey).filter((key) => state.map.hexes[key]);
  const placements = [startKey, startKey, neighbors[0] ?? startKey, neighbors[1] ?? startKey];
  startingUnits.forEach((type, index) => {
    AddUnit(state, ResolvePlayerUnitType(type), placements[index] ?? startKey);
  });
}

/** 玩家单位类型解析：Data_Units 若用了别的 key，退到第一个我方定义。 */
function ResolvePlayerUnitType(preferred) {
  const definitions = unitDefinitions();
  if (definitions[preferred]) return preferred;
  const aliases = {
    GuerrillaSquad: ["GuerrillaTeam", "Guerrilla", "DistrictSquad", "Militia"],
    Scout: ["Recon", "Scouts", "Courier"],
    WorkTeam: ["ArmedWorkTeam", "Organizer", "CadreTeam", "WorkerTeam"],
  };
  for (const alias of aliases[preferred] ?? []) {
    if (definitions[alias]) return alias;
  }
  const firstPlayer = Object.values(definitions).find((unit) => unit?.side === "Player");
  return firstPlayer?.key ?? preferred;
}

function ResolveEnemyUnitType(preferred) {
  const definitions = unitDefinitions();
  if (definitions[preferred]) return preferred;
  const firstEnemy = Object.values(definitions).find((unit) => unit?.side === "Enemy");
  return firstEnemy?.key ?? preferred;
}

export function GetUnitStats(type) {
  const definition = unitDefinitions()[type];
  return {
    key: type,
    name: definition?.name ?? type,
    side: definition?.side ?? "Player",
    maxHp: Number(definition?.maxHp) || 10,
    moves: Number(definition?.moves) || 2,
    attack: Number(definition?.attack) || 4,
    defence: Number(definition?.defence) || 4,
    sight: Number(definition?.sight) || 2,
    concealment: Number(definition?.concealment) || 0.4,
    abilities: Array.isArray(definition?.abilities) ? definition.abilities : [],
    upkeep: definition?.upkeep ?? { grain: 1 },
    cost: definition?.cost ?? { ordnance: 4, labor: 3 },
    blurb: definition?.blurb ?? "",
  };
}

/**
 * 单位已选特长的聚合效果（规则层消费移动/侦察类字段）。
 * 无特长（含全部敌军与旧存档单位）返回 null，零成本；表缺席时同样返回 null。
 */
function GetUnitPerkEffects(unit) {
  if (!unit || !Array.isArray(unit.perks) || !unit.perks.length) return null;
  if (typeof DataUnits.SumPerkEffects !== "function") return null;
  return DataUnits.SumPerkEffects(unit.perks);
}

/**
 * 升级后挂起授衔待选：升到 2/3 级且该档未选过时写 unit.pendingPerk = 档位。
 * 与 Script_Combat 的 GrantUnitXp 同口径（同一张 Data_Units 表判定）。
 */
function QueuePendingPerk(unit) {
  if (!unit || typeof DataUnits.GetPendingPerkTier !== "function") return;
  const tier = DataUnits.GetPendingPerkTier(unit.type, unit.level ?? 1, unit.perks ?? []);
  if (tier) unit.pendingPerk = tier;
}

function AddUnit(state, type, key) {
  const stats = GetUnitStats(type);
  const unit = {
    id: MakeId(state, "u"),
    key,
    type,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    moves: stats.moves,
    maxMoves: stats.moves,
    xp: 0,
    level: 1,
    hidden: true,
    fatigue: 0,
    acted: false,
    orders: null,
  };
  state.units.push(unit);
  return unit;
}

function SeedEnemyForces(state, generated) {
  const seeds = Array.isArray(generated.strongholdSeeds) ? generated.strongholdSeeds : [];
  const usable = seeds.filter((seed) => seed && state.map.hexes[seed.key]);
  const chosen = usable.length ? usable : SyntheticStrongholdSeeds(state);

  for (const seed of chosen) {
    const type = seed.type ?? "Blockhouse";
    const garrison = type === "CountySeat" ? 7 : type === "Garrison" ? 5 : type === "RailStation" ? 4 : 3;
    state.strongholds.push({
      id: MakeId(state, "s"),
      key: seed.key,
      type,
      garrison,
      maxGarrison: garrison,
      supply: ruleConstants.strongholdSupplyByType[type] ?? 6,
      alarm: 0,
      name: seed.name ?? StrongholdName(type),
    });
    const hex = state.map.hexes[seed.key];
    if (hex) {
      hex.control = "Enemy";
      hex.massBase = Math.min(hex.massBase, 12);
    }
  }

  // 第 1 回合可见性红线：起始点周围必须放一支够得着的敌方部队。
  const startKey = state.startKey;
  const nearbyCandidates = HexesInRange(ParseHexKey(startKey), 4)
    .map((coordinate) => HexKey(coordinate.q, coordinate.r))
    .filter((key) => state.map.hexes[key] && HexDistanceKeys(key, startKey) >= 2 && HexDistanceKeys(key, startKey) <= 3);

  const patrolKeys = nearbyCandidates.slice(0, 2);
  const enemyTypes = ["PuppetGarrison", "JapaneseInfantry"];
  const claimedHomes = new Set();
  patrolKeys.forEach((key, index) => {
    const unit = AddEnemyUnit(state, ResolveEnemyUnitType(enemyTypes[index] ?? enemyTypes[0]), key, "Patrol");
    // 巡逻队各认最近的据点为老巢，初始两支分属不同据点，巡逻圈才铺得开。
    const ranked = state.strongholds
      .filter((item) => item.key)
      .map((item) => ({ id: item.id, distance: HexDistanceKeys(item.key, key) }))
      .sort((a, b) => (a.distance - b.distance) || (a.id < b.id ? -1 : 1));
    const home = ranked.find((item) => !claimedHomes.has(item.id)) ?? ranked[0];
    if (home) {
      unit.homeStrongholdId = home.id;
      claimedHomes.add(home.id);
    }
  });

  // 保证附近至少有一个据点可打。
  const hasNearStronghold = state.strongholds.some((item) => HexDistanceKeys(item.key, startKey) <= 4);
  if (!hasNearStronghold && nearbyCandidates.length) {
    const key = nearbyCandidates[nearbyCandidates.length - 1];
    state.strongholds.push({
      id: MakeId(state, "s"),
      key,
      type: "Blockhouse",
      garrison: 3,
      maxGarrison: 3,
      supply: ruleConstants.strongholdSupplyByType.Blockhouse ?? 6,
      alarm: 0,
      name: StrongholdName("Blockhouse"),
    });
    const hex = state.map.hexes[key];
    if (hex) hex.control = "Enemy";
  }
}

function SyntheticStrongholdSeeds(state) {
  const seeds = [];
  const order = state.map.order;
  for (let index = 0; index < order.length; index += 37) {
    const key = order[index];
    const hex = state.map.hexes[key];
    if (!hex) continue;
    if (hex.elevation > 0.6) continue;
    seeds.push({ key, type: hex.feature === "CountySeat" ? "CountySeat" : "Blockhouse" });
    if (seeds.length >= 9) break;
  }
  return seeds;
}

function StrongholdName(type) {
  if (type === "CountySeat") return "县城驻军";
  if (type === "RailStation") return "车站警备";
  if (type === "Garrison") return "据点守备";
  return "炮楼";
}

function AddEnemyUnit(state, type, key, intent = "Patrol") {
  const stats = GetUnitStats(type);
  const unit = {
    id: MakeId(state, "e"),
    key,
    type,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    moves: stats.moves,
    maxMoves: stats.moves,
    intent,
    homeStrongholdId: null,
    visibleToPlayer: false,
  };
  state.enemies.push(unit);
  return unit;
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

export function GetHex(state, key) {
  return state.map.hexes[key] ?? null;
}

export function GetUnit(state, id) {
  return state.units.find((unit) => unit.id === id) ?? null;
}

export function GetEnemy(state, id) {
  return state.enemies.find((unit) => unit.id === id) ?? null;
}

export function GetBase(state, id) {
  return state.bases.find((base) => base.id === id) ?? null;
}

export function GetStrongholdAt(state, key) {
  return state.strongholds.find((item) => item.key === key) ?? null;
}

export function GetUnitsAt(state, key) {
  return state.units.filter((unit) => unit.key === key);
}

export function GetEnemiesAt(state, key) {
  return state.enemies.filter((unit) => unit.key === key);
}

/**
 * 归一化根据地等级定义。Data_Units 用 yieldMultiplier 且不提供工作半径，
 * 这里统一补成规则内核使用的 workRadius / yieldScale 语义。
 */
export function GetBaseTier(tier) {
  const definitions = baseTierDefinitions();
  const raw = definitions[tier] ?? definitions[String(tier)] ?? fallbackBaseTiers[tier] ?? fallbackBaseTiers[1];
  const level = Number(raw?.tier ?? tier) || 1;
  return {
    ...raw,
    tier: level,
    workRadius: raw?.workRadius ?? fallbackBaseTiers[level]?.workRadius ?? level,
    yieldScale: raw?.yieldScale ?? raw?.yieldMultiplier ?? 1,
    districtSlots: raw?.districtSlots ?? fallbackBaseTiers[level]?.districtSlots ?? 2,
    populationCap: raw?.populationCap ?? fallbackBaseTiers[level]?.populationCap ?? 900,
  };
}

/** 汇总科技 / 群众树 / 政策的全部效果。 */
export function GetEffects(state) {
  const sources = [];
  const techs = techDefinitions();
  const doctrines = doctrineDefinitions();
  const policies = policyDefinitions();
  for (const id of state.research.done) {
    const definition = techs[id] ?? doctrines[id];
    if (definition?.effects) sources.push(definition.effects);
  }
  for (const id of state.policy.equipped) {
    if (policies[id]?.effects) sources.push(policies[id].effects);
  }
  for (const eventEffect of state.eventEffects ?? []) sources.push(eventEffect);
  // 根据地等级与已建成区域自带的持续效果。
  const districts = districtDefinitions();
  for (const base of state.bases ?? []) {
    const tierEffects = GetBaseTier(base.tier)?.effects;
    if (tierEffects) sources.push(tierEffects);
    for (const district of base.districts ?? []) {
      if (district.done && districts[district.type]?.effects) sources.push(districts[district.type].effects);
    }
  }

  const aggregate = DataTech?.AggregateEffects;
  if (typeof aggregate === "function") {
    try {
      const merged = aggregate(sources);
      if (merged && typeof merged === "object") return NormalizeEffects(merged);
    } catch (error) {
      // 回退到内置合并
    }
  }
  return NormalizeEffects(MergeEffects(sources));
}

function MergeEffects(sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "number") merged[key] = (merged[key] || 0) + value;
      else if (typeof value === "boolean") merged[key] = Boolean(merged[key]) || value;
      else if (Array.isArray(value)) merged[key] = Array.from(new Set([...(merged[key] || []), ...value]));
      else if (value && typeof value === "object") {
        merged[key] = merged[key] && typeof merged[key] === "object" ? { ...merged[key] } : {};
        for (const [inner, innerValue] of Object.entries(value)) {
          merged[key][inner] = (merged[key][inner] || 0) + (Number(innerValue) || 0);
        }
      }
    }
  }
  return merged;
}

function NormalizeEffects(effects) {
  const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  return {
    yieldBonus: effects.yieldBonus ?? {},
    flatYield: effects.flatYield ?? {},
    // unlock 词汇统一收拢单数/复数两种写法（事件卡里两种都在用）。
    unlockUnits: [...asList(effects.unlockUnits), ...asList(effects.unlockUnit)],
    unlockDistricts: [...asList(effects.unlockDistricts), ...asList(effects.unlockDistrict)],
    unlockWorks: [...asList(effects.unlockWorks), ...asList(effects.unlockWork)],
    unlockPolicies: [...asList(effects.unlockPolicies), ...asList(effects.unlockPolicy)],
    unlockResearch: [...asList(effects.unlockResearch), ...asList(effects.unlockTech), ...asList(effects.unlockDoctrine)],
    policySlots: effects.policySlots ?? 0,
    massGrowth: effects.massGrowth ?? 0,
    exposureDecay: effects.exposureDecay ?? 0,
    intelRange: effects.intelRange ?? 0,
    // ambushBonus/defenceBonus/railSabotage 是事件卡沿用的老词，并入同义主键。
    combatAmbush: (effects.combatAmbush ?? 0) + (effects.ambushBonus ?? 0),
    combatDefence: (effects.combatDefence ?? 0) + (effects.defenceBonus ?? 0),
    combatAttack: effects.combatAttack ?? 0,
    captureRate: effects.captureRate ?? 0,
    healRate: effects.healRate ?? 0,
    buildSpeed: effects.buildSpeed ?? 0,
    moveBonus: effects.moveBonus ?? 0,
    sabotageBonus: (effects.sabotageBonus ?? 0) + (effects.railSabotage ?? 0),
    siegeBonus: effects.siegeBonus ?? 0,
    garrisonReveal: Boolean(effects.garrisonReveal),
    sweepWarning: effects.sweepWarning ?? 0,
    upkeepDiscount: (effects.upkeepDiscount ?? 0) + (effects.maintenanceDiscount ?? 0),
    populationGrowth: effects.populationGrowth ?? 0,
    unrestDecay: effects.unrestDecay ?? 0,
    baseSlots: effects.baseSlots ?? 0,
    // 识字率的机制落点：干部成长与情报判读（词汇表第 125 行声明的语义）。
    cadreGrowth: (effects.cadreGrowth ?? 0) + (effects.literacy ?? 0) * 0.6,
    tunnelMove: Boolean(effects.tunnelMove),
    puppetDefection: Clamp(effects.puppetDefection ?? 0, 0, 0.6),
    // 补给半径：交通线打通后根据地的实际工作范围外扩（封锁沟越沟点/地道网事件）。
    supplyRange: Clamp(Math.round(effects.supplyRange ?? 0), 0, 2),
    alertDecay: effects.alertDecay ?? 0,
    researchSpeed: effects.researchSpeed ?? 0,
    medicineEfficiency: Clamp(effects.medicineEfficiency ?? 0, 0, 0.6),
    concealment: Clamp(effects.concealment ?? 0, 0, 0.5),
    // 减灾类效果：只降低代价账本的增长，绝不产生资源或分数（Spec 第 7 节红线）。
    seizureResist: Clamp(effects.seizureResist ?? 0, 0, 0.85),
    civilianShelter: Clamp(effects.civilianShelter ?? 0, 0, 0.85),
    raw: effects,
  };
}

/**
 * 汇总该地块上已建工事的效果。
 *
 * `Data_Terrain.workDefinitions` 用的是一套地块级的效果词汇
 * （concealmentDelta / defenceBonus / moveCostDelta / warningRange /
 *  grainProtection / scorchResist / setsTunnel），与科技政策那套全局效果不同。
 * 这些必须被真正消费，否则玩家花工和干部修的交通壕、坚壁窖、消息树全是白建。
 */
export function GetHexWorkEffects(hex) {
  const totals = {
    concealmentDelta: 0,
    defenceBonus: 0,
    moveCostDelta: 0,
    enemyMoveCostDelta: 0,
    warningRange: 0,
    grainProtection: 0,
    scorchResist: 0,
    exposureDelta: 0,
    massBaseDelta: 0,
    sabotageBonus: 0,
    setsTunnel: false,
  };
  if (!hex || !Array.isArray(hex.works)) return totals;
  const definitions = workDefinitions();
  for (const work of hex.works) {
    const effects = definitions[work]?.effects;
    if (!effects) continue;
    for (const key of Object.keys(totals)) {
      const value = effects[key];
      if (value === undefined) continue;
      if (typeof value === "boolean") totals[key] = totals[key] || value;
      else totals[key] += Number(value) || 0;
    }
  }
  totals.grainProtection = Clamp(totals.grainProtection, 0, 0.85);
  totals.scorchResist = Clamp(totals.scorchResist, 0, 0.85);
  return totals;
}

/** 某格是否被任一根据地工作范围覆盖（补给半径事件可外扩）。 */
export function GetWorkingBase(state, key) {
  const rangeBonus = GetEffects(state).supplyRange;
  for (const base of state.bases) {
    const radius = (GetBaseTier(base.tier).workRadius ?? 1) + rangeBonus;
    if (HexDistanceKeys(base.key, key) <= radius) return base;
  }
  return null;
}

/** 计算本回合收入与维持费。 */
export function RecomputeEconomy(state) {
  const effects = GetEffects(state);
  const season = SeasonModifier(state.turn);
  // 时期经济修正：困难期产出 ×0.72、恢复期 ×1.15 等（Data_History 声明，此处消费）。
  const eraModifiers = GetEraForTurn(state.turn)?.modifiers ?? {};
  const eraYieldScale = Number(eraModifiers.yieldScale) || 1;
  const income = EmptyStock();
  const upkeep = EmptyStock();
  const detail = { grain: [], labor: [], ordnance: [], medicine: [], intel: [], cadre: [] };
  let workedHexes = 0;

  for (const base of state.bases) {
    const tier = GetBaseTier(base.tier);
    const radius = (tier.workRadius ?? 1) + effects.supplyRange;
    // 被扫荡打停的基地：机关分散隐蔽期间产出大减、区域全部停摆。
    // 不安（unrest）高企的基地：公粮收不齐、夫役派不动，产出打折。
    const disruptedScale = (base.disrupted || 0) > 0 ? 0.3 : 1;
    const unrestScale = (base.unrest || 0) >= 60 ? 0.55 : 1;
    const scale = (tier.yieldScale ?? 1) * disruptedScale * unrestScale;
    for (const coordinate of HexesInRange(ParseHexKey(base.key), radius)) {
      const key = HexKey(coordinate.q, coordinate.r);
      const hex = state.map.hexes[key];
      if (!hex) continue;
      const controlScale = controlYieldMultiplier[hex.control] ?? 0;
      if (controlScale <= 0) continue;
      const massScale = 0.35 + 0.65 * (hex.massBase / 100);
      const scorchScale = 1 - Clamp01(hex.scorch / 150);
      const hexYields = GetHexBaseYields(hex);
      for (const resource of ["grain", "labor", "ordnance", "medicine", "intel"]) {
        const amount =
          hexYields[resource] *
          controlScale *
          massScale *
          scorchScale *
          scale *
          (season[resource] ?? 1) *
          eraYieldScale *
          ruleConstants.hexYieldScale *
          (ruleConstants.resourceYieldScale[resource] ?? 1);
        if (amount) income[resource] += amount;
      }
      // 经营这块地本身要花钱花人：公粮要运、交通要养、区乡干部要吃饭。
      upkeep.grain += ruleConstants.hexUpkeepGrain * controlScale;
      upkeep.labor += ruleConstants.hexUpkeepLabor * controlScale;
      workedHexes += 1;
    }

    for (const district of base.districts ?? []) {
      if (!district.done) continue;
      if (disruptedScale < 1) continue;
      const definition = districtDefinitions()[district.type];
      for (const resource of resourceKeys) {
        const amount = Number(definition?.yields?.[resource]) || 0;
        if (amount) income[resource] += amount;
      }
      upkeep.grain += Number(definition?.upkeep?.grain) || 0;
    }

    income.grain -= base.population * ruleConstants.grainPerPopulation;
    income.cadre += (0.08 + (base.tier - 1) * 0.05) * ruleConstants.cadreIncomeScale;
  }

  for (const unit of state.units) {
    const stats = GetUnitStats(unit.type);
    for (const [resource, amount] of Object.entries(stats.upkeep ?? {})) {
      if (resourceKeys.includes(resource)) upkeep[resource] += Number(amount) || 0;
    }
    // 枪一响就是钱：部队的日常操练、擦枪走火与警戒消耗按火力档次吃械——
    // 械的中后期死山需要一个常态排水口（第二轮评审 P1）。
    upkeep.ordnance += stats.attack >= 12 ? 0.5 : 0.1;
  }

  const discount = 1 - Clamp(effects.upkeepDiscount, 0, 0.6);
  for (const key of resourceKeys) upkeep[key] *= discount;

  for (const [resource, amount] of Object.entries(effects.flatYield)) {
    if (resourceKeys.includes(resource)) income[resource] += Number(amount) || 0;
  }
  for (const [resource, bonus] of Object.entries(effects.yieldBonus)) {
    // 加成封顶：科技该让你变强，但不该让产出指数化。
    if (resourceKeys.includes(resource)) income[resource] *= 1 + Clamp(Number(bonus) || 0, -0.9, ruleConstants.yieldBonusCap);
  }
  income.cadre *= 1 + Clamp(effects.cadreGrowth, -0.9, ruleConstants.yieldBonusCap);
  // 干部稀缺按时期起伏：开辟与困难年月培养一个干部更难。
  income.cadre /= Math.max(0.5, Number(eraModifiers.cadreScarcity) || 1);

  // 情报网：基础情报按覆盖格数补足，保证情报系统在早期也能转起来。
  income.intel += 0.8 + state.bases.length * 0.35;

  for (const key of resourceKeys) {
    income[key] = Math.round(income[key] * 10) / 10;
    upkeep[key] = Math.round(upkeep[key] * 10) / 10;
  }

  state.income = income;
  state.upkeep = upkeep;
  state.incomeDetail = detail;
  // 供 Combat / Ai 消费的效果缓存（纯数据、可序列化）。经济重算的所有入口
  //（回合结算、政策变更、事件选择）都会刷新它。
  state.playerEffects = {
    combatAmbush: effects.combatAmbush,
    combatAttack: effects.combatAttack,
    combatDefence: effects.combatDefence,
    captureRate: effects.captureRate,
    healRate: effects.healRate,
    medicineEfficiency: effects.medicineEfficiency,
    concealment: effects.concealment,
    puppetDefection: effects.puppetDefection,
    sweepWarning: effects.sweepWarning,
    siegeBonus: effects.siegeBonus,
    sabotageBonus: effects.sabotageBonus,
  };
  return state;
}

export function GetNetIncome(state) {
  const net = EmptyStock();
  for (const key of resourceKeys) {
    net[key] = Math.round(((state.income[key] || 0) - (state.upkeep[key] || 0)) * 10) / 10;
  }
  return net;
}

// ---------------------------------------------------------------------------
// 群众基础 / 控制归属 / 视野与情报
// ---------------------------------------------------------------------------

export function RecomputeMassAndControl(state) {
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    if (hex.baseId && GetBase(state, hex.baseId)) {
      hex.control = "Base";
      continue;
    }
    const stronghold = GetStrongholdAt(state, key);
    if (stronghold && stronghold.garrison > 0) {
      hex.control = "Enemy";
      continue;
    }
    if (hex.massBase >= 62) hex.control = "Base";
    else if (hex.massBase >= 34) hex.control = "Guerrilla";
    else if (hex.massBase >= 12) hex.control = "Contested";
    else hex.control = stronghold ? "Enemy" : "Contested";
  }
  return state;
}

export function RecomputeVisibility(state) {
  const effects = GetEffects(state);
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (hex) hex.visibility = 0;
  }

  const reveal = (centerKey, radius, level) => {
    for (const coordinate of HexesInRange(ParseHexKey(centerKey), radius)) {
      const hex = state.map.hexes[HexKey(coordinate.q, coordinate.r)];
      if (!hex) continue;
      hex.visibility = Math.max(hex.visibility, level);
      hex.explored = true;
    }
  };

  for (const unit of state.units) {
    const stats = GetUnitStats(unit.type);
    reveal(unit.key, stats.sight, 2);
  }
  for (const base of state.bases) {
    reveal(base.key, (GetBaseTier(base.tier).workRadius ?? 1) + 1, 2);
  }
  // 群众基础高的地区即使无部队也有耳目。
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    if (hex.massBase >= 55) {
      hex.visibility = Math.max(hex.visibility, 1);
      hex.explored = true;
    }
    const intelRadius = effects.intelRange;
    if (intelRadius > 0 && hex.control === "Base") reveal(key, intelRadius, 1);
  }

  for (const enemy of state.enemies) {
    const hex = state.map.hexes[enemy.key];
    // 侦察标定未过期的敌军对我保持可见——名册在手，走到哪儿都有人捎信来。
    const marked = Number(enemy.markedUntil) > state.turn;
    enemy.visibleToPlayer = Boolean(hex && hex.visibility >= 1) || marked;
  }
  for (const stronghold of state.strongholds) {
    const hex = state.map.hexes[stronghold.key];
    stronghold.knownGarrison = hex && (hex.visibility >= 2 || effects.garrisonReveal) ? stronghold.garrison : null;
  }
  return state;
}

/** 情报覆盖：hex.intel 决定敌情预报精度。 */
function DriftIntel(state) {
  const effects = GetEffects(state);
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    let target = 0;
    if (hex.control === "Base") target = 78;
    else if (hex.control === "Guerrilla") target = 52;
    else if (hex.control === "Contested") target = 24;
    target += hex.massBase * 0.25;
    // 消息树/烽火台之类的工事按自身 warningRange 扩大情报覆盖，并惠及邻格。
    const works = GetHexWorkEffects(hex);
    if (works.warningRange > 0) {
      target += 10 + works.warningRange * 6;
      for (const neighborKey of HexNeighborKeys(key)) {
        const neighbor = state.map.hexes[neighborKey];
        if (neighbor) neighbor.intel = Clamp(neighbor.intel + works.warningRange * 2.5, 0, 100);
      }
    }
    if (hex.visibility >= 2) target += 20;
    target = Clamp(target + effects.intelRange * 6, 0, 100);
    hex.intel = Clamp(Lerp(hex.intel, target, 0.4), 0, 100);
  }
}

function DriftMassBase(state) {
  const effects = GetEffects(state);
  // 恢复期/反攻期的群众工作事半功倍（减租减息落实、伪政权动摇）——
  // 战役曲线不能是一路阴跌到底，低谷之后要给玩家一个能赢回来的坡。
  const eraRegrow = state.eraKey === "Recovery" ? 1.35 : state.eraKey === "Counter" ? 1.2 : 1;
  const growth = ruleConstants.massDriftBase * (1 + effects.massGrowth) * eraRegrow;

  // 据点压制场：驻军越足、辐射越远，周边群众基础被持续压着——
  // 这就是"不拔点，百姓就一直受难"的机制载体。守备被抽调（敌进我进/反攻南调）
  // 或据点被拔，压制立即松动，地图肉眼可见地"活"回来。
  const suppression = new Map();
  for (const stronghold of state.strongholds ?? []) {
    if (!stronghold || stronghold.destroyed || (stronghold.garrison ?? 0) <= 0) continue;
    const strengthScale =
      Clamp01((stronghold.garrison ?? 0) / Math.max(1, stronghold.maxGarrison ?? stronghold.garrison ?? 1)) *
      // 恢复期敌施政重心收缩、反攻期风声鹤唳——压制场随时期衰减，
      // 战役曲线才有"恢复期反弹"这一幕（第三轮复核 P1）。
      (state.eraKey === "Recovery" ? 0.7 : state.eraKey === "Counter" ? 0.45 : 1);
    const radius = stronghold.type === "Blockhouse" ? 1 : 2;
    for (const coordinate of HexesInRange(ParseHexKey(stronghold.key), radius)) {
      const hexKey = HexKey(coordinate.q, coordinate.r);
      if (!state.map.hexes[hexKey]) continue;
      const distance = HexDistanceKeys(stronghold.key, hexKey);
      const amount = (distance === 0 ? ruleConstants.massDriftEnemy : distance === 1 ? -1.1 : -0.5) * strengthScale;
      suppression.set(hexKey, (suppression.get(hexKey) ?? 0) + amount);
    }
  }

  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    let delta = 0;

    // 群众基础靠干部和政权维持，不会因为地理位置自己长起来。
    // 没有根据地工作覆盖的地方一律衰减，且会被压回一个很低的自然上限——
    // 否则相邻格互相加成会形成不需要任何投入的永久根据地，
    // 整个"一寸一寸开辟"的扩张循环就失效了。
    const workingBase = hex.baseId ? GetBase(state, hex.baseId) : GetWorkingBase(state, key);
    const organized = Boolean(workingBase);
    const unitPresent = state.units.some((unit) => unit.key === key);

    // 政权不稳（unrest 高）的基地做不动群众工作：增长减半。
    const unrestDrag = workingBase && (workingBase.unrest || 0) >= 60 ? 0.5 : 1;
    if (hex.baseId) delta += growth * 1.4 * unrestDrag;
    else if (organized) delta += growth * unrestDrag;
    else {
      // 只有工作队/部队在场时才勉强维持，否则持续下滑。
      delta -= unitPresent ? 0.25 : 1.1;
    }

    delta += suppression.get(key) ?? 0;
    for (const neighborKey of HexNeighborKeys(key)) {
      const neighbor = state.map.hexes[neighborKey];
      if (!neighbor) continue;
      // 邻接加成只能巩固已经组织起来的地方，不能凭空创造新的根据地。
      if (organized && neighbor.control === "Base") delta += 0.32;
    }

    if (hex.scorch > 0) {
      // 被"三光"过的村庄群众基础恢复更慢——代价是长期的。
      // 地道与坚壁窖能让村子在焚掠后恢复得快些（scorchResist）。
      const resist = GetHexWorkEffects(hex).scorchResist;
      delta -= hex.scorch * 0.03 * (1 - resist);
      hex.scorch = Math.max(0, hex.scorch - 3.5 * (1 + resist));
    }
    if (organized && hex.feature === "Village") delta += 0.35;
    if (organized && hex.works?.includes("Tunnel")) delta += 0.5;
    // 梯田这类改善生计的工事直接抬高群众基础——修水利、修梯田本身就是群众工作。
    if (organized) delta += GetHexWorkEffects(hex).massBaseDelta * 0.35;

    let next = hex.massBase + delta;
    if (!organized) {
      // 无组织地区的自然上限：村庄还有些自发的同情，旷野几乎没有。
      const ceiling = hex.feature === "Village" ? 34 : hex.feature ? 24 : 16;
      if (next > ceiling) next = Math.max(ceiling, next - 1.6);
    }
    hex.massBase = Clamp(next, 0, 100);
  }
}

// ---------------------------------------------------------------------------
// 行动
// ---------------------------------------------------------------------------

/** 向导（Guide）生效的地形：山地（高山/山梁）、丘陵、林地。 */
const guideTerrainKeys = new Set(["Mountain", "Ridge", "Hill", "Forest"]);

/**
 * 向导带路判定：移动单位自己有 Guide 能力，或以**移动起点**计同格/相邻有
 * 存活的 Guide 友军（不做逐步路径伴随，保持简单可预期）。
 * 返回向导折扣系数：0 = 无向导；默认 0.7；向导带「熟路」特长时加深到 0.6
 * （多位向导取最深折扣，即最小值——替换默认值而非叠乘）。
 */
function GuideEscortFactor(state, unit) {
  if (!unit) return 0;
  let factor = 0;
  const consider = (guideUnit) => {
    const perkEffects = GetUnitPerkEffects(guideUnit);
    const own = perkEffects && perkEffects.guideFactor > 0 ? perkEffects.guideFactor : 0.7;
    if (!factor || own < factor) factor = own;
  };
  if (GetUnitStats(unit.type).abilities.includes("Guide")) consider(unit);
  for (const other of state.units) {
    if (!other || other.id === unit.id) continue;
    if ((other.hp ?? 0) <= 0) continue;
    if (!GetUnitStats(other.type).abilities.includes("Guide")) continue;
    if (other.key === unit.key || HexDistanceKeys(other.key, unit.key) <= 1) consider(other);
  }
  return factor;
}

function MoveCost(state, hex, effects, guideFactor = 0) {
  const definition = terrainDefinitions()[hex.terrain];
  let cost = Number(definition?.moveCost) || 1;
  if (hex.road >= 1) cost = Math.min(cost, 1);
  // 交通壕等工事让本方在自家地盘上跑得更快（moveCostDelta 为负值）。
  cost += GetHexWorkEffects(hex).moveCostDelta;
  if (hex.works?.includes("Tunnel") && effects.tunnelMove) cost = Math.min(cost, 1);
  // 向导带路：山地/丘陵/林地的进入费 ×0.7（「熟路」特长 ×0.6，下限 0.5）。
  // 只折地形脚程——封锁沟与冬季的迟滞在后面原样叠加，向导替代不了填沟。
  if (guideFactor > 0 && guideTerrainKeys.has(hex.terrain)) cost = Math.max(0.5, cost * guideFactor);
  // 囚笼生效：敌人的封锁沟与铁丝网真实迟滞我方机动（每级 +0.75，封顶 +1.5）。
  cost += Math.min(1.5, Math.max(0, Number(hex.blockade) || 0) * 0.75);
  if (GetSeasonKey(state.turn) === "冬") cost += 0.25;
  return Math.max(0.5, cost);
}

/** Dijkstra 求单位可达格及其消耗。 */
export function FindReachableHexes(state, unitId) {
  const unit = GetUnit(state, unitId);
  const reachable = new Map();
  if (!unit) return reachable;
  const effects = GetEffects(state);
  const budget = unit.moves + effects.moveBonus;
  if (budget <= 0) return reachable;
  const guided = GuideEscortFactor(state, unit);

  reachable.set(unit.key, 0);
  const frontier = [{ key: unit.key, cost: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (current.cost > (reachable.get(current.key) ?? Infinity)) continue;
    for (const neighborKey of HexNeighborKeys(current.key)) {
      const hex = state.map.hexes[neighborKey];
      if (!hex) continue;
      const stronghold = GetStrongholdAt(state, neighborKey);
      if (stronghold && stronghold.garrison > 0) continue;
      if (GetEnemiesAt(state, neighborKey).length) continue;
      const cost = current.cost + MoveCost(state, hex, effects, guided);
      if (cost > budget + 1e-6) continue;
      if (cost < (reachable.get(neighborKey) ?? Infinity)) {
        reachable.set(neighborKey, cost);
        frontier.push({ key: neighborKey, cost });
      }
    }
  }
  reachable.delete(unit.key);
  return reachable;
}

export function CanFoundBase(state, unitId, key) {
  const unit = GetUnit(state, unitId);
  const hex = GetHex(state, key);
  if (!unit || !hex) return { ok: false, reason: "无效目标" };
  if (unit.key !== key) return { ok: false, reason: "工作队须在该地块上" };
  if (!GetUnitStats(unit.type).abilities.includes("Organize")) return { ok: false, reason: "只有工作队能开辟根据地" };
  if (hex.baseId) return { ok: false, reason: "此地已是根据地" };
  if (GetStrongholdAt(state, key)) return { ok: false, reason: "敌据点所在，需先拔除" };
  if (hex.massBase < 30) return { ok: false, reason: `群众基础不足（${Math.round(hex.massBase)}/30）` };
  for (const base of state.bases) {
    if (HexDistanceKeys(base.key, key) < 2) return { ok: false, reason: "距既有根据地过近" };
  }
  if (state.stock.cadre < ruleConstants.foundBaseCadreCost) return { ok: false, reason: "干部不足" };
  if (state.stock.labor < ruleConstants.foundBaseLaborCost) return { ok: false, reason: "工不足" };
  return { ok: true, reason: "" };
}

export function ListContextActions(state, unitId, key) {
  const actions = [];
  const unit = unitId ? GetUnit(state, unitId) : null;
  const hex = GetHex(state, key);
  if (!hex) return actions;

  if (unit) {
    const stats = GetUnitStats(unit.type);
    const reachable = FindReachableHexes(state, unit.id);
    if (reachable.has(key)) {
      actions.push({ kind: "Move", unitId: unit.id, toKey: key, label: "转移", cost: { moves: reachable.get(key) } });
    }
    if (stats.abilities.includes("Organize") && unit.key === key) {
      const check = CanFoundBase(state, unit.id, key);
      actions.push({
        kind: "FoundBase",
        unitId: unit.id,
        key,
        label: "开辟根据地",
        enabled: check.ok,
        reason: check.reason,
        cost: { cadre: ruleConstants.foundBaseCadreCost, labor: ruleConstants.foundBaseLaborCost },
      });
      actions.push({ kind: "Mobilize", unitId: unit.id, key, label: "发动群众", enabled: !unit.acted, cost: {} });
    }
    if (stats.abilities.includes("Recon")) {
      actions.push({ kind: "Recon", unitId: unit.id, key, label: "侦察", enabled: !unit.acted, cost: {} });
    }
    if (typeof Combat.ListAttackTargets === "function") {
      let targets = [];
      try {
        targets = Combat.ListAttackTargets(state, unit.id) ?? [];
      } catch (error) {
        targets = [];
      }
      if (targets.includes(key)) {
        // 打完必须转移是本作的核心节奏，因此把「转移」与「滞留」拆成两个明确的选项，
        // 而不是让玩家在看不见代价的情况下默认滞留。
        const withdrawOptions = ListWithdrawOptions(state, unit.id, key);
        if (withdrawOptions.length) {
          actions.push({
            kind: "Attack",
            unitId: unit.id,
            targetKey: key,
            withdrawKey: withdrawOptions[0].key,
            withdrawOptions,
            label: "伏击后转移",
            hint: `打完撤往 ${withdrawOptions[0].label}，暴露度按四分之一计`,
            enabled: !unit.acted,
          });
        }
        actions.push({
          kind: "Attack",
          unitId: unit.id,
          targetKey: key,
          label: withdrawOptions.length ? "强攻并滞留" : "攻击",
          hint: "不转移：暴露度按四倍计，极易招来扫荡",
          danger: true,
          enabled: !unit.acted,
        });
      }
    }
    // 破袭条件与结算口径一致：有铁路或任何等级的公路、且已抵近（≤1 格）。
    // 与攻击一样拆成「转移 / 滞留」两个明确选项——破袭完赖在路边同样是四倍暴露。
    if (stats.abilities.includes("Sabotage") && (hex.railway || hex.road >= 1) && HexDistanceKeys(unit.key, key) <= 1) {
      const sabotageWithdraws = ListWithdrawOptions(state, unit.id, key);
      if (sabotageWithdraws.length) {
        actions.push({
          kind: "Sabotage",
          unitId: unit.id,
          targetKey: key,
          withdrawKey: sabotageWithdraws[0].key,
          withdrawOptions: sabotageWithdraws,
          label: "破袭后转移",
          hint: `炸毁路段后撤往 ${sabotageWithdraws[0].label}，暴露度按四分之一计`,
          enabled: !unit.acted,
        });
      }
      actions.push({
        kind: "Sabotage",
        unitId: unit.id,
        targetKey: key,
        label: sabotageWithdraws.length ? "破袭并滞留" : "破袭",
        hint: "不转移：护路队会顺着痕迹搜索，暴露度按四倍计",
        danger: true,
        enabled: !unit.acted,
      });
    }
    const stronghold = GetStrongholdAt(state, key);
    if (stronghold && HexDistanceKeys(unit.key, key) <= 1) {
      actions.push({ kind: "Siege", unitId: unit.id, strongholdId: stronghold.id, mode: "Assault", label: "攻坚", enabled: !unit.acted });
      actions.push({ kind: "Siege", unitId: unit.id, strongholdId: stronghold.id, mode: "Blockade", label: "围困", enabled: !unit.acted });
    }
    // 平毁封锁：站在敌封锁沟/铁丝网所在格，可发动民工填沟拆网，解除对我方机动的迟滞。
    if (unit.key === key && (hex.blockade || 0) > 0) {
      const laborEnough = (state.stock.labor ?? 0) >= 3;
      actions.push({
        kind: "ClearBlockade",
        unitId: unit.id,
        key,
        label: "平毁封锁",
        hint: "发动民工填封锁沟、拆铁丝网（工 3，暴露度 +2）",
        enabled: !unit.acted && laborEnough,
        reason: laborEnough ? "" : "工不足",
        cost: { labor: 3 },
      });
    }
    if (unit.key === key) {
      actions.push({ kind: "Rest", unitId: unit.id, label: "休整 / 隐蔽", enabled: !unit.acted });
      for (const [workKey, definition] of Object.entries(workDefinitions())) {
        const check = CanBuildWork(state, unit.id, key, workKey);
        if (check.visible !== false) {
          actions.push({
            kind: "BuildWork",
            unitId: unit.id,
            key,
            workType: workKey,
            label: `修建${definition?.name ?? workKey}`,
            enabled: check.ok,
            reason: check.reason,
            cost: definition?.cost ?? {},
          });
        }
      }
    }
  }
  return actions;
}

/**
 * 列出「打完就转移」的可选落脚点：必须与本单位相邻、空着、且离目标更远。
 * 按隐蔽条件排序——地道、群众基础、地形隐蔽度好的地方优先。
 */
export function ListWithdrawOptions(state, unitId, targetKey) {
  const unit = GetUnit(state, unitId);
  if (!unit) return [];
  const options = [];
  for (const key of HexNeighborKeys(unit.key)) {
    const hex = GetHex(state, key);
    if (!hex) continue;
    if (GetEnemiesAt(state, key).length) continue;
    const stronghold = GetStrongholdAt(state, key);
    if (stronghold && stronghold.garrison > 0) continue;
    if (HexDistanceKeys(key, targetKey) <= HexDistanceKeys(unit.key, targetKey)) continue;
    const terrain = terrainDefinitions()[hex.terrain];
    const score =
      (Number(terrain?.concealment) || 0) * 40 +
      hex.massBase * 0.5 +
      (hex.tunnel ? 25 : 0) +
      (hex.control === "Base" ? 12 : hex.control === "Guerrilla" ? 6 : 0);
    // 一句理由：让选择器可以直接把"为什么撤这儿"讲给玩家听。
    const reason = hex.tunnel
      ? "有地道可依托，追兵进村也扑空"
      : hex.control === "Base"
        ? "根据地腹地，群众接应可靠"
        : hex.massBase >= 50
          ? "群众基础好，进村即可隐蔽"
          : (Number(terrain?.concealment) || 0) >= 0.55
            ? "地形隐蔽，便于甩开追兵"
            : "离交火地段稍远，可暂避锋芒";
    options.push({
      key,
      score,
      label: `${terrain?.shortName ?? terrain?.name ?? hex.terrain}${hex.tunnel ? "·地道" : ""}`,
      reason,
    });
  }
  return options.sort((a, b) => b.score - a.score);
}

/**
 * 可选的反扫荡方针 key（与 Script_Combat.combatConstants.sweepStanceProfiles 对齐）：
 * Disperse 分散转移·坚壁清野 / Decisive 正面决战 / CounterRaid 敌进我进 / Fortify 依托工事节节抗击。
 */
export const sweepStanceKeys = Object.freeze(
  Object.keys(Combat.combatConstants?.sweepStanceProfiles ?? { Disperse: true }),
);

/**
 * 设定本次反扫荡的应对方针。写入 state.sweepStance，
 * 扫荡大结算 ResolveSweepBattle 读取它；扫荡结束后自动清空（一次一定）。
 * 无效 key 原样返回传入 state（不落日志、不推进随机数）。
 */
export function SetSweepStance(state, stanceKey) {
  const profiles = Combat.combatConstants?.sweepStanceProfiles ?? {};
  const profile = profiles[stanceKey];
  if (!profile) return state;
  if (state.sweepStance === stanceKey) return state;
  const next = CloneState(state);
  next.sweepStance = stanceKey;
  PushLog(next, "方针", `反扫荡方针定为「${profile.name}」。`);
  return next;
}

export function CanBuildWork(state, unitId, key, workType) {
  const definition = workDefinitions()[workType];
  const hex = GetHex(state, key);
  if (!definition || !hex) return { ok: false, reason: "未知工事", visible: false };
  if (hex.works?.includes(workType)) return { ok: false, reason: "已建成", visible: false };
  if (hex.workBuild) return { ok: false, reason: "该地已有在建工程" };
  const effects = GetEffects(state);
  if (definition.requiresTech && !state.research.done.includes(definition.requiresTech)) {
    if (!effects.unlockWorks.includes(workType)) return { ok: false, reason: "科技未解锁", visible: false };
  }
  if (Array.isArray(definition.requiresTerrain) && definition.requiresTerrain.length) {
    if (!definition.requiresTerrain.includes(hex.terrain)) return { ok: false, reason: "地形不合", visible: false };
  }
  if (hex.control === "Enemy") return { ok: false, reason: "敌占区无法施工" };
  for (const [resource, amount] of Object.entries(definition.cost ?? {})) {
    if ((state.stock[resource] ?? 0) < amount) return { ok: false, reason: `${resourceLabels[resource] ?? resource}不足` };
  }
  return { ok: true, reason: "" };
}

export function GetActionPreview(state, action) {
  if (!action) return null;
  if (action.kind === "Attack" && typeof Combat.PreviewAttack === "function") {
    try {
      return Combat.PreviewAttack(state, action.unitId, action.targetKey, action);
    } catch (error) {
      return { valid: false, reason: "无法预测" };
    }
  }
  if (action.kind === "Mobilize") {
    const hex = GetHex(state, action.key);
    return { valid: true, lines: [`群众基础 ${Math.round(hex?.massBase ?? 0)} → ${Math.round(Math.min(100, (hex?.massBase ?? 0) + ruleConstants.mobilizeGain))}`] };
  }
  if (action.kind === "FoundBase") {
    const check = CanFoundBase(state, action.unitId, action.key);
    return { valid: check.ok, reason: check.reason, lines: ["建立村级支点，工作半径 1", `消耗 干部 ${ruleConstants.foundBaseCadreCost} · 工 ${ruleConstants.foundBaseLaborCost}`] };
  }
  return { valid: action.enabled !== false, reason: action.reason ?? "" };
}

function SpendStock(state, cost) {
  for (const [resource, amount] of Object.entries(cost ?? {})) {
    if (resourceKeys.includes(resource)) state.stock[resource] = Math.max(0, (state.stock[resource] ?? 0) - amount);
  }
}

function PushLog(state, tag, text) {
  state.log.push({ turn: state.turn, tag, text });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

/**
 * 代价账本的逐条记录：何时、何地、何因、多少人。
 * 只用于呈现（账本面板逐条页），绝不参与任何计算——账本红线不变。
 */
export function PushLedgerLog(state, entry) {
  if (!entry || !entry.text) return;
  state.ledgerLog = Array.isArray(state.ledgerLog) ? state.ledgerLog : [];
  state.ledgerLog.push({
    turn: entry.turn ?? state.turn,
    kind: entry.kind ?? "General",
    key: entry.key ?? null,
    text: entry.text,
    delta: entry.delta ?? {},
  });
  if (state.ledgerLog.length > 200) state.ledgerLog.splice(0, state.ledgerLog.length - 200);
}

/**
 * 记入代价账本。mitigate 为真时套用坚壁清野/地道/两面政权等减灾效果——
 * 减灾只能让代价更小，永远不会把代价变成收益，账本项也永不为负。
 */
function AddLedger(state, delta, mitigate = false) {
  const effects = mitigate ? GetEffects(state) : null;
  // 坚壁窖与地道的实际减灾能力：按根据地范围内已建工事的平均覆盖折算。
  const works = mitigate ? GetAverageWorkProtection(state) : null;
  for (const key of ledgerKeys) {
    let amount = Number(delta?.[key]) || 0;
    if (amount <= 0) continue;
    if (effects) {
      if (key === "grainSeized") amount *= (1 - effects.seizureResist) * (1 - (works?.grainProtection ?? 0));
      if (key === "civilianDeaths" || key === "displaced") {
        amount *= (1 - effects.civilianShelter) * (1 - (works?.scorchResist ?? 0) * 0.6);
      }
    }
    // 账本不出现小数人命：一位小数封顶（展示层取整）。
    state.ledger[key] = Math.round((state.ledger[key] + Math.max(0, amount)) * 10) / 10;
  }
}

/** 根据地范围内工事提供的平均保护度（坚壁清野真正落地的地方）。 */
function GetAverageWorkProtection(state) {
  let grainProtection = 0;
  let scorchResist = 0;
  let count = 0;
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex || (hex.control !== "Base" && hex.control !== "Guerrilla")) continue;
    const works = GetHexWorkEffects(hex);
    grainProtection += works.grainProtection;
    scorchResist += works.scorchResist;
    count += 1;
  }
  if (!count) return { grainProtection: 0, scorchResist: 0 };
  return { grainProtection: Clamp(grainProtection / count, 0, 0.7), scorchResist: Clamp(scorchResist / count, 0, 0.7) };
}

/** 执行一个行动，返回 { nextState, report }。report.effects 供渲染层派发特效。 */
export function PerformAction(state, action) {
  const next = CloneState(state);
  const report = { lines: [], effects: [], ok: true, reason: "" };
  const effects = GetEffects(next);

  const fail = (reason) => {
    report.ok = false;
    report.reason = reason;
    return { nextState: state, report };
  };

  switch (action.kind) {
    case "Move": {
      const unit = GetUnit(next, action.unitId);
      if (!unit) return fail("单位不存在");
      const reachable = FindReachableHexes(next, unit.id);
      if (!reachable.has(action.toKey)) return fail("超出行动范围");
      const fromKey = unit.key;
      unit.moves = Math.max(0, unit.moves - reachable.get(action.toKey));
      unit.key = action.toKey;
      // 人一走，围就撤了（防 tap-and-run 把据点补给永久冻结）。
      if (unit.combat?.blockading) unit.combat = { ...unit.combat, blockading: null };
      // 行军破隐蔽：伏击要靠事先潜伏，不是冲刺三格再开火。
      // 本回合累计转移超过 2 格，或落脚在无遮蔽又无群众掩护的开阔地，行迹即败露；
      // 短途转移且落点隐蔽（地形遮蔽 ≥0.45 或群众基础 ≥45）才保得住隐蔽。
      unit.movedThisTurn = (unit.movedThisTurn || 0) + HexDistanceKeys(fromKey, action.toKey);
      const hex = GetHex(next, action.toKey);
      const concealment =
        typeof Combat.ResolveHexStats === "function" ? Combat.ResolveHexStats(hex).concealment : 0.3;
      if (unit.movedThisTurn > 2) {
        unit.hidden = false;
      } else if (hex && hex.massBase >= 45) {
        unit.hidden = true; // 群众掩护下的短途转移，进村即可重新隐蔽
      } else if (concealment < 0.45) {
        unit.hidden = false; // 开阔地上的行军藏不住
      }
      report.effects.push({ kind: "Move", fromKey, toKey: action.toKey, unitId: unit.id });
      break;
    }
    case "Mobilize": {
      const unit = GetUnit(next, action.unitId);
      const hex = GetHex(next, action.key);
      if (!unit || !hex) return fail("无效目标");
      if (unit.acted) return fail("本回合已行动");
      const gain = ruleConstants.mobilizeGain * (1 + effects.massGrowth);
      hex.massBase = Clamp(hex.massBase + gain, 0, 100);
      unit.acted = true;
      unit.moves = 0;
      report.lines.push(`工作队在该村开会、算账、评定负担，群众基础 +${Math.round(gain)}。`);
      report.effects.push({ kind: "Mobilize", key: action.key });
      break;
    }
    case "Recon": {
      const unit = GetUnit(next, action.unitId);
      if (!unit) return fail("单位不存在");
      if (unit.acted) return fail("本回合已行动");
      const stats = GetUnitStats(unit.type);
      const perkEffects = GetUnitPerkEffects(unit);
      // 「顺风耳」：侦察半径 +1（与科技/区域的 intelRange 相加）
      const reconRange = 2 + effects.intelRange + (perkEffects?.reconRangeBonus ?? 0);
      for (const coordinate of HexesInRange(ParseHexKey(unit.key), reconRange)) {
        const hex = GetHex(next, HexKey(coordinate.q, coordinate.r));
        if (!hex) continue;
        hex.explored = true;
        hex.intel = Clamp(hex.intel + ruleConstants.reconIntelGain, 0, 100);
      }
      // 侦察标定：只有目力过硬的侦察骨干（sight ≥3——侦察员/骑兵通信/武工队，
      // 普通游击小组不够格）能把侦察范围内的敌军行止记成册。被标定的敌军
      // 两个季度内对我保持可见，打它胜率更高、缴获更多（Script_Combat 消费）。
      let markedCount = 0;
      let markedConvoy = false;
      if (stats.sight >= 3) {
        // 「标定老手」：时效 3 回合（默认 2），且这份名册的胜率加成升为 +0.07（默认 +0.05）。
        // 加成落在敌军的 markedOddsBonus 字段上（属于名册而非打的人），到期随 markedUntil 一并清除；
        // 普通标定不写该字段，Combat 端回退到 markedOddsBonus 常量 0.05——覆盖旧名册时同样删掉。
        const markTurns = perkEffects && perkEffects.markTurns > 0 ? perkEffects.markTurns : 2;
        const markBonus = perkEffects?.markedOddsBonus ?? 0;
        for (const enemy of next.enemies) {
          if (!enemy || (enemy.hp ?? 0) <= 0) continue;
          if (HexDistanceKeys(enemy.key, unit.key) > reconRange) continue;
          enemy.markedUntil = next.turn + markTurns;
          if (markBonus > 0) enemy.markedOddsBonus = markBonus;
          else delete enemy.markedOddsBonus;
          enemy.visibleToPlayer = true;
          if (enemy.type === "SupplyColumn") {
            // 辎重队被标定：行车路线对我「已知」（渲染层据此画出 convoy 路线）。
            enemy.routeKnown = true;
            markedConvoy = true;
          }
          report.effects.push({ kind: "IntelPing", key: enemy.key });
          markedCount += 1;
        }
      }
      unit.acted = true;
      unit.moves = 0;
      // 摸敌情也是历练：侦察 +2 经验；升到 2/3 级时挂起授衔待选
      unit.xp = (unit.xp || 0) + 2;
      if (unit.xp >= 100) {
        unit.level = (unit.level || 1) + 1;
        unit.xp -= 100;
        QueuePendingPerk(unit);
      }
      report.lines.push("侦察员摸清了周边的岗哨与巡逻规律。");
      if (markedCount > 0) {
        report.lines.push("侦察员把敌哨位、兵力、换岗时刻记在烟盒纸上送回来了。两个季度内，打这些敌人心里有底。");
      }
      if (markedConvoy) {
        report.lines.push("辎重队的行车路线与时刻也一并探明，沿线各村已得关照。");
      }
      report.effects.push({ kind: "IntelPing", key: unit.key });
      break;
    }
    case "FoundBase": {
      const check = CanFoundBase(next, action.unitId, action.key);
      if (!check.ok) return fail(check.reason);
      SpendStock(next, { cadre: ruleConstants.foundBaseCadreCost, labor: ruleConstants.foundBaseLaborCost });
      const hex = GetHex(next, action.key);
      const base = {
        id: MakeId(next, "b"),
        key: action.key,
        name: `${RegionNameAt(next, action.key)}支点`,
        tier: 1,
        population: 320,
        districts: [],
        queue: [],
        garrison: 1,
        unrest: 0,
      };
      next.bases.push(base);
      hex.baseId = base.id;
      hex.control = "Base";
      hex.massBase = Clamp(hex.massBase + 8, 0, 100);
      const unit = GetUnit(next, action.unitId);
      if (unit) {
        unit.acted = true;
        unit.moves = 0;
      }
      report.lines.push(`${base.name}建立。抗日民主政权在此挂牌。`);
      report.effects.push({ kind: "Build", key: action.key });
      break;
    }
    case "BuildWork": {
      const check = CanBuildWork(next, action.unitId, action.key, action.workType);
      if (!check.ok) return fail(check.reason);
      const definition = workDefinitions()[action.workType];
      SpendStock(next, definition.cost ?? {});
      const hex = GetHex(next, action.key);
      const buildTurns = Math.max(1, Number(definition.turns) || 1);
      if (buildTurns <= 1) {
        FinishHexWork(next, hex, action.workType, report);
      } else {
        // 工期真实生效：多回合工程排进地块工地，回合结算逐步推进。
        hex.workBuild = { type: action.workType, turnsLeft: buildTurns };
        report.lines.push(`${definition.name ?? action.workType}破土动工，约 ${buildTurns} 个季度完工。`);
        report.effects.push({ kind: "Build", key: action.key, payload: { started: true } });
      }
      const unit = GetUnit(next, action.unitId);
      if (unit) {
        unit.acted = true;
        unit.moves = 0;
      }
      break;
    }
    case "Rest": {
      const unit = GetUnit(next, action.unitId);
      if (!unit) return fail("单位不存在");
      const hex = GetHex(next, unit.key);
      const heal = Math.round(unit.maxHp * (0.16 + effects.healRate * 0.4) + (hex?.massBase ?? 0) * 0.02);
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(1, heal));
      unit.hidden = true;
      unit.fatigue = Math.max(0, unit.fatigue - 2);
      unit.acted = true;
      unit.moves = 0;
      report.lines.push("部队就地隐蔽休整，伤员送往老乡家中。");
      break;
    }
    case "ClearBlockade": {
      const unit = GetUnit(next, action.unitId);
      if (!unit) return fail("单位不存在");
      if (unit.acted) return fail("本回合已行动");
      const hex = GetHex(next, action.key ?? unit.key);
      if (!hex || hex.key !== unit.key) return fail("需站在封锁线上组织施工");
      if (!((hex.blockade || 0) > 0)) return fail("此处没有敌封锁工事");
      if ((next.stock.labor ?? 0) < 3) return fail("工不足");
      SpendStock(next, { labor: 3 });
      hex.blockade = Math.max(0, (hex.blockade || 0) - 2);
      // 白日里成百人出工，敌哨所看得见（暴露度 +2）
      next.exposure = Clamp(next.exposure + 2, 0, 100);
      unit.acted = true;
      unit.moves = 0;
      report.lines.push(
        hex.blockade > 0
          ? "附近各村出工，填平一段封锁沟、拔掉一片铁丝网桩，余下的明日再平。工地动静不小，敌哨已有察觉。"
          : "封锁沟填平、铁丝网拆净，大车道重新通行。工地动静不小，敌哨已有察觉。"
      );
      report.effects.push({ kind: "Build", key: hex.key });
      break;
    }
    case "Attack":
    case "Sabotage":
    case "Siege": {
      const resolved = ResolveCombatAction(next, action);
      if (!resolved.ok) return fail(resolved.reason);
      report.lines.push(...resolved.lines);
      report.effects.push(...resolved.effects);
      if (resolved.captures) report.captures = resolved.captures;
      if (resolved.casualties) report.casualties = resolved.casualties;
      return { nextState: resolved.state, report };
    }
    default:
      return fail("未知行动");
  }

  RecomputeMassAndControl(next);
  RecomputeVisibility(next);
  RecomputeEconomy(next);
  for (const line of report.lines) PushLog(next, "行动", line);
  return { nextState: next, report };
}

function ResolveCombatAction(state, action) {
  const handlers = {
    Attack: () => Combat.ResolveAttack?.(state, action.unitId, action.targetKey, action),
    Sabotage: () => Combat.ResolveSabotage?.(state, action.unitId, action.targetKey, action),
    Siege: () => Combat.ResolveSiege?.(state, action.unitId, action.strongholdId, action),
  };
  let outcome = null;
  try {
    outcome = handlers[action.kind]?.();
  } catch (error) {
    outcome = null;
  }
  if (!outcome || !outcome.nextState) {
    return { ok: false, reason: "战斗模块不可用", lines: [], effects: [], state };
  }
  const next = outcome.nextState;
  const combatReport = outcome.report ?? {};

  // 战斗模块已经把暴露度与账本写进了 nextState，这里只补它没写的那部分，
  // 避免同一笔代价被记两次。判据是 nextState 与传入 state 的实际差额。
  if (Math.abs((next.exposure ?? 0) - (state.exposure ?? 0)) < 1e-6) {
    next.exposure = Clamp((next.exposure ?? 0) + (combatReport.exposureDelta ?? 0), 0, 100);
  }
  const ledgerAlreadyApplied = ledgerKeys.some((key) => (next.ledger?.[key] ?? 0) > (state.ledger?.[key] ?? 0));
  if (!ledgerAlreadyApplied && combatReport.ledgerDelta) AddLedger(next, combatReport.ledgerDelta, true);

  // 缴获入账由战斗模块全权负责（Attack/Sabotage/Siege 四条路径都在 nextState
  // 里 ApplyCaptures 过了）。规则层绝不再加一遍——曾经这里的重复入账让整个
  // 缴获经济按声明参数的 2 倍运行（第二轮评审的 P0），冒烟有等值闸门盯着。
  if (action.kind === "Sabotage") next.sabotageTotal = (next.sabotageTotal || 0) + 1;
  const unit = GetUnit(next, action.unitId);
  if (unit) {
    unit.acted = true;
    unit.hidden = false;
    // 打别的仗就等于撤围：围困标记只在持续围困时有效（防 tap-and-run 冻结补给）。
    if (unit.combat?.blockading && action.kind !== "Siege") {
      unit.combat = { ...unit.combat, blockading: null };
    }
  }
  RecomputeMassAndControl(next);
  RecomputeVisibility(next);
  RecomputeEconomy(next);
  for (const line of combatReport.lines ?? []) PushLog(next, "战斗", line);
  return {
    ok: true,
    reason: "",
    state: next,
    lines: combatReport.lines ?? [],
    effects: (combatReport.effects ?? []).map((item) => ({ kind: item.kind, key: item.key, payload: item.payload })),
    // 缴获/伤亡数字原样上传（UI 结算卡与冒烟的入账等值闸门都要用）。
    captures: combatReport.captures ?? null,
    casualties: combatReport.casualties ?? null,
  };
}

// ---------------------------------------------------------------------------
// 授衔（特长二选一）
// ---------------------------------------------------------------------------
//
// 成长闭环：战斗/破袭/攻坚/侦察长经验 → 升到 2/3 级时（Script_Combat.GrantUnitXp 或
// 本文件 Recon 分支）写 unit.pendingPerk = 档位 → UI 读 ListPerkChoices 弹二选一 →
// ChoosePerk 落账。存档兼容：perks / pendingPerk / markedOddsBonus 全部可选，
// 缺省 = 无特长，saveVersion 维持 2 不动。

/**
 * 该单位当前的授衔候选（完整定义，UI 可直接渲染）。
 * 无待选（pendingPerk 缺失或表对不上）返回空数组。
 * @returns {Array<{id:string,name:string,detail:string,effects:Object,tier:number}>}
 */
export function ListPerkChoices(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (!unit || !unit.pendingPerk) return [];
  if (typeof DataUnits.GetPerkChoices !== "function") return [];
  const tier = unit.pendingPerk;
  return DataUnits.GetPerkChoices(unit.type, tier).map((definition) => ({
    id: definition.id,
    name: definition.name,
    detail: definition.detail,
    effects: { ...definition.effects },
    tier,
  }));
}

/**
 * 记功授衔：把 perkId 落进 unit.perks[]，清掉 pendingPerk，写一行档案体日志。
 * 校验不过（无待选 / 不在该档候选内 / 已持有）原样返回传入 state，不落日志不动随机数。
 * 若更高一档也已达级且未选（升级很快时可能 L2、L3 接连待选），随即再挂起下一档。
 * 「飞毛腿」类移动特长授衔当回合即时 +1 行动力（此后由 EndTurn 的重置维持）。
 */
export function ChoosePerk(state, unitId, perkId) {
  const existing = GetUnit(state, unitId);
  if (!existing || !existing.pendingPerk) return state;
  if (typeof DataUnits.GetPerkChoices !== "function") return state;
  const tier = existing.pendingPerk;
  const chosen = DataUnits.GetPerkChoices(existing.type, tier).find((definition) => definition.id === perkId);
  if (!chosen) return state;
  if (Array.isArray(existing.perks) && existing.perks.includes(perkId)) return state;

  const next = CloneState(state);
  const unit = GetUnit(next, unitId);
  unit.perks = [...(unit.perks ?? []), perkId];
  delete unit.pendingPerk;
  const moveGain = Number(chosen.effects?.moveBonus) || 0;
  if (moveGain > 0) {
    const priorMoves = unit.moves ?? 0;
    const priorMax = unit.maxMoves ?? priorMoves;
    unit.moves = priorMoves + moveGain;
    unit.maxMoves = priorMax + moveGain;
  }
  QueuePendingPerk(unit);
  PushLog(next, "授衔", `${GetUnitStats(unit.type).name}记功授衔：「${chosen.name}」。`);
  return next;
}

// ---------------------------------------------------------------------------
// 科技 / 政策 / 建设
// ---------------------------------------------------------------------------

const eraOrderKeys = ["Opening", "Growth", "Hardship", "Recovery", "Counter"];

export function IsResearchAvailable(state, id) {
  const definition = techDefinitions()[id] ?? doctrineDefinitions()[id];
  if (!definition) return false;
  if (state.research.done.includes(id)) return false;
  // 时期硬门槛：定义里声明的 era 字段真正生效——大生产、反攻编制这类
  // 后期路线不许在 1938 年就点出来。
  if (definition.era) {
    const needed = eraOrderKeys.indexOf(definition.era);
    const current = eraOrderKeys.indexOf(state.eraKey);
    if (needed >= 0 && current >= 0 && needed > current) return false;
  }
  // 事件解锁的条目（unlockTech/unlockDoctrine）可以越过前置直接研究——
  // 群众运动里长出来的东西不用等实验室的顺序。
  if (GetEffects(state).unlockResearch.includes(id)) return true;
  const requires = definition.requires ?? [];
  return requires.every((requirement) => state.research.done.includes(requirement));
}

export function ListAvailableResearch(state, tree = "tech") {
  const definitions = tree === "doctrine" ? doctrineDefinitions() : techDefinitions();
  return Object.values(definitions)
    .filter((definition) => definition?.id && IsResearchAvailable(state, definition.id))
    .map((definition) => definition.id);
}

export function SetResearch(state, id, tree = "tech") {
  const next = CloneState(state);
  if (!IsResearchAvailable(next, id)) return next;
  if (tree === "doctrine") {
    next.research.currentDoctrineId = id;
    next.research.doctrineProgress = 0;
  } else {
    next.research.currentId = id;
    next.research.progress = 0;
  }
  return next;
}

export function GetPolicySlots(state) {
  return 1 + GetEffects(state).policySlots;
}

export function SetPolicies(state, ids) {
  const next = CloneState(state);
  const definitions = policyDefinitions();
  const slots = GetPolicySlots(next);
  const unlocked = GetEffects(next).unlockPolicies;
  const valid = (ids ?? []).filter((id) => {
    const definition = definitions[id];
    if (!definition) return false;
    if (unlocked.includes(id)) return true;
    const requires = definition.requires ?? [];
    return requires.every((requirement) => next.research.done.includes(requirement));
  });
  const equippedNow = valid.slice(0, slots);
  // 换卡要付协调成本（干部下乡重新布置工作）：首次装填免费，此后每换上一张新卡收费。
  const previous = new Set(state.policy.equipped ?? []);
  if (previous.size > 0 && typeof DataTech?.GetPolicySwapCost === "function") {
    for (const id of equippedNow) {
      if (previous.has(id)) continue;
      try {
        SpendStock(next, DataTech.GetPolicySwapCost(id, previous.size) ?? {});
      } catch (error) {
        // 数据模块缺席时不收费
      }
    }
  }
  next.policy.equipped = equippedNow;
  next.policy.slots = slots;
  RecomputeEconomy(next);
  return next;
}

export function CanQueueDistrict(state, baseId, districtType) {
  const base = GetBase(state, baseId);
  const definition = districtDefinitions()[districtType];
  if (!base || !definition) return { ok: false, reason: "无效目标" };
  const tier = GetBaseTier(base.tier);
  const slots = (tier.districtSlots ?? 2) + GetEffects(state).baseSlots;
  const used = (base.districts?.length ?? 0) + (base.queue?.length ?? 0);
  if (used >= slots) return { ok: false, reason: "区域槽位已满" };
  if (base.districts?.some((item) => item.type === districtType)) {
    const maxPerBase = definition.maxPerBase ?? 1;
    const count = base.districts.filter((item) => item.type === districtType).length;
    if (count >= maxPerBase) return { ok: false, reason: "该区域已达上限" };
  }
  if (definition.requiresTech && !state.research.done.includes(definition.requiresTech)) {
    if (!GetEffects(state).unlockDistricts.includes(districtType)) return { ok: false, reason: "科技未解锁" };
  }
  for (const [resource, amount] of Object.entries(definition.cost ?? {})) {
    if ((state.stock[resource] ?? 0) < amount) return { ok: false, reason: `${resourceLabels[resource] ?? resource}不足` };
  }
  return { ok: true, reason: "" };
}

export function QueueDistrict(state, baseId, districtType) {
  const check = CanQueueDistrict(state, baseId, districtType);
  if (!check.ok) return state;
  const next = CloneState(state);
  const base = GetBase(next, baseId);
  const definition = districtDefinitions()[districtType];
  SpendStock(next, definition.cost ?? {});
  base.queue = base.queue ?? [];
  base.queue.push({ type: districtType, progress: 0, turns: definition.turns ?? 2 });
  RecomputeEconomy(next);
  return next;
}

/** 编成成本随时期起伏（困难期 ×1.35 等），UI 与校验统一从这里取。 */
export function GetTrainCost(state, unitType) {
  const stats = GetUnitStats(unitType);
  const modifier = Number(GetEraForTurn(state.turn)?.modifiers?.recruitCost) || 1;
  const cost = {};
  for (const [resource, amount] of Object.entries(stats.cost ?? {})) {
    cost[resource] = Math.round((Number(amount) || 0) * modifier * 10) / 10;
  }
  return cost;
}

export function CanTrainUnit(state, baseId, unitType) {
  const base = GetBase(state, baseId);
  const definition = unitDefinitions()[unitType];
  if (!base || !definition) return { ok: false, reason: "无效目标" };
  if (definition.side !== "Player") return { ok: false, reason: "不可编成" };
  if (definition.requiresTech && !state.research.done.includes(definition.requiresTech)) {
    if (!GetEffects(state).unlockUnits.includes(unitType)) return { ok: false, reason: "科技未解锁" };
  }
  for (const [resource, amount] of Object.entries(GetTrainCost(state, unitType))) {
    if ((state.stock[resource] ?? 0) < amount) return { ok: false, reason: `${resourceLabels[resource] ?? resource}不足` };
  }
  return { ok: true, reason: "" };
}

export function TrainUnit(state, baseId, unitType) {
  const check = CanTrainUnit(state, baseId, unitType);
  if (!check.ok) return state;
  const next = CloneState(state);
  const base = GetBase(next, baseId);
  SpendStock(next, GetTrainCost(next, unitType));
  AddUnit(next, unitType, base.key);
  RecomputeVisibility(next);
  RecomputeEconomy(next);
  PushLog(next, "编成", `${base.name}新编成${GetUnitStats(unitType).name}。`);
  return next;
}

function AdvanceConstruction(state) {
  const effects = GetEffects(state);
  const speed = 1 + effects.buildSpeed;
  for (const base of state.bases) {
    if (!base.queue?.length) continue;
    const item = base.queue[0];
    item.progress += speed;
    if (item.progress >= (item.turns ?? 2)) {
      base.queue.shift();
      base.districts = base.districts ?? [];
      base.districts.push({ type: item.type, done: true });
      const definition = districtDefinitions()[item.type];
      PushLog(state, "建设", `${base.name}建成${definition?.name ?? item.type}。`);
    }
  }
  // 地块工事的工期推进（多回合工程；被扫荡平毁的是已建成工事，工地不受影响）。
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex || !hex.workBuild) continue;
    hex.workBuild.turnsLeft -= speed;
    if (hex.workBuild.turnsLeft <= 0) {
      const workType = hex.workBuild.type;
      hex.workBuild = null;
      FinishHexWork(state, hex, workType, null);
    }
  }
}

/** 工事完工的统一落点：入列、接地道、结算暴露度影响、发战报。 */
function FinishHexWork(state, hex, workType, report) {
  const definition = workDefinitions()[workType] ?? {};
  hex.works = Array.from(new Set([...(hex.works ?? []), workType]));
  // 是否接通地道由工事自己的 setsTunnel 声明，而不是按名字硬编码。
  if (definition.effects?.setsTunnel || workType === "Tunnel") hex.tunnel = true;
  const workEffects = GetHexWorkEffects(hex);
  if (workEffects.exposureDelta) {
    state.exposure = Clamp(state.exposure + workEffects.exposureDelta, 0, 100);
  }
  const line = `${definition.name ?? workType}修成。`;
  if (report) {
    report.lines.push(line);
    report.effects.push({ kind: "Build", key: hex.key });
  } else {
    PushLog(state, "建设", line);
  }
}

function AdvanceResearch(state) {
  const activeTech = Boolean(state.research.currentId);
  const activeDoctrine = Boolean(state.research.currentDoctrineId);
  if (!activeTech && !activeDoctrine) return;
  const intelIncome = Math.max(0, (state.income.intel ?? 0));
  // 情报是研究的真燃料：先吃收入，再抽库存加速。攒下的情报换扫荡预警的可信度，
  // 花掉的换科技速度——攒还是花，是一条贯穿全程的真取舍。
  const stockDraw = activeTech ? Math.min(Math.max(0, state.stock.intel ?? 0), 6) : 0;
  if (stockDraw > 0) state.stock.intel = Math.round((state.stock.intel - stockDraw) * 10) / 10;
  // 两棵树共享同一班研究人手：同时开两线，两边都得慢下来。
  const shareScale = activeTech && activeDoctrine ? 0.55 : 1;
  const speedScale = 1 + Clamp(GetEffects(state).researchSpeed, 0, 0.5);
  const rate = (ruleConstants.researchBase + intelIncome + stockDraw * 0.6) * shareScale * speedScale;
  const finish = (id, tree) => {
    state.research.done.push(id);
    const definition = tree === "doctrine" ? doctrineDefinitions()[id] : techDefinitions()[id];
    PushLog(state, tree === "doctrine" ? "政权" : "技术", `${definition?.name ?? id} 完成。`);
    if (tree === "doctrine") {
      state.research.currentDoctrineId = null;
      state.research.doctrineProgress = 0;
    } else {
      state.research.currentId = null;
      state.research.progress = 0;
    }
    state.policy.slots = GetPolicySlots(state);
  };

  if (state.research.currentId) {
    const definition = techDefinitions()[state.research.currentId];
    const cost = (definition?.cost?.intel ?? 12) + (definition?.cost?.cadre ?? 0) * 6;
    state.research.progress += rate;
    if (state.research.progress >= cost) finish(state.research.currentId, "tech");
  }
  if (state.research.currentDoctrineId) {
    const definition = doctrineDefinitions()[state.research.currentDoctrineId];
    const cost = (definition?.cost?.intel ?? 10) + (definition?.cost?.cadre ?? 1) * 6;
    const doctrineRate = (ruleConstants.researchBase * 0.8 + (state.income.cadre ?? 0) * 8) * shareScale;
    state.research.doctrineProgress += doctrineRate;
    if (state.research.doctrineProgress >= cost) finish(state.research.currentDoctrineId, "doctrine");
  }
}

function GrowPopulation(state) {
  const effects = GetEffects(state);
  for (const base of state.bases) {
    const tier = GetBaseTier(base.tier);
    const cap = tier.populationCap ?? 900;
    const surplus = Math.max(-1, (state.stock.grain > 0 ? 1 : -1));
    const massAverage = AverageMassAround(state, base.key, tier.workRadius ?? 1);
    const rate = (0.05 + massAverage / 1400) * (1 + effects.populationGrowth) * surplus;
    base.population = Clamp(Math.round(base.population * (1 + rate)), 60, cap);
    // 不安到顶的地方留不住人：人口外流，流离入账（只记代价，不产生任何收益）。
    if ((base.unrest || 0) >= 80 && base.population > 120) {
      const outflow = Math.round(base.population * 0.06);
      base.population -= outflow;
      state.ledger.displaced += outflow;
      PushLedgerLog(state, {
        kind: "Unrest",
        key: base.key,
        text: `${FormatTurnDate(state.turn)}，${base.name}人心浮动，${outflow} 人携家外流。`,
        delta: { displaced: outflow },
      });
    }
    base.unrest = Clamp(base.unrest - 1 - effects.unrestDecay * 4, 0, 100);

    // 升级：人口与群众基础同时到位才能升级（人口线取自 Data_Units 的 upgradePopulation）。
    const threshold = Number(tier.upgradePopulation) || (base.tier === 1 ? 900 : 3000);
    const massGate = base.tier === 1 ? 56 : 66;
    if (base.tier < 3 && base.population >= threshold && massAverage > massGate) base.tier += 1;
  }
}

function AverageMassAround(state, key, radius) {
  let total = 0;
  let count = 0;
  for (const coordinate of HexesInRange(ParseHexKey(key), radius)) {
    const hex = state.map.hexes[HexKey(coordinate.q, coordinate.r)];
    if (!hex) continue;
    total += hex.massBase;
    count += 1;
  }
  return count ? total / count : 0;
}

// ---------------------------------------------------------------------------
// 回合结算
// ---------------------------------------------------------------------------

export function EndTurn(state) {
  if (state.over) return { nextState: state, report: { lines: [], effects: [] } };
  const next = CloneState(state);
  const report = { lines: [], effects: [], events: [] };
  const effects = GetEffects(next);

  // 1. 收支结算
  RecomputeEconomy(next);
  const net = GetNetIncome(next);
  for (const key of resourceKeys) {
    next.stock[key] = Math.max(0, Math.round(((next.stock[key] ?? 0) + net[key]) * 10) / 10);
  }
  // 情报过期作废：压过 120 的存量按 15%/季衰减——用不掉的消息不是资产。
  if (next.stock.intel > 120) {
    next.stock.intel = Math.round((120 + (next.stock.intel - 120) * 0.85) * 10) / 10;
  }
  if (net.grain < 0 && next.stock.grain <= 0) {
    // 缺粮按连续季数累进：一季是紧张，连年断粮是灾难。全部是代价，不产生任何收益。
    next.famineTurns = (next.famineTurns || 0) + 1;
    const severity = Math.min(ruleConstants.famineSeverityCap, next.famineTurns);
    for (const unit of next.units) unit.hp = Math.max(1, unit.hp - severity);
    for (const base of next.bases) base.unrest = Clamp(base.unrest + 6 + severity * 3, 0, 100);
    if (severity >= 2) {
      // 持续断粮连干部队伍也保不住：下乡就食、请长假、脱队——
      // 「一边全县断粮一边连开九个根据地」在数值上必须不成立。
      next.stock.cadre = Math.max(0, Math.round((next.stock.cadre - 0.25 * severity) * 10) / 10);
      let famineVillages = 0;
      for (const key of next.map.order) {
        const hex = next.map.hexes[key];
        if (!hex || (hex.control !== "Base" && hex.control !== "Guerrilla")) continue;
        hex.massBase = Clamp(hex.massBase - ruleConstants.famineMassHitPerLevel * severity, 0, 100);
        if (hex.feature === "Village") famineVillages += 1;
      }
      const displacedGain = Math.round(famineVillages * ruleConstants.famineDisplacedPerVillage * (severity - 1));
      if (displacedGain > 0) {
        next.ledger.displaced += displacedGain;
        PushLedgerLog(next, {
          kind: "Famine",
          text: `${FormatTurnDate(next.turn)}，连续第${next.famineTurns}季断粮，各村外出逃荒 ${displacedGain} 人。`,
          delta: { displaced: displacedGain },
        });
      }
      report.lines.push(
        severity >= 3
          ? `连续第${next.famineTurns}季断粮：部队大量减员，群众开始逃荒，根据地在塌。`
          : "断粮进入第二季。部队分散就食，村里的存粮也见了底。",
      );
    } else {
      report.lines.push("粮食见底。部队分散就食，机关减员。");
    }
  } else if (next.stock.grain > 0) {
    next.famineTurns = 0;
  }

  // 2. 建设与研究
  AdvanceConstruction(next);
  AdvanceResearch(next);
  GrowPopulation(next);
  for (const base of next.bases) {
    if ((base.disrupted || 0) > 0) base.disrupted -= 1;
  }

  // 3. 群众基础与情报漂移
  DriftMassBase(next);
  DriftIntel(next);

  // 4. 敌方回合
  const enemyReport = RunEnemyTurn(next);
  report.lines.push(...enemyReport.lines);
  report.effects.push(...enemyReport.effects);

  // 5. 暴露度与警备度（全局唯一的一处自然衰减；AI 侧不再重复扣减）
  // 比例衰减：高位回落快、低位回落慢，让"节制地打"落在 15~60 的可持续带内。
  const decayRate = ruleConstants.exposureDecayRateByEra[next.eraKey] ?? 0.14;
  const exposureDecay = Math.max(ruleConstants.exposureDecayFloor, next.exposure * decayRate) * (1 + effects.exposureDecay);
  next.exposure = Math.round(Clamp(next.exposure - exposureDecay, 0, 100) * 10) / 10;
  // 警备度：时期基线之上，根据地越多、经营的村庄越多，增速越高——治安战的常态压力。
  const baseHexCount = next.map.order.reduce(
    (count, key) => count + (next.map.hexes[key]?.control === "Base" ? 1 : 0),
    0,
  );
  const alertFloor = ruleConstants.alertFloorByEra[next.eraKey] ?? 10;
  const alertDrift =
    next.bases.length * ruleConstants.alertGrowthPerBase * 0.5 +
    baseHexCount * 0.02 +
    next.exposure * 0.03 -
    1.2 -
    effects.alertDecay -
    next.alert * 0.03;
  next.alert = Clamp(Math.max(next.alert + alertDrift, alertFloor), 0, 100);

  // 事件持续效果的到期处理（duration 按回合递减，到 0 撤销）。
  if (Array.isArray(next.eventEffects) && next.eventEffects.length) {
    next.eventEffects = next.eventEffects
      .map((entry) => (typeof entry?.duration === "number" ? { ...entry, duration: entry.duration - 1 } : entry))
      .filter((entry) => typeof entry?.duration !== "number" || entry.duration > 0);
  }

  // 6. 单位回合重置
  if (typeof Combat.TickCombatRecovery === "function") {
    try {
      const recovered = Combat.TickCombatRecovery(next);
      if (recovered && recovered.units && recovered.map) {
        // 整体采纳（部分字段回抄的采纳块一律禁止——事故档案）：
        // 据点补给恢复/警报松弛/坑道回填、治疗的药品扣费都在这份状态里，
        // 只抄 units/enemies 会让据点恢复系统整体死机（第三轮复核 P0）。
        Object.assign(next, recovered);
      } else if (recovered && recovered.units) {
        next.units = recovered.units;
        next.enemies = recovered.enemies ?? next.enemies;
      }
    } catch (error) {
      // 忽略，走内置恢复
    }
  }
  for (const unit of next.units) {
    const stats = GetUnitStats(unit.type);
    // 「飞毛腿」：行动力 +1，在科技 moveBonus 之上相加（授衔当回合的即时加点见 ChoosePerk）
    unit.moves = stats.moves + effects.moveBonus + (GetUnitPerkEffects(unit)?.moveBonus ?? 0);
    unit.maxMoves = unit.moves;
    unit.acted = false;
    unit.fatigue = Math.max(0, unit.fatigue - 1);
    const hex = GetHex(next, unit.key);
    if (!unit.hidden && hex && hex.massBase >= 50) unit.hidden = true;
  }

  // 被打散与归队：hp 打到 0 的部队不是全灭，而是被打散——
  // 在群众基础好的地区，人员分散隐蔽数个季度后减员归队；
  // 没有群众掩护就是永远的损失，骨干损失记入代价账本。
  const fallen = next.units.filter((unit) => unit.hp <= 0);
  next.units = next.units.filter((unit) => unit.hp > 0);
  for (const unit of fallen) {
    const stats = GetUnitStats(unit.type);
    const hex = GetHex(next, unit.key);
    const sheltered = hex && (hex.massBase >= 30 || hex.control === "Base" || hex.control === "Guerrilla");
    if (sheltered) {
      next.scattered = Array.isArray(next.scattered) ? next.scattered : [];
      next.scattered.push({ type: unit.type, name: stats.name, key: unit.key, returnTurn: next.turn + 2 });
      report.lines.push(`${stats.name}被打散。人员依托群众分散隐蔽，正设法归队。`);
      report.effects.push({ kind: "Retreat", key: unit.key, payload: { scattered: true } });
    } else {
      next.ledger.cadreLost += 1;
      PushLedgerLog(next, {
        kind: "UnitLost",
        key: unit.key,
        text: `${FormatTurnDate(next.turn)}，${stats.name}在无群众掩护的地区被打散，人员失散未归。`,
        delta: { cadreLost: 1 },
      });
      report.lines.push(`${stats.name}被打散在敌占区，人员失散未归。`);
    }
  }
  next.scattered = (next.scattered ?? []).filter((entry) => {
    if (entry.returnTurn > next.turn) return true;
    const stats = GetUnitStats(entry.type);
    // 归队点是打散地附近最近的我方控制区，不是任意远方的基地——
    // 被打散不能当成半价跨图传送（第二轮评审 P2）。
    let rallyKey = entry.key;
    let bestDistance = Infinity;
    for (const key of next.map.order) {
      const hex = next.map.hexes[key];
      if (!hex || (hex.control !== "Base" && hex.control !== "Guerrilla")) continue;
      const distance = HexDistanceKeys(entry.key, key);
      if (distance < bestDistance) {
        bestDistance = distance;
        rallyKey = key;
      }
    }
    // 收拢伤员要药：药够则减员近半归队，缺药则只回得来三成人。
    const medicineCost = Math.round(stats.maxHp * 0.06 * 10) / 10;
    const supplied = (next.stock.medicine ?? 0) >= medicineCost;
    if (supplied) next.stock.medicine = Math.round((next.stock.medicine - medicineCost) * 10) / 10;
    const unit = AddUnit(next, entry.type, rallyKey);
    unit.hp = Math.max(6, Math.round(stats.maxHp * (supplied ? 0.45 : 0.3)));
    unit.fatigue = 40;
    report.lines.push(
      supplied
        ? `${stats.name}的失散人员归队，减员近半，在就近的根据地重新集结。`
        : `${stats.name}的失散人员归队——缺医少药，抬回来的人不到三成。`,
    );
    return false;
  });

  // 7. 推进时间
  next.turn += 1;
  // 侦察标定过期清理：名册上的敌情两个季度后就旧了，不再作数。
  // 「标定老手」写下的加成（markedOddsBonus）属于名册，随名册一并作废。
  for (const enemy of next.enemies) {
    if (enemy && enemy.markedUntil !== undefined && next.turn >= enemy.markedUntil) {
      delete enemy.markedUntil;
      delete enemy.markedOddsBonus;
    }
  }
  const era = GetEraForTurn(next.turn);
  const eraChanged = era.key !== next.eraKey;
  next.eraKey = era.key;
  if (eraChanged) {
    report.lines.push(`进入${era.name}。`);
    report.events.push({ kind: "Era", eraKey: era.key });
  }
  // 反攻期开场的史实塌方：敌大批兵力南调，各据点守备折半，撑不住的炮楼直接弃守。
  // maxGarrison 不动——守备比骤降会解除对周边群众基础的压制，玩家能看见地图松动。
  if (eraChanged && era.key === "Counter" && !next.counterDrawdownDone) {
    next.counterDrawdownDone = true;
    const abandonedNames = [];
    for (const stronghold of next.strongholds) {
      if (stronghold.destroyed || (stronghold.garrison ?? 0) <= 0) continue;
      const reduced = Math.round(stronghold.garrison * 0.6 * 10) / 10;
      if (stronghold.type === "Blockhouse" && reduced < 2) {
        stronghold.destroyed = true;
        stronghold.abandoned = true;
        stronghold.garrison = 0;
        abandonedNames.push(stronghold.name);
        const hex = GetHex(next, stronghold.key);
        if (hex && hex.control === "Enemy") hex.control = "Contested";
      } else {
        stronghold.garrison = Math.max(1, reduced);
      }
    }
    report.lines.push(
      abandonedNames.length
        ? `敌大批兵力南调：各据点守备折半，${abandonedNames.slice(0, 3).join("、")}${abandonedNames.length > 3 ? `等 ${abandonedNames.length} 处` : ""}弃守。`
        : "敌大批兵力南调：各据点守备折半。",
    );
  }

  // 8. 历史事件
  const event = PickHistoricalEvent(next);
  if (event) {
    next.events.pending = event.id;
    report.events.push({ kind: "Historical", event });
  }

  RecomputeMassAndControl(next);
  RecomputeVisibility(next);
  RecomputeEconomy(next);

  if (next.turn >= next.maxTurns) {
    next.over = true;
    next.result = GetVictoryAssessment(next);
    report.events.push({ kind: "Ending", result: next.result });
  }

  for (const line of report.lines) PushLog(next, "回合", line);
  return { nextState: next, report };
}

function RunEnemyTurn(state) {
  const lines = [];
  const effects = [];
  if (typeof Ai.PlanEnemyTurn !== "function" || typeof Ai.ApplyEnemyTurn !== "function") {
    return { lines, effects };
  }
  let plan = null;
  try {
    plan = Ai.PlanEnemyTurn(state, {
      difficulty: state.difficulty,
      exposureSweepThreshold: ruleConstants.exposureSweepThreshold,
    });
  } catch (error) {
    return { lines, effects };
  }
  if (!plan) return { lines, effects };

  let outcome = null;
  try {
    outcome = Ai.ApplyEnemyTurn(state, plan);
  } catch (error) {
    outcome = null;
  }
  if (!outcome?.nextState) return { lines, effects };

  // Ai 返回的是新 state；把它的内容搬回当前 next（保持 EndTurn 的单一 next 对象语义）。
  const applied = outcome.nextState;
  state.map = applied.map;
  state.enemies = applied.enemies;
  state.strongholds = applied.strongholds;
  state.units = applied.units;
  state.bases = applied.bases;
  state.sweep = applied.sweep ?? null;
  state.rngState = applied.rngState;
  // AI 的跨回合记忆（方针迟滞、扫荡冷却、在建工程、守备欠账）必须一起搬运，
  // 否则它每回合都会失忆，战略层退化成随机切方针。
  if (applied.aiMemory) state.aiMemory = applied.aiMemory;
  // 敌情通报与"铁壁合围"挂起旗一起搬运（事件写旗、AI 兑现后摘旗）。
  state.enemyReadout = applied.enemyReadout ?? state.enemyReadout ?? null;
  state.pendingForcedSweep = applied.pendingForcedSweep ?? false;
  state.alert = applied.alert ?? state.alert;
  state.exposure = applied.exposure ?? state.exposure;
  // 扫荡结算写进 AI 侧状态的库存效应（敌进我进缴获、夺粮扣库、抽干部）、
  // 账本逐条与"方针一次一定"的清空必须一起搬运——曾经这里丢字段，
  // 夺粮 19~107 石从不落库存、方针 28/28 粘滞（第三轮复核 P0）。
  state.stock = applied.stock ?? state.stock;
  state.sweepStance = applied.sweepStance ?? null;
  if (Array.isArray(applied.ledgerLog)) state.ledgerLog = applied.ledgerLog;
  state.log = applied.log ?? state.log;
  if (applied.ledger) {
    // 敌方造成的代价经减灾效果折算后再入账（坚壁清野、地道、两面政权等）。
    const delta = {};
    for (const key of ledgerKeys) delta[key] = Math.max(0, (applied.ledger[key] ?? 0) - (state.ledger[key] ?? 0));
    AddLedger(state, delta, true);
  }

  const report = outcome.report ?? {};
  lines.push(...(report.lines ?? []));
  for (const item of report.effects ?? []) effects.push(item);

  // 扫荡到达：交给战斗模块做大结算。
  if (state.sweep && state.sweep.turnsUntil <= 0 && typeof Combat.ResolveSweepBattle === "function") {
    try {
      const sweepOutcome = Combat.ResolveSweepBattle(state, state.sweep);
      if (sweepOutcome?.nextState) {
        // 整体采纳（部分字段回抄的采纳块一律禁止——事故档案）。
        // 账本已在战斗模块按 shelter 结算，这里不再重复入账。
        Object.assign(state, sweepOutcome.nextState);
        state.sweep = null;
        state.sweepStance = null; // 方针一次一定，扫荡结束即清空
        const sweepReport = sweepOutcome.report ?? {};
        lines.push(...(sweepReport.lines ?? []));
        for (const item of sweepReport.effects ?? []) effects.push(item);
      }
    } catch (error) {
      state.sweep = null;
      state.sweepStance = null;
    }
  }
  return { lines, effects };
}

function PickHistoricalEvent(state) {
  const events = Array.isArray(DataHistory?.historicalEvents) ? DataHistory.historicalEvents : [];
  if (!events.length) return null;
  // 对象式条件（{ minExposure: 30 } 等）统一交给 Data_History.EvaluateEventCondition 判定，
  // 函数式条件照旧直接调用。判定上下文每回合只构建一次。
  const evaluateCondition =
    typeof DataHistory?.EvaluateEventCondition === "function" ? DataHistory.EvaluateEventCondition : null;
  const buildContext = typeof DataHistory?.BuildEventContext === "function" ? DataHistory.BuildEventContext : null;
  let context = null;
  if (evaluateCondition && buildContext) {
    try {
      context = buildContext({ ...state, firedEventIds: state.events.fired, flags: state.flags ?? [] });
    } catch (error) {
      context = null;
    }
  }
  const candidates = events.filter((event) => {
    if (!event?.id || state.events.fired.includes(event.id)) return false;
    if (event.era && event.era !== state.eraKey) return false;
    if (Array.isArray(event.turnRange) && (state.turn < event.turnRange[0] || state.turn > event.turnRange[1])) return false;
    if (typeof event.condition === "function") {
      try {
        if (!event.condition(state)) return false;
      } catch (error) {
        return false;
      }
    } else if (event.condition && typeof event.condition === "object" && context && evaluateCondition) {
      try {
        if (!evaluateCondition(event.condition, context)) return false;
      } catch (error) {
        return false;
      }
    }
    return true;
  });
  if (!candidates.length) return null;

  // 史实硬节点（mandatory）：时间窗走到最后一回合仍未触发的强制入列——
  // 铁壁合围、受降这类事件不因玩家打法而缺席。
  const due = candidates.find(
    (event) => event.mandatory && Array.isArray(event.turnRange) && state.turn >= event.turnRange[1],
  );
  if (due) {
    state.events.fired.push(due.id);
    return due;
  }

  const roll = NextRandom(state);
  if (roll > 0.62) return null;
  const totalWeight = candidates.reduce((sum, event) => sum + (event.weight ?? 1), 0);
  let cursor = NextRandom(state) * totalWeight;
  for (const event of candidates) {
    cursor -= event.weight ?? 1;
    if (cursor <= 0) {
      state.events.fired.push(event.id);
      return event;
    }
  }
  return null;
}

/** 玩家在事件卡上做出选择后调用。 */
export function ApplyEventChoice(state, eventId, optionId) {
  const next = CloneState(state);
  const events = Array.isArray(DataHistory?.historicalEvents) ? DataHistory.historicalEvents : [];
  const event = events.find((item) => item.id === eventId);
  const option = event?.options?.find((item) => item.id === optionId) ?? event?.options?.[0];
  next.events.pending = null;
  if (!option) return next;

  const optionEffects = option.effects ?? {};
  for (const [resource, amount] of Object.entries(optionEffects.stockDelta ?? {})) {
    if (resourceKeys.includes(resource)) next.stock[resource] = Math.max(0, (next.stock[resource] ?? 0) + Number(amount || 0));
  }
  if (typeof optionEffects.exposureDelta === "number") next.exposure = Clamp(next.exposure + optionEffects.exposureDelta, 0, 100);
  if (typeof optionEffects.alertDelta === "number") next.alert = Clamp(next.alert + optionEffects.alertDelta, 0, 100);
  if (typeof optionEffects.massDelta === "number") {
    for (const key of next.map.order) {
      const hex = next.map.hexes[key];
      if (hex && (hex.control === "Base" || hex.control === "Guerrilla")) {
        hex.massBase = Clamp(hex.massBase + optionEffects.massDelta, 0, 100);
      }
    }
  }
  // 事件持久效果：只要含任何 GetEffects 词汇表里的持久键就整体入列
  //（旧白名单只认 yieldBonus/flatYield/massGrowth，把村选的 policySlots、
  //  冬装的 healRate 等静默丢弃——评审证实的"虚假发奖"）。
  const oneShotKeys = new Set(["stockDelta", "exposureDelta", "alertDelta", "massDelta", "flags", "id", "label"]);
  const hasPersistent = Object.keys(optionEffects).some((key) => !oneShotKeys.has(key));
  if (hasPersistent) {
    next.eventEffects = next.eventEffects ?? [];
    next.eventEffects.push(optionEffects);
  }
  const ledgerCost = option.ledger ?? {};
  AddLedger(next, ledgerCost);
  const ledgerEntries = ledgerKeys
    .filter((key) => Number(ledgerCost[key]) > 0)
    .map((key) => `${ledgerLabels[key] ?? key} ${Math.round(Number(ledgerCost[key]))}`);
  if (ledgerEntries.length) {
    PushLedgerLog(next, {
      kind: "Event",
      text: `${FormatTurnDate(next.turn)}，《${event?.title ?? "事件"}》：${ledgerEntries.join("，")}。`,
      delta: { ...ledgerCost },
    });
  }

  // 事件旗标：写入 state.flags，供后续事件条件（requireFlags）与结局评定使用。
  if (Array.isArray(optionEffects.flags) && optionEffects.flags.length) {
    next.flags = Array.from(new Set([...(next.flags ?? []), ...optionEffects.flags]));
  }
  // 铁壁合围通路：挂起强制立案旗。若此刻已有合围在途，旗子会一直保留，
  // 等它结束后的第一个敌方回合无视冷却与概率直接再立案一次高强度合围
  // （走 PlanSweep 的现有数据结构；1941-42 年本就是反复合击）。
  if (optionEffects.forceSweep) {
    next.pendingForcedSweep = true;
    PushLog(next, "时局", "合围情报已经核实：敌重兵调动在即，各区立即坚壁清野、准备转移。");
  }

  PushLog(next, "时局", `${event.title}：${option.label}`);
  RecomputeMassAndControl(next);
  RecomputeEconomy(next);
  return next;
}

// ---------------------------------------------------------------------------
// 简报 / 终局评定
// ---------------------------------------------------------------------------

export function GetTurnBriefing(state) {
  const era = GetEraForTurn(state.turn);
  const forecast = ForecastSweep(state);
  const pendingUnits = state.units.filter((unit) => !unit.acted && unit.moves > 0).length;
  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    date: FormatTurnDate(state.turn),
    season: GetSeasonKey(state.turn),
    era,
    exposure: state.exposure,
    alert: state.alert,
    forecast,
    pendingUnits,
    needsResearch: !state.research.currentId,
    needsDoctrine: !state.research.currentDoctrineId,
    openPolicySlots: Math.max(0, GetPolicySlots(state) - state.policy.equipped.length),
    net: GetNetIncome(state),
    // 囚笼在收紧的可视化：敌方在建工事（只报我方侦知的部分）。
    enemyWorks: ListEnemyWorks(state),
    // AI 回合写入的结构化敌情（方针 / 守备调动 / 扫荡阶段 / 辎重路讯）。
    enemyReadout: state.enemyReadout ?? null,
    convoyNotices: state.enemyReadout?.convoyNotices ?? [],
  };
}

/**
 * 敌方在建工事清单（GetTurnBriefing.enemyWorks）。
 * 只报玩家侦知的：看得见的格（visibility ≥1）或情报覆盖 ≥25 的格。
 */
export function ListEnemyWorks(state) {
  const memory = state.aiMemory ?? state.map?.aiMemory ?? null;
  const projects = Array.isArray(memory?.construction) ? memory.construction : [];
  const works = [];
  for (const project of projects) {
    const hex = state.map.hexes[project.key];
    if (!hex) continue;
    const known = (hex.visibility ?? 0) >= 1 || (hex.intel ?? 0) >= 25;
    if (!known) continue;
    const placeName = featureDefinitions()[hex.feature]?.name ?? terrainDefinitions()[hex.terrain]?.name ?? "某地";
    const turnsLeft = Math.max(1, Number(project.turnsLeft) || 0);
    works.push({
      key: project.key,
      kind: project.kind,
      name: project.name,
      turnsLeft,
      totalTurns: Math.max(1, Number(project.totalTurns) || 1),
      label: `敌在${placeName}修筑${project.name}，约 ${turnsLeft} 回合完工。`,
    });
  }
  return works;
}

export function ForecastSweep(state) {
  // 预警的信息量必须由情报网决定：优先走 AI 侧的模糊化预报——
  // 覆盖低时只报大致方位与区间，甚至毫无预警；覆盖高才给确切目标与全部轴线。
  // （旧实现在 state.sweep 存在时直接返回精确情报，confidence 只是装饰，
  //  于是消息树/电台/青抗先全部变成不影响决策的摆设——评审证实的假选择。）
  if (typeof Ai.ForecastSweep === "function") {
    try {
      return Ai.ForecastSweep(state);
    } catch (error) {
      // 落到精确兜底
    }
  }
  if (state.sweep) {
    const coverage = AverageIntelAround(state, state.sweep.targetKey, 2);
    return {
      targetKey: state.sweep.targetKey,
      turnsUntil: state.sweep.turnsUntil,
      strength: state.sweep.strength,
      axisKeys: state.sweep.axisKeys ?? [],
      confidence: Clamp01(coverage / 100),
    };
  }
  return null;
}

function AverageIntelAround(state, key, radius) {
  let total = 0;
  let count = 0;
  for (const coordinate of HexesInRange(ParseHexKey(key), radius)) {
    const hex = state.map.hexes[HexKey(coordinate.q, coordinate.r)];
    if (!hex) continue;
    total += hex.intel;
    count += 1;
  }
  return count ? total / count : 0;
}

/**
 * 「人民安全」评估参数。
 *
 * 关键设计：代价必须按**强度**而不是**绝对总量**来衡量。绝对总量会惩罚扩张——
 * 根据地越大、牵动的群众越多，账面数字必然越大，于是认真经营的一局反而比
 * 缩在山里什么都不干的一局"更不安全"，这显然是错的。
 * 因此每一项都先除以一个规模基准（回合数 × 你实际负责的村庄数），
 * 再过一条饱和曲线 v^k/(v^k+r^k)，避免任何单项把总分砸到 0。
 *
 * 这些数字仍然只用于**评价**，不产生任何资源或奖励（Spec 第 7 节红线）。
 */
// reference 取自实测：稳健经营一局的强度约为 reference 的一半（≈25 分惩罚），
// 莽撞一局约为 3-6 倍（≈85 分惩罚）。改动数值后请重跑冒烟测试里的安全度排序断言。
export const safetyReferences = Object.freeze({
  exponent: 1.6,
  civilianDeaths: { reference: 0.069, weight: 0.3 },
  cadreLost: { reference: 0.034, weight: 0.2 },
  villagesBurned: { reference: 0.0123, weight: 0.2 },
  displaced: { reference: 6.6, weight: 0.15 },
  grainSeized: { reference: 27.7, weight: 0.15 },
});

/** 饱和曲线：v 等于 reference 时得 50 分惩罚，两端平滑不封顶到 0/100。 */
function SaturatingPenalty(value, reference, exponent) {
  const v = Math.max(0, value) ** exponent;
  const r = Math.max(1e-9, reference) ** exponent;
  return (100 * v) / (v + r);
}

export function ComputePeopleSafety(state) {
  const turns = Math.max(1, Math.min(state.turn, state.maxTurns));
  // 你实际负责的地盘规模：根据地格 + 每个根据地按其工作半径折算。
  const baseHexes = state.map.order.filter((key) => state.map.hexes[key]?.control === "Base").length;
  const scale = Math.max(4, baseHexes + state.bases.length * 3);
  const denominator = turns * scale;

  let penalty = 0;
  let weightTotal = 0;
  for (const key of ledgerKeys) {
    const setting = safetyReferences[key];
    if (!setting) continue;
    const intensity = (state.ledger[key] ?? 0) / denominator;
    penalty += SaturatingPenalty(intensity, setting.reference, safetyReferences.exponent) * setting.weight;
    weightTotal += setting.weight;
  }
  if (weightTotal <= 0) return 100;
  return Clamp(100 - penalty / weightTotal, 0, 100);
}

/**
 * 终局评定。主轴是根据地存续与建设、群众基础、人民安全，
 * 破袭牵制有强收益递减，歼敌不是主要计分项（Spec 第 7 节红线）。
 */
export function GetVictoryAssessment(state) {
  const baseHexes = state.map.order.filter((key) => {
    const hex = state.map.hexes[key];
    return hex && hex.control === "Base";
  }).length;
  // 口径统一为"人住的地方"：群众基础与存续都按聚落算——
  // 把整幅地图的荒山野岭算进分母，任何阈值都永远够不着（评审证实的口径病）。
  let villageTotal = 0;
  let baseVillages = 0;
  let settlementMass = 0;
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    if (hex.feature === "Village" || hex.feature === "Town" || hex.feature === "CountySeat") {
      villageTotal += 1;
      settlementMass += hex.massBase ?? 0;
      if (hex.control === "Base" || hex.control === "Guerrilla") baseVillages += 1;
    }
  }
  const settlementMassAverage = villageTotal ? settlementMass / villageTotal : 0;
  const population = state.bases.reduce((sum, base) => sum + base.population, 0);
  const districts = state.bases.reduce((sum, base) => sum + (base.districts?.length ?? 0), 0);
  const works = state.map.order.reduce((sum, key) => sum + (state.map.hexes[key]?.works?.length ?? 0), 0);

  // 存续 = 政权株数（边际递减）+ 治下村庄占比 + 经营地盘；单靠堆基地拿不满。
  const survival = Clamp(
    Math.sqrt(Math.max(0, state.bases.length)) * 8.5 +
      (baseVillages / Math.max(1, villageTotal)) * 120 +
      baseHexes * 0.5,
    0,
    100,
  );
  const construction = Clamp(districts * 5 + works * 2.4 + state.research.done.length * 2.6, 0, 100);
  const massScore = Clamp(settlementMassAverage * 1.5, 0, 100);
  const populationScore = Clamp((population / Math.max(1, state.initialPopulation || 1)) * 190, 0, 100);
  // 破袭收益递减：前 10 次有效，之后边际迅速衰减。
  const disruption = Clamp(28 * Math.log10(1 + (state.sabotageTotal || 0) * 1.6), 0, 60);

  const safety = ComputePeopleSafety(state);

  const total = Math.round(
    survival * 0.24 + massScore * 0.2 + construction * 0.19 + populationScore * 0.15 + safety * 0.16 + disruption * 0.06,
  );

  // 评级闸门：根据地规模不足或人民代价过大时封顶。
  // 评级带按 2026-07 大改后的真实分布重标（与结局重标同一方法论）：
  // 参照打法 ~45=B、优秀人类 ~56+=A、S 是极限局。
  let grade = total >= 68 ? "S" : total >= 56 ? "A" : total >= 45 ? "B" : total >= 32 ? "C" : "D";
  const order = ["D", "C", "B", "A", "S"];
  const capTo = (cap) => {
    if (order.indexOf(grade) > order.indexOf(cap)) grade = cap;
  };
  if (baseVillages < 7) capTo("C");
  else if (baseVillages < 12) capTo("A");
  if (state.bases.length < 2) capTo("C");
  if (safety < 45) capTo("B");
  if (safety < 25) capTo("C");

  const ending = PickEnding(state, { grade, total, survival, massScore, construction, safety, baseVillages });
  return {
    grade,
    total,
    metrics: { survival, massScore, construction, populationScore, safety, disruption },
    counts: { baseVillages, population, districts, works, techs: state.research.done.length, bases: state.bases.length },
    ledger: { ...state.ledger },
    ending,
  };
}

/**
 * 结局评定。Data_History 用的是**声明式条件对象**（minBaseRatio / minMass / …）
 * 而不是函数，所以必须走它自己的 EvaluateEnding，否则会退化成"永远取第一个"，
 * 让最差的一局拿到最好的结局。
 */
function PickEnding(state, summary) {
  // 口径与 GetVictoryAssessment / 事件系统一致：一律按"人住的地方"折算。
  // 旧口径把 520 格荒山野岭算进分母，8 个结局里只有失败档在数学上可达
  //（45/45 局全部「退回山里」——评审证实），所以这里必须用聚落口径。
  let villageCount = 0;
  let settlementMass = 0;
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    if (hex.feature === "Village" || hex.feature === "Town" || hex.feature === "CountySeat") {
      villageCount += 1;
      settlementMass += hex.massBase ?? 0;
    }
  }
  villageCount = Math.max(1, villageCount);
  const population = state.bases.reduce((sum, base) => sum + base.population, 0);

  const metrics = {
    baseRatio: summary.baseVillages / villageCount,
    massAverage: settlementMass / villageCount,
    districtCount: state.bases.reduce((sum, base) => sum + (base.districts?.length ?? 0), 0),
    populationRatio: (state.initialPopulation || 0) > 0 ? population / state.initialPopulation : 0,
    villageCount,
    civilianDeaths: state.ledger.civilianDeaths,
    villagesBurned: state.ledger.villagesBurned,
    displaced: state.ledger.displaced,
    cadreLost: state.ledger.cadreLost,
    grainSeized: state.ledger.grainSeized,
    baseCount: state.bases.length,
    techCount: state.research.done.length,
    grade: summary.grade,
    flags: state.flags ?? state.endingFlags ?? [],
  };

  if (typeof DataHistory?.EvaluateEnding === "function") {
    try {
      const ending = DataHistory.EvaluateEnding(metrics);
      if (ending?.title) return ending;
    } catch (error) {
      // 回退到内置结局
    }
  }
  const list = Object.values(Definitions(DataHistory, "endingDefinitions")).filter(Boolean);
  return (
    list.find((ending) => ending.key === "QuietBuilding") ??
    list[0] ?? {
      key: "Default",
      title: "根据地留存",
      body: "1945 年 8 月，日本宣布投降。根据地的人还在，地还在，账也还在。",
      epilogue: "",
    }
  );
}

// ---------------------------------------------------------------------------
// 存档
// ---------------------------------------------------------------------------

export function SerializeState(state) {
  return JSON.stringify({ version: saveVersion, state });
}

export function DeserializeState(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== saveVersion || !parsed.state?.map?.order?.length) return null;
    const state = parsed.state;
    // 补齐可能缺失的字段，容忍旧存档。
    state.ledger = { ...EmptyLedger(), ...(state.ledger ?? {}) };
    state.stock = { ...EmptyStock(), ...(state.stock ?? {}) };
    state.events = state.events ?? { fired: [], pending: null };
    state.log = state.log ?? [];
    state.ledgerLog = Array.isArray(state.ledgerLog) ? state.ledgerLog : [];
    state.scattered = Array.isArray(state.scattered) ? state.scattered : [];
    state.famineTurns = Number(state.famineTurns) || 0;
    state.counterDrawdownDone = Boolean(state.counterDrawdownDone);
    state.initialPopulation = Number(state.initialPopulation) || 0;
    RecomputeEconomy(state);
    return state;
  } catch (error) {
    return null;
  }
}
