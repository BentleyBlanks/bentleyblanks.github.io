// 《地下长城 · 冀中1942》 —— 视线、隐蔽/目击两级、暴露豆、嫌疑分与 DeriveView。
// 「玩家能看到什么」只由本模块回答：渲染层与 CLI 共用 DeriveView(state)，不得自算规则。

import { ParseHexKey, HexLine, HexKey, HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, terrainDefinitions, unitDefinitions, civKindDefinitions, disguiseDefinitions, TEXT } from "./Data_Rules.mjs";
import { GetLevel, BuildActCard } from "./Data_Levels.mjs";
import {
  SortedKeys, AllyUnits, EnemyUnits, UnitDef, EntranceThreshold, VentThreshold,
  GrainTotal, PopTotal, WoundedTotal, TunnelNeighbors, TunnelGrainTotal, CombatUnitCount,
  LiveCivs, AllCivs, CivsInCell, CivSafeCount, CivTotal, CivSafeRatio, CivLostCount,
  CivSlots, CivSpeed, CivGuidanceOn, UnitsOn, ElevOf, LargestNetworkSize, VillagesLinked,
  LiveEntranceCount, DisguisedEntranceCount, VentCount, ActionUnlocked, StorageCapOf, ShelterCapOf,
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

function UnitBrief(state, unit) {
  const def = unitDefinitions[unit.type];
  return { id: unit.id, type: unit.type, name: def.name, pos: unit.pos, layer: unit.layer,
    hp: unit.hp, mp: unit.mp, acted: unit.acted, stance: unit.stance, breath: unit.breath,
    breathMax: CFG.breathThreshold,
    guideCap: CFG.civ.guideCap[unit.type] || 0,
    escorting: unit.layer === "under" ? CivsInCell(state, unit.pos).length : 0,
    coverLeft: Math.max(0, CFG.coverUsesPerUnit - (unit.coverUses || 0)) };
}

/** 群众批的 HUD 视图：类型/位置/有没有人带路/恐慌值——用户明确要求的第二条主线全在这里透出。 */
function CivBrief(state, civ) {
  const kindDef = civKindDefinitions[civ.kind] || {};
  const escorted = civ.loc === "cell"
    && UnitsOn(state, civ.at, "under").some((unit) => unit.side === "ally");
  return {
    id: civ.id, kind: civ.kind, kindName: kindDef.name || civ.kind,
    loc: civ.loc, at: civ.at, home: civ.home,
    panic: civ.panic || 0, panicMax: CFG.civ.panicThreshold,
    escorted, speed: CivSpeed(civ), slots: CivSlots(civ),
    fate: civ.fate || null,
  };
}

/** 幕目标进度：把 level.victory 的每一条翻成「现在多少 / 还差多少」。 */
function ObjectiveProgress(state) {
  const level = GetLevel(state.meta.level);
  const readers = {
    civSafeAtLeast: () => ({ label: "群众保全（批）", have: CivSafeCount(state) }),
    civSafeRatioAtLeast: () => ({ label: "群众保全率", have: Number(CivSafeRatio(state).toFixed(2)) }),
    tunnelGrainAtLeast: () => ({ label: "洞存粮（担）", have: TunnelGrainTotal(state) }),
    grainAtLeast: () => ({ label: "存粮合计（担）", have: GrainTotal(state) }),
    combatUnitsAtLeast: () => ({ label: "战斗单位（支）", have: CombatUnitCount(state) }),
    villagesAtLeast: () => ({ label: "存活村（处）",
      have: Object.values(state.map.villages).filter((v) => v.burnedHexes < v.hexKeys.length).length }),
    woundedAtLeast: () => ({ label: "伤员保全（批）", have: WoundedTotal(state) }),
  };
  const rows = [];
  for (const key of Object.keys(level.victory || {}).sort()) {
    const reader = readers[key];
    if (!reader) continue;
    const { label, have } = reader();
    const need = level.victory[key];
    rows.push({ key, label, have, need, ok: have >= need, short: Math.max(0, Number((need - have).toFixed(2))) });
  }
  return rows;
}

export function DeriveView(state) {
  const level = GetLevel(state.meta.level);
  const card = BuildActCard(level);
  const civs = AllCivs(state).map((civ) => CivBrief(state, civ));
  const view = {
    turn: state.meta.turn, phase: state.meta.phase, level: state.meta.level, seed: state.meta.seed,
    // —— 幕次卡（剧情 + 三行「这一幕你要学会什么」+ 本幕新解锁）——
    act: { id: card.id, act: card.act, name: card.name, subtitle: card.subtitle,
           lessons: card.lessons, unlocked: card.unlocked,
           nextId: card.nextId, nextName: card.nextName,
           maxTurns: level.maxTurns },
    newUnlocks: card.unlocked,
    unlockedActions: (level.unlocks && level.unlocks.actions ? level.unlocks.actions.slice() : []),
    unlockedFacilities: (level.unlocks && level.unlocks.facilities ? level.unlocks.facilities.slice() : []),
    unlockedDisguises: (level.unlocks && level.unlocks.disguises ? level.unlocks.disguises.slice() : []),
    civGuidance: CivGuidanceOn(state),
    wave: { status: state.wave.status, statusText: TEXT.waveStatus[state.wave.status],
            sweepTurn: state.wave.sweepTurn, pool: state.wave.pool,
            hardEndTurn: state.wave.hardEndTurn, withdrawAnnounced: state.wave.withdrawAnnounced,
            smokeCharges: state.wave.smokeCharges, floodCharges: state.wave.floodCharges },
    resources: { ammo: state.resources.ammo, grainTotal: GrainTotal(state), popTotal: PopTotal(state),
                 woundedTotal: WoundedTotal(state),
                 storageCap: StorageCapOf(state), shelterCap: ShelterCapOf(state) },
    ledger: { ...state.ledger },
    // —— 群众各批状态（类型/位置/是否有人带路/恐慌值）——
    civs,
    civSummary: {
      total: CivTotal(state), safe: CivSafeCount(state), lost: CivLostCount(state),
      ratio: Number(CivSafeRatio(state).toFixed(3)),
      inVillage: civs.filter((civ) => civ.loc === "village").length,
      inTunnel: civs.filter((civ) => civ.loc === "cell").length,
      unescorted: civs.filter((civ) => civ.loc === "cell" && !civ.escorted).length,
      panicking: civs.filter((civ) => civ.loc === "cell" && civ.panic >= CFG.civ.panicThreshold - 1).length,
      forcedOut: state.score.civForcedOut || 0,
      captured: civs.filter((civ) => civ.fate === "captured").length,
      dead: civs.filter((civ) => civ.fate === "dead").length,
    },
    // —— 幕目标与进度 ——
    objectiveProgress: ObjectiveProgress(state),
    network: { cells: Object.keys(state.tunnels.cells).length, largest: LargestNetworkSize(state),
               villagesLinked: VillagesLinked(state), liveEntrances: LiveEntranceCount(state),
               disguised: DisguisedEntranceCount(state), vents: VentCount(state),
               fightpostsUsed: (state.score.fightpostsUsed || []).slice() },
    allies: AllyUnits(state).map((unit) => UnitBrief(state, unit)),
    visibleEnemies: [],
    ghosts: [],
    intentArrows: [],
    telegraphs: [],
    guardrails: [],
    hexBadges: {},
    // 关卡自带的固定情报：地标、伏击位、目标行、规则要点、代价簿说明、敌单位速查，均取自 Data_Levels
    landmarks: (GetLevel(state.meta.level).landmarks || []).map((entry) => ({ ...entry })),
    ambushSpots: (GetLevel(state.meta.level).ambushSpots || []).map((entry) => ({ ...entry })),
    objectives: (GetLevel(state.meta.level).objectives || []).slice(),
    phaseNote: (GetLevel(state.meta.level).phases || [])
      .find((entry) => state.meta.turn >= entry.from && state.meta.turn <= entry.to) || null,
    openingChecklist: (GetLevel(state.meta.level).openingChecklist || []).slice(),
    pitfalls: (GetLevel(state.meta.level).pitfalls || []).slice(),
    roster: (GetLevel(state.meta.level).roster || []).slice(),
    gradeNotes: (GetLevel(state.meta.level).gradeNotes || []).slice(),
    digest: (GetLevel(state.meta.level).digest || []).slice(),
    ledgerNotes: (GetLevel(state.meta.level).ledgerNotes || []).slice(),
    counterNotes: (GetLevel(state.meta.level).counterNotes || []).slice(),
    facilityNotes: (GetLevel(state.meta.level).facilityNotes || []).slice(),
    tactics: (GetLevel(state.meta.level).tactics || []).slice(),
    orderOfBattle: (GetLevel(state.meta.level).orderOfBattle || []).slice(),
    lessons: (level.lessons || []).slice(),
    // —— 终局复盘三段（代价 / 学到什么 / 解锁什么）：结算时才有值，平时给 null ——
    debrief: state.result ? state.result.debrief : null,
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
  // 波次预告：优先用关卡数据自带的档案式电报文案（写在 Data_Levels，情报 100% 真实）
  for (const wave of state.wave.schedule) {
    if (!wave.spawned && wave.kind !== "decision" && wave.turn === state.meta.turn + 1) {
      view.telegraphs.push({ kind: "wave", hex: wave.entry,
        text: wave.telegraph || `内线电报：明日有敌一部（${wave.units.length}队）自 ${wave.entry || "不明方向"} 入境` });
    }
  }
  // 敌情时间线：按回合投放的内线通报（与波次预告同为「已定之事」，不含推测）
  for (const intel of GetLevel(state.meta.level).intelTimeline || []) {
    if (intel.turn !== state.meta.turn) continue;
    const villageName = ({ v1: "枣林庄", v2: "柳条峪", v3: "石槽村" })[state.wave.plan?.targetAssign?.main] || "枣林庄";
    view.telegraphs.push({ kind: "intel", hex: null, text: intel.text.replace("{MAINVILLAGE}", villageName) });
  }
  if (state.wave.withdrawAnnounced && state.wave.status !== "done") {
    view.telegraphs.push({ kind: "withdraw", hex: null, text: TEXT.banner.withdraw });
  }

  // —— 待办护栏（伏击是持续状态：守着不动就是它这回合的活，不再催你重按一次） ——
  for (const unit of AllyUnits(state)) {
    if (!unit.acted && unit.stance !== "ambush" && state.meta.phase === "player") {
      view.guardrails.push({ kind: "unmoved", unitId: unit.id, text: `${UnitDef(unit).name} ${unit.id} 尚未行动` });
    }
    if (unit.breath >= 2) {
      view.guardrails.push({ kind: "breath", unitId: unit.id, text: `${UnitDef(unit).name} ${unit.id} 憋闷 ${unit.breath}/${CFG.breathThreshold}` });
    }
  }
  // 群众护栏：地道里恐慌逼近满值的批（没人带路是最常见的死法）
  for (const civ of LiveCivs(state)) {
    if (civ.loc !== "cell" || (civ.panic || 0) < CFG.civ.panicThreshold - 1) continue;
    const escorted = UnitsOn(state, civ.at, "under").some((unit) => unit.side === "ally");
    view.guardrails.push({ kind: "panic", civId: civ.id, hex: civ.at,
      text: `群众 ${civ.id}（${(civKindDefinitions[civ.kind] || {}).name || civ.kind}）＠${civ.at} 恐慌 ${civ.panic}/${CFG.civ.panicThreshold}`
        + (escorted ? "（有人照应）" : "——无人带路，再撑一回合就要往外冲") });
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
    // 「敌已警戒」：同一格连着两回合设伏留下的记号，敌寻路会绕开这里（§2.5）
    if ((hex.alertedUntil || 0) >= state.meta.turn) badge.alerted = (hex.alertedUntil - state.meta.turn) + 1;
    if (ElevOf(state, key) !== 1) badge.elev = ElevOf(state, key);
    const entrance = state.tunnels.entrances[key];
    if (entrance) badge.entrance = { expose: entrance.expose, threshold: EntranceThreshold(entrance),
      known: entrance.known, sealed: entrance.sealed, disguise: entrance.disguise,
      disguiseName: entrance.disguise ? (disguiseDefinitions[entrance.disguise] || {}).name : null };
    const vent = state.tunnels.vents[key];
    if (vent) badge.vent = { expose: vent.expose, threshold: VentThreshold(), known: vent.known, smoked: vent.smoked };
    const cell = state.tunnels.cells[key];
    if (cell) {
      if (cell.smoke > 0) badge.smoke = cell.smoke;
      if (cell.water > 0) badge.water = cell.water;
      if (cell.facility) badge.facility = cell.facility;
      if (cell.facility === "trapdoor") badge.trapReady = !!cell.trapReady;
      if (cell.facility === "fightpost") badge.fightpost = { lastTurn: cell.fightpostLastTurn || 0,
        locked: !!cell.fightpostLastTurn && state.meta.turn - cell.fightpostLastTurn <= CFG.fightpost.lockWindow };
      if (cell.grain > 0) badge.grain = cell.grain;
      const here = CivsInCell(state, key);
      if (here.length) {
        badge.civs = here.length;
        badge.civPanic = Math.max(...here.map((civ) => civ.panic || 0));
        badge.civEscorted = UnitsOn(state, key, "under").some((unit) => unit.side === "ally");
      }
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
