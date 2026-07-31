// 《地下长城 · 冀中1942》 —— 视线、隐蔽/目击两级、暴露豆、嫌疑分与 DeriveView。
// 「玩家能看到什么」只由本模块回答：渲染层与 CLI 共用 DeriveView(state)，不得自算规则。

import { ParseHexKey, HexLine, HexKey, HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, terrainDefinitions, unitDefinitions, TEXT } from "./Data_Rules.mjs";
import {
  SortedKeys, AllyUnits, EnemyUnits, UnitDef, EntranceThreshold, VentThreshold,
  GrainTotal, PopTotal, WoundedTotal, TunnelNeighbors,
} from "./Script_State.mjs";

// ---------------------------------------------------------------------------
// 视线
// ---------------------------------------------------------------------------

/** 两格间视线：距离 ≤ range，且中间格（不含两端）无树林/村庄阻挡；相邻恒可见。 */
export function HasLineOfSight(state, fromKey, toKey, range) {
  const distance = HexDistanceKeys(fromKey, toKey);
  if (distance > range) return false;
  if (distance <= 1) return true;
  const line = HexLine(ParseHexKey(fromKey), ParseHexKey(toKey));
  for (let i = 1; i < line.length - 1; i += 1) {
    const hex = state.map.hexes[HexKey(line[i].q, line[i].r)];
    if (hex && terrainDefinitions[hex.terrain].blocksSight) return false;
  }
  return true;
}

/** 我方对某格是否可见：地表单位视线，或组织度 ≥1 村庄的哨网（村 2 格内平距）。 */
export function CanAllySeeHex(state, key) {
  for (const unit of AllyUnits(state)) {
    if (unit.layer !== "surface") continue;
    if (HasLineOfSight(state, unit.pos, key, UnitDef(unit).vision)) return true;
  }
  for (const villageId of SortedKeys(state.map.villages)) {
    const village = state.map.villages[villageId];
    if (village.organize < 1) continue;
    for (const hexKey of village.hexKeys) {
      if (HexDistanceKeys(hexKey, key) <= 2) return true;
    }
  }
  return false;
}

/** 敌军对我方单位是否可见：地下永不可见；隐蔽仅相邻可见；其余按敌单位视线。 */
export function EnemySeesUnit(state, unit) {
  if (unit.layer !== "surface" || unit.hp <= 0) return false;
  for (const foe of EnemyUnits(state)) {
    const distance = HexDistanceKeys(foe.pos, unit.pos);
    if (unit.stance === "hidden" && !unit.revealed) {
      if (distance <= 1) return true;
      continue;
    }
    if (unit.stance === "ambush" && !unit.revealed) {
      if (distance <= 1) return true;      // 伏击态视同隐蔽：非相邻不被看见
      continue;
    }
    if (HasLineOfSight(state, foe.pos, unit.pos, UnitDef(foe).vision)) return true;
  }
  return false;
}

export function EnemyCanSeeHex(state, key) {
  for (const foe of EnemyUnits(state)) {
    if (HasLineOfSight(state, foe.pos, key, UnitDef(foe).vision)) return true;
  }
  return false;
}

