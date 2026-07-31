// 《地下长城 · 冀中1942》 —— 状态构造、序列化与选择器。
// 本模块是状态契约（AGENTS.md §三）的唯一权威实现：CreateGame / CloneState /
// SerializeState / DeserializeState + 地道连通块、空气分区、容量、群众批、可达性等选择器。
// 纯逻辑：禁 window/document/three/Math.random/Date.now；随机只经 StepRng 且仅用于建局波次抽取。

import { HexKey, ParseHexKey, HexNeighborKeys, HexDistanceKeys, StepRng, HashString } from "./Script_Hex.mjs";
import { CFG, TEXT, terrainDefinitions, unitDefinitions, disguiseDefinitions } from "./Data_Rules.mjs";
import { GetLevel, BuildBriefing, BuildSchedule, BuildActCard } from "./Data_Levels.mjs";

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

/** 高程（0 低 / 1 中 / 2 高）。水只往同高或更低处漫——这是第四幕的空间信息。 */
export function ElevOf(state, key) {
  const hex = state.map.hexes[key];
  return hex && Number.isFinite(hex.elev) ? hex.elev : 1;
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
// 幕次与解锁（认知递增在代码里的落点：动作合法性据此过滤）
// ---------------------------------------------------------------------------

export function LevelOf(state) {
  return GetLevel(state.meta.level);
}

/** 本幕是否开放某个动作类型。Move / UseEntrance / Rest / EndTurn 是永远开放的骨架动作。 */
export function ActionUnlocked(state, type) {
  const always = type === "Move" || type === "UseEntrance" || type === "Rest" || type === "EndTurn";
  if (always) return true;
  const unlocks = LevelOf(state).unlocks;
  if (!unlocks || !unlocks.actions) return true;
  return unlocks.actions.includes(type);
}

export function FacilityUnlocked(state, facility) {
  const unlocks = LevelOf(state).unlocks;
  if (!unlocks || !unlocks.facilities) return true;
  return unlocks.facilities.includes(facility);
}

export function UnlockedDisguises(state) {
  const unlocks = LevelOf(state).unlocks;
  return (unlocks && unlocks.disguises) ? unlocks.disguises.slice() : [];
}

/** 本幕是否开放「带领群众」——第一幕的洞不通，群众进去了就没处走，也就谈不上恐慌。 */
export function CivGuidanceOn(state) {
  const unlocks = LevelOf(state).unlocks;
  return !!(unlocks && unlocks.civGuidance);
}

export function StorageCapOf(state) {
  return LevelOf(state).storageCap ?? CFG.storageGrainCap;
}

export function ShelterCapOf(state) {
  return LevelOf(state).shelterCap ?? CFG.shelterCivCap;
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
    coverUses: 0, ambushHex: null, ambushTurn: 0, ambushStale: false, stunnedUntil: 0 };
  return id;
}

export function MakeEnemyUnit(state, type, at, columnId) {
  const def = unitDefinitions[type];
  const id = `e${state.meta.nextEnemyId += 1}`;
  state.units[id] = { id, side: "enemy", type, hp: def.hp, mp: def.mp, acted: false, layer: "surface",
    pos: at, stance: "normal", breath: 0, revealed: !def.disguised, columnId, attacked: false, freeMove: false };
  return id;
}

function NewCell() {
  return { facility: null, grain: 0, smoke: 0, water: 0, trapReady: false,
    fightpostHeat: 0, fightpostLastTurn: 0, fightpostKnown: false };
}

// ---------------------------------------------------------------------------
// 战役续承（R5 P0-3）：A2 起的开局盘面由「上一幕的终局地道网/口/伪装/存粮/弹药」派生。
//
//   ExtractCarry(终局 state) → 续承档（可 JSON 序列化，写进存档或 --carry 文件）
//   CreateGame(levelId, seed, { carry }) → 用续承档开局
//   不给续承档时，用关卡自带的**默认继承档** `level.carryDefault`（明确标注、且一定比认真打过差）
//
// 「跳过前几幕要付可感知的代价」就落在这里：默认档少格、少口、没伪装、洞里没粮、弹药也少。
// ---------------------------------------------------------------------------

