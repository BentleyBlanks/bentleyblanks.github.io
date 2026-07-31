// 《地下长城 · 冀中1942》 —— 四个测试 bot（数值平衡域）：
//   Random 乱打：均匀随机合法动作（模糊测试用）。
//   Turtle 缩头：全员尽快下地道，永不出击、永不藏粮——用来验证「纯缩头必输」。
//   Rambo 莽撞：不挖不藏，游击班直冲攻击——用来验证「纯莽夫必败」。
//   Skilled 会玩：平静期备战（藏粮/转移/挖网/组织/掩土），扫荡期周旋（伏击/打了就钻/守口/憋闷管理）。
// bot 是「外部玩家」：其决策随机性走自带 CreateRng（与引擎 rngState 无关），纯条件直查、全确定。
// 另附 RunBotGame 统一跑局器（CLI / 冒烟 / Balance 共用）。

import { CreateRng, HashString, HexDistanceKeys, HexNeighborKeys } from "./Script_Hex.mjs";
import { CFG, unitDefinitions } from "./Data_Rules.mjs";
import {
  CreateGame, SortedKeys, CompareIds, AllyUnits, EnemyUnits, UnitDef, TerrainOf,
  EntranceThreshold, UnitsOn, ReachableFacilityCells,
} from "./Script_State.mjs";
import { GetLevel } from "./Data_Levels.mjs";

function LevelOf(state) {
  return GetLevel(state.meta.level);
}
import { LegalActions, PerformAction } from "./Script_Actions.mjs";
import { EndTurn } from "./Script_Turn.mjs";

export const botNames = ["Random", "Turtle", "Rambo", "Skilled"];

// ---------------------------------------------------------------------------
// 公用小件
// ---------------------------------------------------------------------------

function IdleUnits(state) {
  return AllyUnits(state).filter((unit) => !unit.acted);
}

function UnitActions(state, unit) {
  return LegalActions(state, unit.id);
}

function FindAction(actions, type, extra) {
  return actions.find((action) => action.type === type && (!extra || extra(action))) || null;
}

/** 朝目标格移动：取使终点距目标最近（并列取路径短、再键序）的 Move。 */
function MoveToward(state, unit, actions, targetKey) {
  let best = null;
  let bestScore = HexDistanceKeys(unit.pos, targetKey) * 1000;
  for (const action of actions) {
    if (action.type !== "Move") continue;
    const dest = action.path[action.path.length - 1];
    const score = HexDistanceKeys(dest, targetKey) * 1000 + action.path.length * 10
      + (dest < unit.pos ? 0 : 1);
    if (score < bestScore) { bestScore = score; best = action; }
  }
  return best;
}

function NearestEnemyPos(state, fromKey, onlyRevealed) {
  let best = null;
  let bestDist = Infinity;
  for (const foe of EnemyUnits(state)) {
    if (onlyRevealed && !foe.revealed) continue;
    const dist = HexDistanceKeys(fromKey, foe.pos);
    if (dist < bestDist || (dist === bestDist && best && foe.pos < best)) { bestDist = dist; best = foe.pos; }
  }
  return best ? { pos: best, dist: bestDist } : null;
}

