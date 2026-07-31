// 《地下长城 · 冀中1942》 —— 敌军 AI：波次入场、纵队七步决策树（§2.7）、反地道四选一（§2.8）。
// 纵队为整体（成员同格同进退）；一切先算后播，事件带 visible 标记交由播报器过滤。
// 全确定性：波内零随机（三处 RNG 子流已在建局时抽定于 wave.plan / schedule / tieSalt）。

import { HexNeighborKeys, HexDistanceKeys, ParseHexKey } from "./Script_Hex.mjs";
import { CFG, unitDefinitions, disguiseDefinitions, TEXT } from "./Data_Rules.mjs";
import { GetLevel } from "./Data_Levels.mjs";
import {
  SortedKeys, CompareIds, PushEvent, AddLedger, MakeEnemyUnit, EnemyMoveCost, EnemyPathCost, UnitsOn,
  AllyUnits, EnemyUnits, RemoveUnit, UnitDef, TerrainOf, EntranceThreshold, VentThreshold,
  ZoneOfCell, ZoneVentCount, ElevOf, CivsInCell, CivsAtVillage, LoseCiv, CivsOnHex, StunUnit,
  ConnectedCells, SpendAmmo,
} from "./Script_State.mjs";
import { CanAllySeeHex, EnemySeesUnit, FreshSightings, SuspicionScore, RecordSighting } from "./Script_Visibility.mjs";
import { ResolveAttack, RecordExposedSightings, KillEnemyUnit } from "./Script_Actions.mjs";

// ---------------------------------------------------------------------------
// 小件
// ---------------------------------------------------------------------------

function ColumnUnits(state, column) {
  return column.unitIds.map((id) => state.units[id]).filter((unit) => unit && unit.hp > 0);
}

function ColumnPos(state, column) {
  const units = ColumnUnits(state, column);
  return units.length ? units[0].pos : null;
}

function ColumnMp(state, column) {
  const units = ColumnUnits(state, column);
  if (!units.length) return 0;
  let mp = Math.min(...units.map((unit) => UnitDef(unit).mp));
  if (column.caution >= 1) mp -= CFG.cautionMpPenalty;
  return Math.max(1, mp);
}

function ColumnHasType(state, column, type) {
  return ColumnUnits(state, column).some((unit) => unit.type === type);
}

function CountInf(state, column) {
  return ColumnUnits(state, column).filter((unit) => unit.type === "inf").length;
}

/** 波次可见性：入场/移动等敌事件按我方是否看得见该格标记 visible。 */
function SeenBy(state, key) {
  return CanAllySeeHex(state, key);
}

// ---------------------------------------------------------------------------
// 寻路（Dijkstra；路 0.5、越野 1、河/断桥不可通；平手按格键字典序）
// ---------------------------------------------------------------------------

export function EnemyPath(state, fromKey, toKey) {
  if (fromKey === toKey) return [];
  const dist = { [fromKey]: 0 };
  const prev = {};
  const open = [fromKey];
  while (open.length) {
    open.sort((a, b) => (dist[a] - dist[b]) || (a < b ? -1 : 1));
    const key = open.shift();
    if (key === toKey) break;
    for (const nb of HexNeighborKeys(key)) {
      const cost = EnemyPathCost(state, nb);      // 含「敌已警戒」惩罚：有路可绕就绕开伏击老地方
      if (!Number.isFinite(cost)) continue;
      const alt = dist[key] + cost;
      if (dist[nb] === undefined || alt < dist[nb] - 1e-9) {
        dist[nb] = alt;
        prev[nb] = key;
        if (!open.includes(nb)) open.push(nb);
      }
    }
  }
  if (dist[toKey] === undefined) return null;
  const path = [];
  let cursor = toKey;
  while (cursor !== fromKey) {
    path.unshift(cursor);
    cursor = prev[cursor];
  }
  return path;
}

// ---------------------------------------------------------------------------
// 伏击触发（敌纵队每进一格检查；未识破特务先因相邻现形，再谈可否被伏）
// ---------------------------------------------------------------------------

/** 伏击触发。R2 P0-5：同格只可能有 1 个伏击手；打完转「暴露」并当场吃一次还击。 */
function TriggerAmbushes(state, events, column, hexKey) {
  const ambushers = AllyUnits(state)
    .filter((unit) => unit.stance === "ambush" && unit.layer === "surface"
      && HexDistanceKeys(unit.pos, hexKey) <= 1)
    .sort((a, b) => CompareIds(a.id, b.id));
  let fired = false;
  for (const ambusher of ambushers) {
    // 伏击先撞上的是走在前头的步兵班——**工兵夹在队伍中间**，不会第一个挨枪。
    // （原来一律按单位号取第一个，而工兵总是最先生成：一发伏击就能让整幕的烟与水永不出现。）
    const targets = ColumnUnits(state, column)
      .filter((unit) => unit.revealed)
      .sort((a, b) => ((a.type === "sapper" ? 1 : 0) - (b.type === "sapper" ? 1 : 0)) || CompareIds(a.id, b.id));
    if (!targets.length) break;
    if (state.resources.ammo < CFG.ammoPerAttack) break;
    const outcome = ResolveAttack(state, events, ambusher.id, targets[0].id, { ambush: true });
    if (!outcome.done) continue;
    fired = true;
    // 还击：伏击手已暴露，纵队里够得着又打得动的第一个班当场回敬一下
    const shooter = ColumnUnits(state, column)
      .filter((unit) => UnitDef(unit).atk > 0 && HexDistanceKeys(unit.pos, ambusher.pos) <= 1)
      .sort((a, b) => CompareIds(a.id, b.id))[0];
    if (shooter && state.units[ambusher.id] && state.units[ambusher.id].hp > 0) {
      ResolveAttack(state, events, shooter.id, ambusher.id, { ambush: false });
    }
  }
  return fired;
}

/** 纵队移动（逐格扣费；被伏即停）。返回实际是否移动过。 */
function MoveColumn(state, events, column, targetKey) {
  const from = ColumnPos(state, column);
  if (!from || !targetKey || from === targetKey) return false;
  const path = EnemyPath(state, from, targetKey);
  if (!path || !path.length) return false;
  let mpLeft = ColumnMp(state, column);
  let moved = false;
  for (const step of path) {
    const cost = EnemyMoveCost(state, step);
    if (cost > mpLeft + 1e-9) break;
    mpLeft -= cost;
    for (const unit of ColumnUnits(state, column)) unit.pos = step;
    moved = true;
    // 相邻我方 → 特务现形
    for (const unit of ColumnUnits(state, column)) {
      if (unit.type === "spy" && !unit.revealed
          && AllyUnits(state).some((ally) => ally.layer === "surface" && HexDistanceKeys(ally.pos, unit.pos) <= 1)) {
        unit.revealed = true;
        PushEvent(state, events, { kind: "spy", text: "便衣行迹败露：确认为特务", hex: unit.pos, visible: true });
      }
    }
    if (TriggerAmbushes(state, events, column, step)) break;   // 遇伏即停
    if (!ColumnUnits(state, column).length) break;
  }
  const at = ColumnPos(state, column);
  if (moved && at) {
    PushEvent(state, events, { kind: "enemyMove", text: "敌一部行进", hex: at, visible: SeenBy(state, at) });
  }
  return moved;
}