/** 把一局终局状态压成续承档。只带走「你自己挖出来的东西」，不带走战果与账本。 */
export function ExtractCarry(state) {
  const cells = [];
  const facilities = [];
  let grain = 0;
  for (const key of SortedKeys(state.tunnels.cells)) {
    const cell = state.tunnels.cells[key];
    cells.push(key);
    if (cell.facility && cell.facility !== "trapdoor") facilities.push([key, cell.facility]);
    grain += cell.grain;
  }
  const edges = SortedKeys(state.tunnels.edges).map((edgeKey) => EdgeEnds(edgeKey));
  const entrances = [];
  const disguises = [];
  const sealed = [];
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const entrance = state.tunnels.entrances[key];
    entrances.push(key);
    if (entrance.sealed) sealed.push(key);
    if (entrance.disguise) disguises.push([key, entrance.disguise]);
  }
  return { source: state.meta.level, act: state.meta.act, isDefault: false,
    cells, edges, entrances, sealed, facilities, disguises,
    tunnelGrain: grain, ammo: state.resources.ammo,
    won: !!(state.result && state.result.won), grade: state.result ? state.result.grade : null };
}

/** 续承档落地到新局：只认新图上真实存在且挖得动的格，粮按本幕仓容截断。 */
function ApplyCarry(state, level, carry) {
  const valid = (key) => {
    const hex = state.map.hexes[key];
    return !!hex && terrainDefinitions[hex.terrain].diggable;
  };
  for (const key of (carry.cells || []).filter(valid)) {
    if (!state.tunnels.cells[key]) state.tunnels.cells[key] = NewCell();
  }
  for (const [a, b] of carry.edges || []) {
    if (!valid(a) || !valid(b) || !state.tunnels.cells[a] || !state.tunnels.cells[b]) continue;
    state.tunnels.edges[EdgeKey(a, b)] = { door: null };
  }
  const sealedSet = new Set(carry.sealed || []);
  for (const key of (carry.entrances || []).filter(valid)) {
    if (!state.tunnels.cells[key]) continue;
    const cap = TerrainOf(state, key)?.concealCap ?? 1;
    if ((cap ?? 0) <= 0) continue;
    state.tunnels.entrances[key] = { conceal: Math.min(3, cap), expose: 0, known: false,
      sealed: sealedSet.has(key), disguise: null };
  }
  for (const [key, facility] of carry.facilities || []) {
    const cell = state.tunnels.cells[key];
    if (!cell) continue;
    cell.facility = facility;
    if (facility === "vent") state.tunnels.vents[key] = { expose: 0, known: false, smoked: false };
    if (facility === "trapdoor") cell.trapReady = true;
  }
  for (const [key, disguise] of carry.disguises || []) {
    if (state.tunnels.entrances[key] && disguiseDefinitions[disguise]) {
      state.tunnels.entrances[key].disguise = disguise;
    }
  }
  // 洞存粮：按本幕仓容一洞一洞地填（装不下的就是上一幕白藏了——网不够大，粮也留不住）
  let grain = Math.max(0, Number(carry.tunnelGrain) || 0);
  for (const key of SortedKeys(state.tunnels.cells)) {
    if (grain <= 0) break;
    const cell = state.tunnels.cells[key];
    if (cell.facility !== "storage") continue;
    const take = Math.min(StorageCapOf(state), grain);
    cell.grain += take;
    grain -= take;
  }
  // 弹药：本幕照例配发 level.ammoStart；上一幕省下的比这多就按省下的算（认真打永远不吃亏）。
  // **默认继承档例外**：它自带一个明确写死的、比配发数更低的数字——那就是「跳过前作」的账。
  if (Number.isFinite(carry.ammo)) {
    state.resources.ammo = carry.isDefault
      ? Math.max(0, Math.min(CFG.ammoMax, carry.ammo))
      : Math.max(level.ammoStart, Math.min(CFG.ammoMax, carry.ammo));
  }
  state.meta.carry = {
    source: carry.source || (carry.isDefault ? "default" : null),
    isDefault: !!carry.isDefault,
    label: carry.label || (carry.isDefault ? TEXT.carryText.fromDefault : TEXT.carryText.fromPrev),
    notes: (carry.notes || []).slice(),
    tunnelGrain: Math.max(0, Number(carry.tunnelGrain) || 0),
    ammo: Number.isFinite(carry.ammo) ? carry.ammo : level.ammoStart,
    cells: Object.keys(state.tunnels.cells).length,
    entrances: SortedKeys(state.tunnels.entrances).filter((key) => !state.tunnels.entrances[key].sealed).length,
    sealed: SortedKeys(state.tunnels.entrances).filter((key) => state.tunnels.entrances[key].sealed).length,
    disguised: SortedKeys(state.tunnels.entrances).filter((key) => state.tunnels.entrances[key].disguise).length,
  };
}

