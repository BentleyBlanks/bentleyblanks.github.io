// 《地下长城 · 冀中1942》 —— 回合管线（AGENTS.md §2.1/§三）：
// EndTurn = 玩家阶段收尾 → 敌军阶段（逐纵队）→ 固定结算顺序
// （烟蔓延→憋闷累计→被迫出洞→搜索暴露判定→粮食产耗→情报刷新→池扣减与撤退判定→胜负勋记判定）
// → 新回合开卷（波次状态机 quiet→sweep→withdrawing→done）。
// 胜负评级三勋记制；breakdown 数值分仅供冒烟排序断言，不进 UI。

import { HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, TEXT, GradeForMedals } from "./Data_Rules.mjs";
import { GetLevel } from "./Data_Levels.mjs";
import {
  SortedKeys, CompareIds, PushEvent, AddLedger, CloneState, UnitDef, UnitsOn,
  AllyUnits, EnemyUnits, RemoveUnit, CombatUnitCount, AirZones, ZoneHasAir, ZoneExits,
  ConnectedCells, TunnelNeighbors, GrainTotal, TunnelGrainTotal, PopTotal, WoundedTotal,
  EntranceThreshold, VentThreshold, EnemyNearVillage, StorageCellsUnder,
  IsSurfacePassable,
} from "./Script_State.mjs";
import { ExpireSightings, UpdateEnemyMemory, ExposeEntranceUse, CanAllySeeHex, RecordSighting } from "./Script_Visibility.mjs";
import { RunEnemyPhase } from "./Script_EnemyAi.mjs";
import { AdvanceSite, AddTraces, RevealAdjacentSpies, RecordExposedSightings } from "./Script_Actions.mjs";

// ---------------------------------------------------------------------------
// 玩家阶段收尾：组织 2 级村的免费工地进度（敌近则停）
// ---------------------------------------------------------------------------

function PlayerWrapUp(state, events) {
  for (const villageId of SortedKeys(state.map.villages)) {
    const village = state.map.villages[villageId];
    if (village.organize < 2) continue;
    if (EnemyNearVillage(state, villageId, CFG.organizeStopEnemyRange)) continue;
    for (const siteId of SortedKeys(state.tunnels.digs)) {
      const site = state.tunnels.digs[siteId];
      const near = village.hexKeys.some((key) => HexDistanceKeys(key, site.at) <= CFG.organizeFreeDigRadius);
      if (!near) continue;
      AdvanceSite(state, events, siteId, 1);
      break;   // 每村每回合只帮一个工地
    }
  }
}

// ---------------------------------------------------------------------------
// 结算八步（顺序固定）
// ---------------------------------------------------------------------------

/** ① 烟蔓延：沿开放边扩 1 格/回合 ×3，再滞留 2 回合后消散；关闭的隔断门阻挡。 */
function StepSmoke(state, events) {
  const keep = [];
  for (const op of state.tunnels.smokeOps) {
    if (op.spreadLeft > 0) {
      const next = new Set(op.cells);
      for (const key of op.cells) {
        for (const nb of TunnelNeighbors(state, key, true)) next.add(nb);
      }
      op.cells = [...next].sort();
      op.spreadLeft -= 1;
      PushEvent(state, events, { kind: "smoke", text: "烟沿地道蔓延", hex: op.origin, layer: "under", visible: true });
    } else {
      op.lingerLeft -= 1;
    }
    if (op.lingerLeft > 0 || op.spreadLeft > 0) keep.push(op);
    else PushEvent(state, events, { kind: "smoke", text: "地道里的烟散了", hex: op.origin, layer: "under", visible: true });
  }
  state.tunnels.smokeOps = keep;
  // 统一重刷各格烟浓度与通风口熏染
  for (const key of SortedKeys(state.tunnels.cells)) state.tunnels.cells[key].smoke = 0;
  for (const op of state.tunnels.smokeOps) {
    const remain = op.spreadLeft + op.lingerLeft;
    for (const key of op.cells) {
      const cell = state.tunnels.cells[key];
      if (cell) cell.smoke = Math.max(cell.smoke, remain);
    }
  }
  for (const key of SortedKeys(state.tunnels.vents)) {
    state.tunnels.vents[key].smoked = (state.tunnels.cells[key]?.smoke || 0) > 0;
  }
}

