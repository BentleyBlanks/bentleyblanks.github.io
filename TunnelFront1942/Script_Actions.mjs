// 《地下长城 · 冀中1942》 —— 动作协议（AGENTS.md §四）：LegalActions 枚举 + PerformAction 结算。
// ResolveAttack 是敌我全部战斗的单一入口（§2.5 固定判定顺序，零随机）：
// ①前置校验 ②伤害=攻 ③伏击+1 ④掩护-1（下限：伏击1/普攻0）⑤扣血移除 ⑥反击 ⑦缴获（上限12，死者不缴获）
// ⑧攻方隐蔽/伏击解除 + 枪声目击（置信2）。
// 纯逻辑模块：禁 window/document/three、禁时钟与非 StepRng 随机；对外接口一律 CloneState 后推进。

import { HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, terrainDefinitions, unitDefinitions, disguiseDefinitions, TEXT } from "./Data_Rules.mjs";
import { GetLevel } from "./Data_Levels.mjs";
import {
  SortedKeys, CompareIds, EdgeKey, EdgeEnds, TerrainOf, PushEvent, AddLedger, AddPlayerDrain,
  SpendAmmo, GainAmmo, UnitDef, CloneState, UnitsOn, AllyUnits, EnemyUnits, RemoveUnit,
  TunnelNeighbors, ReachableFacilityCells, StorageCellsUnder,
  EntranceThreshold, CellHasRoom, IsSurfacePassable, ZoneOfCell, ZoneEntranceKeys, EntranceCivPassable,
  ActionUnlocked, FacilityUnlocked, UnlockedDisguises, CivGuidanceOn, StorageCapOf,
  CivsAtVillage, CivsInCell, CivSlots, CivSpeed, CellCivRoom, EntranceGuideBonus,
} from "./Script_State.mjs";
import {
  EnemyCanSeeHex, EnemySeesUnit, RecordSighting, ExposeEntranceUse, PreviewEntranceUseBeans,
  UpdateEnemyMemory,
} from "./Script_Visibility.mjs";
import { EndTurn } from "./Script_Turn.mjs";

// ---------------------------------------------------------------------------
// 通用判定小件
// ---------------------------------------------------------------------------

function AllyOf(state, unitId) {
  const unit = state.units[unitId];
  return unit && unit.side === "ally" && unit.hp > 0 ? unit : null;
}

function HexOf(state, key) {
  return state.map.hexes[key] || null;
}

/** 地表格是否被敌单位占据（我方不可踏入，须以攻击应对）。 */
function SurfaceBlockedByEnemy(state, key) {
  return UnitsOn(state, key, "surface").some((unit) => unit.side === "enemy");
}

export function AddTraces(state, key, amount) {
  const hex = state.map.hexes[key];
  if (hex) hex.traces = Math.min(CFG.tracesMax, hex.traces + amount);
}

/** R2 P0-1 承重墙：暴露豆**全程结算**——每挖通 1 段 / 修成 1 处设施 → 该气区所有开口 +1，
 *  每开 1 个新口 → 该口 +2；掩土是唯一的减法（每人每局 3 次）。动土在哪个阶段都要付账。 */
export function ExposeZoneWork(state, events, atKey, amount = CFG.exposePerWork) {
  const zone = ZoneOfCell(state, atKey);
  if (!zone.size) return 0;
  let touched = 0;
  for (const key of ZoneEntranceKeys(state, zone)) {
    const entrance = state.tunnels.entrances[key];
    if (entrance.known) continue;
    entrance.expose += amount;
    touched += 1;
  }
  for (const key of [...zone].sort()) {
    const vent = state.tunnels.vents[key];
    if (vent && !vent.known) { vent.expose += amount; touched += 1; }
  }
  if (touched > 0) {
    PushEvent(state, events, { kind: "expose", text: TEXT.expose.work, hex: atKey, visible: true });
  }
  return touched;
}

/** 特务现形判定：与我方单位相邻（任一层不论，按地表距离）即现形。 */
export function RevealAdjacentSpies(state, events) {
  for (const foe of EnemyUnits(state)) {
    if (foe.type !== "spy" || foe.revealed) continue;
    for (const ally of AllyUnits(state)) {
      if (ally.layer !== "surface") continue;
      if (HexDistanceKeys(ally.pos, foe.pos) <= 1) {
        foe.revealed = true;
        PushEvent(state, events, { kind: "spy", text: "便衣行迹败露：确认为特务", hex: foe.pos, visible: true });
        break;
      }
    }
  }
}

/** 我方地面暴露单位 → 置信 2 目击（敌方记忆，机动队据此响应）。 */
export function RecordExposedSightings(state) {
  for (const unit of AllyUnits(state)) {
    if (unit.layer === "surface" && EnemySeesUnit(state, unit)) RecordSighting(state, unit.pos, 2);
  }
}

// ---------------------------------------------------------------------------
// 工地：找址 / 进度推进（组织免费进度亦走此入口）
// ---------------------------------------------------------------------------

function FindSite(state, matcher) {
  for (const siteId of SortedKeys(state.tunnels.digs)) {
    if (matcher(state.tunnels.digs[siteId])) return siteId;
  }
  return null;
}

function EnsureSite(state, spec) {
  const found = FindSite(state, (site) => site.kind === spec.kind && site.at === spec.at
    && (site.edge || null) === (spec.edge || null) && (site.facility || null) === (spec.facility || null));
  if (found) return found;
  const siteId = `s${state.tunnels.nextSiteId += 1}`;
  state.tunnels.digs[siteId] = { kind: spec.kind, at: spec.at, edge: spec.edge || null,
    facility: spec.facility || null, need: spec.need, progress: 0, workedTurn: 0 };
  return siteId;
}

/** 工地进度 +amount，并在完工时落地效果（段/入口/设施/门/破路）。 */
export function AdvanceSite(state, events, siteId, amount) {
  const site = state.tunnels.digs[siteId];
  if (!site) return false;
  site.progress += amount;
  if (site.progress < site.need) return false;
  const at = site.at;
  if (site.kind === "segment") {
    state.tunnels.edges[site.edge] = { door: null };
    if (!state.tunnels.cells[at]) {
      state.tunnels.cells[at] = { facility: null, grain: 0, smoke: 0, water: 0, trapReady: false,
        fightpostHeat: 0, fightpostLastTurn: 0, fightpostKnown: false };
    }
    PushEvent(state, events, { kind: "dig", text: "地道段贯通", hex: at, layer: "under", visible: true });
    ExposeZoneWork(state, events, at);
  } else if (site.kind === "entrance") {
    const cap = TerrainOf(state, at)?.concealCap ?? 1;
    const previous = state.tunnels.entrances[at];
    state.tunnels.entrances[at] = { conceal: Math.min(3, cap), expose: CFG.exposeNewEntrance,
      known: false, sealed: false, disguise: (previous && previous.disguise) || null };
    PushEvent(state, events, { kind: "dig", text: "新开地道口", hex: at, layer: "under", visible: true });
    PushEvent(state, events, { kind: "expose", text: TEXT.expose.newEntrance, hex: at, visible: true });
  } else if (site.kind === "facility") {
    const cell = state.tunnels.cells[at];
    if (cell) {
      const rearm = cell.facility === "trapdoor" && site.facility === "trapdoor";
      cell.facility = site.facility;
      if (site.facility === "vent" && !state.tunnels.vents[at]) state.tunnels.vents[at] = { expose: 0, known: false, smoked: false };
      if (site.facility === "trapdoor") cell.trapReady = true;
      PushEvent(state, events, { kind: "dig",
        text: rearm ? TEXT.trapText.rearm
          : `修成${({ storage: "储粮洞", shelter: "藏人室", vent: "通气孔", fightpost: "射击孔", trapdoor: "翻板" })[site.facility]}`,
        hex: at, layer: "under", visible: true });
      ExposeZoneWork(state, events, at);
    }
  } else if (site.kind === "disguise") {
    const entrance = state.tunnels.entrances[at];
    if (entrance) {
      entrance.disguise = site.facility;
      const def = disguiseDefinitions[site.facility];
      PushEvent(state, events, { kind: "dig", text: `口做进了${def ? def.name : "什物"}里（${TEXT.expose.disguised}）`,
        hex: at, visible: true });
    }
  } else if (site.kind === "door") {
    const edge = state.tunnels.edges[site.edge];
    if (edge) edge.door = "open";
    PushEvent(state, events, { kind: "dig", text: "装上隔断门", hex: at, layer: "under", visible: true });
  } else if (site.kind === "roadBreak") {
    const hex = state.map.hexes[at];
    if (hex) hex.roadBroken = true;
    PushEvent(state, events, { kind: "road", text: "大车路已破毁", hex: at, visible: true });
    const level = GetLevel(state.meta.level);
    if ((level.supplyRoad || []).includes(at) && state.wave.status === "sweep"
        && state.wave.roadCuts < CFG.pool.roadCutMaxPerWave) {
      state.wave.roadCuts += 1;
      AddPlayerDrain(state, CFG.pool.roadCut);
    }
  }
  delete state.tunnels.digs[siteId];
  return true;
}

