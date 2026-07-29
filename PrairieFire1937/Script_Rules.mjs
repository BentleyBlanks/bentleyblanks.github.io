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

export const saveVersion = 1;
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
  exposureDecayBase: 5,
  exposureSweepThreshold: 58,
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
  researchBase: 4,
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
    events: { fired: [], pending: null },
    log: [],
    over: false,
    result: null,
  };

  SeedStartingForces(state, generated);
  SeedEnemyForces(state, generated);
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
      supply: 100,
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
  patrolKeys.forEach((key, index) => {
    AddEnemyUnit(state, ResolveEnemyUnitType(enemyTypes[index] ?? enemyTypes[0]), key, "Patrol");
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
      supply: 100,
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
  return {
    yieldBonus: effects.yieldBonus ?? {},
    flatYield: effects.flatYield ?? {},
    unlockUnits: effects.unlockUnits ?? [],
    unlockDistricts: effects.unlockDistricts ?? [],
    unlockWorks: effects.unlockWorks ?? [],
    unlockPolicies: effects.unlockPolicies ?? [],
    policySlots: effects.policySlots ?? 0,
    massGrowth: effects.massGrowth ?? 0,
    exposureDecay: effects.exposureDecay ?? 0,
    intelRange: effects.intelRange ?? 0,
    combatAmbush: effects.combatAmbush ?? 0,
    combatDefence: effects.combatDefence ?? 0,
    combatAttack: effects.combatAttack ?? 0,
    captureRate: effects.captureRate ?? 0,
    healRate: effects.healRate ?? 0,
    buildSpeed: effects.buildSpeed ?? 0,
    moveBonus: effects.moveBonus ?? 0,
    sabotageBonus: effects.sabotageBonus ?? 0,
    siegeBonus: effects.siegeBonus ?? 0,
    garrisonReveal: Boolean(effects.garrisonReveal),
    sweepWarning: effects.sweepWarning ?? 0,
    upkeepDiscount: effects.upkeepDiscount ?? 0,
    populationGrowth: effects.populationGrowth ?? 0,
    unrestDecay: effects.unrestDecay ?? 0,
    baseSlots: effects.baseSlots ?? 0,
    cadreGrowth: effects.cadreGrowth ?? 0,
    tunnelMove: Boolean(effects.tunnelMove),
    // 减灾类效果：只降低代价账本的增长，绝不产生资源或分数（Spec 第 7 节红线）。
    seizureResist: Clamp(effects.seizureResist ?? 0, 0, 0.85),
    civilianShelter: Clamp(effects.civilianShelter ?? 0, 0, 0.85),
    raw: effects,
  };
}

/** 某格是否被任一根据地工作范围覆盖。 */
export function GetWorkingBase(state, key) {
  for (const base of state.bases) {
    const radius = GetBaseTier(base.tier).workRadius ?? 1;
    if (HexDistanceKeys(base.key, key) <= radius) return base;
  }
  return null;
}

/** 计算本回合收入与维持费。 */
export function RecomputeEconomy(state) {
  const effects = GetEffects(state);
  const season = SeasonModifier(state.turn);
  const income = EmptyStock();
  const upkeep = EmptyStock();
  const detail = { grain: [], labor: [], ordnance: [], medicine: [], intel: [], cadre: [] };

  for (const base of state.bases) {
    const tier = GetBaseTier(base.tier);
    const radius = tier.workRadius ?? 1;
    const scale = tier.yieldScale ?? 1;
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
        const amount = hexYields[resource] * controlScale * massScale * scorchScale * scale * (season[resource] ?? 1);
        if (amount) income[resource] += amount;
      }
    }

    for (const district of base.districts ?? []) {
      if (!district.done) continue;
      const definition = districtDefinitions()[district.type];
      for (const resource of resourceKeys) {
        const amount = Number(definition?.yields?.[resource]) || 0;
        if (amount) income[resource] += amount;
      }
      upkeep.grain += Number(definition?.upkeep?.grain) || 0;
    }

    income.grain -= base.population * ruleConstants.grainPerPopulation;
    income.cadre += 0.06 + (base.tier - 1) * 0.05;
  }

  for (const unit of state.units) {
    const stats = GetUnitStats(unit.type);
    for (const [resource, amount] of Object.entries(stats.upkeep ?? {})) {
      if (resourceKeys.includes(resource)) upkeep[resource] += Number(amount) || 0;
    }
  }

  const discount = 1 - Clamp(effects.upkeepDiscount, 0, 0.6);
  for (const key of resourceKeys) upkeep[key] *= discount;

  for (const [resource, amount] of Object.entries(effects.flatYield)) {
    if (resourceKeys.includes(resource)) income[resource] += Number(amount) || 0;
  }
  for (const [resource, bonus] of Object.entries(effects.yieldBonus)) {
    if (resourceKeys.includes(resource)) income[resource] *= 1 + (Number(bonus) || 0);
  }
  income.cadre *= 1 + effects.cadreGrowth;

  // 情报网：基础情报按覆盖格数补足，保证情报系统在早期也能转起来。
  income.intel += 0.8 + state.bases.length * 0.35;

  for (const key of resourceKeys) {
    income[key] = Math.round(income[key] * 10) / 10;
    upkeep[key] = Math.round(upkeep[key] * 10) / 10;
  }

  state.income = income;
  state.upkeep = upkeep;
  state.incomeDetail = detail;
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
    enemy.visibleToPlayer = Boolean(hex && hex.visibility >= 1);
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
    if (hex.works?.includes("Beacon")) target += 18;
    if (hex.visibility >= 2) target += 20;
    target = Clamp(target + effects.intelRange * 6, 0, 100);
    hex.intel = Clamp(Lerp(hex.intel, target, 0.4), 0, 100);
  }
}