/** 建局：手工地图 + seed 白名单抽取（路线变体/入场口/配比/时刻抖动/嫌疑平手盐）。
 *  options.carry：战役续承档（缺省用 level.carryDefault，再缺省才用 level.tunnels）。 */
export function CreateGame(levelId, seed, options = {}) {
  const level = GetLevel(levelId);
  const state = {
    meta: { level: level.id, act: level.act, seed: Number(seed) >>> 0, turn: 1, phase: "player",
            nextUnitId: 0, nextEnemyId: 0, nextCivId: 0 },
    wave: { status: "quiet", sweepTurn: 0, pool: level.pool, decay: level.decay, playerDrainThisTurn: 0,
            smokeCharges: level.smokeCharges, floodCharges: level.floodCharges || 0,
            hardEndTurn: level.hardEndTurn, withdrawAnnounced: false,
            sweepStartTurn: level.sweepStartTurn, expelled: false, roadCuts: 0, doneTurn: null, withdrawTurn: null,
            garrison: false, axisKills: { north: 0, south: 0 }, schedule: [], plan: {}, tieSalt: 0, revenge: null,
            // 本役各手反地道作业已用次数：敌据此轮着来，不把同一手用到底（R5 P0-5）
            opsUsed: { smoke: 0, flood: 0, blast: 0, breach: 0, excavate: 0, seal: 0 },
            scriptedBreachDone: false },
    rngState: (Number(seed) >>> 0) || 1,
    map: { hexes: JSON.parse(JSON.stringify(level.hexes)), villages: {} },
    tunnels: { cells: {}, edges: {}, entrances: {}, vents: {}, digs: {},
               smokeOps: [], floodOps: [], nextSiteId: 0 },
    units: {},
    civs: {},
    resources: { ammo: level.ammoStart },
    enemy: { columns: [], sightings: [], pendingOps: [], memory: { ambushedVillages: [] }, lastSeen: {} },
    ledger: { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 },
    score: { kills: { inf: 0, puppet: 0, spy: 0, sapper: 0 }, withdrewEarlyTurns: 0, alliesLost: 0,
             hqOccupiedTurns: 0, fightpostsUsed: [], civForcedOut: 0, civGuidedTrips: 0 },
    log: [],
    medals: null,
    result: null,
  };
  for (const village of level.villages) {
    state.map.villages[village.id] = { name: village.name, hexKeys: village.hexKeys.slice(),
      popStart: 0, grainOpen: village.grainOpen,
      organize: village.organize, organizeProgress: 0, hasHq: !!village.hasHq, burnedHexes: 0,
      seizedTurn: 0 };
  }
  for (const ally of level.allies) MakeAllyUnit(state, ally.type, ally.at);
  // 战役续承（R5 P0-3）：优先用调用方给的续承档 → 关卡的默认继承档 → 关卡原始 tunnels。
  const carry = options.carry || level.carryDefault || null;
  if (carry) {
    ApplyCarry(state, level, carry);
  } else {
    for (const key of level.tunnels.cells) state.tunnels.cells[key] = NewCell();
    for (const [a, b] of level.tunnels.edges) state.tunnels.edges[EdgeKey(a, b)] = { door: null };
    for (const key of level.tunnels.entrances) {
      const cap = TerrainOf(state, key)?.concealCap ?? 1;
      state.tunnels.entrances[key] = { conceal: Math.min(3, cap), expose: 0, known: false, sealed: false, disguise: null };
    }
    for (const [key, facility] of level.tunnels.facilities || []) {
      const cell = state.tunnels.cells[key];
      if (!cell) continue;
      cell.facility = facility;
      if (facility === "vent") state.tunnels.vents[key] = { expose: 0, known: false, smoked: false };
      if (facility === "trapdoor") cell.trapReady = true;
    }
    for (const [key, disguise] of level.tunnels.disguises || []) {
      if (state.tunnels.entrances[key] && disguiseDefinitions[disguise]) {
        state.tunnels.entrances[key].disguise = disguise;
      }
    }
  }
  // 逐口暴露阈值覆写（第一幕：祖辈挖的土口摆在明处，4 豆就翻出来）
  for (const [key, threshold] of level.entranceThresholds || []) {
    if (state.tunnels.entrances[key]) state.tunnels.entrances[key].threshold = threshold;
  }
  // 群众批：按关卡声明展开成独立的「批」（老弱/青壮/伤员），每批有自己的位置与恐慌值。
  // R5 P0-2：地面上的群众也有**格号**——敌纵队踩上哪一格，那一格的人就被拉走。
  for (const batch of level.civBatches || []) {
    const village = state.map.villages[batch.village];
    const homeHexes = village ? village.hexKeys : [];
    for (let index = 0; index < batch.count; index += 1) {
      const id = `c${state.meta.nextCivId += 1}`;
      const hex = homeHexes.length ? homeHexes[state.meta.nextCivId % homeHexes.length] : null;
      state.civs[id] = { id, kind: batch.kind, home: batch.village, loc: "village", at: batch.village,
        hex, panic: 0, fate: null };
      if (village) village.popStart += 1;
    }
  }
  DrawWavePlan(state, level);
  PushEvent(state, null, { kind: "brief",
    text: `第${["零", "一", "二", "三", "四", "五"][level.act] || level.act}幕《${level.name}》——${level.villages[0].name}`,
    visible: true });
  return state;
}