// ---------------------------------------------------------------------------
// ResolveAttack（单一入口）
// ---------------------------------------------------------------------------

function CoverOf(state, unit) {
  if (!unit || unit.layer !== "surface") return 0;
  return TerrainOf(state, unit.pos)?.cover ? CFG.coverReduce : 0;
}

/** 我方击杀敌单位的全部进账：战果计数、行动力池扣减、轴线杀伤、报复队计数、缴获。 */
function OnEnemyKilled(state, events, foe, allyLooterAlive) {
  if (Object.prototype.hasOwnProperty.call(state.score.kills, foe.type)) state.score.kills[foe.type] += 1;
  AddPlayerDrain(state, foe.type === "inf" ? CFG.pool.killInf : CFG.pool.killOther);
  const column = state.enemy.columns.find((entry) => entry.id === foe.columnId);
  if (column) {
    column.casualties = (column.casualties || 0) + 1;
    if (column.axis) state.wave.axisKills[column.axis] = (state.wave.axisKills[column.axis] || 0) + 1;
  }
  const revenge = state.wave.revenge;
  if (revenge && String(foe.columnId || "").startsWith(revenge.watch)) {
    revenge.casualties += 1;
    if (!revenge.pending && revenge.spawnedTurn === null && revenge.casualties >= revenge.casualtiesNeed) {
      revenge.pending = true;
      revenge.spawnTurn = state.meta.turn + 1;
      PushEvent(state, events, { kind: "telegraph", text: "内线电报：敌拟派报复队进庄", visible: true });
    }
  }
  if (allyLooterAlive) {
    const loot = CFG.loot[foe.type] ?? 0;
    if (loot > 0) {
      GainAmmo(state, loot);
      PushEvent(state, events, { kind: "loot", text: `缴获弹药 ${loot}`, hex: foe.pos, visible: true });
    }
  }
  PushEvent(state, events, { kind: "kill", text: `${UnitDef(foe).name}被歼`, hex: foe.pos, visible: true });
  RemoveUnit(state, foe.id);
}

function OnAllyKilled(state, events, unit) {
  state.score.alliesLost += 1;
  PushEvent(state, events, { kind: "loss", text: `${UnitDef(unit).name}阵亡`, hex: unit.pos, visible: true });
  RemoveUnit(state, unit.id);
}

/**
 * 战斗单一入口。opts: { ambush: 伏击/枪眼按伏击结算, fightpost: 攻方在地下枪眼格 }。
 * 返回 { done, damage, killed, counter }；弹药不足时 done=false 且无任何副作用。
 */
export function ResolveAttack(state, events, attackerId, defenderId, opts = {}) {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) return { done: false };
  const ambush = !!opts.ambush;
  const aDef = UnitDef(attacker);
  const dDef = UnitDef(defender);
  if (attacker.side === "ally") {
    if (state.resources.ammo < CFG.ammoPerAttack) return { done: false, reason: "弹药不足" };
    SpendAmmo(state);
  }
  // ②③④ 伤害与掩护（老地方连设两回合的伏击：敌有防备，固定只伤 1）
  const stale = ambush && !opts.fightpost && attacker.ambushStale;
  let damage = aDef.atk + (ambush ? CFG.ambushBonus : 0);
  damage = Math.max(ambush ? CFG.ambushMinDamage : 0, damage - CoverOf(state, defender));
  if (stale) damage = CFG.staleAmbushDamage;
  // 打一枪换一个地方：同一个射击孔隔一回合内再开火 → 火光被咬住，这一枪只伤 1。
  if (opts.locked) damage = CFG.fightpost.lockedDamage;
  defender.hp -= damage;
  const verb = ambush
    ? (opts.fightpost ? (opts.locked ? "射击孔急射（已被咬住）" : "射击孔急射") : (stale ? "伏击（敌有防备）" : "伏击"))
    : "接火";
  PushEvent(state, events, { kind: "combat", text: `${aDef.name}${verb}${dDef.name}：伤 ${damage}`, hex: defender.pos, visible: true });
  const killed = defender.hp <= 0;
  let counter = 0;
  // ⑥ 反击（仅非伏击、防方存活且能打；攻方在地下则敌够不着）
  if (!ambush && !killed && dDef.atk > 0 && attacker.layer === "surface") {
    counter = Math.max(dDef.atk - CFG.counterPenalty - CoverOf(state, attacker), 0);
    if (counter > 0) {
      attacker.hp -= counter;
      PushEvent(state, events, { kind: "combat", text: `${dDef.name}还击：伤 ${counter}`, hex: attacker.pos, visible: true });
    }
  }
  // ⑤⑦ 移除与缴获（死者不缴获：攻方须存活）
  if (killed) {
    if (defender.side === "enemy") OnEnemyKilled(state, events, defender, attacker.side === "ally" && attacker.hp > 0);
    else OnAllyKilled(state, events, defender);
  } else if (attacker.side === "ally" && defender.side === "enemy" && damage > 0) {
    AddPlayerDrain(state, CFG.pool.wound);
  }
  if (attacker.hp <= 0) {
    if (attacker.side === "ally") OnAllyKilled(state, events, attacker);
    // 反击打死的敌人不缴获：没主动权就没工夫捡枪——否则弹药收支能靠挨打回正。
    else OnEnemyKilled(state, events, attacker, false);
  } else if (counter > 0 && attacker.side === "enemy") {
    AddPlayerDrain(state, CFG.pool.wound);   // 我方反击致伤敌单位：击伤扣池
  }
  // ⑧ 攻方状态解除 + 枪声目击（我方开火才留给敌人）
  // R2 P0-5：伏击打完就藏不住了——我方伏击手强制转入「暴露」1 回合，可被敌方还击。
  if (attacker.hp > 0) {
    const wasAmbush = attacker.stance === "ambush";
    attacker.stance = wasAmbush && attacker.side === "ally" && !opts.fightpost ? "exposed" : "normal";
    attacker.ambushStale = false;
    if (attacker.stance === "exposed") {
      PushEvent(state, events, { kind: "ambush", text: TEXT.ambushText.exposedAfter, hex: attacker.pos, visible: true });
    }
    if (attacker.side === "ally") {
      attacker.revealed = true;
      const hex = state.map.hexes[attacker.pos];
      if (hex) hex.attackSite = true;
      RecordSighting(state, attacker.pos, 2);
      if (attacker.layer === "surface") {
        const entrance = state.tunnels.entrances[attacker.pos];
        if (entrance && !entrance.sealed && !entrance.known) {
          entrance.known = true;
          PushEvent(state, events, { kind: "expose", text: "从入口开火：该口已被敌记下", hex: attacker.pos, visible: true });
        }
      } else if (opts.fightpost) {
        const cell = state.tunnels.cells[attacker.pos];
        if (cell) cell.fightpostKnown = true;
        // 从射击孔开火 = 交出这个口；连着打还会被咬住（该格获警戒，敌寻路绕不开地记住它）
        const entrance = state.tunnels.entrances[attacker.pos];
        if (entrance && !entrance.sealed && !entrance.known) {
          entrance.known = true;
          PushEvent(state, events, { kind: "expose", text: TEXT.fightpostText.known, hex: attacker.pos, visible: true });
        }
      }
    }
  }
  // 遇伏 → 谨慎 +1 并整队一回合
  if (ambush && defender.side === "enemy") {
    const column = state.enemy.columns.find((entry) => entry.id === defender.columnId);
    if (column) {
      if (column.caution < CFG.cautionMax) {
        column.caution += 1;
        column.regroupTurns = 1;
      }
      column.cautionTurns = 0;
      column.incident = true;
    }
  }
  return { done: true, damage, killed, counter };
}