/** ② 憋闷累计：无风分区内单位/群众批 +1（烟中 +2）；有风清零。 */
function StepBreath(state, events) {
  const zones = AirZones(state);
  for (const zone of zones) {
    const hasAir = ZoneHasAir(state, zone);
    for (const key of [...zone].sort()) {
      const cell = state.tunnels.cells[key];
      const gain = cell.smoke > 0 ? CFG.breathGainSmoke : CFG.breathGainNoAir;
      for (const unit of UnitsOn(state, key, "under")) {
        unit.breath = hasAir && cell.smoke === 0 ? 0 : unit.breath + gain;
        if (!hasAir || cell.smoke > 0) {
          if (unit.breath === CFG.breathThreshold) {
            PushEvent(state, events, { kind: "breath", text: `${UnitDef(unit).name}在地道中憋闷难支`, hex: key, layer: "under", visible: true });
          }
        }
      }
      if (cell.civs > 0 || (state.wounded.inCells[key] || 0) > 0) {
        cell.civBreath = hasAir && cell.smoke === 0 ? 0 : (cell.civBreath || 0) + gain;
      } else {
        cell.civBreath = 0;
      }
    }
  }
}

/** ③ 被迫出洞（R2 P0-3）：憋闷 ≥3 → **一定上地面**：先走分区里最近的未封口，没有口就在本格
 *  正上方刨土钻出（留痕迹），连正上方都不可通行才退化为掉血。地面有敌 → 群众当场被捕入账本。
 *  这是地上-地下唯一的强耦合点：把人闷死在洞里不再是可行打法。 */
function ForcedExit(state, zone, fromKey) {
  const exits = ZoneExits(state, zone, fromKey);
  if (exits.length) return { key: exits[0], dug: false };
  if (IsSurfacePassable(state, fromKey)) return { key: fromKey, dug: true };
  return null;
}