// ---------------------------------------------------------------------------
// 波次入场（含 L1 报复队、L2 预备队条件与 T13 判定波）
// ---------------------------------------------------------------------------

function SpawnColumn(state, events, spec) {
  const column = {
    id: spec.id, unitIds: [], role: spec.role || "march",
    route: (spec.waypoints || []).slice(), routeIndex: 0,
    exit: spec.exit || null, targetVillage: spec.target || null,
    seizeGoal: spec.seizeGoal || 0, seized: 0,
    caution: 0, cautionTurns: 0, regroupTurns: 0, opInProgress: null,
    withdrawing: false, garrison: false, plannedPath: [], respondFresh: false,
    incident: false, casualties: 0, burned: false, done: false, gained: false, hauled: false, seals: 0,
    axis: spec.axis || null, burnCount: spec.burnCount || 0,
  };
  for (const type of spec.units) {
    column.unitIds.push(MakeEnemyUnit(state, type, spec.entry, column.id));
  }
  state.enemy.columns.push(column);
  PushEvent(state, events, { kind: "spawn", text: `敌一部（${spec.units.length}队）入境`,
    hex: spec.entry, visible: SeenBy(state, spec.entry) });
  return column;
}

function AxisOfEntry(state, entryKey) {
  if (!entryKey) return null;
  const level = GetLevel(state.meta.level);
  if (!level.exitKeys || level.exitKeys.length < 2) return null;
  return entryKey === level.exitKeys[0] ? "north" : "south";
}

function SpawnDueWaves(state, events) {
  const level = GetLevel(state.meta.level);
  for (const wave of state.wave.schedule) {
    if (wave.spawned || wave.turn !== state.meta.turn) continue;
    wave.spawned = true;
    if (wave.kind === "decision") {
      ResolveDecisionWave(state, events);
      continue;
    }
    if (wave.kind === "reserve") {
      const kills = state.wave.axisKills;
      const most = Math.max(kills.north || 0, kills.south || 0);
      if (most < (wave.axisKillsNeed || 0)) {
        PushEvent(state, events, { kind: "wave", text: "敌预备队按兵未出", visible: false });
        continue;
      }
      const axis = (kills.north || 0) >= (kills.south || 0) ? "north" : "south";
      const entry = axis === "north" ? level.exitKeys[0] : level.exitKeys[1];
      SpawnColumn(state, events, { ...wave, entry, exit: entry, axis,
        waypoints: (level.reserveWays || {})[axis] || wave.waypoints,
        target: state.wave.plan.targetAssign ? state.wave.plan.targetAssign.main : null });
      continue;
    }
    SpawnColumn(state, events, { ...wave, axis: AxisOfEntry(state, wave.entry) });
  }
  // L1 报复队（条件波：征粮队伤亡 ≥2 的次回合入场）
  const revenge = state.wave.revenge;
  if (revenge && revenge.pending && state.meta.turn >= revenge.spawnTurn) {
    revenge.pending = false;
    revenge.spawnedTurn = state.meta.turn;
    SpawnColumn(state, events, { id: revenge.id, role: revenge.role, units: revenge.units.slice(),
      entry: revenge.entry, exit: revenge.exit, target: revenge.target, waypoints: [],
      burnCount: revenge.burnCount || 0 });
  }
}

/** 村子是否还「值得驻剿」：尚有明存粮，或村 1 格内有已知未封的地道口。
 *  藏净粮、护住口，就是让敌人扑空自走的正解。 */
function VillageWorthGarrison(state, villageId) {
  const village = state.map.villages[villageId];
  if (!village) return false;
  if ((GetLevel(state.meta.level).garrisonPriority || [])[0] === villageId) return true;   // 区队部永远值得占
  if (village.grainOpen > 0) return true;
  if (CivsAtVillage(state, villageId).length > 0) return true;
  for (const hexKey of village.hexKeys) {
    if (TargetableEntranceNear(state, hexKey, 1)) return true;
  }
  return false;
}

/** L2 T13 判定：占村且有可剿之物 → 驻剿搜毁；否则全体沿路收队。 */
function ResolveDecisionWave(state, events) {
  if (state.wave.status === "withdrawing" || state.wave.withdrawAnnounced) return;
  let occupied = false;
  for (const column of state.enemy.columns) {
    if (column.done) continue;
    const pos = ColumnPos(state, column);
    if (!pos) continue;
    const hex = state.map.hexes[pos];
    if (hex && hex.villageId && VillageWorthGarrison(state, hex.villageId)) {
      column.garrison = true;
      column.targetVillage = hex.villageId;
      occupied = true;
    }
  }
  if (occupied) {
    state.wave.garrison = true;
    PushEvent(state, events, { kind: "banner", text: "敌占村不去，转入驻剿搜毁", visible: true });
  } else {
    for (const column of state.enemy.columns) column.withdrawing = true;
    state.wave.withdrawAnnounced = true;
    if (state.wave.withdrawTurn === null) state.wave.withdrawTurn = state.meta.turn;
    PushEvent(state, events, { kind: "banner", text: TEXT.banner.withdraw, visible: true });
  }
}

// ---------------------------------------------------------------------------
// 反地道四选一：宣布（提前 1 回合电报）与执行
// ---------------------------------------------------------------------------

/** R2 P0-2：盯上一个口的门槛从「已被搜出（满 9 豆）」降到「暴露豆 ≥4」，暴露高者优先。
 *  L1 的口一辈子到不了 9 豆，这正是反地道四选一从没发生过的原因。 */
/** 盯上一个口所需的动静：基础 opTargetExpose，**伪装每级再加 2**——
 *  灶台/炕洞（+1）要 6 豆、水井（+2）要 8 豆才招敌动手。
 *  伪装口因此不只是更难搜出，也更晚被敌盯上；没做伪装的口门槛照旧。 */