export function EnemyNearHex(state, key, range) {
  for (const foe of EnemyUnits(state)) {
    if (HexDistanceKeys(foe.pos, key) <= range) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 暴露与敌方记忆（引擎侧确定性写入；DeriveView 本身只读不写）
// ---------------------------------------------------------------------------

/** 我方使用入口的暴露豆（§2.6）：敌视野内 +2、敌 2 格内 +1、否则 0；forcedBeans 用于「打了就钻」固定 +2。 */
export function ExposeEntranceUse(state, key, forcedBeans = null) {
  const entrance = state.tunnels.entrances[key];
  if (!entrance) return 0;
  let beans = forcedBeans;
  if (beans === null || beans === undefined) {
    beans = EnemyCanSeeHex(state, key) ? CFG.useEntranceExposeSeen
      : EnemyNearHex(state, key, CFG.useEntranceNearRange) ? CFG.useEntranceExposeNear : 0;
  }
  if (beans > 0) entrance.expose += beans;
  return beans;
}

/** 预估使用某入口会加的豆数（LegalActions 标注 exposeRisk 用，只读）。 */
export function PreviewEntranceUseBeans(state, key) {
  if (EnemyCanSeeHex(state, key)) return CFG.useEntranceExposeSeen;
  if (EnemyNearHex(state, key, CFG.useEntranceNearRange)) return CFG.useEntranceExposeNear;
  return 0;
}

/** 敌方对我可见单位的最后目击记录（虚影用）。只在 PerformAction / EndTurn 内调用，保证确定性。 */
export function UpdateEnemyMemory(state) {
  for (const foe of EnemyUnits(state)) {
    if (CanAllySeeHex(state, foe.pos)) {
      state.enemy.lastSeen[foe.id] = { pos: foe.pos, turn: state.meta.turn };
    }
  }
}

// ---------------------------------------------------------------------------
// 目击（置信 2 = 亲眼所见/枪声，可拉动机动队；置信 1 = 痕迹/动静，只加嫌疑）
// ---------------------------------------------------------------------------

export function RecordSighting(state, pos, confidence) {
  const exists = state.enemy.sightings.some(
    (s) => s.pos === pos && s.turn === state.meta.turn && s.confidence === confidence);
  if (!exists) state.enemy.sightings.push({ pos, turn: state.meta.turn, confidence });
}

export function ExpireSightings(state) {
  state.enemy.sightings = state.enemy.sightings.filter(
    (s) => state.meta.turn - s.turn <= CFG.sightingLife);
}

/** 时效内（≤2 回合）的置信 2 目击列表。 */
export function FreshSightings(state) {
  return state.enemy.sightings.filter(
    (s) => s.confidence >= 2 && state.meta.turn - s.turn <= CFG.sightingLife);
}

/** 嫌疑分（§2.6）：敌搜索选格依据；同分按格键字典序 + 波次盐轮转。 */
export function SuspicionScore(state, key) {
  const hex = state.map.hexes[key];
  if (!hex) return 0;
  let score = 0;
  for (const s of state.enemy.sightings) {
    if (s.pos !== key || state.meta.turn - s.turn > 2) continue;
    score += s.confidence >= 2 ? CFG.suspicion.sighting2 : CFG.suspicion.sighting1;
  }
  if (hex.attackSite) score += CFG.suspicion.attackSite;
  const village = hex.villageId ? state.map.villages[hex.villageId] : null;
  if (village && village.grainOpen > 0) score += CFG.suspicion.openGrain;
  score += hex.traces * CFG.suspicion.tracesUnit;
  return score;
}

// ---------------------------------------------------------------------------
// DeriveView：玩家视角模型（渲染与 CLI 唯一信息源）
// ---------------------------------------------------------------------------

function UnitBrief(unit) {
  const def = unitDefinitions[unit.type];
  return { id: unit.id, type: unit.type, name: def.name, pos: unit.pos, layer: unit.layer,
    hp: unit.hp, mp: unit.mp, acted: unit.acted, stance: unit.stance, breath: unit.breath };
}

export function DeriveView(state) {
  const view = {
    turn: state.meta.turn, phase: state.meta.phase, level: state.meta.level, seed: state.meta.seed,
    wave: { status: state.wave.status, statusText: TEXT.waveStatus[state.wave.status],
            sweepTurn: state.wave.sweepTurn, pool: state.wave.pool,
            hardEndTurn: state.wave.hardEndTurn, withdrawAnnounced: state.wave.withdrawAnnounced,
            smokeCharges: state.wave.smokeCharges },
    resources: { ammo: state.resources.ammo, grainTotal: GrainTotal(state), popTotal: PopTotal(state),
                 woundedTotal: WoundedTotal(state) },
    ledger: { ...state.ledger },
    allies: AllyUnits(state).map(UnitBrief),
    visibleEnemies: [],
    ghosts: [],
    intentArrows: [],
    telegraphs: [],
    guardrails: [],
    hexBadges: {},
    result: state.result,
  };

  // —— 可见敌单位与虚影（未识破特务以「行人」示人，不可当作战目标） ——
  const visibleIds = new Set();
  for (const foe of EnemyUnits(state)) {
    if (CanAllySeeHex(state, foe.pos)) {
      visibleIds.add(foe.id);
      const masked = UnitDef(foe).disguised && !foe.revealed;
      view.visibleEnemies.push({ id: foe.id, type: masked ? "civilian" : foe.type,
        name: masked ? "行人（身份不明）" : UnitDef(foe).name, pos: foe.pos, hp: masked ? null : foe.hp,
        masked, columnId: foe.columnId });
    }
  }
  for (const id of SortedKeys(state.enemy.lastSeen)) {
    if (visibleIds.has(id)) continue;
    const seen = state.enemy.lastSeen[id];
    const foe = state.units[id];
    if (foe && foe.hp > 0) view.ghosts.push({ id, type: foe.type, pos: seen.pos, turn: seen.turn });
  }

  // —— 意图箭头：纵队在我视野内或组织村 2 格内时显示未来路径（谨慎 2 只显 1 格） ——
  for (const column of state.enemy.columns) {
    const alive = column.unitIds.filter((id) => state.units[id] && state.units[id].hp > 0);
    if (!alive.length) continue;
    const anySeen = alive.some((id) => CanAllySeeHex(state, state.units[id].pos));
    if (!anySeen) continue;
    if (column.respondFresh) {
      view.intentArrows.push({ columnId: column.id, hexes: [], mark: "?" });
      continue;
    }
    const planned = (column.plannedPath || []).slice(0, column.caution >= 2 ? 1 : 2);
    view.intentArrows.push({ columnId: column.id, hexes: planned, mark: null,
      task: column.role, at: state.units[alive[0]].pos });
  }

  // —— 电报：反地道作业提前 1 回合全量预告 + 次回合波次入场预告 ——
  for (const op of state.enemy.pendingOps) {
    view.telegraphs.push({ kind: op.kind, hex: op.at, text: `${TEXT.telegraph[op.kind]}（${op.at}）` });
  }
  for (const wave of state.wave.schedule) {
    if (!wave.spawned && wave.kind !== "decision" && wave.turn === state.meta.turn + 1) {
      view.telegraphs.push({ kind: "wave", hex: wave.entry, text: `内线电报：明日有敌一部（${wave.units.length}队）自 ${wave.entry || "不明方向"} 入境` });
    }
  }
  if (state.wave.withdrawAnnounced && state.wave.status !== "done") {
    view.telegraphs.push({ kind: "withdraw", hex: null, text: TEXT.banner.withdraw });
  }

  // —— 待办护栏 ——
  for (const unit of AllyUnits(state)) {
    if (!unit.acted && state.meta.phase === "player") {
      view.guardrails.push({ kind: "unmoved", unitId: unit.id, text: `${UnitDef(unit).name} ${unit.id} 尚未行动` });
    }
    if (unit.breath >= 2) {
      view.guardrails.push({ kind: "breath", unitId: unit.id, text: `${UnitDef(unit).name} ${unit.id} 憋闷 ${unit.breath}/3` });
    }
  }
  for (const siteId of SortedKeys(state.tunnels.digs)) {
    const site = state.tunnels.digs[siteId];
    if (site.progress < site.need && (site.workedTurn || 0) < state.meta.turn) {
      view.guardrails.push({ kind: "idleSite", siteId, text: `工地 ${siteId}（${site.at}）本回合无人施工` });
    }
  }
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const entrance = state.tunnels.entrances[key];
    if (!entrance.known && !entrance.sealed && EntranceThreshold(entrance) - entrance.expose <= 2) {
      view.guardrails.push({ kind: "exposeSoon", hex: key, text: `入口 ${key} 即将被搜出（${entrance.expose}/${EntranceThreshold(entrance)}）` });
    }
  }

  // —— 每格徽记（豆/痕迹/烟/工地/伏击/已搜/袭击点，全程明牌项） ——
  for (const key of SortedKeys(state.map.hexes)) {
    const hex = state.map.hexes[key];
    const badge = {};
    if (hex.traces > 0) badge.traces = hex.traces;
    if (hex.searched) badge.searched = true;
    if (hex.attackSite) badge.attackSite = true;
    const entrance = state.tunnels.entrances[key];
    if (entrance) badge.entrance = { expose: entrance.expose, threshold: EntranceThreshold(entrance),
      known: entrance.known, sealed: entrance.sealed };
    const vent = state.tunnels.vents[key];
    if (vent) badge.vent = { expose: vent.expose, threshold: VentThreshold(), known: vent.known, smoked: vent.smoked };
    const cell = state.tunnels.cells[key];
    if (cell) {
      if (cell.smoke > 0) badge.smoke = cell.smoke;
      if (cell.facility) badge.facility = cell.facility;
      if (cell.grain > 0) badge.grain = cell.grain;
      if (cell.civs > 0) badge.civs = cell.civs;
      const tunnelLinks = TunnelNeighbors(state, key, false);
      if (tunnelLinks.length) badge.tunnelLinks = tunnelLinks;
    }
    if (Object.keys(badge).length) view.hexBadges[key] = badge;
  }
  for (const unit of AllyUnits(state)) {
    if (unit.stance === "ambush") {
      view.hexBadges[unit.pos] = view.hexBadges[unit.pos] || {};
      view.hexBadges[unit.pos].ambush = true;
    }
  }
  for (const siteId of SortedKeys(state.tunnels.digs)) {
    const site = state.tunnels.digs[siteId];
    if (site.progress >= site.need) continue;
    view.hexBadges[site.at] = view.hexBadges[site.at] || {};
    view.hexBadges[site.at].dig = { siteId, kind: site.kind, progress: site.progress, need: site.need };
  }
  return view;
}
