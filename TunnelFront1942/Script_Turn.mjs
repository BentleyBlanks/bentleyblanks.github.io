// 《地下长城 · 冀中1942》 —— 回合管线（AGENTS.md §2.1/§三）：
// EndTurn = 玩家阶段收尾 → 敌军阶段（逐纵队）→ 固定结算顺序
// （烟蔓延→水漫延→憋闷与恐慌→被迫出洞→搜索暴露判定→粮食产耗→情报刷新→池扣减与撤退判定→胜负勋记判定）
// → 新回合开卷（波次状态机 quiet→sweep→withdrawing→done）。
// 胜负评级三勋记制 + 群众保全率；breakdown 数值分仅供冒烟排序断言，不进 UI。

import { HexNeighborKeys, HexDistanceKeys, ParseHexKey, hexDirections } from "./Script_Hex.mjs";
import { CFG, TEXT, GradeForMedals } from "./Data_Rules.mjs";
import { GetLevel, BuildActCard } from "./Data_Levels.mjs";
import {
  SortedKeys, CompareIds, PushEvent, AddLedger, CloneState, UnitDef, UnitsOn,
  AllyUnits, EnemyUnits, RemoveUnit, CombatUnitCount, AirZones, ZoneHasAir, ZoneExits,
  ConnectedCells, TunnelNeighbors, GrainTotal, TunnelGrainTotal, PopTotal, WoundedTotal,
  EntranceThreshold, VentThreshold, EnemyNearVillage, StorageCellsUnder, ElevOf,
  IsSurfacePassable, LiveCivs, CivsInCell, CivsAtVillage, CivSafeCount, CivTotal, CivSafeRatio,
  CivLostCount, LoseCiv, CivGuidanceOn, LargestNetworkSize, VillagesLinked, LiveEntranceCount,
  DisguisedEntranceCount, VentCount, VillageIdOfHex, PlaceCivOnHex, IsStunned, StorageCapOf,
} from "./Script_State.mjs";
import { ExpireSightings, UpdateEnemyMemory, ExposeEntranceUse, CanAllySeeHex, RecordSighting } from "./Script_Visibility.mjs";
import { RunEnemyPhase } from "./Script_EnemyAi.mjs";
import { AdvanceSite, AddTraces, RevealAdjacentSpies, RecordExposedSightings } from "./Script_Actions.mjs";

// ---------------------------------------------------------------------------
// 玩家阶段收尾：组织 2 级村的免费工地进度（敌近则停）
// ---------------------------------------------------------------------------

/**
 * R6 P0-3：这条规则本来就在，只是**一声不吭**——给了免费进度不播报，停了也不播报，
 * 于是三幕独立复审都判它「未观察到 / 不生效」。规则不播报就等于不存在，现在两头都说话。
 */
function PlayerWrapUp(state, events) {
  for (const villageId of SortedKeys(state.map.villages)) {
    const village = state.map.villages[villageId];
    if (village.organize < 2) continue;
    const sites = SortedKeys(state.tunnels.digs).filter((siteId) => village.hexKeys
      .some((key) => HexDistanceKeys(key, state.tunnels.digs[siteId].at) <= CFG.organizeFreeDigRadius));
    if (!sites.length) continue;
    if (EnemyNearVillage(state, villageId, CFG.organizeStopEnemyRange)) {
      PushEvent(state, events, { kind: "organize", text: `${village.name}：${TEXT.organizeFreeText.stopped}`,
        hex: village.hexKeys[0], visible: true });
      continue;
    }
    const siteId = sites[0];                        // 每村每回合只帮一个工地
    const at = state.tunnels.digs[siteId].at;
    PushEvent(state, events, { kind: "organize", text: `${village.name}：${TEXT.organizeFreeText.given}`,
      hex: at, layer: "under", visible: true });
    AdvanceSite(state, events, siteId, 1);
  }
}

// ---------------------------------------------------------------------------
// 结算（顺序固定）
// ---------------------------------------------------------------------------

/** 方向索引：拐弯判定用（直巷子里烟走得快，拐一个弯要多花一回合）。 */
function DirIndex(fromKey, toKey) {
  const a = ParseHexKey(fromKey);
  const b = ParseHexKey(toKey);
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  for (let index = 0; index < hexDirections.length; index += 1) {
    if (hexDirections[index].q === dq && hexDirections[index].r === dr) return index;
  }
  return -1;
}