function OpTargetBeans(state, entrance) {
  const bonus = entrance.disguise && disguiseDefinitions[entrance.disguise]
    ? disguiseDefinitions[entrance.disguise].conceal * 2 : 0;
  return CFG.opTargetExpose + bonus;
}

function TargetableEntranceNear(state, pos, range) {
  const keys = [];
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const entrance = state.tunnels.entrances[key];
    if (entrance.sealed || HexDistanceKeys(pos, key) > range) continue;
    if (entrance.known || entrance.expose >= OpTargetBeans(state, entrance)) keys.push(key);
  }
  keys.sort((a, b) => (state.tunnels.entrances[b].expose - state.tunnels.entrances[a].expose) || (a < b ? -1 : 1));
  return keys.length ? keys[0] : null;
}

/**
 * 工兵专程要去的那个口（R5 P0-5）：已经够得着就去够得着的那个；
 * 一个都还不够门槛时，就**朝动静最大的那个口摸过去**（暴露豆 ≥ sapperSniffExpose 才算有动静）。
 * 情报公平：暴露豆本来就是明牌，敌人被新土吸引过去不是读心，而且他站上去还要自己踩几回合。
 * 原来工兵只认「已够门槛」的口，于是在正常游玩里它一辈子走不到任何一个口跟前——
 * 这就是「A4 打满 12 回合 0 次灌水、水车 2/2 从没动过」的直接原因。
 */
function SapperSeekTarget(state, pos, range) {
  const ready = TargetableEntranceNear(state, pos, range);
  if (ready) return ready;
  const keys = [];
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const entrance = state.tunnels.entrances[key];
    if (entrance.sealed || HexDistanceKeys(pos, key) > range) continue;
    if (entrance.expose >= CFG.sapperSniffExpose) keys.push(key);
  }
  keys.sort((a, b) => (state.tunnels.entrances[b].expose - state.tunnels.entrances[a].expose) || (a < b ? -1 : 1));
  return keys.length ? keys[0] : null;
}

/** 烟攻的额外条件（R2 P0-2）：该气区通风口数 < 地道格数 / 3——通风口修得够多，敌就不烧这份柴。 */
function ZoneUnderVentilated(state, entranceKey) {
  const zone = ZoneOfCell(state, entranceKey);
  if (!zone.size) return false;
  return ZoneVentCount(state, zone) < zone.size / CFG.ventPerCellsForSmoke;
}

/** 灌水的额外条件：这个口下面的地道格得在低处（水往低处走——高岗上的口灌不进去）。 */
function FloodUseful(state, entranceKey) {
  const zone = ZoneOfCell(state, entranceKey);
  if (!zone.size) return false;
  const here = ElevOf(state, entranceKey);
  for (const key of zone) {
    if (key !== entranceKey && ElevOf(state, key) <= here) return true;
  }
  return false;
}

/** 工兵在不在手边：本纵队自带工兵，或有工兵班就在 1 格内跟着（R5 P0-5 放宽）。
 *  原来只认「同一纵队里有工兵」，而工兵永远单独成队——烟与水因此在正常游玩里根本不会发生。 */
function SapperOnHand(state, column) {
  if (ColumnHasType(state, column, "sapper")) return true;
  const pos = ColumnPos(state, column);
  if (!pos) return false;
  return EnemyUnits(state).some((unit) => unit.type === "sapper" && HexDistanceKeys(unit.pos, pos) <= 1);
}

/** 攻入的兵力门槛（R5 P0-5 放宽）：≥2 个班，其中至少 1 个日军班。 */
function BreachManpowerOk(state, column) {
  const squads = ColumnUnits(state, column).filter((unit) => unit.type === "inf" || unit.type === "puppet").length;
  return CountInf(state, column) >= CFG.breachMinInf && squads >= CFG.breachMinSquads;
}

function AnnounceOp(state, events, column, entranceKey) {
  const level = GetLevel(state.meta.level);
  const allowed = level.enemyOps || [];
  const entrance = state.tunnels.entrances[entranceKey];
  // 反地道诸手的偏好顺序写在关卡数据里（level.opPriority），这里只判「能不能做」。
  const able = {
    smoke: () => state.wave.smokeCharges > 0 && SapperOnHand(state, column)
      && ZoneUnderVentilated(state, entranceKey),
    flood: () => state.wave.floodCharges > 0 && SapperOnHand(state, column)
      && FloodUseful(state, entranceKey),
    blast: () => SapperOnHand(state, column),
    breach: () => BreachManpowerOk(state, column) && column.caution < CFG.cautionMax && !entrance.breachDenied,
    excavate: () => entrance.known,          // 刨口不需要工兵：认准了的口，扛锹镐就能刨
    seal: () => (column.seals || 0) < CFG.sealPerColumn,
  };
  const order = (level.opPriority || ["smoke", "blast", "breach", "seal"])
    .filter((option) => allowed.includes(option) && able[option] && able[option]());
  // R5 P0-5：敌不会把同一手用到底——可做的几手里先挑**本役用得最少**的那一手。
  // 「水是死内容」的根因就是烟永远排在水前面、又共用同一个工兵。
  if (CFG.opRotate && order.length > 1) {
    order.sort((a, b) => ((state.wave.opsUsed[a] || 0) - (state.wave.opsUsed[b] || 0)) || 0);
  }
  const kind = order.length ? order[0] : null;
  if (!kind) return false;
  state.wave.opsUsed[kind] = (state.wave.opsUsed[kind] || 0) + 1;
  state.enemy.pendingOps.push({ kind, at: entranceKey, columnId: column.id, announcedTurn: state.meta.turn, turnsLeft: 1 });
  column.gained = true;
  column.opInProgress = { kind, at: entranceKey, turnsLeft: 1 };
  PushEvent(state, events, { kind: "telegraph", text: TEXT.telegraph[kind], hex: entranceKey, visible: true });
  return true;
}

/**
 * 翻板拦截：敌对这个口动手时踩空掉下去，整队白费一回合，翻板落下（须重新支好）。
 * 它买的是**时间**，不是安全——那一回合是留给你换位、带人、关门的。
 */
function TrapIntercept(state, events, op, column) {
  const cell = state.tunnels.cells[op.at];
  if (!cell || cell.facility !== "trapdoor" || !cell.trapReady) return false;
  cell.trapReady = false;
  if (column) {
    column.regroupTurns = Math.max(column.regroupTurns || 0, CFG.trap.holdTurns);
    column.incident = true;
    column.gained = false;
  }
  state.wave.pool -= CFG.trap.selfCost;
  PushEvent(state, events, { kind: "op", text: TEXT.trapText.sprung, hex: op.at, visible: true });
  return true;
}