function NearestEntranceKey(state, fromKey, needRoom) {
  let best = null;
  let bestDist = Infinity;
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const entrance = state.tunnels.entrances[key];
    if (entrance.sealed) continue;
    if (needRoom) {
      const cell = state.tunnels.cells[key];
      if (!cell || UnitsOn(state, key, "under").length >= CFG.cellUnitCap) continue;
    }
    const dist = HexDistanceKeys(fromKey, key);
    if (dist < bestDist || (dist === bestDist && best && key < best)) { bestDist = dist; best = key; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Random 乱打
// ---------------------------------------------------------------------------

function RandomAct(state, rng) {
  const actions = LegalActions(state);
  if (!actions.length) return { type: "EndTurn" };
  return actions[Math.floor(rng() * actions.length) % actions.length];
}

// ---------------------------------------------------------------------------
// Turtle 缩头
// ---------------------------------------------------------------------------

function TurtleAct(state) {
  for (const unit of IdleUnits(state)) {
    const actions = UnitActions(state, unit);
    if (unit.layer === "under") return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
    const down = FindAction(actions, "UseEntrance", (action) => !action.dive);
    if (down && state.tunnels.entrances[unit.pos]) return down;
    const entranceKey = NearestEntranceKey(state, unit.pos, true);
    if (entranceKey && entranceKey !== unit.pos) {
      const move = MoveToward(state, unit, actions, entranceKey);
      if (move) return move;
    }
    const hide = FindAction(actions, "Hide");
    if (hide) return hide;
    return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
  }
  return { type: "EndTurn" };
}

// ---------------------------------------------------------------------------
// Rambo 莽撞
// ---------------------------------------------------------------------------

function RamboAct(state) {
  for (const unit of IdleUnits(state)) {
    const actions = UnitActions(state, unit);
    const attack = FindAction(actions, "Attack", (action) => !action.fightpost);
    if (attack) return attack;
    const near = NearestEnemyPos(state, unit.pos, false);
    if (near && near.dist > 1) {
      const move = MoveToward(state, unit, actions, near.pos);
      if (move) return move;
    }
    return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
  }
  return { type: "EndTurn" };
}

// ---------------------------------------------------------------------------
// Skilled 会玩
// ---------------------------------------------------------------------------

function HasFacility(state, facility) {
  return SortedKeys(state.tunnels.cells).some((key) => state.tunnels.cells[key].facility === facility);
}

function ActiveEntranceKeys(state) {
  return SortedKeys(state.tunnels.entrances).filter((key) => !state.tunnels.entrances[key].sealed);
}

/** 备战网待办：返回下一批工地诉求 [{ kind, workPos, action }]（按优先序）。 */
function DigWishes(state) {
  const wishes = [];
  const cells = SortedKeys(state.tunnels.cells);
  const emptyCells = cells.filter((key) => state.tunnels.cells[key].facility === null);
  let emptyCursor = 0;
  const TakeEmpty = () => (emptyCursor < emptyCells.length ? emptyCells[emptyCursor++] : null);
  const SegmentWish = (preferKinds) => {
    for (const from of cells) {
      const neighbors = HexNeighborKeys(from)
        .filter((nb) => {
          const hex = state.map.hexes[nb];
          return hex && !state.tunnels.cells[nb] && TerrainOf(state, nb)?.diggable
            && !state.tunnels.edges[[from, nb].sort().join("|")];
        })
        .sort((a, b) => {
          const ta = preferKinds.indexOf(state.map.hexes[a].terrain);
          const tb = preferKinds.indexOf(state.map.hexes[b].terrain);
          return (ta === -1 ? 9 : ta) - (tb === -1 ? 9 : tb) || (a < b ? -1 : 1);
        });
      if (neighbors.length) {
        return { kind: "segment", workPos: from, action: (unit) => ({ type: "Dig", unit: unit.id, target: neighbors[0] }) };
      }
    }
    return null;
  };
  const FacilityWish = (facility) => {
    const cell = TakeEmpty();
    if (cell) return { kind: facility, workPos: cell, action: (unit) => ({ type: "DigFacility", unit: unit.id, cell, facility }) };
    return SegmentWish(["village", "grave", "woods", "field"]);
  };
  if (!HasFacility(state, "storage")) wishes.push(FacilityWish("storage"));
  // 洞容不够装全村余粮 → 再修一个储粮洞（勋记「仓廪」的底账）
  const openGrain = SortedKeys(state.map.villages).reduce((sum, id) => sum + state.map.villages[id].grainOpen, 0);
  const storageRoom = cells.reduce((sum, key) => {
    const cell = state.tunnels.cells[key];
    return sum + (cell.facility === "storage" ? CFG.storageGrainCap - cell.grain : 0);
  }, 0);
  if (HasFacility(state, "storage") && openGrain > storageRoom) wishes.push(FacilityWish("storage"));
  const needShelter = state.meta.level === "L2"
    || SortedKeys(state.wounded.atVillage).some((id) => state.wounded.atVillage[id] > 0);
  if (needShelter && !HasFacility(state, "shelter")) wishes.push(FacilityWish("shelter"));
  if (!HasFacility(state, "vent")) wishes.push(FacilityWish("vent"));
  // 备用口：优先坟地（经典伏击位），其次树林
  if (ActiveEntranceKeys(state).length < 2) {
    let placed = false;
    for (const key of cells) {
      const hex = state.map.hexes[key];
      if (!state.tunnels.entrances[key] && (TerrainOf(state, key)?.concealCap ?? 0) >= 3
          && (hex.terrain === "grave" || hex.terrain === "woods")) {
        wishes.push({ kind: "entrance", workPos: key, action: (unit) => ({ type: "DigEntrance", unit: unit.id, at: key }) });
        placed = true;
        break;
      }
    }
    if (!placed) wishes.push(SegmentWish(["grave", "woods", "village"]));
  }
  if (!HasFacility(state, "fightpost")) wishes.push(FacilityWish("fightpost"));
  return wishes.filter(Boolean);
}

function WishBlocked(state, wish) {
  for (const siteId of SortedKeys(state.tunnels.digs)) {
    const site = state.tunnels.digs[siteId];
    if ((site.workedTurn || 0) >= state.meta.turn && site.at === wish.workPos) return true;
  }
  return false;
}

function SkilledQuiet(state, unit, actions) {
  const digPower = CFG.digPower[unit.type] || 0;
  // 藏粮 → 转移群众/伤员
  const hideGrain = FindAction(actions, "HideGrain");
  if (hideGrain) return hideGrain;
  const moveWounded = FindAction(actions, "MoveWounded");
  if (moveWounded) return moveWounded;
  const moveCivs = FindAction(actions, "MoveCivs");
  if (moveCivs) return moveCivs;
  // 挖网
  if (digPower > 0) {
    const wishes = DigWishes(state).filter((wish) => !WishBlocked(state, wish));
    if (wishes.length) {
      const wish = wishes[0];
      if (unit.layer === "under") {
        if (unit.pos === wish.workPos) {
          const want = wish.action(unit);
          if (FindAction(actions, want.type, (a) => JSON.stringify(a).includes(want.target || want.cell || want.at || ""))) return want;
          const legal = FindAction(actions, want.type);
          if (legal) return legal;
        }
        const move = MoveToward(state, unit, actions, wish.workPos);
        if (move) return move;
      } else {
        const down = FindAction(actions, "UseEntrance", (action) => !action.dive);
        if (down && state.tunnels.entrances[unit.pos] && !state.tunnels.entrances[unit.pos].sealed) return down;
        const entranceKey = NearestEntranceKey(state, unit.pos, true);
        if (entranceKey && entranceKey !== unit.pos) {
          const move = MoveToward(state, unit, actions, entranceKey);
          if (move) return move;
        }
      }
    }
  }
  // 掩土（暴露豆逼近敌盯上的阈值就得压一压）→ 组织 → 隐蔽待命
  const cover = CoverIfExposed(state, unit, actions);
  if (cover) return cover;
  const organize = FindAction(actions, "Organize");
  if (organize) return organize;
  const hide = FindAction(actions, "Hide");
  if (hide) return hide;
  return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
}

/** R2：掩土是全局唯一的减法且每人只有 3 次——只在本格开口逼近「敌盯上」阈值时才花。 */
function CoverIfExposed(state, unit, actions) {
  if (unit.layer !== "surface") return null;
  const covering = FindAction(actions, "CoverTraces");
  if (!covering) return null;
  const entrance = state.tunnels.entrances[unit.pos];
  const vent = state.tunnels.vents[unit.pos];
  const hex = state.map.hexes[unit.pos];
  const opening = (entrance && !entrance.known && !entrance.sealed && entrance.expose >= CFG.opTargetExpose - 1)
    || (vent && !vent.known && vent.expose >= CFG.opTargetExpose - 1);
  if (opening || (hex && hex.traces >= 3)) return covering;
  return null;
}

function SkilledSweep(state, unit, actions) {
  const def = UnitDef(unit);
  // 伏击是持续状态（R2）：已经趴好的人就守着，不再每回合重按一次
  if (unit.stance === "ambush") return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
  // 憋闷 ≥2：向出口转移 / 出洞
  if (unit.layer === "under" && unit.breath >= 2) {
    const exits = ActiveEntranceKeys(state).filter((key) => state.tunnels.cells[key]);
    if (exits.length) {
      if (state.tunnels.entrances[unit.pos] && !state.tunnels.entrances[unit.pos].sealed) {
        const enemyOnHex = UnitsOn(state, unit.pos, "surface").some((u) => u.side === "enemy");
        const up = FindAction(actions, "UseEntrance");
        if (up && !enemyOnHex) return up;
      } else {
        const move = MoveToward(state, unit, actions, exits[0]);
        if (move) return move;
      }
    }
  }
  // 敌集结攻入电报 → 派单位入地驻守口
  const breachOp = state.enemy.pendingOps.find((op) => op.kind === "breach");
  if (breachOp) {
    if (unit.layer === "under") {
      if (unit.pos === breachOp.at) return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
      const move = MoveToward(state, unit, actions, breachOp.at);
      if (move && HexDistanceKeys(unit.pos, breachOp.at) <= 3) return move;
    } else if (unit.pos === breachOp.at) {
      const down = FindAction(actions, "UseEntrance", (action) => !action.dive);
      if (down) return down;
    }
  }
  // 打了就钻
  const dive = FindAction(actions, "UseEntrance", (action) => action.dive);
  if (dive) return dive;
  // 弃用换口（自毁）：已被搜出的口立刻塌掉断敌利用；暴露临界（阈值-2）的口也提前放弃
  if (state.tunnels.entrances[unit.pos]) {
    const entrance = state.tunnels.entrances[unit.pos];
    const otherAir = ActiveEntranceKeys(state).length >= 2 || HasFacility(state, "vent");
    if (!entrance.sealed && otherAir
        && (entrance.known || (!entrance.known && entrance.expose >= EntranceThreshold(entrance) - 2 && ActiveEntranceKeys(state).length >= 2))) {
      const collapse = FindAction(actions, "Collapse");
      if (collapse) return collapse;
    }
  }
  // 已知口暴露在自家村里而无人处置 → 地下单位就近赶去塌口
  if (unit.layer === "under") {
    const knownKeys = SortedKeys(state.tunnels.entrances).filter((key) => {
      const entrance = state.tunnels.entrances[key];
      return entrance.known && !entrance.sealed && state.tunnels.cells[key];
    });
    if (knownKeys.length && (ActiveEntranceKeys(state).length >= 2 || HasFacility(state, "vent"))) {
      const move = MoveToward(state, unit, actions, knownKeys[0]);
      if (move) return move;
    }
  }
  const near = NearestEnemyPos(state, unit.pos, false);
  // 破路耗池：扫荡期只在**敌补给线**上断路（每处 -2 池且逼敌减速），在自家村里刨路没有意义
  if (unit.layer === "surface" && (CFG.digPower[unit.type] || 0) > 0
      && state.wave.roadCuts < CFG.pool.roadCutMaxPerWave) {
    const level = LevelOf(state);
    const onSupply = (level.supplyRoad || []).includes(unit.pos);
    const breakHere = onSupply ? FindAction(actions, "BreakRoad") : null;
    if (breakHere && (!near || near.dist >= 2)) return breakHere;
    // 断敌补给线是最稳的耗池手段：值得为它多走两回合（含破桥——桥毁敌须绕行）
    const targets = (level.supplyRoad || []).filter((key) => {
      const hex = state.map.hexes[key];
      if (!hex || hex.roadBroken) return false;
      const foe = NearestEnemyPos(state, key, false);
      return (!foe || foe.dist >= 2) && HexDistanceKeys(unit.pos, key) <= unit.mp * 2;
    }).sort((a, b) => (HexDistanceKeys(unit.pos, a) - HexDistanceKeys(unit.pos, b)) || (a < b ? -1 : 1));
    if (targets.length && (!near || near.dist >= 2)) {
      const move = MoveToward(state, unit, actions, targets[0]);
      if (move) return move;
    }
  }
  // 贴脸处置：补刀残敌 / 缩回未暴露口 / 联络员脱离
  if (unit.layer === "surface" && near && near.dist <= 1) {
    if (def.fieldAttack && state.resources.ammo >= CFG.ammoPerAttack) {
      const finisher = FindAction(actions, "Attack", (action) => {
        const target = state.units[action.target];
        return target && !action.fightpost && target.hp <= 2;
      });
      if (finisher) return finisher;
    }
    const entrance = state.tunnels.entrances[unit.pos];
    if (entrance && !entrance.sealed && !entrance.known) {
      const down = FindAction(actions, "UseEntrance", (action) => !action.dive);
      if (down) return down;
    }
    if (def.atk <= 0) {
      // 联络员：拉开距离再隐蔽
      let bestMove = null;
      let bestDist = near.dist;
      for (const action of actions) {
        if (action.type !== "Move") continue;
        const dest = action.path[action.path.length - 1];
        const dist = HexDistanceKeys(dest, near.pos);
        if (dist > bestDist) { bestDist = dist; bestMove = action; }
      }
      if (bestMove) return bestMove;
    }
  }
  // 掩土：口快被敌盯上了就先压豆（每人 3 次，花在刀刃上）
  const cover = CoverIfExposed(state, unit, actions);
  if (cover && (!near || near.dist >= 2)) return cover;
  if (unit.layer === "surface" && def.atk > 0 && state.resources.ammo >= CFG.ammoPerAttack) {
    // 设伏要趁敌**还没贴上来**：敌已相邻时它先开火，伏击白搭；也不在「老地方」重复设伏。
    // 伏击是持续状态，早趴下不吃亏：只要场上有敌且它还没贴上来，就先把伏点占住
    const ambush = FindAction(actions, "Ambush", (action) => !action.stale && action.site !== "foxhole");
    if (ambush && near && near.dist >= 2) return ambush;
    // 向坟地/树林伏击位机动：站到「敌下一步会走到我旁边」的掩蔽格上（距敌 2 格）
    if (near && near.dist <= 5 && unit.stance !== "ambush") {
      let bestHex = null;
      let bestScore = Infinity;
      for (const key of SortedKeys(state.map.hexes)) {
        const terrain = TerrainOf(state, key);
        if (!terrain?.hide || !terrain.cover) continue;
        const toEnemy = HexDistanceKeys(key, near.pos);
        const toMe = HexDistanceKeys(key, unit.pos);
        if (toEnemy !== 2 || toMe > unit.mp) continue;
        const score = toMe * 10 + ((state.map.hexes[key].alertedUntil || 0) >= state.meta.turn ? 100 : 0);
        if (score < bestScore) { bestScore = score; bestHex = key; }
      }
      if (bestHex && bestHex !== unit.pos) {
        const move = MoveToward(state, unit, actions, bestHex);
        if (move) return move;
      }
    }
  }
  // 枪眼开火
  const fightpostShot = FindAction(actions, "Attack", (action) => action.fightpost);
  if (fightpostShot) return fightpostShot;
  // 扫荡期照旧藏粮（敌不在近旁时）
  if (unit.layer === "surface" && (!near || near.dist > 2)) {
    const hideGrain = FindAction(actions, "HideGrain");
    if (hideGrain) return hideGrain;
    const moveWounded = FindAction(actions, "MoveWounded");
    if (moveWounded) return moveWounded;
    const moveCivs = FindAction(actions, "MoveCivs");
    if (moveCivs) return moveCivs;
  }
  // 无弹民兵 / 联络员：隐蔽或入地保存
  if (unit.layer === "surface") {
    if (near && near.dist <= 2 && state.tunnels.entrances[unit.pos] && !state.tunnels.entrances[unit.pos].known) {
      const down = FindAction(actions, "UseEntrance", (action) => !action.dive);
      if (down) return down;
    }
    const hide = FindAction(actions, "Hide");
    if (hide && unit.stance !== "hidden") return hide;
  }
  return FindAction(actions, "Rest") || { type: "Rest", unit: unit.id };
}

function SkilledAct(state) {
  for (const unit of IdleUnits(state)) {
    const actions = UnitActions(state, unit);
    if (!actions.length) continue;
    const action = state.wave.status === "quiet"
      ? SkilledQuiet(state, unit, actions)
      : SkilledSweep(state, unit, actions);
    if (action) return action;
  }
  return { type: "EndTurn" };
}

// ---------------------------------------------------------------------------
// bot 工厂与统一跑局器
// ---------------------------------------------------------------------------

export function CreateBot(name, seed) {
  if (name === "Random") {
    const rng = CreateRng(((seed >>> 0) ^ HashString(name)) || 1);
    return (state) => RandomAct(state, rng);
  }
  if (name === "Turtle") return TurtleAct;
  if (name === "Rambo") return RamboAct;
  if (name === "Skilled") return SkilledAct;
  throw new Error(`未知 bot：${name}`);
}

/**
 * 统一跑局器：options = { level, seed, bot, untilTurn?, maxSteps?, onStep? }。
 * 返回 { state, actions, steps }；actions 为完整动作序列（可用于确定性重放）。
 */
export function RunBotGame(options) {
  const bot = CreateBot(options.bot, options.seed);
  let state = CreateGame(options.level, options.seed);
  const actions = [];
  const maxSteps = options.maxSteps || 3000;
  let actionsThisTurn = 0;
  let steps = 0;
  while (!state.result && steps < maxSteps) {
    if (options.untilTurn && state.meta.turn >= options.untilTurn) break;
    steps += 1;
    let action = bot(state) || { type: "EndTurn" };
    if (actionsThisTurn >= 90) action = { type: "EndTurn" };
    let outcome = action.type === "EndTurn" ? EndTurn(state) : PerformAction(state, action);
    if (outcome.illegal) {
      const unitId = action.unit;
      const fallback = unitId && state.units[unitId] && !state.units[unitId].acted && action.type !== "Rest"
        ? { type: "Rest", unit: unitId }
        : { type: "EndTurn" };
      action = fallback;
      outcome = fallback.type === "EndTurn" ? EndTurn(state) : PerformAction(state, fallback);
      if (outcome.illegal) break;
    }
    state = outcome.state;
    actions.push(action);
    actionsThisTurn = action.type === "EndTurn" ? 0 : actionsThisTurn + 1;
    if (options.onStep) options.onStep(state, action, outcome.events);
  }
  return { state, actions, steps };
}