function StepForcedOut(state, events) {
  const zones = AirZones(state);
  const zoneOf = {};
  zones.forEach((zone, index) => { for (const key of zone) zoneOf[key] = index; });
  // 单位
  for (const unit of AllyUnits(state)) {
    if (unit.layer !== "under" || unit.breath < CFG.breathThreshold) continue;
    const zone = zones[zoneOf[unit.pos]] || new Set([unit.pos]);
    const out = ForcedExit(state, zone, unit.pos);
    if (out) {
      unit.pos = out.key;
      unit.layer = "surface";
      unit.breath = 0;
      unit.stance = "normal";
      unit.revealed = true;
      if (out.dug) AddTraces(state, out.key, CFG.tracesPerDig);
      else ExposeEntranceUse(state, out.key, null);
      PushEvent(state, events, { kind: "forcedOut", text: `${UnitDef(unit).name}${out.dug ? TEXT.forced.dugOut : TEXT.forced.entrance}`,
        hex: out.key, visible: true });
    } else {
      unit.hp -= CFG.suffocateHpLoss;
      PushEvent(state, events, { kind: "breath", text: `${UnitDef(unit).name}${TEXT.forced.trapped}（-1）`, hex: unit.pos, layer: "under", visible: true });
      if (unit.hp <= 0) {
        state.score.alliesLost += 1;
        PushEvent(state, events, { kind: "loss", text: `${UnitDef(unit).name}窒息牺牲`, hex: unit.pos, layer: "under", visible: true });
        RemoveUnit(state, unit.id);
      }
    }
  }
  // 群众批与伤员批
  for (const key of SortedKeys(state.tunnels.cells)) {
    const cell = state.tunnels.cells[key];
    const wounded = state.wounded.inCells[key] || 0;
    if ((cell.civs <= 0 && wounded <= 0) || (cell.civBreath || 0) < CFG.breathThreshold) continue;
    const zone = zones[zoneOf[key]] || new Set([key]);
    const out = ForcedExit(state, zone, key);
    if (out) {
      const exitKey = out.key;
      const enemyThere = UnitsOn(state, exitKey, "surface").some((unit) => unit.side === "enemy");
      const civs = cell.civs;
      cell.civs = 0;
      cell.civBreath = 0;
      if (wounded > 0) delete state.wounded.inCells[key];
      if (out.dug) AddTraces(state, exitKey, CFG.tracesPerDig);
      else ExposeEntranceUse(state, exitKey, null);
      if (enemyThere) {
        if (civs > 0) AddLedger(state, "civCaptured", civs);
        if (wounded > 0) AddLedger(state, "civCaptured", wounded);
        PushEvent(state, events, { kind: "ledger", text: `憋出地面的群众 ${civs + wounded} 批当场被抓（入代价簿）`, hex: exitKey, visible: true });
      } else {
        const village = NearestVillage(state, exitKey);
        if (village) {
          village.pop += civs;
          if (wounded > 0) {
            const villageId = VillageIdOf(state, village);
            state.wounded.atVillage[villageId] = (state.wounded.atVillage[villageId] || 0) + wounded;
          }
        }
        PushEvent(state, events, { kind: "forcedOut", text: `群众 ${civs + wounded} 批被憋出地面，散回村中`, hex: exitKey, visible: true });
      }
    } else {
      if (cell.civs > 0) {
        cell.civs -= 1;
        AddLedger(state, "civDead", 1);
        PushEvent(state, events, { kind: "ledger", text: "无风地道中群众罹难 1 批（入代价簿）", hex: key, layer: "under", visible: true });
      } else if (wounded > 0) {
        state.wounded.inCells[key] = wounded - 1;
        if (state.wounded.inCells[key] <= 0) delete state.wounded.inCells[key];
        AddLedger(state, "civDead", 1);
        PushEvent(state, events, { kind: "ledger", text: "无风地道中伤员罹难 1 批（入代价簿）", hex: key, layer: "under", visible: true });
      }
    }
  }
  RecordExposedSightings(state);
}

function NearestVillage(state, key) {
  let best = null;
  let bestDist = Infinity;
  for (const villageId of SortedKeys(state.map.villages)) {
    const village = state.map.villages[villageId];
    for (const hexKey of village.hexKeys) {
      const dist = HexDistanceKeys(hexKey, key);
      if (dist < bestDist) { bestDist = dist; best = village; }
    }
  }
  return best;
}

function VillageIdOf(state, village) {
  for (const villageId of SortedKeys(state.map.villages)) {
    if (state.map.villages[villageId] === village) return villageId;
  }
  return null;
}

/** ④ 搜索暴露判定：暴露豆达到阈值 → 入口/通风口转为已知（永久）。 */
function StepExposure(state, events) {
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const entrance = state.tunnels.entrances[key];
    if (!entrance.known && !entrance.sealed && entrance.expose >= EntranceThreshold(entrance)) {
      entrance.known = true;
      PushEvent(state, events, { kind: "expose", text: "入口被敌搜出（已知，永久）", hex: key, visible: true });
    }
  }
  for (const key of SortedKeys(state.tunnels.vents)) {
    const vent = state.tunnels.vents[key];
    if (!vent.known && vent.expose >= VentThreshold()) {
      vent.known = true;
      PushEvent(state, events, { kind: "expose", text: "通风口被敌搜出", hex: key, visible: true });
    }
  }
}

/** ⑤ 粮食产耗：平静期每村 +1（组织 ≥1 且脚下通着储粮洞则自动藏 1）；扫荡期敌到村边则每回合
 *  搜走 sweepGrainLoss 担进代价簿（R2 P0-6a）。当回合已被纵队征过粮的村不重复扣。 */