/** 完好的翻板压着的格：烟灌不进、水漫不进（第四幕的结构性反制之一）。 */
function TrapBlocks(state, key) {
  const cell = state.tunnels.cells[key];
  return !!(cell && cell.facility === "trapdoor" && cell.trapReady);
}

/**
 * ① 烟蔓延：沿开放边扩散，**直巷子 1 格/回合，拐一个弯要多花 1 回合**；
 * 关闭的隔断门与完好的翻板阻断。持续 3 回合后再滞留 2 回合消散。
 */
function StepSmoke(state, events) {
  const keep = [];
  for (const op of state.tunnels.smokeOps) {
    op.cells = op.cells || [];
    op.front = op.front || op.cells.map((key) => ({ key, dir: -1 }));
    op.queued = op.queued || [];
    const known = new Set(op.cells);
    // 上一回合被「拐弯」拖住的支线，这一回合到位
    const promoted = [];
    for (const entry of op.queued) {
      if (known.has(entry.key)) continue;
      known.add(entry.key);
      op.cells.push(entry.key);
      promoted.push(entry);
    }
    op.queued = [];
    if (op.spreadLeft > 0) {
      const nextFront = promoted.slice();
      for (const entry of op.front) {
        for (const nb of TunnelNeighbors(state, entry.key, true).sort()) {
          if (known.has(nb) || TrapBlocks(state, nb)) continue;
          const dir = DirIndex(entry.key, nb);
          if (entry.dir < 0 || dir === entry.dir) {
            known.add(nb);
            op.cells.push(nb);
            nextFront.push({ key: nb, dir });
          } else if (!op.queued.some((q) => q.key === nb)) {
            op.queued.push({ key: nb, dir });          // 拐弯：多花一回合
          }
        }
      }
      op.front = nextFront;
      op.cells.sort();
      op.spreadLeft -= 1;
      PushEvent(state, events, { kind: "smoke", text: "烟沿地道蔓延（直巷子快，拐弯慢一回合）", hex: op.origin, layer: "under", visible: true });
    } else {
      op.lingerLeft -= 1;
      op.front = promoted;
    }
    if (op.lingerLeft > 0 || op.spreadLeft > 0) keep.push(op);
    else PushEvent(state, events, { kind: "smoke", text: "地道里的烟散了", hex: op.origin, layer: "under", visible: true });
  }
  state.tunnels.smokeOps = keep;
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

/**
 * ①' 灌水：水**只往同高或更低**的相邻格漫（关闭的隔断门与完好的翻板阻断）。
 * 高处的巷子淹不着——这是第四幕唯一真正可靠的反制，而且它是地形，不是数值。
 */
function StepWater(state, events) {
  const keep = [];
  for (const op of state.tunnels.floodOps) {
    op.cells = op.cells || [];
    if (op.spreadLeft > 0) {
      const known = new Set(op.cells);
      const added = [];
      for (const key of op.cells) {
        for (const nb of TunnelNeighbors(state, key, true).sort()) {
          if (known.has(nb) || TrapBlocks(state, nb)) continue;
          if (ElevOf(state, nb) > ElevOf(state, key)) continue;      // 水不上坡
          known.add(nb);
          added.push(nb);
        }
      }
      for (const key of added) op.cells.push(key);
      op.cells.sort();
      op.spreadLeft -= 1;
      PushEvent(state, events, { kind: "water", text: TEXT.water.spread, hex: op.origin, layer: "under", visible: true });
    } else {
      op.lingerLeft -= 1;
    }
    if (op.lingerLeft > 0 || op.spreadLeft > 0) keep.push(op);
    else PushEvent(state, events, { kind: "water", text: TEXT.water.dry, hex: op.origin, layer: "under", visible: true });
  }
  state.tunnels.floodOps = keep;
  for (const key of SortedKeys(state.tunnels.cells)) state.tunnels.cells[key].water = 0;
  for (const op of state.tunnels.floodOps) {
    const remain = op.spreadLeft + op.lingerLeft;
    for (const key of op.cells) {
      const cell = state.tunnels.cells[key];
      if (cell) cell.water = Math.max(cell.water, remain);
    }
  }
  // 被淹的储粮洞泡毁存粮（只进代价簿，绝不产生任何收益）
  for (const key of SortedKeys(state.tunnels.cells)) {
    const cell = state.tunnels.cells[key];
    if (cell.water > 0 && cell.grain > 0) {
      const lost = Math.min(CFG.water.grainSpoilPerTurn, cell.grain);
      cell.grain -= lost;
      AddLedger(state, "grainSeized", lost);
      PushEvent(state, events, { kind: "ledger", text: `${TEXT.water.spoil}：${lost} 担`, hex: key, layer: "under", visible: true });
    }
  }
}

/** ② 憋闷（单位）与恐慌（群众批）：同一套压力，只是两种称呼。 */
function StepPressure(state, events) {
  const zones = AirZones(state);
  const zoneAir = {};
  for (const zone of zones) {
    const hasAir = ZoneHasAir(state, zone);
    for (const key of zone) zoneAir[key] = hasAir;
  }
  // 单位憋闷
  for (const key of SortedKeys(state.tunnels.cells)) {
    const cell = state.tunnels.cells[key];
    const hasAir = !!zoneAir[key];
    const gain = cell.smoke > 0 ? CFG.breathGainSmoke
      : cell.water > 0 ? CFG.breathGainWater : CFG.breathGainNoAir;
    for (const unit of UnitsOn(state, key, "under")) {
      const bad = !hasAir || cell.smoke > 0 || cell.water > 0;
      unit.breath = bad ? unit.breath + gain : 0;
      if (bad && unit.breath === CFG.breathThreshold) {
        PushEvent(state, events, { kind: "breath", text: `${UnitDef(unit).name}在地道中憋闷难支`, hex: key, layer: "under", visible: true });
      }
    }
  }
  // 群众恐慌（无人带路 / 无风 / 烟 / 水 —— 合并成同一个表）
  const guidance = CivGuidanceOn(state);
  const sweeping = state.wave.status !== "quiet";
  for (const civ of LiveCivs(state)) {
    if (civ.loc !== "cell") { civ.panic = 0; continue; }
    const cell = state.tunnels.cells[civ.at];
    if (!cell) { civ.panic = 0; continue; }
    let gain = 0;
    if (cell.smoke > 0) gain += CFG.civ.panicSmoke;
    else if (cell.water > 0) gain += CFG.civ.panicWater;
    else if (!zoneAir[civ.at]) gain += CFG.civ.panicNoAir;
    const escorted = UnitsOn(state, civ.at, "under").some((unit) => unit.side === "ally");
    if (!escorted && guidance && sweeping) gain += CFG.civ.panicNoGuide;
    if (gain > 0) {
      civ.panic += gain;
      if (civ.panic === CFG.civ.panicThreshold) {
        PushEvent(state, events, { kind: "panic",
          text: `地道里的群众（${KindName(civ)}）撑不住了：${escorted ? "" : "无人照应，"}恐慌已满`,
          hex: civ.at, layer: "under", visible: true });
      }
    } else if (escorted && civ.panic > 0) {
      civ.panic = Math.max(0, civ.panic - CFG.civ.calmPerTurn);
      PushEvent(state, events, { kind: "panic", text: TEXT.civText.calmed, hex: civ.at, layer: "under", visible: false });
    }
  }
}

function KindName(civ) {
  return ({ old: "老弱", young: "青壮", wounded: "伤员" })[civ.kind] || civ.kind;
}

/**
 * ③ 被迫出洞：憋闷 ≥3 的单位、恐慌 ≥3 的群众批**一定上地面**。
 * 先走本分区最近的可用口（群众过不去的伪装口——比如水井——不算），没有口就在本格正上方刨土钻出，
 * 连正上方都不可通行才退化为掉血/罹难。地面有敌 → 群众当场被捕入账本。
 */
function ForcedExit(state, zone, fromKey, forCivs) {
  const exits = ZoneExits(state, zone, fromKey, forCivs);
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
    const out = ForcedExit(state, zone, unit.pos, false);
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
  // 群众批
  for (const civ of LiveCivs(state)) {
    if (civ.loc !== "cell" || civ.panic < CFG.civ.panicThreshold) continue;
    const zone = zones[zoneOf[civ.at]] || new Set([civ.at]);
    const out = ForcedExit(state, zone, civ.at, true);
    if (!out) {
      LoseCiv(state, civ, "dead");
      PushEvent(state, events, { kind: "ledger", text: `无路可出：群众（${KindName(civ)}）1 批罹难（入代价簿）`, layer: "under", visible: true });
      continue;
    }
    const enemyThere = UnitsOn(state, out.key, "surface").some((unit) => unit.side === "enemy");
    state.score.civForcedOut += 1;
    if (out.dug) AddTraces(state, out.key, CFG.tracesPerDig);
    else ExposeEntranceUse(state, out.key, null);
    if (enemyThere) {
      LoseCiv(state, civ, "captured");
      PushEvent(state, events, { kind: "ledger", text: `${TEXT.civText.caught}：群众（${KindName(civ)}）1 批`, hex: out.key, visible: true });
    } else {
      // R5 P0-2：冲出地面的人**落在一个具体的格上**（带格号），不再一句「散回村中」把地上地下抹平。
      // 口外没有敌人时，他们四散躲进村里离敌最远的那一格——但人已经在地面上了：
      // 下一个敌军阶段敌纵队踩到哪一格，那一格的人就被拉走。
      const villageId = NearestVillageId(state, out.key);
      const landing = ScatterHex(state, villageId, out.key);
      PlaceCivOnHex(state, civ, villageId, landing);
      PushEvent(state, events, { kind: "forcedOut",
        text: `${TEXT.civText.panicOut}：群众（${KindName(civ)}）1 批钻出 ${out.key}，躲进 ${landing} 的房子里`,
        hex: out.key, visible: true });
    }
  }
  RecordExposedSightings(state);
}

/** 钻出地面后往哪儿躲：本村里**离敌最远**的那一格（并列取格键序）；没有村格就还站在原地。 */
function ScatterHex(state, villageId, fromKey) {
  const village = villageId ? state.map.villages[villageId] : null;
  if (!village || !village.hexKeys.length) return fromKey;
  const foes = EnemyUnits(state);
  const Score = (key) => (foes.length
    ? Math.min(...foes.map((unit) => HexDistanceKeys(unit.pos, key)))
    : 99);
  return village.hexKeys.slice()
    .sort((a, b) => (Score(b) - Score(a)) || (a < b ? -1 : 1))[0];
}

function NearestVillageId(state, key) {
  let best = null;
  let bestDist = Infinity;
  for (const villageId of SortedKeys(state.map.villages)) {
    for (const hexKey of state.map.villages[villageId].hexKeys) {
      const dist = HexDistanceKeys(hexKey, key);
      if (dist < bestDist) { bestDist = dist; best = villageId; }
    }
  }
  return best;
}

/**
 * ④ 搜索暴露判定。先结算「敌就踩在口上」的持续加压（R5 P0-1）：
 * 翻检是断续的（要选中这一格才 +搜索力），脚却是一直踩着的——
 * 敌纵队占住哪一格，那一格未被搜出的口与通气孔每回合 +2。
 * 这一条同时是「烟/水/攻入在正常游玩里根本不发生」的根因修复：豆子终于攒得上去。
 */
function StepOccupiedPressure(state, events) {
  if (state.wave.status === "quiet" || state.wave.status === "done") return;
  const occupied = new Set(EnemyUnits(state).map((unit) => unit.pos));
  for (const key of [...occupied].sort()) {
    let touched = false;
    const entrance = state.tunnels.entrances[key];
    if (entrance && !entrance.known && !entrance.sealed) {
      entrance.expose += CFG.occupiedExposePerTurn;
      touched = true;
    }
    const vent = state.tunnels.vents[key];
    if (vent && !vent.known) { vent.expose += CFG.occupiedExposePerTurn; touched = true; }
    if (touched) {
      PushEvent(state, events, { kind: "expose", text: TEXT.expose.occupied, hex: key, visible: true });
    }
  }
}

function StepExposure(state, events) {
  StepOccupiedPressure(state, events);
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
      PushEvent(state, events, { kind: "expose", text: "通气孔被敌搜出", hex: key, visible: true });
    }
  }
}