/** 敌从破开的口顺着巷子往里搬粮：连通储粮洞按格键序掏走至多 amount 担（只进代价簿）。 */
function HaulFromZone(state, events, atKey, amount) {
  let want = amount;
  const zone = [...ConnectedCells(state, atKey, false)].sort();
  for (const key of zone) {
    if (want <= 0) break;
    if (key === atKey) continue;
    const cell = state.tunnels.cells[key];
    if (!cell || cell.grain <= 0) continue;
    const take = Math.min(cell.grain, want);
    cell.grain -= take;
    want -= take;
    AddLedger(state, "grainSeized", take);
    PushEvent(state, events, { kind: "ledger", text: `敌顺着地道搬走储粮 ${take} 担（入代价簿）`,
      hex: key, layer: "under", visible: true });
  }
}

function ResolveDueOps(state, events) {
  const due = state.enemy.pendingOps.filter((op) => op.announcedTurn < state.meta.turn);
  state.enemy.pendingOps = state.enemy.pendingOps.filter((op) => op.announcedTurn >= state.meta.turn);
  for (const op of due) {
    const column = state.enemy.columns.find((entry) => entry.id === op.columnId);
    if (column) column.opInProgress = null;
    ExecuteOp(state, events, op, column);
  }
}

function ExecuteOp(state, events, op, column) {
  const entrance = state.tunnels.entrances[op.at];
  const columnPos = column ? ColumnPos(state, column) : null;
  const adjacent = columnPos && HexDistanceKeys(columnPos, op.at) <= 1;
  if (!entrance || entrance.sealed) {
    PushEvent(state, events, { kind: "op", text: "敌作业扑空：该口已不存在", hex: op.at, visible: SeenBy(state, op.at) });
    return;
  }
  // 翻板先于一切作业结算：踩空一次，这一趟就白跑了
  if (TrapIntercept(state, events, op, column)) return;
  if (op.kind === "smoke") {
    if (!column || !adjacent || !SapperOnHand(state, column) || state.wave.smokeCharges <= 0) {
      PushEvent(state, events, { kind: "op", text: "敌烟攻中止", hex: op.at, visible: SeenBy(state, op.at) });
      return;
    }
    state.wave.smokeCharges -= 1;
    state.wave.pool -= CFG.pool.smokeSelfCost;
    state.tunnels.smokeOps.push({ origin: op.at, spreadLeft: CFG.smokeSpreadTurns, lingerLeft: CFG.smokeLingerTurns,
      cells: [op.at], front: [{ key: op.at, dir: -1 }], queued: [] });
    const cell = state.tunnels.cells[op.at];
    if (cell) cell.smoke = CFG.smokeSpreadTurns + CFG.smokeLingerTurns;
    const vent = state.tunnels.vents[op.at];
    if (vent) vent.smoked = true;
    PushEvent(state, events, { kind: "op", text: `${TEXT.op.smoke}：烟自该口灌入地道`, hex: op.at, visible: true });
    column.incident = true;
    return;
  }
  if (op.kind === "flood") {
    if (!column || !adjacent || !SapperOnHand(state, column) || state.wave.floodCharges <= 0) {
      PushEvent(state, events, { kind: "op", text: "敌灌水中止", hex: op.at, visible: SeenBy(state, op.at) });
      return;
    }
    state.wave.floodCharges -= 1;
    state.wave.pool -= CFG.pool.floodSelfCost;
    state.tunnels.floodOps.push({ origin: op.at, spreadLeft: CFG.water.spreadTurns,
      lingerLeft: CFG.water.lingerTurns, cells: [op.at] });
    const cell = state.tunnels.cells[op.at];
    if (cell) cell.water = CFG.water.spreadTurns + CFG.water.lingerTurns;
    PushEvent(state, events, { kind: "op", text: `${TEXT.op.flood}：水自该口灌进地道，顺着往低处走`, hex: op.at, visible: true });
    column.incident = true;
    return;
  }
  if (op.kind === "excavate") {
    if (!column || !adjacent) {
      PushEvent(state, events, { kind: "op", text: "敌刨口中止", hex: op.at, visible: SeenBy(state, op.at) });
      return;
    }
    state.wave.pool -= CFG.pool.excavateSelfCost;
    delete state.tunnels.entrances[op.at];
    PushEvent(state, events, { kind: "op", text: `${TEXT.op.excavate}：入口被一锹一镐刨塌`, hex: op.at, visible: true });
    return;
  }
  if (op.kind === "blast") {
    const sapperReady = column && adjacent && SapperOnHand(state, column);
    if (!sapperReady) {
      PushEvent(state, events, { kind: "op", text: "敌爆破被打断", hex: op.at, visible: SeenBy(state, op.at) });
      return;
    }
    state.wave.pool -= CFG.pool.blastSelfCost;
    delete state.tunnels.entrances[op.at];
    const cell = state.tunnels.cells[op.at];
    if (cell) {
      if (cell.facility === "vent") delete state.tunnels.vents[op.at];
      // 炸塌的储粮洞里那几担粮跟着土一起埋了（R5 P0-6：洞存粮不再是存进去就永远安全）。
      // 只埋一部分——这一条要教的是「粮分几个洞放」，不是「一炮翻盘」。
      if (cell.grain > 0) {
        const buried = Math.min(CFG.blastGrainLoss, cell.grain);
        cell.grain -= buried;
        AddLedger(state, "grainSeized", buried);
        PushEvent(state, events, { kind: "ledger", text: `储粮洞被炸塌，${buried} 担粮埋在土里（入代价簿）`,
          hex: op.at, layer: "under", visible: true });
      }
      cell.facility = null;
      for (const unit of UnitsOn(state, op.at, "under")) {
        unit.hp -= CFG.blastDamage;
        if (unit.hp <= 0) {
          state.score.alliesLost += 1;
          PushEvent(state, events, { kind: "loss", text: `${UnitDef(unit).name}于爆破中阵亡`, hex: op.at, visible: true });
          RemoveUnit(state, unit.id);
        }
      }
      const trapped = CivsInCell(state, op.at);
      if (trapped.length) {
        for (const civ of trapped) LoseCiv(state, civ, "dead");
        PushEvent(state, events, { kind: "ledger", text: `爆破塌方：群众罹难 ${trapped.length} 批（入代价簿）`, hex: op.at, visible: true });
      }
    }
    PushEvent(state, events, { kind: "op", text: `${TEXT.op.blast}：入口被炸毁`, hex: op.at, visible: true });
    return;
  }
  if (op.kind === "breach") {
    const ready = column && adjacent && BreachManpowerOk(state, column) && column.caution < CFG.cautionMax;
    if (!ready) {
      PushEvent(state, events, { kind: "op", text: "敌攻入中止", hex: op.at, visible: SeenBy(state, op.at) });
      return;
    }
    state.wave.pool -= CFG.pool.breachSelfCost;
    // 驻守判定：入口正下方格或相邻枪眼格有我方单位 → 敌 1 班伤亡且中止。
    // R5 P0-4：守洞**不再免费**——要打出去一发子弹（弹药池空就堵不住），
    // 守洞的人被压制一回合，且这个口从此明摆在敌人眼里。它仍然是一手好棋，只是有价。
    const defenders = UnitsOn(state, op.at, "under").slice();
    for (const nb of HexNeighborKeys(op.at)) {
      const cell = state.tunnels.cells[nb];
      if (cell && cell.facility === "fightpost") defenders.push(...UnitsOn(state, nb, "under"));
    }
    const allyDefenders = defenders.filter((unit) => unit.side === "ally");
    if (allyDefenders.length && state.resources.ammo < CFG.guardAmmoCost) {
      PushEvent(state, events, { kind: "op", text: TEXT.guardText.noAmmo, hex: op.at, visible: true });
    }
    if (allyDefenders.length && state.resources.ammo >= CFG.guardAmmoCost) {
      for (let i = 0; i < CFG.guardAmmoCost; i += 1) SpendAmmo(state);
      PushEvent(state, events, { kind: "combat", text: TEXT.guardText.ammo, hex: op.at, visible: true });
      const infUnits = ColumnUnits(state, column).filter((unit) => unit.type === "inf").sort((a, b) => CompareIds(a.id, b.id));
      PushEvent(state, events, { kind: "op", text: `敌强攻入口，${TEXT.guardText.repelled}`, hex: op.at, visible: true });
      if (infUnits.length) KillEnemyUnit(state, events, infUnits[0], false);
      for (const unit of allyDefenders) StunUnit(state, unit, CFG.guardStunTurns);
      PushEvent(state, events, { kind: "combat", text: TEXT.guardText.stunned, hex: op.at, layer: "under", visible: true });
      if (!entrance.known) {
        entrance.known = true;
        PushEvent(state, events, { kind: "expose", text: TEXT.guardText.marked, hex: op.at, visible: true });
      }
      entrance.breachDenied = true;
      column.incident = true;
      if (column.caution < CFG.cautionMax) { column.caution += 1; column.regroupTurns = 1; column.cautionTurns = 0; }
      return;
    }
    delete state.tunnels.entrances[op.at];
    const cell = state.tunnels.cells[op.at];
    if (cell) {
      const caught = CivsInCell(state, op.at);
      if (caught.length) {
        for (const civ of caught) LoseCiv(state, civ, "captured");
        PushEvent(state, events, { kind: "ledger", text: `藏身处失守：群众被抓 ${caught.length} 批（入代价簿）`, hex: op.at, visible: true });
      }
      if (cell.grain > 0) {
        AddLedger(state, "grainSeized", cell.grain);
        PushEvent(state, events, { kind: "ledger", text: `储粮洞被夺 ${cell.grain} 担（入代价簿）`, hex: op.at, visible: true });
        cell.grain = 0;
      }
      // R5 P0-6：口一破，敌就顺着这条巷子往里搬——连通的储粮洞也要被掏走一部分。
      HaulFromZone(state, events, op.at, CFG.breachStorageHaul);
      if (cell.facility === "vent") delete state.tunnels.vents[op.at];
      cell.facility = null;
      cell.trapReady = false;
    }
    PushEvent(state, events, { kind: "op", text: `${TEXT.op.breach}：无人驻守，入口被毁`, hex: op.at, visible: true });
    return;
  }
  if (op.kind === "seal") {
    if (!column || !adjacent) {
      PushEvent(state, events, { kind: "op", text: "敌封堵中止", hex: op.at, visible: SeenBy(state, op.at) });
      return;
    }
    column.seals = (column.seals || 0) + 1;
    entrance.sealed = true;
    PushEvent(state, events, { kind: "op", text: `${TEXT.op.seal}：入口被土石填死`, hex: op.at, visible: true });
  }
}