// ---------------------------------------------------------------------------
// 移动枚举（BFS，一步 1 MP；地表避敌占格，地下走已挖通且门开的边）
// ---------------------------------------------------------------------------

function EnumMoves(state, unit) {
  const results = [];
  if (unit.mp <= 0) return results;
  const start = unit.pos;
  const frontier = [{ key: start, cost: 0, path: [] }];
  const best = { [start]: 0 };
  while (frontier.length) {
    const node = frontier.shift();
    if (node.cost >= unit.mp) continue;
    const neighbors = unit.layer === "under"
      ? TunnelNeighbors(state, node.key, true)
      : HexNeighborKeys(node.key).filter((nb) => HexOf(state, nb) && IsSurfacePassable(state, nb)
          && !SurfaceBlockedByEnemy(state, nb));
    for (const nb of neighbors) {
      const cost = node.cost + 1;
      if (best[nb] !== undefined && best[nb] <= cost) continue;
      best[nb] = cost;
      const path = [...node.path, nb];
      if (unit.layer !== "under" || CellHasRoom(state, nb) || UnitsOn(state, nb, "under").some((u) => u.id === unit.id)) {
        results.push({ dest: nb, path });
      }
      frontier.push({ key: nb, cost, path });
    }
  }
  results.sort((a, b) => (a.dest < b.dest ? -1 : 1));
  return results;
}

/** 带路时一次能带几批：单位本身的额度 + 所在格伪装口的加成（牲口槽口子大，多带 1 批）。 */
export function GuideCapacity(state, unit) {
  const base = CFG.civ.guideCap[unit.type] || 0;
  return base + EntranceGuideBonus(state.tunnels.entrances[unit.pos]);
}

/** 带路时实际会带走的那几批（按批号定序，取前 count 批）。 */
export function GuidePick(state, unit, count) {
  const here = CivsInCell(state, unit.pos).sort((a, b) => CompareIds(a.id, b.id));
  const cap = Math.min(GuideCapacity(state, unit), here.length);
  const want = Math.max(1, Math.min(cap, Number(count) || cap));
  return here.slice(0, want);
}

/**
 * 带路可达枚举：单位与群众同格 → 沿开放门的地道走，步数上限 = min(单位 MP, 最慢一批的速度)。
 * 老弱与伤员一回合只挪一格——这就是「早动身」的全部理由。
 */
function EnumGuideMoves(state, unit) {
  const results = [];
  if (unit.mp <= 0) return results;
  const taken = GuidePick(state, unit, 0);
  if (!taken.length) return results;
  const slots = taken.reduce((sum, civ) => sum + CivSlots(civ), 0);
  const speed = Math.min(...taken.map(CivSpeed));
  const limit = Math.min(unit.mp, speed);
  if (limit <= 0) return results;
  const frontier = [{ key: unit.pos, cost: 0, path: [] }];
  const best = { [unit.pos]: 0 };
  while (frontier.length) {
    const node = frontier.shift();
    if (node.cost >= limit) continue;
    for (const nb of TunnelNeighbors(state, node.key, true)) {
      const cost = node.cost + 1;
      if (best[nb] !== undefined && best[nb] <= cost) continue;
      best[nb] = cost;
      const path = [...node.path, nb];
      if (CellCivRoom(state, nb) >= slots && CellHasRoom(state, nb)) {
        results.push({ dest: nb, path, count: taken.length });
      }
      frontier.push({ key: nb, cost, path });
    }
  }
  results.sort((a, b) => (a.dest < b.dest ? -1 : 1));
  return results;
}

/** 射击孔是否处于「被咬住」状态：距上次从这个孔开火 ≤ lockWindow 回合。 */
export function FightpostLocked(state, key) {
  const cell = state.tunnels.cells[key];
  if (!cell || !cell.fightpostLastTurn) return false;
  return state.meta.turn - cell.fightpostLastTurn <= CFG.fightpost.lockWindow;
}

// ---------------------------------------------------------------------------
// LegalActions
// ---------------------------------------------------------------------------

/** 设伏地点是否成立：可隐蔽地形 / 地道口格 / 民兵就地挖散兵坑（可挖地形，留痕迹）。 */
function AmbushSite(state, unit) {
  const terrain = TerrainOf(state, unit.pos);
  const entrance = state.tunnels.entrances[unit.pos];
  if (terrain?.hide) return "cover";
  if (entrance && !entrance.sealed) return "entrance";
  if ((CFG.digPower[unit.type] || 0) >= CFG.foxholeMinDig && terrain?.diggable) return "foxhole";
  return null;
}

/** R2 P0-5：同一格同时至多 1 个单位处于伏击态——「三个班堆一格全砸下去」不再成立。 */
function HexAmbusherCount(state, pos, exceptId) {
  return UnitsOn(state, pos, "surface")
    .filter((unit) => unit.side === "ally" && unit.stance === "ambush" && unit.id !== exceptId).length;
}

/** 本格上一回合是否已经设过伏（连着两回合就是「老地方」，敌有防备）。
 *  注意 ambushSetTurn 缺省为 0：T1 的 `0 === turn-1` 会把全新格误判成老地方，必须先要求 >0。 */
function HexAmbushStale(state, pos) {
  const setTurn = state.map.hexes[pos]?.ambushSetTurn || 0;
  return setTurn > 0 && setTurn === state.meta.turn - 1;
}

/** 掩土是否还有额度与可掩之物（痕迹或未被搜出的开口暴露豆）。 */
function CoverTarget(state, unit) {
  if ((unit.coverUses || 0) >= CFG.coverUsesPerUnit) return null;
  const hex = state.map.hexes[unit.pos];
  if (!hex) return null;
  const entrance = state.tunnels.entrances[unit.pos];
  const vent = state.tunnels.vents[unit.pos];
  if (hex.traces > 0) return "traces";
  if (entrance && !entrance.known && !entrance.sealed && entrance.expose > 0) return "entrance";
  if (vent && !vent.known && vent.expose > 0) return "vent";
  return null;
}