/** seed 白名单抽取：仅此处消耗 rngState。 */
function DrawWavePlan(state, level) {
  const plan = state.wave.plan;
  for (const draw of level.seedDraws || []) plan[draw.key] = PickIndex(state, draw.count);
  for (const entry of BuildSchedule(level, plan)) state.wave.schedule.push(entry);
  if (level.revengeVariants) {
    const variant = level.revengeVariants[(plan.revenge || 0) % level.revengeVariants.length];
    state.wave.revenge = { ...variant, watch: level.revengeWatch, casualties: 0, spawnedTurn: null, pending: false };
  }
  state.wave.tieSalt = Math.floor(NextRandom(state) * 997);            // 嫌疑同分平手子流
}

export function GetBriefing(state) {
  const level = GetLevel(state.meta.level);
  return BuildBriefing(level, state.wave.plan);
}

export function GetActCard(state) {
  return BuildActCard(GetLevel(state.meta.level));
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
// 群众批选择器（AGENTS.md §2.9：以「批」计，分老弱/青壮/伤员）
// ---------------------------------------------------------------------------

export function AllCivs(state) {
  return SortedKeys(state.civs).sort(CompareIds).map((id) => state.civs[id]);
}

/** 还在场（没被抓、没罹难）的群众批。 */
export function LiveCivs(state) {
  return AllCivs(state).filter((civ) => civ.loc !== "lost");
}

export function CivsAtVillage(state, villageId) {
  return LiveCivs(state).filter((civ) => civ.loc === "village" && civ.at === villageId);
}

export function CivsInCell(state, key) {
  return LiveCivs(state).filter((civ) => civ.loc === "cell" && civ.at === key);
}

/** 还站在**地面某一格**上的群众批（R5 P0-2：抓丁挂在这里，不再挂在「村里还有没有粮」）。 */
export function CivsOnHex(state, key) {
  return LiveCivs(state).filter((civ) => civ.loc === "village" && civ.hex === key);
}

/** 把一批群众安置到某个村格上（村口没送走、被逼出洞、扫荡结束都走这里，保证 hex 恒有值）。 */
export function PlaceCivOnHex(state, civ, villageId, hexKey) {
  const village = state.map.villages[villageId] || null;
  civ.loc = "village";
  civ.at = villageId;
  civ.hex = hexKey && state.map.hexes[hexKey] ? hexKey
    : (village && village.hexKeys.length ? village.hexKeys[0] : null);
  civ.panic = 0;
}

export function CivSlots(civ) {
  return CFG.civ.slots[civ.kind] || 1;
}

export function CivSpeed(civ) {
  return CFG.civ.speed[civ.kind] || 1;
}

/** 某地道格的铺位上限：藏人室按关卡容量，普通巷子只能临时挤 2 个铺位。 */
export function CellCivCap(state, key) {
  const cell = state.tunnels.cells[key];
  if (!cell) return 0;
  return cell.facility === "shelter" ? ShelterCapOf(state) : CFG.corridorCivCap;
}

export function CellCivUsed(state, key) {
  return CivsInCell(state, key).reduce((sum, civ) => sum + CivSlots(civ), 0);
}

export function CellCivRoom(state, key) {
  return Math.max(0, CellCivCap(state, key) - CellCivUsed(state, key));
}

/** 群众保全数（终局评定的分母是 CivTotal）。 */
export function CivSafeCount(state) {
  return LiveCivs(state).length;
}

export function CivTotal(state) {
  return AllCivs(state).length;
}

export function CivLostCount(state) {
  return AllCivs(state).filter((civ) => civ.loc === "lost").length;
}

export function CivSafeRatio(state) {
  const total = CivTotal(state);
  return total > 0 ? CivSafeCount(state) / total : 1;
}

/** 群众批离场（被抓 / 罹难）：只写代价簿，永不产生任何收益。 */
export function LoseCiv(state, civ, fate) {
  civ.loc = "lost";
  civ.at = null;
  civ.hex = null;
  civ.panic = 0;
  civ.fate = fate;
  AddLedger(state, fate === "dead" ? "civDead" : "civCaptured", 1);
}

/** 兼容口径：人口总数（=还在场的批数）。 */
export function PopTotal(state) {
  return CivSafeCount(state);
}

/** 伤员批（第一幕起就存在的一类群众，速度慢、占两个铺位）。 */
export function WoundedTotal(state) {
  return LiveCivs(state).filter((civ) => civ.kind === "wounded").length;
}

export function VillagePop(state, villageId) {
  return CivsAtVillage(state, villageId).length;
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

/** 分区内未封的地道口键。 */
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

/** 分区内可用出口（未封入口），按到 fromKey 的地道步数排序。
 *  forCivs=true 时排除群众过不去的伪装口（水井口窄，群众上不来）。 */
export function ZoneExits(state, zone, fromKey, forCivs) {
  const exits = [];
  for (const key of zone) {
    const entrance = state.tunnels.entrances[key];
    if (!entrance || entrance.sealed) continue;
    if (forCivs && !EntranceCivPassable(entrance)) continue;
    exits.push(key);
  }
  exits.sort((a, b) => HexDistanceKeys(fromKey, a) - HexDistanceKeys(fromKey, b) || (a < b ? -1 : 1));
  return exits;
}

export function EntranceCivPassable(entrance) {
  if (!entrance || !entrance.disguise) return true;
  const def = disguiseDefinitions[entrance.disguise];
  return !def || def.civPassable !== false;
}

export function EntranceGuideBonus(entrance) {
  if (!entrance || !entrance.disguise) return 0;
  const def = disguiseDefinitions[entrance.disguise];
  return def ? (def.guideBonus || 0) : 0;
}

/** 压制（R5 P0-4）：守洞打退攻入的那个单位，下一回合抬不起头——`stunnedUntil` 到期前不能行动。 */
export function StunUnit(state, unit, turns) {
  unit.stunnedUntil = Math.max(unit.stunnedUntil || 0, state.meta.turn + (turns || 1));
  unit.stance = "stunned";
}

export function IsStunned(state, unit) {
  return (unit.stunnedUntil || 0) >= state.meta.turn;
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
    if (facility === "storage") return cell.grain < StorageCapOf(state);
    if (facility === "shelter") return CellCivRoom(state, key) > 0;
    return true;
  });
}