// ---------------------------------------------------------------------------
// 搜索与征粮
// ---------------------------------------------------------------------------

function BestSearcherPower(state, column) {
  let best = 0;
  for (const unit of ColumnUnits(state, column)) {
    const def = UnitDef(unit);
    let power = def.search || 0;
    if (def.needsInfToSearch) {
      const hasInf = EnemyUnits(state).some((other) => other.type === "inf" && HexDistanceKeys(other.pos, unit.pos) <= 1);
      if (!hasInf) power = 0;
    }
    if (power > 0 && column.caution >= 1) power += CFG.cautionSearchBonus;
    best = Math.max(best, power);
  }
  return best;
}

function SearchCandidates(state, column) {
  const village = column.targetVillage ? state.map.villages[column.targetVillage] : null;
  const pool = new Set();
  const base = village ? village.hexKeys : [ColumnPos(state, column)].filter(Boolean);
  for (const key of base) {
    pool.add(key);
    for (const nb of HexNeighborKeys(key)) if (state.map.hexes[nb]) pool.add(nb);
  }
  const results = [];
  for (const key of [...pool].sort()) {
    const hex = state.map.hexes[key];
    const entrance = state.tunnels.entrances[key];
    const vent = state.tunnels.vents[key];
    const hiddenOpening = (entrance && !entrance.known && !entrance.sealed) || (vent && !vent.known);
    if (hex.searched && !hiddenOpening) continue;
    results.push(key);
  }
  return results;
}

function PickSearchTarget(state, column, candidates) {
  if (!candidates.length) return null;
  let bestScore = -1;
  for (const key of candidates) bestScore = Math.max(bestScore, SuspicionScore(state, key));
  const top = candidates.filter((key) => SuspicionScore(state, key) === bestScore);
  return top[state.wave.tieSalt % top.length];   // 同分平手：波次盐轮转（建局抽定）
}