function CanDive(state, unit) {
  if (!(unit.acted && unit.attacked && unit.layer === "surface" && unit.mp >= 1)) return false;
  const entrance = state.tunnels.entrances[unit.pos];
  return !!(entrance && !entrance.sealed && !entrance.known && state.tunnels.cells[unit.pos]
    && CellHasRoom(state, unit.pos));
}

function CollectUnitActions(state, unit, actions) {
  const def = UnitDef(unit);
  const id = unit.id;
  const hex = HexOf(state, unit.pos);
  const terrain = TerrainOf(state, unit.pos);
  const entrance = state.tunnels.entrances[unit.pos];
  const cell = state.tunnels.cells[unit.pos];

  // 免费动作：开关邻接隔断门（每门每回合 1 次；不耗主动作与 MP）
  if (unit.layer === "under") {
    for (const nb of HexNeighborKeys(unit.pos)) {
      const edgeId = EdgeKey(unit.pos, nb);
      const edge = state.tunnels.edges[edgeId];
      if (edge && edge.door && (edge.toggledTurn || 0) < state.meta.turn) {
        actions.push({ type: "ToggleDoor", unit: id, edge: edgeId });
      }
    }
  }

  // 打了就钻（唯一允许「已行动仍可入地」的例外）
  if (CanDive(state, unit)) {
    actions.push({ type: "UseEntrance", unit: id, dive: true, exposeRisk: true, confirm: true });
  }
  if (unit.acted && !unit.freeMove) return;

  // 移动（佯动后 freeMove 仅允许移动与上下口撤离）
  for (const move of EnumMoves(state, unit)) {
    actions.push({ type: "Move", unit: id, path: move.path });
  }
  if (entrance && !entrance.sealed && unit.mp >= 1) {
    if (unit.layer === "surface" && cell && CellHasRoom(state, unit.pos)) {
      const beans = PreviewEntranceUseBeans(state, unit.pos);
      actions.push({ type: "UseEntrance", unit: id, exposeRisk: beans > 0, confirm: beans > 0 });
    } else if (unit.layer === "under") {
      const beans = PreviewEntranceUseBeans(state, unit.pos);
      actions.push({ type: "UseEntrance", unit: id, exposeRisk: beans > 0, confirm: beans > 0 });
    }
  }
  if (unit.freeMove) return;

  // —— 以下均为主动作 ——
  const digPower = CFG.digPower[unit.type] || 0;
  if (unit.layer === "under" && digPower > 0 && cell) {
    for (const nb of HexNeighborKeys(unit.pos)) {
      const nbHex = HexOf(state, nb);
      if (!nbHex || !terrainDefinitions[nbHex.terrain].diggable) continue;
      if (state.tunnels.edges[EdgeKey(unit.pos, nb)]) continue;
      actions.push({ type: "Dig", unit: id, target: nb });
    }
    if ((!entrance || entrance.sealed) && (terrain?.concealCap ?? 0) > 0) {
      actions.push({ type: "DigEntrance", unit: id, at: unit.pos });
    }
    if (cell.facility === null) {
      for (const facility of ["storage", "shelter", "vent", "fightpost", "trapdoor"]) {
        if (!FacilityUnlocked(state, facility)) continue;
        if (facility === "trapdoor" && (!entrance || entrance.sealed)) continue;   // 翻板要压在有口的格上
        actions.push({ type: "DigFacility", unit: id, cell: unit.pos, facility });
      }
    } else if (cell.facility === "trapdoor" && !cell.trapReady && FacilityUnlocked(state, "trapdoor")) {
      actions.push({ type: "DigFacility", unit: id, cell: unit.pos, facility: "trapdoor", rearm: true });
    }
    for (const nb of TunnelNeighbors(state, unit.pos, false)) {
      const edgeId = EdgeKey(unit.pos, nb);
      if (state.tunnels.edges[edgeId] && state.tunnels.edges[edgeId].door === null) {
        actions.push({ type: "DigDoor", unit: id, edge: edgeId });
      }
    }
  }
  // 带领群众：单位与群众同格才带得动；一次带的批数看单位（联络员 3 / 民兵 2 / 游击 1），
  // 走得多远看最慢的那一批（老弱与伤员 1 格、青壮 2 格）。带路是主动作——谁去带路，就谁不去挖。
  if (unit.layer === "under" && cell && CivGuidanceOn(state)) {
    for (const move of EnumGuideMoves(state, unit)) {
      actions.push({ type: "GuideCivs", unit: id, to: move.dest, count: move.count, path: move.path });
    }
  }
  if (unit.layer === "surface") {
    if (CoverTarget(state, unit)) {
      actions.push({ type: "CoverTraces", unit: id, usesLeft: CFG.coverUsesPerUnit - (unit.coverUses || 0) });
    }
    if (hex && hex.road && !hex.roadBroken && digPower > 0
        && (!hex.bridge || GetLevel(state.meta.level).bridgeBreakable)) {
      actions.push({ type: "BreakRoad", unit: id, bridge: !!hex.bridge });
    }
    if (def.atk > 0 && unit.stance !== "ambush" && state.resources.ammo >= CFG.ammoPerAttack
        && AmbushSite(state, unit) && HexAmbusherCount(state, unit.pos, id) < CFG.ambushPerHex) {
      actions.push({ type: "Ambush", unit: id, site: AmbushSite(state, unit), stale: HexAmbushStale(state, unit.pos) });
    }
    if (terrain?.hide && unit.stance !== "hidden") actions.push({ type: "Hide", unit: id });
    actions.push({ type: "Feint", unit: id });
    // 野战攻击（仅 fieldAttack 单位；同格敌人也打得着——R2 P1）
    if (def.fieldAttack && state.resources.ammo >= CFG.ammoPerAttack) {
      for (const foe of EnemyUnits(state)) {
        if (foe.layer === "surface" && foe.revealed && HexDistanceKeys(unit.pos, foe.pos) <= 1) {
          actions.push({ type: "Attack", unit: id, target: foe.id, sameHex: unit.pos === foe.pos });
        }
      }
    }
    // 伪装口：把本格的口做进灶台/水井/炕洞/牲口槽（1 进度，不留痕迹）
    if (entrance && !entrance.sealed && !entrance.known && !entrance.disguise && digPower > 0) {
      for (const kind of UnlockedDisguises(state)) {
        const def2 = disguiseDefinitions[kind];
        if (!def2 || !def2.terrains.includes(hex.terrain)) continue;
        actions.push({ type: "Disguise", unit: id, at: unit.pos, disguise: kind });
      }
    }
    const villageId = hex?.villageId || null;
    const village = villageId ? state.map.villages[villageId] : null;
    if (village) {
      if (village.grainOpen > 0 && StorageCellsUnder(state, unit.pos).length) {
        actions.push({ type: "HideGrain", unit: id });
      }
      const waiting = CivsAtVillage(state, villageId);
      if (waiting.length && NearbyShelterEntrance(state, unit.pos)) {
        const kinds = [...new Set(waiting.map((civ) => civ.kind))].sort();
        actions.push({ type: "MoveCivs", unit: id, count: Math.min(CFG.moveCivsPerAction, waiting.length) });
        if (kinds.length > 1) {
          for (const kind of kinds) {
            actions.push({ type: "MoveCivs", unit: id, kind,
              count: Math.min(CFG.moveCivsPerAction, waiting.filter((civ) => civ.kind === kind).length) });
          }
        }
      }
      if (village.organize < CFG.organizeMax) actions.push({ type: "Organize", unit: id });
    }
  } else if (cell && cell.facility === "fightpost" && def.atk > 0 && state.resources.ammo >= CFG.ammoPerAttack) {
    // 射击孔：攻击本格/相邻地表敌单位（按伏击结算）；连着打会被锁定，所以标出 locked 让玩家看得见
    const locked = FightpostLocked(state, unit.pos);
    for (const foe of EnemyUnits(state)) {
      if (foe.layer === "surface" && foe.revealed && HexDistanceKeys(unit.pos, foe.pos) <= 1) {
        actions.push({ type: "Attack", unit: id, target: foe.id, fightpost: true, locked, confirm: locked });
      }
    }
  }
  if (entrance && !entrance.sealed) {
    actions.push({ type: "Collapse", unit: id, at: unit.pos, confirm: true });
  }
  actions.push({ type: "Rest", unit: id });
}