/**
 * 藏粮要求物理连通：本格**正下方**必须有地道格，该格所在分区里有还装得下的储粮洞，
 * 且分区里至少有一个未封的口（否则粮根本递不下去）。返回可用的储粮洞格键（近者优先）。
 */
export function StorageCellsUnder(state, hexKey) {
  const cell = state.tunnels.cells[hexKey];
  if (!cell) return [];
  if (!ZoneEntranceKeys(state, ZoneOfCell(state, hexKey)).length) return [];
  return ReachableFacilityCells(state, hexKey, "storage");
}

/** 该村中「脚底下真通着储粮洞」的村格（藏粮用）。 */
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

/** 最大地道连通块的格数（第二幕勋记「户户相通」的判据，忽略门）。 */
export function LargestNetworkSize(state) {
  let best = 0;
  const seen = new Set();
  for (const key of SortedKeys(state.tunnels.cells)) {
    if (seen.has(key)) continue;
    const block = ConnectedCells(state, key, false);
    for (const cell of block) seen.add(cell);
    best = Math.max(best, block.size);
  }
  return best;
}

/** 同一片地道网串起来的村数（第五幕勋记「村村相连」的判据）。 */
export function VillagesLinked(state) {
  const seen = new Set();
  let best = 0;
  for (const key of SortedKeys(state.tunnels.cells)) {
    if (seen.has(key)) continue;
    const block = ConnectedCells(state, key, false);
    const villages = new Set();
    for (const cell of block) {
      seen.add(cell);
      const villageId = state.map.hexes[cell]?.villageId;
      if (villageId) villages.add(villageId);
    }
    best = Math.max(best, villages.size);
  }
  return best;
}