function DriftMassBase(state) {
  const effects = GetEffects(state);
  const growth = ruleConstants.massDriftBase * (1 + effects.massGrowth);
  for (const key of state.map.order) {
    const hex = state.map.hexes[key];
    if (!hex) continue;
    const stronghold = GetStrongholdAt(state, key);
    let delta = 0;

    if (hex.baseId) delta += growth * 1.4;
    else {
      const workingBase = GetWorkingBase(state, key);
      if (workingBase) delta += growth;
      else if (hex.massBase > 0) delta -= 0.9;
    }

    if (stronghold && stronghold.garrison > 0) delta += ruleConstants.massDriftEnemy;
    for (const neighborKey of HexNeighborKeys(key)) {
      const neighbor = state.map.hexes[neighborKey];
      if (!neighbor) continue;
      if (neighbor.control === "Base") delta += 0.32;
      if (GetStrongholdAt(state, neighborKey)) delta -= 0.45;
    }

    if (hex.scorch > 0) {
      // 被"三光"过的村庄群众基础恢复更慢——代价是长期的。
      delta -= hex.scorch * 0.03;
      hex.scorch = Math.max(0, hex.scorch - 3.5);
    }
    if (hex.feature === "Village") delta += 0.35;
    if (hex.works?.includes("Tunnel")) delta += 0.5;

    hex.massBase = Clamp(hex.massBase + delta, 0, 100);
  }
}

// ---------------------------------------------------------------------------
// 行动
// ---------------------------------------------------------------------------

function MoveCost(state, hex, effects) {
  const definition = terrainDefinitions()[hex.terrain];
  let cost = Number(definition?.moveCost) || 1;
  if (hex.road >= 1) cost = Math.min(cost, 1);
  if (hex.works?.includes("Tunnel") && effects.tunnelMove) cost = Math.min(cost, 1);
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
      const cost = current.cost + MoveCost(state, hex, effects);
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
    if (stats.abilities.includes("Sabotage") && (hex.railway || hex.road >= 2)) {
      actions.push({ kind: "Sabotage", unitId: unit.id, targetKey: key, label: "破袭", enabled: !unit.acted });
    }
    const stronghold = GetStrongholdAt(state, key);
    if (stronghold && HexDistanceKeys(unit.key, key) <= 1) {
      actions.push({ kind: "Siege", unitId: unit.id, strongholdId: stronghold.id, mode: "Assault", label: "攻坚", enabled: !unit.acted });
      actions.push({ kind: "Siege", unitId: unit.id, strongholdId: stronghold.id, mode: "Blockade", label: "围困", enabled: !unit.acted });
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
    options.push({
      key,
      score,
      label: `${terrain?.shortName ?? terrain?.name ?? hex.terrain}${hex.tunnel ? "·地道" : ""}`,
    });
  }
  return options.sort((a, b) => b.score - a.score);
}