/**
 * 群众从村口能落脚的地道格：**只有藏人室**（AGENTS §2.3「群众只能待在藏人室」）。
 * 走廊只能在「带路」途中临时容身（每格 2 个铺位），不能从村口直接往里塞人——
 * 藏人室的铺位不够，就是不够，这是第一幕代价的结构来源。
 */
function CivDropCells(state, entranceKey) {
  return ReachableFacilityCells(state, entranceKey, "shelter");
}

/** 群众下得去的口：未封，且伪装物不挡人（水井口窄，群众进不去也上不来）。 */
function NearbyShelterEntrance(state, pos) {
  const keys = [pos, ...HexNeighborKeys(pos)];
  for (const key of keys) {
    const entrance = state.tunnels.entrances[key];
    if (!entrance || entrance.sealed || !EntranceCivPassable(entrance)) continue;
    if (CivDropCells(state, key).length) return key;
  }
  return null;
}

/** 转移群众为什么不行——分清「没口 / 没藏人室 / 铺位满了」，不再一律说成「未连通」。 */
function ShelterBlockReason(state, pos) {
  if (![pos, ...HexNeighborKeys(pos)].some((key) => state.tunnels.entrances[key] && !state.tunnels.entrances[key].sealed)) {
    return "本格与相邻格都没有可用地道口（口要在地下用 DigEntrance 自己开）";
  }
  if (!SortedKeys(state.tunnels.cells).some((key) => state.tunnels.cells[key].facility === "shelter")) {
    return "连通的地道里还没有藏人室——先在地道格上 DigFacility shelter";
  }
  return "连通的藏人室铺位都满了（老弱/青壮各占 1 铺，伤员占 2 铺）——再修一间或换个口";
}

export function LegalActions(state, unitId) {
  const actions = [];
  if (state.meta.phase !== "player" || state.result) return actions;
  const units = unitId
    ? [state.units[unitId]].filter((unit) => unit && unit.side === "ally" && unit.hp > 0)
    : AllyUnits(state);
  for (const unit of units) CollectUnitActions(state, unit, actions);
  // 认知递增在代码里的落点：本幕没解锁的动作，压根不出现在合法动作里。
  const filtered = actions.filter((action) => ActionUnlocked(state, action.type));
  if (!unitId) filtered.push({ type: "EndTurn" });
  return filtered;
}

// ---------------------------------------------------------------------------
// PerformAction：克隆 → 结算 → 事件；非法则原样退回并给出理由
// ---------------------------------------------------------------------------

const applyHandlers = {
  Move: ApplyMove, UseEntrance: ApplyUseEntrance, Dig: ApplyDig, DigEntrance: ApplyDigEntrance,
  DigFacility: ApplyDigFacility, DigDoor: ApplyDigDoor, ToggleDoor: ApplyToggleDoor,
  Disguise: ApplyDisguise, GuideCivs: ApplyGuideCivs,
  CoverTraces: ApplyCoverTraces, BreakRoad: ApplyBreakRoad, Ambush: ApplyAmbush, Hide: ApplyHide,
  Attack: ApplyAttack, Feint: ApplyFeint, HideGrain: ApplyHideGrain, MoveCivs: ApplyMoveCivs,
  Organize: ApplyOrganize, Collapse: ApplyCollapse, Rest: ApplyRest,
};

export function PerformAction(inputState, action) {
  if (!action || typeof action.type !== "string") {
    return { state: inputState, events: [], illegal: "动作缺失或无类型" };
  }
  if (action.type === "EndTurn") return EndTurn(inputState);
  if (inputState.meta.phase !== "player" || inputState.result) {
    return { state: inputState, events: [], illegal: "当前不在玩家阶段" };
  }
  const handler = applyHandlers[action.type];
  if (!handler) return { state: inputState, events: [], illegal: `未知动作类型：${action.type}` };
  if (!ActionUnlocked(inputState, action.type)) {
    const level = GetLevel(inputState.meta.level);
    return { state: inputState, events: [],
      illegal: `本幕（第${level.act}幕《${level.name}》）尚未开放「${action.type}」——这一幕要学的不是它` };
  }
  const state = CloneState(inputState);
  const events = [];
  const illegal = handler(state, events, action);
  if (illegal) return { state: inputState, events: [], illegal };
  // 伏击是持续状态：只有移动、改做别的主动作、或开火/被打断才解除（Rest 与免费动作不打断）。
  const actor = action.unit ? state.units[action.unit] : null;
  if (actor && actor.stance === "ambush" && action.type !== "Ambush"
      && action.type !== "Rest" && action.type !== "ToggleDoor") {
    actor.stance = "normal";
    actor.ambushHex = null;
    actor.ambushStale = false;
  }
  RevealAdjacentSpies(state, events);
  RecordExposedSightings(state);
  UpdateEnemyMemory(state);
  return { state, events };
}

// ---------------------------------------------------------------------------
// 各动作结算（返回 null=合法完成；返回字符串=非法理由，调用方丢弃克隆）
// ---------------------------------------------------------------------------

function ApplyMove(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted && !unit.freeMove) return "该单位本回合已行动";
  const path = Array.isArray(action.path) ? action.path : [];
  if (!path.length) return "移动路径为空";
  if (path.length > unit.mp) return "移动力不足";
  let cursor = unit.pos;
  for (const step of path) {
    if (HexDistanceKeys(cursor, step) !== 1) return "路径不连续";
    if (unit.layer === "under") {
      if (!TunnelNeighbors(state, cursor, true).includes(step)) return "地道未挖通或门已关闭";
    } else {
      if (!HexOf(state, step) || !IsSurfacePassable(state, step)) return "地形不可通行";
      if (SurfaceBlockedByEnemy(state, step)) return "敌军占据该格";
    }
    cursor = step;
  }
  if (unit.layer === "under" && !CellHasRoom(state, cursor)
      && !UnitsOn(state, cursor, "under").some((u) => u.id === unit.id)) return "地道格已满员";
  unit.pos = cursor;
  unit.mp -= path.length;
  if (unit.stance === "hidden" || unit.stance === "ambush") unit.stance = "normal";
  PushEvent(state, events, { kind: "move", text: `${UnitDef(unit).name}移动`, hex: cursor, layer: unit.layer, visible: true });
  return null;
}