export function LiveEntranceCount(state) {
  return SortedKeys(state.tunnels.entrances)
    .filter((key) => !state.tunnels.entrances[key].sealed && !state.tunnels.entrances[key].known).length;
}

export function DisguisedEntranceCount(state) {
  return SortedKeys(state.tunnels.entrances)
    .filter((key) => !state.tunnels.entrances[key].sealed && state.tunnels.entrances[key].disguise).length;
}

export function VentCount(state) {
  return SortedKeys(state.tunnels.vents).filter((key) => !state.tunnels.vents[key].known).length;
}

/**
 * 暴露阈值 =（基础隐蔽 + 伪装加成）× 3。伪装口更难被搜出，这是第二幕的全部意义。
 * **关卡可逐口覆写**（`level.entranceThresholds`，R5 P0-1）：第一幕祖辈挖的窖是明摆着的土口，
 * 村里的窖 4 豆、青纱帐那个 3 豆就被翻出来——招牌失败必须在 8 回合内够得着。
 */
export function EntranceThreshold(entrance) {
  const bonus = entrance.disguise && disguiseDefinitions[entrance.disguise]
    ? disguiseDefinitions[entrance.disguise].conceal : 0;
  if (Number.isFinite(entrance.threshold)) {
    return entrance.threshold + bonus * CFG.exposePerConceal;
  }
  return (entrance.conceal + bonus) * CFG.exposePerConceal;
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

/** 「敌已警戒」：同一格连着两回合设伏、或同一个射击孔连着开火，敌记住了这个地方。 */
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

export function VillageIdOfHex(state, key) {
  return state.map.hexes[key]?.villageId || null;
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