function StepGrain(state, events) {
  if (state.wave.status === "quiet") {
    for (const villageId of SortedKeys(state.map.villages)) {
      const village = state.map.villages[villageId];
      village.grainOpen += CFG.quietGrainPerVillage;
      if (village.organize < 1 || village.grainOpen <= 0) continue;
      for (const hexKey of village.hexKeys) {
        const cells = StorageCellsUnder(state, hexKey);
        if (!cells.length) continue;
        state.tunnels.cells[cells[0]].grain += CFG.autoHidePerTurn;
        village.grainOpen -= CFG.autoHidePerTurn;
        break;
      }
    }
    return;
  }
  if (state.wave.status === "done" || !EnemyUnits(state).length) return;
  for (const villageId of SortedKeys(state.map.villages)) {
    const village = state.map.villages[villageId];
    if (village.grainOpen <= 0 || village.seizedTurn === state.meta.turn) continue;
    if (!EnemyNearVillage(state, villageId, CFG.sweepGrainRange)) continue;   // 敌摸到村边才搜得着
    const take = Math.min(GetLevel(state.meta.level).sweepGrainLoss ?? CFG.sweepOpenGrainLoss, village.grainOpen);
    village.grainOpen -= take;
    AddLedger(state, "grainSeized", take);
    PushEvent(state, events, { kind: "ledger", text: `${TEXT.sweepGrain}：${village.name} ${take} 担（入代价簿）`,
      hex: village.hexKeys[0], visible: true });
  }
}

/** ⑥ 情报刷新：目击过期、特务相邻现形、敌方记忆更新。 */
function StepIntel(state, events) {
  ExpireSightings(state);
  RevealAdjacentSpies(state, events);
  UpdateEnemyMemory(state);
}

/** ⑦ 池扣减与撤退（R2 P0-6b）：基础衰减（两关都已归零）+ **扑空衰减**（摸到村边却一无所获的
 *  纵队每支 -1，每回合至多 -2）+ 我方所致（封顶 5）。扑空衰减不是白送，是藏干净换来的。 */
function EmptyHandedColumns(state) {
  let count = 0;
  for (const column of state.enemy.columns) {
    if (column.done || column.withdrawing || column.gained) continue;
    const units = column.unitIds.map((id) => state.units[id]).filter((unit) => unit && unit.hp > 0);
    if (!units.length) continue;
    const atVillageEdge = SortedKeys(state.map.villages).some((villageId) => state.map.villages[villageId].hexKeys
      .some((key) => HexDistanceKeys(units[0].pos, key) <= CFG.pool.emptyHandedRange));
    if (atVillageEdge) count += 1;
  }
  return count;
}

function StepPool(state, events) {
  if (state.wave.status !== "sweep" && state.wave.status !== "withdrawing") {
    state.wave.playerDrainThisTurn = 0;
    return;
  }
  if (state.wave.status === "sweep") {
    state.wave.pool -= state.wave.decay;
    const empty = Math.min(EmptyHandedColumns(state), CFG.pool.emptyHandedCapPerTurn) * CFG.pool.emptyHanded;
    if (empty > 0) {
      state.wave.pool -= empty;
      PushEvent(state, events, { kind: "pool", text: `敌翻遍村子一无所获，锐气又挫（行动力池 -${empty}）`, visible: true });
    }
  }
  const drain = Math.min(state.wave.playerDrainThisTurn, CFG.pool.playerDrainCapPerTurn);
  if (drain > 0) state.wave.pool -= drain;
  state.wave.playerDrainThisTurn = 0;
}