function ApplyUseEntrance(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  const entrance = state.tunnels.entrances[unit.pos];
  if (!entrance || entrance.sealed) return "此处没有可用入口";
  if (unit.mp < 1) return "移动力不足";
  const dive = unit.acted && !unit.freeMove;
  if (dive && !CanDive(state, unit)) return "该单位本回合已行动";
  if (unit.layer === "surface") {
    if (!state.tunnels.cells[unit.pos] || !CellHasRoom(state, unit.pos)) return "地道格已满员";
    unit.layer = "under";
    unit.mp -= 1;
    unit.stance = "normal";
    const beans = ExposeEntranceUse(state, unit.pos, dive ? CFG.shootAndDiveExpose : null);
    if (dive) unit.mp = 0;
    PushEvent(state, events, { kind: "enter", text: dive ? "打了就钻：转入地下" : "转入地下",
      hex: unit.pos, layer: "under", visible: true });
    if (beans > 0) PushEvent(state, events, { kind: "expose", text: `入口动静被敌察觉（+${beans}）`, hex: unit.pos, visible: true });
  } else {
    unit.layer = "surface";
    unit.mp -= 1;
    unit.stance = "normal";
    unit.breath = 0;
    const beans = ExposeEntranceUse(state, unit.pos, null);
    PushEvent(state, events, { kind: "exit", text: "出洞上到地面", hex: unit.pos, layer: "surface", visible: true });
    if (beans > 0) PushEvent(state, events, { kind: "expose", text: `入口动静被敌察觉（+${beans}）`, hex: unit.pos, visible: true });
  }
  return null;
}

function RequireDigger(state, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return { error: "单位不存在或已阵亡" };
  if (unit.acted) return { error: "该单位本回合已行动" };
  if ((CFG.digPower[unit.type] || 0) <= 0) return { error: "该单位没有挖掘能力" };
  return { unit, power: CFG.digPower[unit.type] };
}

function WorkSite(state, events, unit, power, spec, traceKey) {
  const siteId = EnsureSite(state, spec);
  const site = state.tunnels.digs[siteId];
  if ((site.workedTurn || 0) >= state.meta.turn) return "同一工地同回合只允许一个单位施工";
  site.workedTurn = state.meta.turn;
  unit.acted = true;
  if (traceKey) AddTraces(state, traceKey, CFG.tracesPerDig);
  const finished = AdvanceSite(state, events, siteId, power);
  if (!finished) {
    PushEvent(state, events, { kind: "dig", text: `施工推进（${site.progress}/${site.need}）`, hex: spec.at, visible: true });
  }
  return null;
}

function ApplyDig(state, events, action) {
  const got = RequireDigger(state, action);
  if (got.error) return got.error;
  const { unit, power } = got;
  if (unit.layer !== "under" || !state.tunnels.cells[unit.pos]) return "须在地道内施工";
  const target = action.target;
  if (!target || HexDistanceKeys(unit.pos, target) !== 1) return "只能向相邻格挖段";
  const nbHex = HexOf(state, target);
  if (!nbHex || !terrainDefinitions[nbHex.terrain].diggable) return "该地形不可挖穿";
  const edgeId = EdgeKey(unit.pos, target);
  if (state.tunnels.edges[edgeId]) return "该段已挖通";
  const need = nbHex.terrain === "village" ? CFG.dig.segmentVillage : CFG.dig.segment;
  return WorkSite(state, events, unit, power, { kind: "segment", at: target, edge: edgeId, need }, target);
}

function ApplyDigEntrance(state, events, action) {
  const got = RequireDigger(state, action);
  if (got.error) return got.error;
  const { unit, power } = got;
  if (unit.layer !== "under" || !state.tunnels.cells[unit.pos]) return "须在地道内施工";
  if (action.at !== unit.pos) return "只能在所在格向上开口";
  const entrance = state.tunnels.entrances[unit.pos];
  if (entrance && !entrance.sealed) return "此格已有入口";
  if ((TerrainOf(state, unit.pos)?.concealCap ?? 0) <= 0) return "该地形无法设口";
  const need = entrance && entrance.sealed ? CFG.sealRepairProgress : CFG.dig.entrance;
  return WorkSite(state, events, unit, power, { kind: "entrance", at: unit.pos, need }, unit.pos);
}

function ApplyDigFacility(state, events, action) {
  const got = RequireDigger(state, action);
  if (got.error) return got.error;
  const { unit, power } = got;
  if (unit.layer !== "under") return "须在地道内施工";
  const cell = state.tunnels.cells[unit.pos];
  if (!cell || action.cell !== unit.pos) return "只能在所在地道格修设施";
  if (!["storage", "shelter", "vent", "fightpost", "trapdoor"].includes(action.facility)) return "设施类型不合法";
  if (!FacilityUnlocked(state, action.facility)) return `本幕还修不了「${action.facility}」`;
  const rearm = cell.facility === "trapdoor" && action.facility === "trapdoor" && !cell.trapReady;
  if (cell.facility !== null && !rearm) return "此格已有设施";
  if (action.facility === "trapdoor") {
    const entrance = state.tunnels.entrances[unit.pos];
    if (!entrance || entrance.sealed) return "翻板要压在有地道口的格上";
  }
  return WorkSite(state, events, unit, power,
    { kind: "facility", at: unit.pos, facility: action.facility, need: CFG.dig.facility }, unit.pos);
}

/** 伪装口：把已有的口做进灶台/水井/炕洞/牲口槽。1 进度，不留痕迹（本来就是在遮掩）。 */
function ApplyDisguise(state, events, action) {
  const got = RequireDigger(state, action);
  if (got.error) return got.error;
  const { unit, power } = got;
  if (unit.layer !== "surface") return "伪装口要在地面做（灶台、水井、炕洞都在屋里屋外）";
  const at = action.at || unit.pos;
  if (at !== unit.pos) return "只能伪装脚下这个口";
  const entrance = state.tunnels.entrances[at];
  if (!entrance || entrance.sealed) return "本格没有可伪装的地道口";
  if (entrance.known) return "这个口已经被敌人记下了，再伪装也没用（塌了另开一个吧）";
  if (entrance.disguise) return "这个口已经做过伪装了";
  const def = disguiseDefinitions[action.disguise];
  if (!def) return "伪装物不合法";
  if (!UnlockedDisguises(state).includes(action.disguise)) return "本幕还不会做这种伪装口";
  const hex = HexOf(state, at);
  if (!def.terrains.includes(hex.terrain)) return `${def.name}只能做在${def.terrains.map((t) => terrainDefinitions[t].name).join("/")}上`;
  return WorkSite(state, events, unit, power,
    { kind: "disguise", at, facility: action.disguise, need: CFG.dig.disguise }, null);
}

/**
 * 带领群众（第二幕起）：单位与群众同格，领着他们沿开放门的地道走。
 * 一次带几批看单位（联络员 3 / 民兵 2 / 游击 1，牲口槽口 +1），走几格看最慢的那一批。
 * 这是主动作——带路的人这一回合就挖不成、也打不了。
 */
