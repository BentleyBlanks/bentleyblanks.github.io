// 《地下长城 · 冀中1942》 —— 状态构造、序列化与选择器。
// 本模块是状态契约（AGENTS.md §三）的唯一权威实现：CreateGame / CloneState /
// SerializeState / DeserializeState + 地道连通块、空气分区、容量、可达性等选择器。
// 纯逻辑：禁 window/document/three/Math.random/Date.now；随机只经 StepRng 且仅用于建局波次抽取。

import { HexKey, ParseHexKey, HexNeighborKeys, HexDistanceKeys, StepRng, HashString } from "./Script_Hex.mjs";
import { CFG, terrainDefinitions, unitDefinitions } from "./Data_Rules.mjs";
import { GetLevel, BuildBriefing, BuildSchedule } from "./Data_Levels.mjs";

// ---------------------------------------------------------------------------
// 通用小工具（其余模块共用）
// ---------------------------------------------------------------------------

/** 稳定键序遍历：所有依赖对象键序的决策一律走这里，保证读档续跑与一次跑通一致。 */
export function SortedKeys(obj) {
  return Object.keys(obj || {}).sort();
}

/** 单位 id 比较：先长度后字典序（u2 < u10）。 */
export function CompareIds(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function EdgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function EdgeEnds(edgeKey) {
  return edgeKey.split("|");
}

export function TerrainOf(state, key) {
  const hex = state.map.hexes[key];
  return hex ? terrainDefinitions[hex.terrain] : null;
}

/** 记事件：同时进 events 数组与 state.log（封顶截断）。visible=false 表示玩家不可见。 */
export function PushEvent(state, events, entry) {
  const record = { turn: state.meta.turn, kind: entry.kind, text: entry.text, visible: entry.visible !== false };
  if (entry.hex) record.hex = entry.hex;
  if (entry.layer) record.layer = entry.layer;
  state.log.push(record);
  if (state.log.length > CFG.logCap) state.log.splice(0, state.log.length - CFG.logCap);
  if (events) events.push(record);
  return record;
}

/** 代价账本：只增不减，永不为负，绝不产生任何奖励。 */
export function AddLedger(state, key, amount) {
  if (amount > 0 && Object.prototype.hasOwnProperty.call(state.ledger, key)) state.ledger[key] += amount;
}

/** 我方所致行动力池扣减（结算时统一按每回合上限截断）。 */
export function AddPlayerDrain(state, amount) {
  if (state.wave.status === "sweep" || state.wave.status === "withdrawing") {
    state.wave.playerDrainThisTurn += amount;
  }
}

export function SpendAmmo(state) {
  state.resources.ammo = Math.max(0, state.resources.ammo - CFG.ammoPerAttack);
}

export function GainAmmo(state, amount) {
  state.resources.ammo = Math.min(CFG.ammoMax, state.resources.ammo + amount);
}

export function UnitDef(unit) {
  return unitDefinitions[unit.type];
}

// ---------------------------------------------------------------------------
// 建局
// ---------------------------------------------------------------------------

function NextRandom(state) {
  const stepped = StepRng(state.rngState);
  state.rngState = stepped.state;
  return stepped.value;
}

function PickIndex(state, count) {
  return Math.floor(NextRandom(state) * count) % count;
}

function MakeAllyUnit(state, type, at) {
  const def = unitDefinitions[type];
  const id = `u${state.meta.nextUnitId += 1}`;
  state.units[id] = { id, side: "ally", type, hp: def.hp, mp: def.mp, acted: false, layer: "surface",
    pos: at, stance: "normal", breath: 0, revealed: false, columnId: null, attacked: false, freeMove: false,
    coverUses: 0, ambushHex: null, ambushTurn: 0, ambushStale: false };
  return id;
}

export function MakeEnemyUnit(state, type, at, columnId) {
  const def = unitDefinitions[type];
  const id = `e${state.meta.nextEnemyId += 1}`;
  state.units[id] = { id, side: "enemy", type, hp: def.hp, mp: def.mp, acted: false, layer: "surface",
    pos: at, stance: "normal", breath: 0, revealed: !def.disguised, columnId, attacked: false, freeMove: false };
  return id;
}

/** 建局：手工地图 + seed 白名单抽取（路线变体/入场口/目标村/时刻抖动/嫌疑平手盐）。 */
export function CreateGame(levelId, seed) {
  const level = GetLevel(levelId);
  const state = {
    meta: { level: level.id, seed: Number(seed) >>> 0, turn: 1, phase: "player", nextUnitId: 0, nextEnemyId: 0 },
    wave: { status: "quiet", sweepTurn: 0, pool: level.pool, decay: level.decay, playerDrainThisTurn: 0,
            smokeCharges: level.smokeCharges, hardEndTurn: level.hardEndTurn, withdrawAnnounced: false,
            sweepStartTurn: level.sweepStartTurn, expelled: false, roadCuts: 0, doneTurn: null, withdrawTurn: null,
            garrison: false, axisKills: { north: 0, south: 0 }, schedule: [], plan: {}, tieSalt: 0 },
    rngState: (Number(seed) >>> 0) || 1,
    map: { hexes: JSON.parse(JSON.stringify(level.hexes)), villages: {} },
    tunnels: { cells: {}, edges: {}, entrances: {}, vents: {}, digs: {}, smokeOps: [], nextSiteId: 0 },
    units: {},
    resources: { ammo: level.ammoStart },
    enemy: { columns: [], sightings: [], pendingOps: [], memory: { ambushedVillages: [] }, lastSeen: {} },
    wounded: { atVillage: JSON.parse(JSON.stringify(level.wounded || {})), inCells: {}, delivered: 0 },
    ledger: { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 },
    score: { kills: { inf: 0, puppet: 0, spy: 0, sapper: 0 }, withdrewEarlyTurns: 0, alliesLost: 0, hqOccupiedTurns: 0 },
    log: [],
    medals: null,
    result: null,
  };
  for (const village of level.villages) {
    state.map.villages[village.id] = { name: village.name, hexKeys: village.hexKeys.slice(),
      pop: village.pop, popStart: village.pop, grainOpen: village.grainOpen,
      organize: village.organize, organizeProgress: 0, hasHq: !!village.hasHq, burnedHexes: 0,
      seizedTurn: 0 };
  }
  for (const ally of level.allies) MakeAllyUnit(state, ally.type, ally.at);
  for (const key of level.tunnels.cells) {
    state.tunnels.cells[key] = { facility: null, grain: 0, civs: 0, smoke: 0, civBreath: 0, fightpostKnown: false };
  }
  for (const [a, b] of level.tunnels.edges) state.tunnels.edges[EdgeKey(a, b)] = { door: null };
  for (const key of level.tunnels.entrances) {
    const cap = TerrainOf(state, key)?.concealCap ?? 1;
    state.tunnels.entrances[key] = { conceal: Math.min(3, cap), expose: 0, known: false, sealed: false };
  }
  DrawWavePlan(state, level);
  PushEvent(state, null, { kind: "brief", text: `第▲区队进驻${level.villages[0].name}，${level.name}任务开始`, visible: true });
  return state;
}

/** seed 白名单抽取：仅此处消耗 rngState。抽哪几支、每支几选一由关卡的 seedDraws 声明，
 *  「抽出来长什么样」由 Data_Levels 的 BuildSchedule 决定（规则脚本不写关卡内容）。 */
function DrawWavePlan(state, level) {
  const plan = state.wave.plan;
  for (const draw of level.seedDraws || []) plan[draw.key] = PickIndex(state, draw.count);
  for (const entry of BuildSchedule(level, plan)) state.wave.schedule.push(entry);
  if (level.revenge) {
    state.wave.revenge = { ...level.revenge, casualties: 0, spawnedTurn: null, pending: false };
  }
  state.wave.tieSalt = Math.floor(NextRandom(state) * 997);            // 嫌疑同分平手子流
}

export function GetBriefing(state) {
  const level = GetLevel(state.meta.level);
  return BuildBriefing(level, state.wave.plan);
}

// ---------------------------------------------------------------------------
// 克隆与序列化（同 seed 同操作序列逐字节一致；读档续跑 = 一次跑通）
// ---------------------------------------------------------------------------

export function CloneState(state) {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

function StableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(StableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${StableStringify(value[key])}`).join(",")}}`;
}

export function SerializeState(state) {
  return StableStringify(state);
}

export function DeserializeState(text) {
  const state = JSON.parse(text);
  if (!state || !state.meta || !state.map || !state.units) throw new Error("存档损坏：缺少核心字段");
  return state;
}

export function HashState(state) {
  return HashString(SerializeState(state));
}

// ---------------------------------------------------------------------------
// 单位选择器
// ---------------------------------------------------------------------------

export function AllUnits(state) {
  return SortedKeys(state.units).sort(CompareIds).map((id) => state.units[id]);
}

export function AllyUnits(state) {
  return AllUnits(state).filter((unit) => unit.side === "ally" && unit.hp > 0);
}

export function EnemyUnits(state) {
  return AllUnits(state).filter((unit) => unit.side === "enemy" && unit.hp > 0);
}

export function CombatUnitCount(state) {
  return AllyUnits(state).filter((unit) => unit.type === "militia" || unit.type === "guerrilla").length;
}

export function UnitsOn(state, pos, layer) {
  return AllUnits(state).filter((unit) => unit.pos === pos && unit.layer === layer && unit.hp > 0);
}

export function RemoveUnit(state, unitId) {
  delete state.units[unitId];
  for (const column of state.enemy.columns) {
    const index = column.unitIds.indexOf(unitId);
    if (index >= 0) column.unitIds.splice(index, 1);
  }
  delete state.enemy.lastSeen[unitId];
}

// ---------------------------------------------------------------------------
// 地道选择器：连通块、空气分区、容量、可达性
// ---------------------------------------------------------------------------

/** 地下相邻格（须挖通的边；respectDoors=true 时关闭的隔断门视为不通）。 */
export function TunnelNeighbors(state, key, respectDoors) {
  const result = [];
  for (const nb of HexNeighborKeys(key)) {
    const edge = state.tunnels.edges[EdgeKey(key, nb)];
    if (!edge) continue;
    if (respectDoors && edge.door === "closed") continue;
    if (state.tunnels.cells[nb]) result.push(nb);
  }
  return result;
}

/** 自 startKey 起的连通格集合（含起点）。 */
export function ConnectedCells(state, startKey, respectDoors) {
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    const key = queue.shift();
    for (const nb of TunnelNeighbors(state, key, respectDoors)) {
      if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
  }
  return seen;
}

/** 全部空气分区：经「开放门」连通的地道连通块列表（键序稳定）。 */
export function AirZones(state) {
  const zones = [];
  const assigned = new Set();
  for (const key of SortedKeys(state.tunnels.cells)) {
    if (assigned.has(key)) continue;
    const zone = ConnectedCells(state, key, true);
    for (const cell of zone) assigned.add(cell);
    zones.push(zone);
  }
  return zones;
}

/** 某地道格所属的空气分区（经开放门连通）。格不存在时返回空集。 */
export function ZoneOfCell(state, key) {
  if (!state.tunnels.cells[key]) return new Set();
  return ConnectedCells(state, key, true);
}

/** 分区内未封的地道口键（暴露豆全程结算与被迫出洞都按此口径）。 */
export function ZoneEntranceKeys(state, zone) {
  const keys = [];
  for (const key of [...zone].sort()) {
    const entrance = state.tunnels.entrances[key];
    if (entrance && !entrance.sealed) keys.push(key);
  }
  return keys;
}

/** 分区内通风口数量（敌选烟攻的额外条件：通风口数 < 地道格数 / 3）。 */
export function ZoneVentCount(state, zone) {
  let count = 0;
  for (const key of zone) {
    if (state.tunnels.cells[key]?.facility === "vent" && !state.tunnels.vents[key]?.smoked) count += 1;
  }
  return count;
}

/** 分区是否有可呼吸的开口：未被烟熏的通风口，或未封且无烟的开放入口。 */
export function ZoneHasAir(state, zone) {
  for (const key of zone) {
    const cell = state.tunnels.cells[key];
    const entrance = state.tunnels.entrances[key];
    if (entrance && !entrance.sealed && cell.smoke === 0) return true;
    if (cell.facility === "vent" && state.tunnels.vents[key] && !state.tunnels.vents[key].smoked) return true;
  }
  return false;
}

/** 分区内可用出口（未封入口，烟不挡逃生），按到 fromKey 的地道步数排序。 */
export function ZoneExits(state, zone, fromKey) {
  const exits = [];
  for (const key of zone) {
    const entrance = state.tunnels.entrances[key];
    if (entrance && !entrance.sealed) exits.push(key);
  }
  exits.sort((a, b) => HexDistanceKeys(fromKey, a) - HexDistanceKeys(fromKey, b) || (a < b ? -1 : 1));
  return exits;
}

export function CellUnitCount(state, key) {
  return UnitsOn(state, key, "under").length;
}

export function CellHasRoom(state, key) {
  return CellUnitCount(state, key) < CFG.cellUnitCap;
}

/** 从某入口（respectDoors）可达的、还有余量的指定设施格，近者优先。 */
export function ReachableFacilityCells(state, startKey, facility) {
  if (!state.tunnels.cells[startKey]) return [];
  const zone = [...ConnectedCells(state, startKey, true)];
  zone.sort((a, b) => HexDistanceKeys(startKey, a) - HexDistanceKeys(startKey, b) || (a < b ? -1 : 1));
  return zone.filter((key) => {
    const cell = state.tunnels.cells[key];
    if (cell.facility !== facility) return false;
    if (facility === "storage") return cell.grain < CFG.storageGrainCap;
    if (facility === "shelter") return cell.civs + (state.wounded.inCells[key] || 0) < CFG.shelterCivCap;
    return true;
  });
}

/**
 * R2 P0-4：藏粮要求物理连通——本格**正下方**必须有地道格，该格所在分区里有还装得下的储粮洞，
 * 且分区里至少有一个未封的口（否则粮根本递不下去）。返回可用的储粮洞格键（近者优先）。
 */
export function StorageCellsUnder(state, hexKey) {
  const cell = state.tunnels.cells[hexKey];
  if (!cell) return [];
  if (!ZoneEntranceKeys(state, ZoneOfCell(state, hexKey)).length) return [];
  return ReachableFacilityCells(state, hexKey, "storage");
}

/** 该村中「脚底下真通着储粮洞」的村格（藏粮用；AsciiMap 只取其条数做提示）。 */
export function VillageStorageEntrances(state, villageId) {
  const village = state.map.villages[villageId];
  if (!village) return [];
  return village.hexKeys.filter((hexKey) => StorageCellsUnder(state, hexKey).length > 0);
}

export function GrainTotal(state) {
  let total = 0;
  for (const id of SortedKeys(state.map.villages)) total += state.map.villages[id].grainOpen;
  for (const key of SortedKeys(state.tunnels.cells)) total += state.tunnels.cells[key].grain;
  return total;
}

/** 洞存粮：胜负线与勋记都只认这一项（明存粮扫荡期每回合被搜走）。 */
export function TunnelGrainTotal(state) {
  let total = 0;
  for (const key of SortedKeys(state.tunnels.cells)) total += state.tunnels.cells[key].grain;
  return total;
}

export function PopTotal(state) {
  let total = 0;
  for (const id of SortedKeys(state.map.villages)) total += state.map.villages[id].pop;
  for (const key of SortedKeys(state.tunnels.cells)) total += state.tunnels.cells[key].civs;
  return total;
}

export function WoundedTotal(state) {
  let total = state.wounded.delivered;
  for (const id of SortedKeys(state.wounded.atVillage)) total += state.wounded.atVillage[id];
  for (const key of SortedKeys(state.wounded.inCells)) total += state.wounded.inCells[key];
  return total;
}

export function EntranceThreshold(entrance) {
  return entrance.conceal * CFG.exposePerConceal;
}

export function VentThreshold() {
  return CFG.ventConceal * CFG.exposePerConceal;
}

/** 地表通行判定（我方与敌军通用的地形层判定；单位阻挡由调用方处理）。 */
export function IsSurfacePassable(state, key) {
  const hex = state.map.hexes[key];
  if (!hex) return false;
  const def = terrainDefinitions[hex.terrain];
  if (def.passable) return true;
  return hex.bridge && !hex.roadBroken;    // 河沟仅桥格可行；桥破则不可通
}

/** 敌纵队移动成本：路 0.5、越野 1、河/断桥不可通（roadBroken 视同越野）。 */
export function EnemyMoveCost(state, key) {
  const hex = state.map.hexes[key];
  if (!hex) return Infinity;
  if (!IsSurfacePassable(state, key)) return Infinity;
  if (hex.road && !hex.roadBroken) return CFG.moveCost.road;
  return CFG.moveCost.offroad;
}

/** 「敌已警戒」：同一格连着两回合设伏，敌记住了这个地方（§2.5）。 */
export function IsHexAlerted(state, key) {
  return (state.map.hexes[key]?.alertedUntil || 0) >= state.meta.turn;
}

/** 寻路成本 = 移动成本 + 警戒惩罚：有路可绕就绕开警戒格，绕不开还是得硬过（不是墙）。 */
export function EnemyPathCost(state, key) {
  const cost = EnemyMoveCost(state, key);
  if (!Number.isFinite(cost)) return cost;
  return cost + (IsHexAlerted(state, key) ? CFG.alertedExtraCost : 0);
}

export function VillageOfHex(state, key) {
  const hex = state.map.hexes[key];
  return hex && hex.villageId ? state.map.villages[hex.villageId] : null;
}

/** 敌单位是否在某村 range 格内（组织免费进度停摆等用）。 */
export function EnemyNearVillage(state, villageId, range) {
  const village = state.map.villages[villageId];
  if (!village) return false;
  for (const unit of EnemyUnits(state)) {
    for (const hexKey of village.hexKeys) {
      if (HexDistanceKeys(unit.pos, hexKey) <= range) return true;
    }
  }
  return false;
}

/** 世界坐标行渲染顺序用：轴向键 → offset 行列。 */
export function KeyToOffset(key) {
  const { q, r } = ParseHexKey(key);
  return { x: q, y: r + Math.floor(q / 2) };
}

export function OffsetToKey(x, y) {
  return HexKey(x, y - Math.floor(x / 2));
}