/** ⑧ 胜负勋记判定（早败 / 波次收束 / 到时终局）。 */
function StepOutcome(state, events) {
  const level = GetLevel(state.meta.level);
  // 早败：战斗单位全灭
  if (CombatUnitCount(state) === 0) {
    Evaluate(state, events, { defeatReason: "战斗单位全部损失" });
    return;
  }
  if (state.meta.level === "L2") {
    const hq = Object.values(state.map.villages).find((village) => village.hasHq);
    const hqHexes = hq ? hq.hexKeys : [];
    // 「驻占」= T13 判定后转入驻剿的纵队据守区队部（扫荡期路过搜粮不算占）
    const garrisonColumns = state.enemy.columns.filter((column) => column.garrison);
    const occupied = garrisonColumns.some((column) => column.unitIds.some((id) => {
      const unit = state.units[id];
      return unit && unit.hp > 0 && hqHexes.includes(unit.pos);
    }));
    state.score.hqOccupiedTurns = occupied ? state.score.hqOccupiedTurns + 1 : 0;
    if (state.score.hqOccupiedTurns >= level.defeat.hqOccupiedTurns) {
      Evaluate(state, events, { defeatReason: "区队部被敌驻占" });
      return;
    }
    const popStart = Object.values(state.map.villages).reduce((sum, village) => sum + village.popStart, 0);
    if (PopTotal(state) < popStart * level.defeat.popRatioBelow) {
      Evaluate(state, events, { defeatReason: "人口损失过半" });
      return;
    }
  }
  // 波次收束：所有纵队离场且无待入场波次
  if ((state.wave.status === "sweep" || state.wave.status === "withdrawing") && state.wave.doneTurn === null) {
    const columnsGone = state.enemy.columns.every((column) => column.done
      || !column.unitIds.some((id) => state.units[id] && state.units[id].hp > 0));
    const wavesLeft = state.wave.schedule.some((wave) => !wave.spawned && wave.kind !== "decision");
    const revengePending = !!(state.wave.revenge && state.wave.revenge.pending);
    if (columnsGone && !wavesLeft && !revengePending && EnemyUnits(state).length === 0) {
      state.wave.status = "done";
      state.wave.doneTurn = state.meta.turn;
      state.score.withdrewEarlyTurns = Math.max(0, state.wave.hardEndTurn - state.meta.turn);
      PushEvent(state, events, { kind: "banner", text: TEXT.waveStatus.done, visible: true });
      // 敌离场：群众自动返村
      for (const key of SortedKeys(state.tunnels.cells)) {
        const cell = state.tunnels.cells[key];
        if (cell.civs > 0) {
          const village = NearestVillage(state, key);
          if (village) { village.pop += cell.civs; cell.civs = 0; cell.civBreath = 0; }
        }
      }
      Evaluate(state, events, {});
      return;
    }
  }
  if (state.meta.turn >= level.maxTurns) Evaluate(state, events, {});
}

// ---------------------------------------------------------------------------
// 胜负、勋记与数值分
// ---------------------------------------------------------------------------

export function KillsScore(totalKills) {
  return Math.min(8, Math.floor(3 * Math.log2(1 + Math.max(0, totalKills))));
}

function AliveVillages(state) {
  return Object.values(state.map.villages).filter((village) => village.burnedHexes < village.hexKeys.length).length;
}

/** 主干贯通（L2 勋记③）：枣林庄任一地道格与石槽村任一地道格连通（忽略门）。 */
function TrunkIntact(state) {
  const v1 = state.map.villages.v1;
  const v3 = state.map.villages.v3;
  if (!v1 || !v3) return false;
  const starts = v1.hexKeys.filter((key) => state.tunnels.cells[key]);
  const goals = new Set(v3.hexKeys.filter((key) => state.tunnels.cells[key]));
  if (!starts.length || !goals.size) return false;
  for (const start of starts) {
    const reach = ConnectedCells(state, start, false);
    for (const goal of goals) if (reach.has(goal)) return true;
  }
  return false;
}

function LedgerEmpty(state) {
  return Object.values(state.ledger).every((value) => value === 0);
}

export function ComputeBreakdown(state, won) {
  const kills = state.score.kills;
  const totalKills = (kills.inf || 0) + (kills.puppet || 0) + (kills.spy || 0) + (kills.sapper || 0);
  const entrancesIntact = SortedKeys(state.tunnels.entrances)
    .filter((key) => !state.tunnels.entrances[key].sealed).length;
  const breakdown = {
    survive: 8 * CombatUnitCount(state) + 2 * PopTotal(state) + 2 * WoundedTotal(state),
    grain: 2 * GrainTotal(state),
    network: Object.keys(state.tunnels.cells).length + 2 * entrancesIntact + (state.meta.level === "L2" && TrunkIntact(state) ? 4 : 0),
    harass: 3 * (state.score.withdrewEarlyTurns || 0) + (state.wave.expelled ? 4 : 0),
    kills: KillsScore(totalKills),
  };
  breakdown.total = breakdown.survive + breakdown.grain + breakdown.network
    + breakdown.harass + breakdown.kills + (won ? 40 : 0);
  return breakdown;
}