function ApplyGuideCivs(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (!CivGuidanceOn(state)) return "本幕的洞不通，群众进去了就没处走——带不了路";
  if (unit.layer !== "under" || !state.tunnels.cells[unit.pos]) return "带路须在地道里，且与群众同格";
  const taken = GuidePick(state, unit, action.count);
  if (!taken.length) return "本格没有等着带路的群众";
  const to = action.to;
  if (!to || !state.tunnels.cells[to]) return "目的地不是地道格";
  const speed = Math.min(...taken.map(CivSpeed));
  const limit = Math.min(unit.mp, speed);
  if (limit <= 0) return "移动力不足（带路要跟着走）";
  const path = Array.isArray(action.path) && action.path.length ? action.path : GuidePath(state, unit.pos, to, limit);
  if (!path || !path.length) return `带不到那么远：最慢的一批一回合只走 ${speed} 格`;
  if (path.length > limit) return `带不到那么远：最慢的一批一回合只走 ${speed} 格`;
  let cursor = unit.pos;
  for (const step of path) {
    if (!TunnelNeighbors(state, cursor, true).includes(step)) return "地道未挖通或门已关闭";
    cursor = step;
  }
  if (cursor !== to) return "路径终点与目的地不符";
  const slots = taken.reduce((sum, civ) => sum + CivSlots(civ), 0);
  if (CellCivRoom(state, to) < slots) return "目的地铺位不够（老弱/青壮各 1 铺，伤员 2 铺）";
  if (!CellHasRoom(state, to) && !UnitsOn(state, to, "under").some((u) => u.id === unit.id)) return "地道格已满员";
  unit.pos = to;
  unit.mp -= path.length;
  unit.acted = true;
  for (const civ of taken) {
    civ.at = to;
    civ.panic = Math.max(0, civ.panic - CFG.civ.calmPerTurn);
  }
  state.score.civGuidedTrips += 1;
  PushEvent(state, events, { kind: "civs",
    text: `${UnitDef(unit).name}${TEXT.civText.guided}：${taken.length} 批（${taken.map((civ) => civ.kind === "old" ? "老弱" : civ.kind === "young" ? "青壮" : "伤员").join("、")}）→ ${to}`,
    hex: to, layer: "under", visible: true });
  return null;
}

/** 带路寻路：只走开放门，最短路（键序稳定）。 */
function GuidePath(state, fromKey, toKey, limit) {
  if (fromKey === toKey) return null;
  const frontier = [{ key: fromKey, path: [] }];
  const seen = new Set([fromKey]);
  while (frontier.length) {
    const node = frontier.shift();
    if (node.path.length >= limit) continue;
    for (const nb of TunnelNeighbors(state, node.key, true).sort()) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      const path = [...node.path, nb];
      if (nb === toKey) return path;
      frontier.push({ key: nb, path });
    }
  }
  return null;
}

function ApplyDigDoor(state, events, action) {
  const got = RequireDigger(state, action);
  if (got.error) return got.error;
  const { unit, power } = got;
  if (unit.layer !== "under") return "须在地道内施工";
  const edge = state.tunnels.edges[action.edge];
  if (!edge) return "该段尚未挖通";
  if (edge.door !== null) return "该段已装门";
  if (!EdgeEnds(action.edge).includes(unit.pos)) return "须邻接该段施工";
  return WorkSite(state, events, unit, power, { kind: "door", at: unit.pos, edge: action.edge, need: CFG.dig.door }, null);
}

function ApplyToggleDoor(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.layer !== "under") return "须在地道内操作门";
  const edge = state.tunnels.edges[action.edge];
  if (!edge || !edge.door) return "该处没有隔断门";
  if (!EdgeEnds(action.edge).includes(unit.pos)) return "须邻接该门";
  if ((edge.toggledTurn || 0) >= state.meta.turn) return "该门本回合已开合过";
  edge.door = edge.door === "open" ? "closed" : "open";
  edge.toggledTurn = state.meta.turn;
  PushEvent(state, events, { kind: "door", text: edge.door === "closed" ? "隔断门关闭" : "隔断门打开",
    hex: unit.pos, layer: "under", visible: true });
  return null;
}

/** 掩土：本格痕迹 -2，本格未被搜出的开口暴露豆 -2。每单位每局 3 次——这是全局唯一的减法。 */
function ApplyCoverTraces(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "须在地面掩土";
  if ((unit.coverUses || 0) >= CFG.coverUsesPerUnit) return TEXT.expose.coverSpent;
  if (!CoverTarget(state, unit)) return "此格没有可掩的痕迹或暴露";
  const hex = HexOf(state, unit.pos);
  hex.traces = Math.max(0, hex.traces - CFG.coverTracesAmount);
  const entrance = state.tunnels.entrances[unit.pos];
  if (entrance && !entrance.known) entrance.expose = Math.max(0, entrance.expose - CFG.coverTracesAmount);
  const vent = state.tunnels.vents[unit.pos];
  if (vent && !vent.known) vent.expose = Math.max(0, vent.expose - CFG.coverTracesAmount);
  unit.coverUses = (unit.coverUses || 0) + 1;
  unit.acted = true;
  PushEvent(state, events, { kind: "cover", text: `${TEXT.expose.cover}（本人还剩 ${CFG.coverUsesPerUnit - unit.coverUses} 次）`,
    hex: unit.pos, visible: true });
  return null;
}

function ApplyBreakRoad(state, events, action) {
  const got = RequireDigger(state, action);
  if (got.error) return got.error;
  const { unit, power } = got;
  if (unit.layer !== "surface") return "须在地面破路";
  const hex = HexOf(state, unit.pos);
  if (!hex || !hex.road || hex.roadBroken) return "此格没有可破的路";
  if (hex.bridge && !GetLevel(state.meta.level).bridgeBreakable) return "此桥不可破毁";
  const need = hex.bridge ? CFG.dig.bridgeBreak : CFG.dig.roadBreak;
  return WorkSite(state, events, unit, power, { kind: "roadBreak", at: unit.pos, need }, null);
}

/** 设伏（R2 P0-5）：① 同格至多 1 人；② 持续状态，不移动不换动作就一直守着；
 *  ③ 连两回合同格 → 只伤 1 且该格获「敌已警戒」2 回合；④ 民兵可挖散兵坑设伏（+1 痕迹）。 */
function ApplyAmbush(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "伏击须在地面";
  if (UnitDef(unit).atk <= 0) return "该单位无法伏击";
  if (state.resources.ammo < CFG.ammoPerAttack) return "弹药不足，设不了伏";
  const site = AmbushSite(state, unit);
  if (!site) return "须在可隐蔽地形、地道口格设伏（民兵还可就地挖散兵坑）";
  if (HexAmbusherCount(state, unit.pos, unit.id) >= CFG.ambushPerHex) return TEXT.ambushText.occupied;
  const hex = HexOf(state, unit.pos);
  const stale = HexAmbushStale(state, unit.pos);
  unit.stance = "ambush";
  unit.acted = true;
  unit.ambushHex = unit.pos;
  unit.ambushTurn = state.meta.turn;
  unit.ambushStale = stale;
  hex.ambushSetTurn = state.meta.turn;
  if (site === "foxhole") {
    AddTraces(state, unit.pos, CFG.foxholeTrace);
    PushEvent(state, events, { kind: "ambush", text: TEXT.ambushText.foxhole, hex: unit.pos, visible: true });
  }
  PushEvent(state, events, { kind: "ambush", text: `${UnitDef(unit).name}设伏`, hex: unit.pos, visible: true });
  if (stale) {
    hex.alertedUntil = state.meta.turn + CFG.alertedTurns;
    PushEvent(state, events, { kind: "ambush", text: TEXT.ambushText.stale, hex: unit.pos, visible: true });
    PushEvent(state, events, { kind: "ambush", text: TEXT.ambushText.alerted, hex: unit.pos, visible: true });
  }
  return null;
}