/** ⑤ 粮食产耗：平静期每村 +1（组织 ≥1 且脚下通着储粮洞则自动藏 1）；扫荡期敌到村边则每回合搜走。 */
function StepGrain(state, events) {
  if (state.wave.status === "quiet") {
    // R5 必修 bug 1：平静期的产出与自动藏粮**必须播报**——原来这两笔都是静默的，
    // 零操作对照能看见合计从 14 变 16 却查不到任何一条事件。
    for (const villageId of SortedKeys(state.map.villages)) {
      const village = state.map.villages[villageId];
      village.grainOpen += CFG.quietGrainPerVillage;
      PushEvent(state, events, { kind: "grain", text: `${TEXT.quietGrain}（${village.name} 现有明存粮 ${village.grainOpen} 担）`,
        hex: village.hexKeys[0], visible: true });
      if (village.organize < 1 || village.grainOpen <= 0) continue;
      for (const hexKey of village.hexKeys) {
        const cells = StorageCellsUnder(state, hexKey);
        if (!cells.length) continue;
        const room = StorageCapOf(state) - state.tunnels.cells[cells[0]].grain;
        const take = Math.min(CFG.autoHidePerTurn, room, village.grainOpen);
        if (take <= 0) break;
        state.tunnels.cells[cells[0]].grain += take;
        village.grainOpen -= take;
        PushEvent(state, events, { kind: "grain", text: `${TEXT.quietHide}（${village.name}，${cells[0]}）`,
          hex: hexKey, layer: "under", visible: true });
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

/** ⑦ 池扣减与撤退：扑空衰减（摸到村边却一无所获的纵队每支 -1，每回合至多 -2）+ 我方所致（封顶 5）。 */
function EmptyHandedColumns(state) {
  let count = 0;
  for (const column of state.enemy.columns) {
    // 已经装了车的队伍不算「扑空」：他们手里有东西可押运，锐气挫不着（R5）。
    // 这条把因果重新拧紧——**把粮和人留给敌人搜，就别指望把他熬走**；
    // 扑空衰减只能靠「粮藏净、人藏好、口掩住」去换。
    if (column.done || column.withdrawing || column.gained || column.hauled) continue;
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
  if (CombatUnitCount(state) === 0) {
    Evaluate(state, events, { defeatReason: "战斗单位全部损失" });
    return;
  }
  const defeat = level.defeat || {};
  if (defeat.hqOccupiedTurns !== undefined) {
    const hq = Object.values(state.map.villages).find((village) => village.hasHq);
    const hqHexes = hq ? hq.hexKeys : [];
    const garrisonColumns = state.enemy.columns.filter((column) => column.garrison);
    const occupied = garrisonColumns.some((column) => column.unitIds.some((id) => {
      const unit = state.units[id];
      return unit && unit.hp > 0 && hqHexes.includes(unit.pos);
    }));
    state.score.hqOccupiedTurns = occupied ? state.score.hqOccupiedTurns + 1 : 0;
    if (state.score.hqOccupiedTurns >= defeat.hqOccupiedTurns) {
      Evaluate(state, events, { defeatReason: "区队部被敌驻占" });
      return;
    }
  }
  if (defeat.civLostRatioAbove !== undefined && CivTotal(state) > 0) {
    if (CivLostCount(state) / CivTotal(state) > defeat.civLostRatioAbove) {
      Evaluate(state, events, { defeatReason: "群众损失过半" });
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
      Evaluate(state, events, {});
      return;
    }
  }
  if (state.meta.turn >= level.maxTurns) {
    Evaluate(state, events, {});
  }
}

// R5 P0-2：终局**不再**把幸存群众一律传回地面。人在洞里就算在洞里，在地面就算在地面——
// 原来的 ReturnCivsHome 把「谁下去了、谁还站在敌人脚底下」这个区别在结算那一刻全抹平了，
// 于是「什么都不做」与「全塞进地道」两条线的终局一模一样。就地结算，账才对得上。

// ---------------------------------------------------------------------------
// 胜负、勋记与数值分
// ---------------------------------------------------------------------------

export function KillsScore(totalKills) {
  return Math.min(8, Math.floor(3 * Math.log2(1 + Math.max(0, totalKills))));
}

function AliveVillages(state) {
  return Object.values(state.map.villages).filter((village) => village.burnedHexes < village.hexKeys.length).length;
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
    survive: 8 * CombatUnitCount(state) + 4 * CivSafeCount(state),
    grain: 2 * GrainTotal(state),
    network: Object.keys(state.tunnels.cells).length + 2 * entrancesIntact + 2 * LargestNetworkSize(state),
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
    civSafeAtLeast: () => ({ ok: CivSafeCount(state) >= want,
      text: `群众保全 ${CivSafeCount(state)}/${CivTotal(state)} 批（需 ≥${want}）` }),
    civSafeRatioAtLeast: () => ({ ok: CivSafeRatio(state) >= want - 1e-9,
      text: `群众保全率 ${(CivSafeRatio(state) * 100).toFixed(0)}%（需 ≥${(want * 100).toFixed(0)}%）` }),
    civLostAtMost: () => ({ ok: CivLostCount(state) <= want, text: `群众损失 ${CivLostCount(state)} 批（需 ≤${want}）` }),
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
    largestNetworkAtLeast: () => ({ ok: LargestNetworkSize(state) >= want,
      text: `最大地道连通块 ${LargestNetworkSize(state)} 格（需 ≥${want}）` }),
    villagesLinkedAtLeast: () => ({ ok: VillagesLinked(state) >= want,
      text: `同一片地道网串起 ${VillagesLinked(state)} 个村（需 ≥${want}）` }),
    liveEntrancesAtLeast: () => ({ ok: LiveEntranceCount(state) >= want,
      text: `未被搜出的地道口 ${LiveEntranceCount(state)} 个（需 ≥${want}）` }),
    disguisedAtLeast: () => ({ ok: DisguisedEntranceCount(state) >= want,
      text: `伪装口 ${DisguisedEntranceCount(state)} 个（需 ≥${want}）` }),
    // R6 P1：这条判据一直只认**未被搜出**的孔（VentCount 就是这个口径），
    // 但文案只写「通气孔 N 处」，于是「保全 8/8、逼出 0 批却判通气孔 1 处」看上去像 bug。把口径写进文案。
    ventsAtLeast: () => ({ ok: VentCount(state) >= want,
      text: `未被搜出的通气孔 ${VentCount(state)} 处（需 ≥${want}；被敌翻出来的孔不算）` }),
    fightpostsUsedAtLeast: () => ({ ok: (state.score.fightpostsUsed || []).length >= want,
      text: `开过火的射击孔 ${(state.score.fightpostsUsed || []).length} 处（需 ≥${want}）` }),
    forcedOutAtMost: () => ({ ok: (state.score.civForcedOut || 0) <= want,
      text: `被逼出地面的群众 ${state.score.civForcedOut || 0} 批（需 ≤${want}）` }),
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
  const card = BuildActCard(level);
  state.medals = medals;
  state.result = {
    won,
    grade: GradeForMedals(won, medalCount),
    medals,
    breakdown: ComputeBreakdown(state, won),
    reasons,
    endTurn: state.meta.turn,
    // 终局复盘三段（付出了什么代价 / 学到了什么 / 解锁了什么）—— HUD 直接取这三段
    act: level.act,
    actName: level.name,
    civSafe: CivSafeCount(state),
    civTotal: CivTotal(state),
    civRatio: Number(CivSafeRatio(state).toFixed(3)),
    civForcedOut: state.score.civForcedOut || 0,
    debrief: {
      cost: card.debrief.cost || "",
      learned: card.debrief.learned || "",
      unlocked: card.debrief.unlocked || "",
      ledger: { ...state.ledger },
    },
    nextId: card.nextId,
    nextName: card.nextName,
  };
  PushEvent(state, events, { kind: "result", text: won ? `第${level.act}幕《${level.name}》结束，评定：${state.result.grade}` : `第${level.act}幕《${level.name}》失利，评定：${state.result.grade}`, visible: true });
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
    if (unit.stance === "exposed") unit.stance = "normal";
    // 压制（R5 P0-4）：守洞打退攻入的人，这一回合动不了；到期自动恢复。
    if (IsStunned(state, unit)) {
      unit.acted = true;
      unit.mp = 0;
      unit.stance = "stunned";
      PushEvent(state, events, { kind: "combat", text: `${UnitDef(unit).name}仍被压制，本回合动不了`,
        hex: unit.pos, layer: unit.layer, visible: unit.side === "ally" });
    } else if (unit.stance === "stunned") {
      unit.stance = "normal";
    }
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
  StepWater(state, events);
  StepPressure(state, events);
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