function DoSearch(state, events, column) {
  const pos = ColumnPos(state, column);
  const power = BestSearcherPower(state, column);
  if (!pos || power <= 0) return false;
  const hex = state.map.hexes[pos];
  const entrance = state.tunnels.entrances[pos];
  const vent = state.tunnels.vents[pos];
  // 特务现形：执行搜索即暴露身份
  for (const unit of ColumnUnits(state, column)) {
    if (unit.type === "spy" && !unit.revealed) {
      unit.revealed = true;
      PushEvent(state, events, { kind: "spy", text: "翻检器物者露了行藏：确认为特务", hex: pos, visible: SeenBy(state, pos) });
    }
  }
  if (entrance && !entrance.known && !entrance.sealed) {
    entrance.expose += power;
    column.gained = true;
    PushEvent(state, events, { kind: "search", text: `敌在翻检此地（暴露 +${power}）`, hex: pos, visible: true });
    return true;
  }
  if (vent && !vent.known) {
    vent.expose += power;
    column.gained = true;
    PushEvent(state, events, { kind: "search", text: `敌在翻检此地（暴露 +${power}）`, hex: pos, visible: true });
    return true;
  }
  if (hex && !hex.searched) {
    hex.searched = true;
    PushEvent(state, events, { kind: "search", text: "敌搜过此格，一无所获", hex: pos, visible: SeenBy(state, pos) });
    return true;
  }
  return false;
}

/**
 * 抓丁（R5 P0-2 重挂触发源）：**敌军阶段结束时，站在敌纵队所占村格上的群众批被抓。**
 * 老弱与伤员走不动，一个也跑不掉；青壮腿脚快，每两批走脱一批。
 *
 * 旧规则看的是「村里还有没有明存粮」，于是「什么都不做」和「全塞进地道后不管」
 * 结果一模一样，而「疯狂藏粮」反而死人更多——反向激励。现在只看**人还站在哪儿**：
 * 恐慌被逼出洞、村口没送走、终局还留在地面，都会在这里结账。
 */
function LevyOccupiedHexes(state, events) {
  if (state.wave.status === "quiet" || state.wave.status === "done") return;
  const occupied = new Set();
  for (const foe of EnemyUnits(state)) {
    const hex = state.map.hexes[foe.pos];
    if (hex && hex.villageId) occupied.add(foe.pos);
  }
  for (const key of [...occupied].sort()) {
    const here = CivsOnHex(state, key).sort((a, b) => CompareIds(a.id, b.id));
    const grabbed = [];
    let dodged = 0;
    for (const civ of here) {
      // 青壮腿脚快：**头一回**能翻墙走脱（每批一次），第二回就没跑掉——
      // 确定性的「一半」，而且给玩家一个回合的警告去把人挪走。老弱与伤员一次也躲不掉。
      if (civ.kind === "young" && (civ.levyMisses || 0) < CFG.levyYoungEveryN - 1) {
        civ.levyMisses = (civ.levyMisses || 0) + 1;
        dodged += 1;
        continue;
      }
      grabbed.push(civ);
    }
    if (dodged > 0) {
      PushEvent(state, events, { kind: "civs", text: `${TEXT.civText.levyYoungAway}（${dodged} 批）`, hex: key, visible: true });
    }
    if (!grabbed.length) continue;
    for (const civ of grabbed) LoseCiv(state, civ, "captured");
    for (const column of state.enemy.columns) {
      if (!ColumnUnits(state, column).some((unit) => unit.pos === key)) continue;
      column.gained = true;
      column.hauled = true;      // 拉到了人：这支队伍此后不再算「扑空」
    }
    PushEvent(state, events, { kind: "ledger",
      text: `${TEXT.civText.levyOnHex}：群众被抓 ${grabbed.length} 批（${grabbed.map(KindName).join("、")}）（入代价簿）`,
      hex: key, visible: true });
  }
}

function KindName(civ) {
  return ({ old: "老弱", young: "青壮", wounded: "伤员" })[civ.kind] || civ.kind;
}

/**
 * 第一幕的硬脚本攻入（R5 P0-1）：到了关卡声明的那一回合，敌人认准村里最挤的那个窖撬开——
 * **窖里的人一个也跑不掉**，全部进代价簿。这是开场白写的招牌失败，必须在 8 回合内够得着。
 * 提前一回合电报；玩家能改变的是**把人分散在哪几个窖里**，不是这一下会不会来。
 */
function ScriptedBreach(state, events) {
  const script = GetLevel(state.meta.level).scriptedBreach;
  if (!script || state.wave.scriptedBreachDone) return;
  if (state.meta.turn === script.turn - 1) {
    PushEvent(state, events, { kind: "telegraph", text: script.telegraph || TEXT.scriptText.breachWarn, visible: true });
    return;
  }
  if (state.meta.turn < script.turn) return;
  // 人最多的那个窖（并列取格键序）——你把人分散在哪儿，决定这一下要走多少
  let target = null;
  let best = -1;
  for (const key of SortedKeys(state.tunnels.cells)) {
    const count = CivsInCell(state, key).reduce((sum, civ) => sum + 1, 0);
    if (count > best) { best = count; target = key; }
  }
  state.wave.scriptedBreachDone = true;
  if (!target || best <= 0) {
    PushEvent(state, events, { kind: "op", text: "敌撬开窖口，里面空空如也——人早转走了", visible: true });
    return;
  }
  const caught = CivsInCell(state, target);
  for (const civ of caught) LoseCiv(state, civ, "captured");
  const cell = state.tunnels.cells[target];
  if (cell && cell.grain > 0) {
    AddLedger(state, "grainSeized", cell.grain);
    PushEvent(state, events, { kind: "ledger", text: `窖中存粮 ${cell.grain} 担一并被夺（入代价簿）`, hex: target, visible: true });
    cell.grain = 0;
  }
  const entrance = state.tunnels.entrances[target];
  if (entrance) { entrance.known = true; entrance.sealed = true; }
  PushEvent(state, events, { kind: "ledger",
    text: `${script.text || TEXT.scriptText.breachDone}：群众被抓 ${caught.length} 批（入代价簿）`,
    hex: target, visible: true });
}

/** 征粮：进村就搬粮（抓丁已改挂群众暴露，见 LevyOccupiedHexes）。 */
function DoSeize(state, events, column) {
  const village = column.targetVillage ? state.map.villages[column.targetVillage] : null;
  const pos = ColumnPos(state, column);
  if (!village || !pos) return false;
  const hex = state.map.hexes[pos];
  if (!hex || hex.villageId !== column.targetVillage) return false;
  if (village.grainOpen <= 0) return false;
  const take = Math.min(CFG.seizePerTurn, village.grainOpen);
  village.grainOpen -= take;
  village.seizedTurn = state.meta.turn;
  column.gained = true;
  column.hauled = true;          // 装了粮：这支队伍此后不再算「扑空」
  AddLedger(state, "grainSeized", take);
  column.seized += take;
  PushEvent(state, events, { kind: "ledger", text: `敌征走明存粮 ${take} 担（入代价簿）`, hex: pos, visible: true });
  if (column.seizeGoal > 0 && column.seized >= column.seizeGoal) {
    column.withdrawing = true;
    PushEvent(state, events, { kind: "banner", text: TEXT.banner.seizedEnough, visible: true });
  }
  return take > 0;
}