function ApplyHide(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "隐蔽须在地面";
  if (!TerrainOf(state, unit.pos)?.hide) return "该地形无法隐蔽";
  unit.stance = "hidden";
  unit.acted = true;
  PushEvent(state, events, { kind: "hide", text: `${UnitDef(unit).name}隐蔽`, hex: unit.pos, visible: true });
  return null;
}

function ApplyAttack(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  const target = state.units[action.target];
  if (!target || target.side !== "enemy" || target.hp <= 0) return "目标不存在";
  if (target.layer !== "surface") return "目标不在地面";
  if (!target.revealed) return "身份未明者不可攻击";
  if (state.resources.ammo < CFG.ammoPerAttack) return "弹药不足";
  const def = UnitDef(unit);
  let opts = null;
  if (unit.layer === "surface") {
    if (!def.fieldAttack) return "该单位不能野战攻击（仅伏击/枪眼）";
    if (HexDistanceKeys(unit.pos, target.pos) > 1) return "目标不相邻";
    opts = { ambush: false };
  } else {
    const cell = state.tunnels.cells[unit.pos];
    if (!cell || cell.facility !== "fightpost") return "地下攻击须在射击孔格";
    if (def.atk <= 0) return "该单位无法开火";
    if (HexDistanceKeys(unit.pos, target.pos) > 1) return "目标超出射击孔射界";
    opts = { ambush: true, fightpost: true, locked: FightpostLocked(state, unit.pos) };
  }
  const outcome = ResolveAttack(state, events, unit.id, target.id, opts);
  if (!outcome.done) return outcome.reason || "攻击未能进行";
  if (opts.fightpost) {
    const cell = state.tunnels.cells[unit.pos];
    if (opts.locked) {
      const hex = HexOf(state, unit.pos);
      if (hex) hex.alertedUntil = state.meta.turn + CFG.fightpost.lockedTurns;
      PushEvent(state, events, { kind: "fightpost", text: TEXT.fightpostText.locked, hex: unit.pos, visible: true });
      PushEvent(state, events, { kind: "fightpost", text: TEXT.fightpostText.relocate, hex: unit.pos, visible: true });
    }
    if (cell) {
      cell.fightpostLastTurn = state.meta.turn;
      cell.fightpostHeat = (cell.fightpostHeat || 0) + 1;
    }
    if (!state.score.fightpostsUsed.includes(unit.pos)) state.score.fightpostsUsed.push(unit.pos);
  }
  if (state.units[unit.id]) {
    unit.acted = true;
    unit.attacked = true;
  }
  return null;
}

function ApplyFeint(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "佯动须在地面";
  unit.stance = "normal";
  unit.revealed = true;
  unit.acted = true;
  unit.freeMove = true;
  RecordSighting(state, unit.pos, 2);
  PushEvent(state, events, { kind: "feint", text: `${UnitDef(unit).name}现身佯动，引敌来看`, hex: unit.pos, visible: true });
  return null;
}

function ApplyHideGrain(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "须在地面组织藏粮";
  const hex = HexOf(state, unit.pos);
  const village = hex?.villageId ? state.map.villages[hex.villageId] : null;
  if (!village) return "须在村格藏粮";
  if (village.grainOpen <= 0) return "村中已无明存粮";
  // R2 P0-4：粮不会隔空入洞——本村格正下方必须有地道格，且该格连着还装得下的储粮洞。
  const cells = StorageCellsUnder(state, unit.pos);
  if (!cells.length) return "本格正下方没有连着储粮洞的地道（先把地道挖到粮囤脚底下）";
  let moved = 0;
  let want = Math.min(CFG.hideGrainPerAction, village.grainOpen);
  for (const cellKey of cells) {
    const cell = state.tunnels.cells[cellKey];
    const room = StorageCapOf(state) - cell.grain;
    const take = Math.min(room, want);
    if (take > 0) {
      cell.grain += take;
      village.grainOpen -= take;
      moved += take;
      want -= take;
    }
    if (want <= 0) break;
  }
  if (moved <= 0) return "储粮洞已满";
  unit.acted = true;
  PushEvent(state, events, { kind: "grain", text: `粮秣入洞 ${moved} 担`, hex: unit.pos, visible: true });
  return null;
}

/** 村口转移：把地面上的群众送进邻接地道口连通的地道。可用 kind 指定先送哪一类（老弱/伤员优先是常识）。 */
function ApplyMoveCivs(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "须在地面组织转移";
  const hex = HexOf(state, unit.pos);
  const villageId = hex?.villageId || null;
  const village = villageId ? state.map.villages[villageId] : null;
  if (!village) return "须在村格转移群众";
  let waiting = CivsAtVillage(state, villageId).sort((a, b) => CompareIds(a.id, b.id));
  if (action.kind) waiting = waiting.filter((civ) => civ.kind === action.kind);
  if (!waiting.length) return "村中已无未转移的群众（或该类群众已转移完）";
  const entranceKey = NearbyShelterEntrance(state, unit.pos);
  if (!entranceKey) return ShelterBlockReason(state, unit.pos);
  const want = Math.min(CFG.moveCivsPerAction, waiting.length,
    Math.max(1, Number(action.count) || CFG.moveCivsPerAction));
  const queue = waiting.slice(0, want);
  const moved = [];
  for (const civ of queue) {
    const slot = CivSlots(civ);
    const target = CivDropCells(state, entranceKey).find((key) => CellCivRoom(state, key) >= slot);
    if (!target) break;
    civ.loc = "cell";
    civ.at = target;
    moved.push(civ);
  }
  if (!moved.length) return ShelterBlockReason(state, unit.pos);
  unit.acted = true;
  PushEvent(state, events, { kind: "civs",
    text: `群众 ${moved.length} 批转入地道（${moved.map((civ) => civ.kind === "old" ? "老弱" : civ.kind === "young" ? "青壮" : "伤员").join("、")}）`,
    hex: unit.pos, visible: true });
  return null;
}

function ApplyOrganize(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  if (unit.layer !== "surface") return "须在地面做组织工作";
  const hex = HexOf(state, unit.pos);
  const village = hex?.villageId ? state.map.villages[hex.villageId] : null;
  if (!village) return "须在村格组织";
  if (village.organize >= CFG.organizeMax) return "该村组织度已到上限";
  village.organizeProgress += 1;
  if (village.organizeProgress >= CFG.organizeNeed) {
    village.organize += 1;
    village.organizeProgress = 0;
    PushEvent(state, events, { kind: "organize", text: `${village.name}组织度升至 ${village.organize}`, hex: unit.pos, visible: true });
  } else {
    PushEvent(state, events, { kind: "organize", text: `组织工作推进（${village.organizeProgress}/${CFG.organizeNeed}）`, hex: unit.pos, visible: true });
  }
  unit.acted = true;
  return null;
}

function ApplyCollapse(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  const at = action.at || unit.pos;
  if (at !== unit.pos) return "须在入口所在格自毁封口";
  const entrance = state.tunnels.entrances[at];
  if (!entrance || entrance.sealed) return "此处没有可封的入口";
  entrance.sealed = true;
  unit.acted = true;
  PushEvent(state, events, { kind: "collapse", text: "自毁封口，断敌利用", hex: at, visible: true });
  return null;
}

function ApplyRest(state, events, action) {
  const unit = AllyOf(state, action.unit);
  if (!unit) return "单位不存在或已阵亡";
  if (unit.acted) return "该单位本回合已行动";
  unit.acted = true;
  PushEvent(state, events, { kind: "rest", text: `${UnitDef(unit).name}原地待命`, hex: unit.pos, layer: unit.layer, visible: false });
  return null;
}