/** 判据求值器（胜负线与勋记共用；条件写在 Data_Levels）。每条返回 { ok, text } 进终局归因。 */
function CheckCondition(state, key, want) {
  const table = {
    grainTotal: () => ({ ok: GrainTotal(state) >= want, text: `存粮 ${GrainTotal(state)} 担（需 ≥${want}）` }),
    tunnelGrain: () => ({ ok: TunnelGrainTotal(state) >= want, text: `洞存粮 ${TunnelGrainTotal(state)} 担（需 ≥${want}）` }),
    tunnelGrainAtLeast: () => ({ ok: TunnelGrainTotal(state) >= want, text: `洞存粮 ${TunnelGrainTotal(state)} 担（需 ≥${want}）` }),
    grainAtLeast: () => ({ ok: GrainTotal(state) >= want, text: `存粮 ${GrainTotal(state)} 担（需 ≥${want}）` }),
    woundedAtLeast: () => ({ ok: WoundedTotal(state) >= want, text: `伤员保全 ${WoundedTotal(state)} 批（需 ≥${want}）` }),
    wounded: () => ({ ok: WoundedTotal(state) >= want, text: `伤员保全 ${WoundedTotal(state)} 批（需 ≥${want}）` }),
    villagesAtLeast: () => ({ ok: AliveVillages(state) >= want, text: `存活村 ${AliveVillages(state)} 处（需 ≥${want}）` }),
    combatUnitsAtLeast: () => ({ ok: CombatUnitCount(state) >= want, text: `战斗单位 ${CombatUnitCount(state)} 支（需 ≥${want}）` }),
    ledgerEmpty: () => ({ ok: LedgerEmpty(state) === want, text: LedgerEmpty(state) ? "代价簿全空" : "代价簿有记录" }),
    alliesLostAtMost: () => ({ ok: (state.score.alliesLost || 0) <= want, text: `阵亡 ${state.score.alliesLost || 0} 支（需 ≤${want}）` }),
    grainSeizedAtMost: () => ({ ok: state.ledger.grainSeized <= want, text: `粮秣被夺 ${state.ledger.grainSeized} 担（需 ≤${want}）` }),
    civLedgerAtMost: () => ({ ok: state.ledger.civCaptured + state.ledger.civDead <= want,
      text: `群众被抓/罹难 ${state.ledger.civCaptured + state.ledger.civDead} 批（需 ≤${want}）` }),
    housesBurnedAtMost: () => ({ ok: state.ledger.housesBurned <= want, text: `房屋被焚 ${state.ledger.housesBurned} 处（需 ≤${want}）` }),
    expelled: () => ({ ok: !!state.wave.expelled === want, text: state.wave.expelled ? "敌被逼退" : "敌按期收队，未被逼退" }),
    trunkIntact: () => ({ ok: TrunkIntact(state) === want, text: TrunkIntact(state) ? "主干贯通未毁" : "主干未贯通或有段被毁" }),
  };
  const check = table[key];
  return check ? check() : { ok: true, text: "" };
}

function CheckAll(state, spec) {
  const rows = Object.keys(spec || {}).sort().map((key) => CheckCondition(state, key, spec[key]));
  return { ok: rows.every((row) => row.ok), rows };
}

function CheckAny(state, spec) {
  const rows = Object.keys(spec || {}).sort().map((key) => CheckCondition(state, key, spec[key]));
  return { ok: rows.some((row) => row.ok), rows };
}