export function CanBuildWork(state, unitId, key, workType) {
  const definition = workDefinitions()[workType];
  const hex = GetHex(state, key);
  if (!definition || !hex) return { ok: false, reason: "未知工事", visible: false };
  if (hex.works?.includes(workType)) return { ok: false, reason: "已建成", visible: false };
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
 * 记入代价账本。mitigate 为真时套用坚壁清野/地道/两面政权等减灾效果——
 * 减灾只能让代价更小，永远不会把代价变成收益，账本项也永不为负。
 */
function AddLedger(state, delta, mitigate = false) {
  const effects = mitigate ? GetEffects(state) : null;
  for (const key of ledgerKeys) {
    let amount = Number(delta?.[key]) || 0;
    if (amount <= 0) continue;
    if (effects) {
      if (key === "grainSeized") amount *= 1 - effects.seizureResist;
      if (key === "civilianDeaths" || key === "displaced") amount *= 1 - effects.civilianShelter;
    }
    state.ledger[key] += Math.max(0, amount);
  }
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
      const hex = GetHex(next, action.toKey);
      if (hex && hex.massBase >= 45) unit.hidden = true;
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
      for (const coordinate of HexesInRange(ParseHexKey(unit.key), 2 + effects.intelRange)) {
        const hex = GetHex(next, HexKey(coordinate.q, coordinate.r));
        if (!hex) continue;
        hex.explored = true;
        hex.intel = Clamp(hex.intel + ruleConstants.reconIntelGain, 0, 100);
      }
      unit.acted = true;
      unit.moves = 0;
      report.lines.push("侦察员摸清了周边的岗哨与巡逻规律。");
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
      hex.works = Array.from(new Set([...(hex.works ?? []), action.workType]));
      if (action.workType === "Tunnel") hex.tunnel = true;
      const unit = GetUnit(next, action.unitId);
      if (unit) {
        unit.acted = true;
        unit.moves = 0;
      }
      report.lines.push(`${definition.name ?? action.workType}修成。`);
      report.effects.push({ kind: "Build", key: action.key });
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
    case "Attack":
    case "Sabotage":
    case "Siege": {
      const resolved = ResolveCombatAction(next, action);
      if (!resolved.ok) return fail(resolved.reason);
      report.lines.push(...resolved.lines);
      report.effects.push(...resolved.effects);
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

  // 缴获由规则层入账（战斗模块只负责算出数量，不碰玩家库存）。
  for (const [resource, amount] of Object.entries(combatReport.captures ?? {})) {
    const gained = Number(amount) || 0;
    if (gained > 0 && resourceKeys.includes(resource)) {
      next.stock[resource] = Math.round(((next.stock[resource] ?? 0) + gained) * 10) / 10;
    }
  }
  if (action.kind === "Sabotage") next.sabotageTotal = (next.sabotageTotal || 0) + 1;
  const unit = GetUnit(next, action.unitId);
  if (unit) {
    unit.acted = true;
    unit.hidden = false;
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
  };
}

// ---------------------------------------------------------------------------
// 科技 / 政策 / 建设
// ---------------------------------------------------------------------------

export function IsResearchAvailable(state, id) {
  const definition = techDefinitions()[id] ?? doctrineDefinitions()[id];
  if (!definition) return false;
  if (state.research.done.includes(id)) return false;
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
  const valid = (ids ?? []).filter((id) => {
    const definition = definitions[id];
    if (!definition) return false;
    const requires = definition.requires ?? [];
    return requires.every((requirement) => next.research.done.includes(requirement));
  });
  next.policy.equipped = valid.slice(0, slots);
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

export function CanTrainUnit(state, baseId, unitType) {
  const base = GetBase(state, baseId);
  const stats = GetUnitStats(unitType);
  const definition = unitDefinitions()[unitType];
  if (!base || !definition) return { ok: false, reason: "无效目标" };
  if (definition.side !== "Player") return { ok: false, reason: "不可编成" };
  if (definition.requiresTech && !state.research.done.includes(definition.requiresTech)) {
    if (!GetEffects(state).unlockUnits.includes(unitType)) return { ok: false, reason: "科技未解锁" };
  }
  for (const [resource, amount] of Object.entries(stats.cost ?? {})) {
    if ((state.stock[resource] ?? 0) < amount) return { ok: false, reason: `${resourceLabels[resource] ?? resource}不足` };
  }
  return { ok: true, reason: "" };
}

export function TrainUnit(state, baseId, unitType) {
  const check = CanTrainUnit(state, baseId, unitType);
  if (!check.ok) return state;
  const next = CloneState(state);
  const base = GetBase(next, baseId);
  SpendStock(next, GetUnitStats(unitType).cost ?? {});
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
}

function AdvanceResearch(state) {
  const effects = GetEffects(state);
  const intelIncome = Math.max(0, (state.income.intel ?? 0));
  const rate = ruleConstants.researchBase + intelIncome;
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
    const doctrineRate = ruleConstants.researchBase * 0.8 + (state.income.cadre ?? 0) * 8;
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
  if (net.grain < 0 && next.stock.grain <= 0) {
    // 缺粮：部队减员、群众基础下滑。这是代价，不产生任何收益。
    for (const unit of next.units) unit.hp = Math.max(1, unit.hp - 1);
    for (const base of next.bases) base.unrest = Clamp(base.unrest + 8, 0, 100);
    report.lines.push("粮食见底。部队分散就食，机关减员。");
  }

  // 2. 建设与研究
  AdvanceConstruction(next);
  AdvanceResearch(next);
  GrowPopulation(next);

  // 3. 群众基础与情报漂移
  DriftMassBase(next);
  DriftIntel(next);

  // 4. 敌方回合
  const enemyReport = RunEnemyTurn(next);
  report.lines.push(...enemyReport.lines);
  report.effects.push(...enemyReport.effects);

  // 5. 暴露度与警备度
  const decay = ruleConstants.exposureDecayBase * (1 + effects.exposureDecay);
  next.exposure = Clamp(next.exposure - decay, 0, 100);
  next.alert = Clamp(next.alert + next.bases.length * ruleConstants.alertGrowthPerBase * 0.35 + next.exposure * 0.03 - 1.5, 0, 100);

  // 6. 单位回合重置
  if (typeof Combat.TickCombatRecovery === "function") {
    try {
      const recovered = Combat.TickCombatRecovery(next);
      if (recovered && recovered.units) {
        next.units = recovered.units;
        next.enemies = recovered.enemies ?? next.enemies;
      }
    } catch (error) {
      // 忽略，走内置恢复
    }
  }
  for (const unit of next.units) {
    const stats = GetUnitStats(unit.type);
    unit.moves = stats.moves + effects.moveBonus;
    unit.maxMoves = unit.moves;
    unit.acted = false;
    unit.fatigue = Math.max(0, unit.fatigue - 1);
    const hex = GetHex(next, unit.key);
    if (!unit.hidden && hex && hex.massBase >= 50) unit.hidden = true;
  }
  next.units = next.units.filter((unit) => unit.hp > 0);

  // 7. 推进时间
  next.turn += 1;
  const era = GetEraForTurn(next.turn);
  const eraChanged = era.key !== next.eraKey;
  next.eraKey = era.key;
  if (eraChanged) {
    report.lines.push(`进入${era.name}。`);
    report.events.push({ kind: "Era", eraKey: era.key });
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
    plan = Ai.PlanEnemyTurn(state, { difficulty: state.difficulty });
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
  state.alert = applied.alert ?? state.alert;
  state.exposure = applied.exposure ?? state.exposure;
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
        const swept = sweepOutcome.nextState;
        state.map = swept.map;
        state.units = swept.units;
        state.enemies = swept.enemies;
        state.strongholds = swept.strongholds;
        state.bases = swept.bases;
        state.rngState = swept.rngState;
        state.sweep = null;
        const sweepReport = sweepOutcome.report ?? {};
        if (sweepReport.ledgerDelta) AddLedger(state, sweepReport.ledgerDelta, true);
        lines.push(...(sweepReport.lines ?? []));
        for (const item of sweepReport.effects ?? []) effects.push(item);
      }
    } catch (error) {
      state.sweep = null;
    }
  }
  return { lines, effects };
}

function PickHistoricalEvent(state) {
  const events = Array.isArray(DataHistory?.historicalEvents) ? DataHistory.historicalEvents : [];
  if (!events.length) return null;
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
    }
    return true;
  });
  if (!candidates.length) return null;
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
  // 事件持久效果并入研究完成列表（以虚拟 id 承载），保证 GetEffects 能吃到。
  if (optionEffects.yieldBonus || optionEffects.flatYield || optionEffects.massGrowth) {
    next.eventEffects = next.eventEffects ?? [];
    next.eventEffects.push(optionEffects);
  }
  AddLedger(next, option.ledger ?? {});

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
  };
}