// ---------------------------------------------------------------------------
// 决策树（§2.7，逐纵队按序取首个命中项）
// ---------------------------------------------------------------------------

function WithdrawMove(state, events, column) {
  const level = GetLevel(state.meta.level);
  const pos = ColumnPos(state, column);
  if (!pos) { column.done = true; return; }
  let exit = column.exit;
  if (!exit || !Number.isFinite(EnemyMoveCost(state, exit)) || !EnemyPath(state, pos, exit)) {
    const options = level.exitKeys.slice()
      .filter((key) => EnemyPath(state, pos, key))
      .sort((a, b) => (HexDistanceKeys(pos, a) - HexDistanceKeys(pos, b)) || (a < b ? -1 : 1));
    if (!options.length) {          // 桥断路绝：残部弃辎重涉水散去（不许卡在图上拖住波次收束）
      for (const unit of ColumnUnits(state, column)) RemoveUnit(state, unit.id);
      column.done = true;
      PushEvent(state, events, { kind: "enemyMove", text: "敌一部无路可退，弃辎重涉水散去", hex: pos, visible: SeenBy(state, pos) });
      return;
    }
    exit = options[0];
  }
  MoveColumn(state, events, column, exit);
  const now = ColumnPos(state, column);
  if (now === exit) {
    for (const unit of ColumnUnits(state, column)) RemoveUnit(state, unit.id);
    column.done = true;
    PushEvent(state, events, { kind: "enemyMove", text: "敌一部退出本区", hex: exit, visible: SeenBy(state, exit) });
  }
  column.plannedPath = [];
}

function GarrisonAct(state, events, column) {
  const village = column.targetVillage ? state.map.villages[column.targetVillage]
    : (state.map.hexes[ColumnPos(state, column)]?.villageId ? state.map.villages[state.map.hexes[ColumnPos(state, column)].villageId] : null);
  const pos = ColumnPos(state, column);
  if (!village || !pos) return;
  // 驻剿队也搞反地道作业（R5 P0-5）：占了村不去，本来就是为了把地道挖出来。
  // 原来一转入驻剿就只会「搜、烧、抓」，第五幕 T12 之后的一切反地道作业因此全部停摆。
  if (column.opInProgress) {
    const busy = state.tunnels.entrances[column.opInProgress.at];
    if (busy && !busy.sealed) { column.plannedPath = []; return; }
    column.opInProgress = null;
    state.enemy.pendingOps = state.enemy.pendingOps.filter((op) => op.columnId !== column.id);
  }
  const garrisonTarget = TargetableEntranceNear(state, pos, 1);
  if (garrisonTarget && AnnounceOp(state, events, column, garrisonTarget)) { column.plannedPath = []; return; }
  DoSeize(state, events, column);
  if (village.burnedHexes < village.hexKeys.length) {
    village.burnedHexes += 1;
    AddLedger(state, "housesBurned", 1);
    PushEvent(state, events, { kind: "ledger", text: `${village.name}又有房屋被焚（入代价簿）`, hex: pos, visible: true });
  }
  // 抓丁不在这里做：驻剿队踩住哪一格，那一格的人才被拉走（统一走 LevyOccupiedHexes，R5 P0-2）
  const candidates = SearchCandidates(state, column);
  const target = PickSearchTarget(state, column, candidates);
  if (target && target !== pos) MoveColumn(state, events, column, target);
  DoSearch(state, events, column);
  column.plannedPath = [];
}

function MobileRespond(state, events, column) {
  const pos = ColumnPos(state, column);
  const fresh = FreshSightings(state)
    .filter((s) => HexDistanceKeys(pos, s.pos) <= CFG.mobileResponseRadius)
    .sort((a, b) => (HexDistanceKeys(pos, a.pos) - HexDistanceKeys(pos, b.pos)) || (a.pos < b.pos ? -1 : 1));
  if (!fresh.length) return false;
  const target = fresh[0].pos;
  column.respondFresh = column.respondTarget !== target;
  column.respondTarget = target;
  MoveColumn(state, events, column, target);
  ColumnAttackAdjacent(state, events, column);
  column.plannedPath = [];
  return true;
}

/** 邻接接火：只打「打得动」的目标（攻-掩护>0），打完不吞掉纵队的任务（只压制其移动）。 */
function ColumnAttackAdjacent(state, events, column) {
  let attacked = false;
  for (const member of ColumnUnits(state, column).sort((a, b) => CompareIds(a.id, b.id))) {
    const atk = UnitDef(member).atk;
    if (atk <= 0) continue;
    const targets = AllyUnits(state)
      .filter((ally) => ally.layer === "surface" && EnemySeesUnit(state, ally)
        && HexDistanceKeys(member.pos, ally.pos) <= 1
        && atk - (TerrainOf(state, ally.pos)?.cover ? CFG.coverReduce : 0) > 0)
      .sort((a, b) => (a.hp - b.hp) || CompareIds(a.id, b.id));
    if (!targets.length) continue;
    ResolveAttack(state, events, member.id, targets[0].id, { ambush: false });
    attacked = true;
  }
  return attacked;
}

function PlanPath(state, column, targetKey) {
  const pos = ColumnPos(state, column);
  if (!pos || !targetKey) { column.plannedPath = []; return; }
  const path = EnemyPath(state, pos, targetKey) || [];
  column.plannedPath = path.slice(0, column.caution >= CFG.cautionMax ? 1 : 2);
}

function NextObjective(state, column) {
  const pos = ColumnPos(state, column);
  while (column.routeIndex < column.route.length && column.route[column.routeIndex] === pos) column.routeIndex += 1;
  if (column.routeIndex < column.route.length) return column.route[column.routeIndex];
  if (column.targetVillage) {
    const village = state.map.villages[column.targetVillage];
    const hexes = village.hexKeys.slice().sort((a, b) => (HexDistanceKeys(pos, a) - HexDistanceKeys(pos, b)) || (a < b ? -1 : 1));
    if (hexes.length && HexDistanceKeys(pos, hexes[0]) > 0) return hexes[0];
    return null;
  }
  return "exit";   // 斥候巡毕出境
}