function Evaluate(state, events, opts) {
  const level = GetLevel(state.meta.level);
  let won = false;
  const reasons = [];
  if (opts.defeatReason) {
    reasons.push(opts.defeatReason);
  } else {
    const verdict = CheckAll(state, level.victory);
    won = verdict.ok;
    const keys = Object.keys(level.victory || {}).sort();
    verdict.rows.forEach((row, index) => {
      const hint = !row.ok && level.defeatHints ? level.defeatHints[keys[index]] : null;
      reasons.push(`${row.ok ? "✓" : "✗"} ${row.text}${hint ? `——${hint}` : ""}`);
    });
  }
  let medals = (level.medals || []).map((medal) => (medal.anyOf
    ? CheckAny(state, medal.anyOf).ok && CheckAll(state, medal.need || {}).ok
    : CheckAll(state, medal.need || {}).ok));
  if (!won) medals = medals.map(() => false);
  const medalCount = medals.filter(Boolean).length;
  state.medals = medals;
  state.result = {
    won,
    grade: GradeForMedals(won, medalCount),
    medals,
    breakdown: ComputeBreakdown(state, won),
    reasons,
    endTurn: state.meta.turn,
  };
  PushEvent(state, events, { kind: "result", text: won ? `扫荡对抗结束，评定：${state.result.grade}` : `此役失利，评定：${state.result.grade}`, visible: true });
}

// ---------------------------------------------------------------------------
// 新回合开卷：波次状态机与单位重置
// ---------------------------------------------------------------------------

function StartNewTurn(state, events) {
  state.meta.turn += 1;
  const wave = state.wave;
  if (wave.status === "quiet" && state.meta.turn >= wave.sweepStartTurn) {
    wave.status = "sweep";
    wave.sweepTurn = 0;
    // 挖掘痕迹结转：每个入口暴露豆初值 = min(本格及相邻格痕迹合计, 阈值-1)
    for (const key of SortedKeys(state.tunnels.entrances)) {
      const entrance = state.tunnels.entrances[key];
      if (entrance.sealed) continue;
      let traces = state.map.hexes[key]?.traces || 0;
      for (const nb of HexNeighborKeys(key)) traces += state.map.hexes[nb]?.traces || 0;
      entrance.expose = Math.max(entrance.expose, Math.min(traces, EntranceThreshold(entrance) - 1));
    }
    PushEvent(state, events, { kind: "banner", text: TEXT.banner.sweepStart, visible: true });
  }
  if (wave.status === "sweep") {
    wave.sweepTurn += 1;
    if (wave.pool <= 0 && !wave.withdrawAnnounced) {
      wave.withdrawAnnounced = true;
      wave.expelled = true;
      wave.status = "withdrawing";
      wave.withdrawTurn = state.meta.turn;
      for (const column of state.enemy.columns) column.withdrawing = true;
      PushEvent(state, events, { kind: "banner", text: TEXT.banner.withdraw, visible: true });
    }
  }
  for (const unit of Object.keys(state.units).sort(CompareIds).map((id) => state.units[id])) {
    unit.mp = UnitDef(unit).mp;
    unit.acted = false;
    unit.attacked = false;
    unit.freeMove = false;
    // 「暴露」只持续到我方下一次行动前；伏击是持续状态，不在这里清（只有移动/换动作/开火才解除）。
    if (unit.stance === "exposed") unit.stance = "normal";
    if (unit.side === "ally") unit.revealed = false;
  }
  for (const villageId of SortedKeys(state.map.villages)) state.map.villages[villageId].seizedTurn = 0;
  state.meta.phase = "player";
}

// ---------------------------------------------------------------------------
// EndTurn 总入口
// ---------------------------------------------------------------------------

export function EndTurn(inputState) {
  if (inputState.meta.phase !== "player" || inputState.result) {
    return { state: inputState, events: [], illegal: "当前不可结束回合" };
  }
  const state = CloneState(inputState);
  const events = [];
  PlayerWrapUp(state, events);
  state.meta.phase = "enemy";
  RunEnemyPhase(state, events);
  state.meta.phase = "resolve";
  StepSmoke(state, events);
  StepBreath(state, events);
  StepForcedOut(state, events);
  StepExposure(state, events);
  StepGrain(state, events);
  StepIntel(state, events);
  StepPool(state, events);
  StepOutcome(state, events);
  if (state.result) {
    state.meta.phase = "over";
  } else {
    StartNewTurn(state, events);
  }
  UpdateEnemyMemory(state);
  return { state, events };
}