export function ForecastSweep(state) {
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
  if (typeof Ai.ForecastSweep === "function") {
    try {
      return Ai.ForecastSweep(state);
    } catch (error) {
      return null;
    }
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
 * 终局评定。主轴是根据地存续与建设、群众基础、人民安全，
 * 破袭牵制有强收益递减，歼敌不是主要计分项（Spec 第 7 节红线）。
 */
export function GetVictoryAssessment(state) {
  const baseVillages = state.map.order.filter((key) => {
    const hex = state.map.hexes[key];
    return hex && hex.control === "Base";
  }).length;
  const population = state.bases.reduce((sum, base) => sum + base.population, 0);
  const massTotal = state.map.order.reduce((sum, key) => sum + (state.map.hexes[key]?.massBase ?? 0), 0);
  const massAverage = state.map.order.length ? massTotal / state.map.order.length : 0;
  const districts = state.bases.reduce((sum, base) => sum + (base.districts?.length ?? 0), 0);
  const works = state.map.order.reduce((sum, key) => sum + (state.map.hexes[key]?.works?.length ?? 0), 0);

  const survival = Clamp(state.bases.length * 12 + baseVillages * 2.2, 0, 100);
  const construction = Clamp(districts * 5 + works * 2.4 + state.research.done.length * 2.6, 0, 100);
  const massScore = Clamp(massAverage * 1.35, 0, 100);
  const populationScore = Clamp(population / 90, 0, 100);
  // 破袭收益递减：前 10 次有效，之后边际迅速衰减。
  const disruption = Clamp(28 * Math.log10(1 + (state.sabotageTotal || 0) * 1.6), 0, 60);

  const cost = state.ledger;
  const costWeight =
    cost.civilianDeaths * 0.055 +
    cost.displaced * 0.014 +
    cost.villagesBurned * 1.5 +
    cost.cadreLost * 1.1 +
    cost.grainSeized * 0.02;
  const safety = Clamp(100 - costWeight, 0, 100);

  const total = Math.round(
    survival * 0.24 + massScore * 0.2 + construction * 0.19 + populationScore * 0.15 + safety * 0.16 + disruption * 0.06,
  );

  // 评级闸门：根据地规模不足或人民代价过大时封顶。
  let grade = total >= 86 ? "S" : total >= 74 ? "A" : total >= 60 ? "B" : total >= 44 ? "C" : "D";
  const order = ["D", "C", "B", "A", "S"];
  const capTo = (cap) => {
    if (order.indexOf(grade) > order.indexOf(cap)) grade = cap;
  };
  if (baseVillages < 8) capTo("C");
  else if (baseVillages < 14) capTo("A");
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

function PickEnding(state, summary) {
  const endings = Definitions(DataHistory, "endingDefinitions");
  const list = Object.values(endings).filter(Boolean);
  for (const ending of list) {
    if (typeof ending.condition !== "function") continue;
    try {
      if (ending.condition(state, summary)) return ending;
    } catch (error) {
      // 跳过异常的条件
    }
  }
  return (
    list.find((ending) => ending.key === "Default") ??
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
    RecomputeEconomy(state);
    return state;
  } catch (error) {
    return null;
  }
}