function ColumnAct(state, events, column) {
  if (column.done || !ColumnUnits(state, column).length) return;
  column.gained = false;      // 本回合有没有「搜出东西/抢到东西/干成一件作业」，决定扑空衰减
  column.incident = false;
  column.respondFresh = false;
  const pos = ColumnPos(state, column);
  // 0) 撤退（含「残兵回撤报信」：斥候/特务一旦挂彩即脱离，不与我纠缠）
  if ((column.role === "scout" || column.role === "spy") && !column.withdrawing
      && ColumnUnits(state, column).some((unit) => unit.hp < UnitDef(unit).hp)) {
    column.withdrawing = true;
    PushEvent(state, events, { kind: "enemy", text: "受创斥候回撤报信", hex: pos, visible: SeenBy(state, pos) });
  }
  if (column.withdrawing || state.wave.status === "withdrawing") {
    WithdrawMove(state, events, column);
    return;
  }
  // 0.5) 驻剿（L2 T13 判定后）
  if (column.garrison) { GarrisonAct(state, events, column); column.gained = true; TickCaution(state, column); return; }
  // 0.7) 报复队烧房：一到目标村界即执行（只进账本，绝不产生任何资源）
  if (column.burnCount > 0 && column.targetVillage) {
    const target = state.map.villages[column.targetVillage];
    if (target && pos && target.hexKeys.some((key) => HexDistanceKeys(pos, key) <= 1)) {
      if (target.burnedHexes < target.hexKeys.length) {
        target.burnedHexes += 1;
        AddLedger(state, "housesBurned", 1);
        PushEvent(state, events, { kind: "ledger", text: `${target.name}房屋被焚一处（入代价簿）`, hex: pos, visible: true });
      }
      column.burnCount = 0;
    }
  }
  // 1) 谨慎整队
  if (column.regroupTurns > 0) {
    column.regroupTurns -= 1;
    column.plannedPath = [];
    PushEvent(state, events, { kind: "enemy", text: "敌一部原地整队", hex: pos, visible: SeenBy(state, pos) });
    return;
  }
  // 2) 在途反地道作业（已电报，下一敌阶段结算）
  if (column.opInProgress) {
    const entrance = state.tunnels.entrances[column.opInProgress.at];
    if (entrance && !entrance.sealed) { column.plannedPath = []; return; }
    column.opInProgress = null;   // 目标口已不在：作业作废
    state.enemy.pendingOps = state.enemy.pendingOps.filter((op) => op.columnId !== column.id);
  }
  // 3) 机动队响应置信 2 目击
  if (column.role === "mobile" && MobileRespond(state, events, column)) { TickCaution(state, column); return; }
  // 3.5) 邻接可见我方单位 → 接火（不吞任务；两班以下的小队才会被缠住停止机动）
  const fired = ColumnAttackAdjacent(state, events, column);
  if (!ColumnUnits(state, column).length) return;
  const engaged = fired && ColumnUnits(state, column).length <= 2;
  // 3.8) 工兵队专程来对付地道口：主动奔向暴露最高的那个口（走到了就在同一回合下电报，不空耗一回合）
  if (column.role === "sapper" && pos && !engaged) {
    const seek = SapperSeekTarget(state, pos, CFG.sapperSeekRange);
    if (seek) {
      MoveColumn(state, events, column, seek);
      PlanPath(state, column, seek);
      // 走到口上就**踩住不走**：踩着的那一格每回合 +2 豆，够门槛了就下电报动手。
      // 还没摸到就这一回合只管赶路——不能像原来那样再往下走一遍脚本路线，把自己带离那个口。
      const arrived = HexDistanceKeys(ColumnPos(state, column) || pos, seek) <= 1;
      if (!arrived) { TickCaution(state, column); return; }
    }
  }
  // 4) 已知/已被盯上的入口在 1 格内 → 反地道四选一（提前 1 回合电报）
  const here = ColumnPos(state, column) || pos;
  const knownKey = here ? TargetableEntranceNear(state, here, 1) : null;
  if (knownKey && AnnounceOp(state, events, column, knownKey)) { column.plannedPath = []; TickCaution(state, column); return; }
  // 5) 在目标村：征粮 + 按嫌疑分搜索
  const village = column.targetVillage ? state.map.villages[column.targetVillage] : null;
  const nearTargetVillage = village && pos
    && village.hexKeys.some((key) => HexDistanceKeys(pos, key) <= 1);
  if (nearTargetVillage) {
    const seized = DoSeize(state, events, column);
    const candidates = SearchCandidates(state, column);
    const searchTarget = PickSearchTarget(state, column, candidates);
    if (searchTarget && searchTarget !== pos && !engaged) {
      MoveColumn(state, events, column, searchTarget);
      if (ColumnPos(state, column) === searchTarget) DoSearch(state, events, column);
      PlanPath(state, column, searchTarget);
      TickCaution(state, column);
      return;
    }
    if (searchTarget === pos) { DoSearch(state, events, column); column.plannedPath = []; TickCaution(state, column); return; }
    if (seized || engaged) { column.plannedPath = []; TickCaution(state, column); return; }
    // 村内无事可做 → 推进路点或警戒
  }
  if (engaged) { column.plannedPath = []; TickCaution(state, column); return; }
  // 6) 沿脚本路线推进
  const objective = NextObjective(state, column);
  if (objective === "exit") { column.withdrawing = true; WithdrawMove(state, events, column); return; }
  if (objective) {
    MoveColumn(state, events, column, objective);
    const now = ColumnPos(state, column);
    while (column.routeIndex < column.route.length && column.route[column.routeIndex] === now) column.routeIndex += 1;
    PlanPath(state, column, objective);
    TickCaution(state, column);
    return;
  }
  // 7) 就地警戒
  column.plannedPath = [];
  TickCaution(state, column);
}

function TickCaution(state, column) {
  if (column.incident) { column.cautionTurns = 0; return; }
  column.cautionTurns += 1;
  if (column.cautionTurns >= CFG.cautionCalmTurns && column.caution > 0) {
    column.caution -= 1;
    column.cautionTurns = 0;
  }
}

// ---------------------------------------------------------------------------
// 敌军阶段总入口
// ---------------------------------------------------------------------------

export function RunEnemyPhase(state, events) {
  if (state.wave.status === "quiet" || state.wave.status === "done") {
    RecordExposedSightings(state);
    return;
  }
  SpawnDueWaves(state, events);
  ResolveDueOps(state, events);
  ScriptedBreach(state, events);          // 关卡硬脚本的那一下（第一幕的招牌失败）
  const columns = state.enemy.columns.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const column of columns) ColumnAct(state, events, column);
  LevyOccupiedHexes(state, events);       // 敌军阶段收尾：踩住的村格上还站着谁，就拉走谁
  RecordExposedSightings(state);
}
