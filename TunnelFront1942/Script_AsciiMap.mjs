// 《地下长城 · 冀中1942》 —— 双层 ASCII 战场 + CLI/网页共用的呈现报表。
//
// 本模块是纯逻辑（无 window/document/three/伪随机/时钟），只读 state 与 DeriveView 的输出，
// 绝不改状态、绝不自算敌军可见性（可见敌单位/意图箭头一律取 view.visibleEnemies / view.intentArrows）。
//
// 格位约定（R2 修正：暴露豆与单位不再抢同一字符位）：
//   地上 3 字/格 = [地形] [开口位：入口暴露豆 / 通气孔 / 痕迹] [占用位：我方 > 敌方 > 意图箭头]
//   地下 3 字/格 = [设施] [内容位：烟 > 群众/伤员 > 存粮]      [占用位：地下单位]
// 坐标：动作用轴向键 "q,r"；本图列号 = q，行号 y = r + floor(q/2)（故 r = y - floor(q/2)）。

import { CFG, terrainDefinitions, facilityDefinitions, civKindDefinitions, disguiseDefinitions, TEXT, unitDefinitions } from "./Data_Rules.mjs";
import { GetLevel } from "./Data_Levels.mjs";
import { HexNeighborKeys } from "./Script_Hex.mjs";
import {
  SortedKeys, KeyToOffset, OffsetToKey, GrainTotal, TerrainOf, UnitDef,
  ReachableFacilityCells, VillageStorageEntrances, WoundedTotal, CivsInCell, CivsAtVillage,
  VillagePop, ShelterCapOf, StorageCapOf, CivSlots, LiveCivs, AllCivs, CivGuidanceOn,
  ActionUnlocked, FacilityUnlocked, ElevOf,
  EdgeKey, EdgeEnds, AirZones, ZoneVentCount, ZoneHasAir, ZoneEntranceKeys,
  LargestNetworkSize, VillagesLinked, LiveEntranceCount, DisguisedEntranceCount, VentCount,
  CivSafeCount, CivTotal, StorageCellsUnder,
} from "./Script_State.mjs";
import { DeriveView } from "./Script_Visibility.mjs";

const allyChars = { militia: "M", guerrilla: "G", runner: "R" };
const enemyChars = { inf: "J", puppet: "P", spy: "S", sapper: "B", civilian: "?" };
const facilityChars = { storage: "S", shelter: "H", vent: "O", fightpost: "X", trapdoor: "T" };
const civChars = { old: "o", young: "y", wounded: "w" };

const cellWidth = 3;        // 每格字符数（地形/设施 + 开口/内容 + 占用）
const gutter = " ";         // 格间隔
const labelWidth = 5;       // 行首标签宽

function GridBounds(state) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of SortedKeys(state.map.hexes)) {
    const { x, y } = KeyToOffset(key);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function ArrowChar(fromKey, toKey) {
  const a = KeyToOffset(fromKey);
  const b = KeyToOffset(toKey);
  if (b.x > a.x) return ">";
  if (b.x < a.x) return "<";
  if (b.y > a.y) return "v";
  return "^";
}

/** 地上格 3 字：地形位 + 开口位（暴露豆/通气孔/痕迹） + 占用位（单位/箭头）。 */
function SurfaceCell(state, key, marks) {
  const hex = state.map.hexes[key];
  if (!hex) return "   ";
  let base = terrainDefinitions[hex.terrain].char;
  if (hex.bridge) base = hex.roadBroken ? "x" : "B";
  else if (hex.road) base = hex.roadBroken ? "x" : (hex.terrain === "open" ? "=" : base);

  let opening = " ";
  const entrance = state.tunnels.entrances[key];
  const vent = state.tunnels.vents[key];
  if (entrance) opening = entrance.sealed ? "#" : entrance.known ? "!" : String(Math.min(9, entrance.expose));
  else if (vent) opening = vent.smoked ? "*" : vent.known ? "!" : "o";
  else if (hex.traces > 0) opening = ",";
  else if (hex.searched) opening = "_";

  let occupant = " ";
  if (marks.arrows[key]) occupant = marks.arrows[key];
  if (marks.enemies[key]) occupant = marks.enemies[key];
  if (marks.allies[key]) occupant = marks.enemies[key] ? "&" : marks.allies[key];
  return base + opening + occupant;
}

/** 地下格 3 字：设施位 + 内容位（水/烟/群众/存粮） + 占用位（地下单位）。 */
function UnderCell(state, key, marks) {
  const cell = state.tunnels.cells[key];
  if (!cell) return state.map.hexes[key] ? "·  " : "   ";
  const base = cell.facility ? facilityChars[cell.facility] : "o";
  let content = " ";
  if (cell.grain > 0) content = "g";
  const civs = marks.civs[key] || [];
  if (civs.length) content = civs.some((civ) => civ.panic >= CFG.civ.panicThreshold - 1) ? "!" : (civChars[civs[0].kind] || "c");
  if (cell.smoke > 0) content = "*";
  if (cell.water > 0) content = "~";
  const occupant = marks.underUnits[key] || " ";
  return base + content + occupant;
}

function CollectMarks(state, view) {
  const marks = { allies: {}, enemies: {}, underUnits: {}, arrows: {}, civs: {} };
  for (const unit of view.allies) {
    const char = allyChars[unit.type] || "A";
    if (unit.layer === "under") {
      marks.underUnits[unit.pos] = marks.underUnits[unit.pos] ? "+" : char;
    } else {
      marks.allies[unit.pos] = marks.allies[unit.pos] ? "+" : char;
    }
  }
  for (const foe of view.visibleEnemies) {
    const char = enemyChars[foe.type] || "E";
    marks.enemies[foe.pos] = marks.enemies[foe.pos] ? "+" : char;
  }
  for (const arrow of view.intentArrows) {
    if (arrow.mark === "?") { if (arrow.at) marks.arrows[arrow.at] = "?"; continue; }
    let prev = arrow.at;
    for (const hexKey of arrow.hexes) {
      if (prev) marks.arrows[hexKey] = ArrowChar(prev, hexKey);
      prev = hexKey;
    }
  }
  for (const civ of LiveCivs(state)) {
    if (civ.loc !== "cell") continue;
    (marks.civs[civ.at] = marks.civs[civ.at] || []).push(civ);
  }
  return marks;
}

// ---------------------------------------------------------------------------
// 坐标说明（审查 Agent 曾靠移动单位反推映射，这里必须写死说清）
// ---------------------------------------------------------------------------

/** 轴向 ↔ 偏移 换算说明行（含每列的 floor(q/2) 速查）。 */
export function AxialHelpLines(state) {
  const { minX, maxX } = GridBounds(state);
  const parts = [];
  for (let q = minX; q <= maxX; q += 1) parts.push(`q${q}→${Math.floor(q / 2)}`);
  return [
    "坐标：动作 JSON 一律用轴向键 \"q,r\"；本图列号就是 q，行号 y = r + floor(q/2)。",
    "      读图取 r：r = 行号 y − floor(q/2)；下图第二行 “r=y−” 已列出每列要减的数。",
    `      floor(q/2) 速查：${parts.join(" ")}`,
  ];
}

// ---------------------------------------------------------------------------
// 报表（CLI 与网页共用；全部只读）
// ---------------------------------------------------------------------------

/** 存粮分账：各村明存粮（敌可征走） vs 各储粮洞洞存粮（敌须攻入才能夺）。 */
export function GrainReport(state) {
  const villages = [];
  let open = 0;
  for (const id of SortedKeys(state.map.villages)) {
    const village = state.map.villages[id];
    villages.push({
      id, name: village.name, hexKeys: village.hexKeys.slice(),
      grainOpen: village.grainOpen, pop: VillagePop(state, id), popStart: village.popStart,
      organize: village.organize, hasHq: !!village.hasHq,
    });
    open += village.grainOpen;
  }
  const cells = [];
  let hidden = 0;
  for (const key of SortedKeys(state.tunnels.cells)) {
    const cell = state.tunnels.cells[key];
    if (cell.grain > 0) {
      cells.push({ key, grain: cell.grain, cap: StorageCapOf(state), facility: cell.facility });
      hidden += cell.grain;
    }
  }
  return { villages, cells, open, hidden, total: GrainTotal(state) };
}

/** 胜利线里跟粮相关的那一条（关卡数据驱动，关卡改了这行自动跟着改）。 */
function GrainGoalLine(state, report) {
  let victory = null;
  try { victory = GetLevel(state.meta.level).victory || null; } catch { victory = null; }
  if (!victory) return null;
  const parts = [];
  if (victory.tunnelGrainAtLeast !== undefined) {
    parts.push(`洞存粮 ≥${victory.tunnelGrainAtLeast} 担（明存粮不算数）——当前洞存 ${report.hidden}，`
      + `还差 ${Math.max(0, victory.tunnelGrainAtLeast - report.hidden)}`);
  }
  if (victory.grainAtLeast !== undefined) {
    parts.push(`存粮合计 ≥${victory.grainAtLeast} 担（明存 + 洞存）——当前 ${report.total}，`
      + `还差 ${Math.max(0, victory.grainAtLeast - report.total)}`);
  }
  return parts.length ? `胜利线：${parts.join("；")}` : null;
}

/** 存粮分账的可打印行（CLI / 网页共用同一措辞）。 */
export function GrainLines(state) {
  const report = GrainReport(state);
  const lines = [];
  const openParts = report.villages
    .filter((village) => village.grainOpen > 0)
    .map((village) => `${village.name}（${village.hexKeys.join(" / ")}）${village.grainOpen} 担`);
  lines.push(`明存粮 ${report.open} 担${openParts.length ? "：" + openParts.join("；") : "（各村已无明存粮）"}`);
  const hiddenParts = report.cells.map((cell) => `${cell.key} ${cell.grain}/${cell.cap} 担`);
  lines.push(`洞存粮 ${report.hidden} 担${hiddenParts.length ? "：" + hiddenParts.join("；") : "（尚无粮入洞）"}`);
  lines.push(`存粮合计 ${report.total} 担（明存 ${report.open} + 洞存 ${report.hidden}）；明存粮敌进村就搜得走，洞存粮须敌攻入得手才会丢`);
  const goal = GrainGoalLine(state, report);
  if (goal) lines.push(goal);
  return lines;
}

/** 地道口 / 通气孔 / 挖掘痕迹一览（暴露豆全程明牌，且不再被单位字母盖住）。 */
export function OpeningReport(state, view) {
  const derived = view || DeriveView(state);
  const allyAt = {};
  for (const unit of derived.allies) {
    (allyAt[unit.pos] = allyAt[unit.pos] || []).push(`${unit.id}${unit.layer === "under" ? "(地下)" : ""}`);
  }
  const entrances = [];
  for (const key of SortedKeys(state.tunnels.entrances)) {
    const badge = derived.hexBadges[key] && derived.hexBadges[key].entrance;
    if (!badge) continue;
    const hex = state.map.hexes[key] || {};
    const village = hex.villageId ? state.map.villages[hex.villageId] : null;
    const cell = state.tunnels.cells[key];
    entrances.push({
      key, expose: badge.expose, threshold: badge.threshold, known: badge.known, sealed: badge.sealed,
      disguise: badge.disguise || null, disguiseName: badge.disguiseName || null,
      terrain: TerrainOf(state, key) ? TerrainOf(state, key).name : "?",
      village: village ? village.name : null,
      allies: allyAt[key] || [],
      traces: hex.traces || 0,
      elev: ElevOf(state, key),
      trap: cell && cell.facility === "trapdoor" ? (cell.trapReady ? "翻板已支好" : "翻板已落下（须重修）") : null,
    });
  }
  const vents = [];
  for (const key of SortedKeys(state.tunnels.vents)) {
    const badge = derived.hexBadges[key] && derived.hexBadges[key].vent;
    if (!badge) continue;
    vents.push({ key, expose: badge.expose, threshold: badge.threshold, known: badge.known, smoked: badge.smoked });
  }
  const traces = [];
  for (const key of SortedKeys(state.map.hexes)) {
    const hex = state.map.hexes[key];
    if (hex.traces > 0) traces.push({ key, traces: hex.traces, max: CFG.tracesMax });
  }
  return { entrances, vents, traces };
}

export function OpeningLines(state, view) {
  const report = OpeningReport(state, view);
  const lines = [];
  if (!report.entrances.length) lines.push("地道口：（一个也没有——地道口要在地下用 DigEntrance 自己开）");
  for (const entry of report.entrances) {
    const status = entry.sealed ? "已封堵（重挖 2 进度可恢复）"
      : entry.known ? "已被搜出（永久暴露）"
      : `暴露豆 ${entry.expose}/${entry.threshold}`;
    lines.push(`  地道口 ${entry.key}（${entry.village ? entry.village + " " : ""}${entry.terrain}·高程${entry.elev}）${status}`
      + `${entry.disguiseName ? ` ｜ 伪装：${entry.disguiseName}${disguiseDefinitions[entry.disguise].civPassable === false ? "（群众上不去）" : ""}` : ""}`
      + `${entry.trap ? ` ｜ ${entry.trap}` : ""}`
      + `${entry.traces ? ` 本格痕迹 ${entry.traces}` : ""}`
      + `${entry.allies.length ? ` ｜ 我方在此：${entry.allies.join("、")}` : ""}`);
  }
  for (const vent of report.vents) {
    lines.push(`  通气孔 ${vent.key} ${vent.known ? "已被搜出" : `暴露豆 ${vent.expose}/${vent.threshold}`}${vent.smoked ? " · 已被灌烟（失效）" : ""}`);
  }
  if (report.traces.length) {
    lines.push("  挖掘痕迹：" + report.traces.map((entry) => `${entry.key}×${entry.traces}`).join(" "));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 地道段 / 隔断门 / 空气分区（R5 P0-1：没有这三张表，地下层就只能靠试错）
// ---------------------------------------------------------------------------

/** 「通气孔够不够」的分母：敌选烟攻的条件是「本气区通气孔数 < 地道格数 / N」。容错读取。 */
function VentPerCells() {
  const per = CFG.ventPerCellsForSmoke;
  return typeof per === "number" && per > 0 ? per : 3;
}

/** 某气区要几个通气孔，敌人的烟才用不上（ventCount ≥ size/N ⇔ ≥ ceil(size/N)）。 */
export function VentNeedFor(size) {
  return Math.ceil(size / VentPerCells());
}

/** 段的字符：未挖通=空、有门按开/关、其余用给定的方向字符。 */
function LinkChar(state, keyA, keyB, dirChar) {
  const edge = state.tunnels.edges[EdgeKey(keyA, keyB)];
  if (!edge) return " ";
  if (edge.door === "closed") return "#";
  if (edge.door === "open") return "D";
  return dirChar;
}

/** 谁现在按得动这道门：门只能由邻接该段的地下我方单位免费开合（每门每回合 1 次）。 */
function DoorOperator(state, edgeKey) {
  const ends = EdgeEnds(edgeKey);
  for (const id of SortedKeys(state.units)) {
    const unit = state.units[id];
    if (unit.side !== "ally" || unit.hp <= 0 || unit.layer !== "under") continue;
    if (ends.includes(unit.pos)) return unit.id;
  }
  return null;
}

/**
 * 空气分区一览：分区 = 经「开放门」连通的地道连通块。
 * 通气孔按分区算——关一道门就把一个区切成两个，两边各自要够数。
 */
export function AirZoneReport(state) {
  return AirZones(state).map((zone, index) => {
    const cells = [...zone].sort();
    const vents = ZoneVentCount(state, zone);
    const ventKeys = cells.filter((key) => state.tunnels.cells[key].facility === "vent");
    return {
      index: index + 1,
      cells,
      size: cells.length,
      vents,
      ventKeys,
      ventsKnown: ventKeys.filter((key) => (state.tunnels.vents[key] || {}).known).length,
      ventsSmoked: ventKeys.filter((key) => (state.tunnels.vents[key] || {}).smoked).length,
      ventNeed: VentNeedFor(cells.length),
      hasAir: ZoneHasAir(state, zone),
      entrances: ZoneEntranceKeys(state, zone),
      grain: cells.reduce((sum, key) => sum + (state.tunnels.cells[key].grain || 0), 0),
      civs: cells.reduce((sum, key) => sum + CivsInCell(state, key).length, 0),
      elevLow: cells.length ? Math.min(...cells.map((key) => ElevOf(state, key))) : null,
      elevHigh: cells.length ? Math.max(...cells.map((key) => ElevOf(state, key))) : null,
    };
  });
}

/**
 * 通气孔总账：顶栏「通气孔 3/需 4」的数据源。
 * have = 各气区里还在通风的孔（被烟灌死的不算）；need = 各气区门槛之和——两个数同口径才能比。
 * 另给 unknown = 尚未被敌搜出的孔数（勋记「换气」按这个算，与通风与否是两回事）。
 */
export function VentSummary(state) {
  const zones = AirZoneReport(state);
  return {
    have: zones.reduce((sum, zone) => sum + zone.vents, 0),
    need: zones.reduce((sum, zone) => sum + zone.ventNeed, 0),
    unknown: VentCount(state),
    total: SortedKeys(state.tunnels.vents).length,
    zones,
    perCells: VentPerCells(),
  };
}

/**
 * 地道段一览：逐条列出已挖通的段（哪两格通着），并标明每道隔断门是开是关。
 * 「地道未挖通或门已关闭」这条报错以前无处可查，这张表就是它的答案。
 */
export function TunnelLinkReport(state) {
  const segments = [];
  for (const edgeKey of SortedKeys(state.tunnels.edges)) {
    const edge = state.tunnels.edges[edgeKey];
    const [a, b] = EdgeEnds(edgeKey);
    const door = edge.door || null;
    segments.push({
      edge: edgeKey, a, b, door,
      blocked: door === "closed",
      toggledThisTurn: (edge.toggledTurn || 0) >= state.meta.turn,
      operator: door ? DoorOperator(state, edgeKey) : null,
      elevA: ElevOf(state, a), elevB: ElevOf(state, b),
    });
  }
  const doors = segments.filter((segment) => segment.door);
  return {
    segments,
    doors,
    doorsOpen: doors.filter((segment) => segment.door === "open").length,
    doorsClosed: doors.filter((segment) => segment.door === "closed").length,
    zones: AirZoneReport(state),
  };
}

/** 地道段 + 隔断门 + 空气分区的可打印行（CLI 与网页共用同一措辞）。 */
export function TunnelLinkLines(state) {
  const report = TunnelLinkReport(state);
  const lines = [];
  if (!report.segments.length) {
    lines.push("  （一条段也没有挖通——地下的每个窖各自孤立，人进去就出不来）");
  }
  for (const segment of report.segments) {
    const elev = segment.elevA === segment.elevB
      ? `高程${segment.elevA}`
      : `高程${segment.elevA}→${segment.elevB}`;
    if (!segment.door) {
      lines.push(`  ${segment.a} — ${segment.b}  已挖通 · 无门（${elev}）`);
      continue;
    }
    const open = segment.door === "open";
    const order = segment.operator
      ? `{"type":"ToggleDoor","unit":"${segment.operator}","edge":"${segment.edge}"}`
      : `需先让一个单位下到 ${segment.a} 或 ${segment.b}`;
    lines.push(`  ${segment.a} — ${segment.b}  隔断门【${open ? "开着" : "关着"}】`
      + `（${elev}）→ ${open ? "现在人、烟、水都过得去；关上即挡烟挡水" : "现在人、烟、水都过不去"}`
      + `${segment.toggledThisTurn ? " ｜ 本回合已开合过，下回合才能再动" : ` ｜ 免费开合：${order}`}`);
  }
  lines.push(`  （共 ${report.segments.length} 段；隔断门 ${report.doors.length} 道：开 ${report.doorsOpen} / 关 ${report.doorsClosed}。`
    + "地图上段画在格与格之间：- | / \\ 已挖通、D 门开着、# 门关着、空白 未挖通）");
  lines.push("空气分区（关上一道门就把网切成几间屋子；通气孔按分区算）：");
  if (!report.zones.length) lines.push("  （地下还没有地道格）");
  for (const zone of report.zones) {
    lines.push(`  区${zone.index}：${zone.cells.join(" ")}（${zone.size} 格，高程 ${zone.elevLow}~${zone.elevHigh}）`
      + ` ｜ 通气孔 ${zone.vents}/需 ${zone.ventNeed}${zone.vents >= zone.ventNeed ? "（够——敌工兵的烟对本区用不上）" : `（还差 ${zone.ventNeed - zone.vents}，敌可对本区放烟）`}`
      + `${zone.ventsKnown ? `（其中 ${zone.ventsKnown} 处已被敌搜出——照样通风，但勋记不认）` : ""}`
      + `${zone.ventsSmoked ? `（另有 ${zone.ventsSmoked} 处被灌了烟，已失效）` : ""}`
      + ` ｜ 通风：${zone.hasAir ? "有" : "无（区内每人每回合憋闷 +1）"}`
      + ` ｜ 出口 ${zone.entrances.length ? zone.entrances.join(" ") : "无（一个未封的口都没有）"}`
      + `${zone.civs ? ` ｜ 群众 ${zone.civs} 批` : ""}${zone.grain ? ` ｜ 洞存粮 ${zone.grain} 担` : ""}`);
  }
  return lines;
}

const victoryLabels = {
  surviveTurn: (v) => `撑到 T${v}`,
  civSafeAtLeast: (v) => `群众保全 ≥${v} 批`,
  civSafeRatioAtLeast: (v) => `群众保全率 ≥${Math.round(v * 100)}%`,
  villagesAtLeast: (v) => `存活村 ≥${v} 处`,
  grainAtLeast: (v) => `存粮 ≥${v} 担`,
  tunnelGrainAtLeast: (v) => `洞存粮 ≥${v} 担`,
  openGrainAtLeast: (v) => `明存粮 ≥${v} 担`,
  woundedAtLeast: (v) => `伤员 ≥${v} 批`,
  combatUnitsAtLeast: (v) => `战斗单位 ≥${v}`,
};

/**
 * 胜负目标一行（关卡数据驱动，数值改了这行自动跟着改）。
 * 顺手把区队部的格号写进去——L2 的即败条件绑在它身上，玩家得知道它在哪。
 */
export function ObjectiveLine(state) {
  let level = null;
  try { level = GetLevel(state.meta.level); } catch { return null; }
  const goals = [];
  for (const [key, value] of Object.entries(level.victory || {})) {
    if (victoryLabels[key]) goals.push(victoryLabels[key](value));
  }
  let hqText = "";
  for (const id of SortedKeys(state.map.villages)) {
    const village = state.map.villages[id];
    if (village.hasHq) hqText = `${village.name} ${village.hexKeys.join(" ")}`;
  }
  const defeats = [];
  const defeat = level.defeat || {};
  if (defeat.hqOccupiedTurns !== undefined) {
    defeats.push(`区队部（${hqText || "位置见地图“部”标记"}）被驻占 ${defeat.hqOccupiedTurns} 回合`);
  }
  if (defeat.popRatioBelow !== undefined) defeats.push(`人口跌破 ${Math.round(defeat.popRatioBelow * 100)}%`);
  defeats.push("战斗单位全灭");
  let text = `${level.name}（${level.hardEndTurn} 回合）：${goals.join("、") || "见简报"}`;
  text += `｜即败：${defeats.join(" / ")}`;
  if (hqText && defeat.hqOccupiedTurns === undefined) text += `｜区队部：${hqText}`;
  return text;
}

/** 关键地点：村庄格、区队部所在（即败条件与之绑定，必须给坐标）。 */
export function LandmarkLines(state) {
  const lines = [];
  for (const id of SortedKeys(state.map.villages)) {
    const village = state.map.villages[id];
    lines.push(`  ${village.name}${village.hasHq ? "【区队部】" : ""} 格 ${village.hexKeys.join(" / ")}`
      + ` ｜ 地面群众 ${VillagePop(state, id)}/${village.popStart} 批 ｜ 明存粮 ${village.grainOpen} 担 ｜ 组织度 ${village.organize}`
      + (village.burnedHexes ? ` ｜ 被焚 ${village.burnedHexes} 处` : ""));
  }
  for (const entry of GetLevel(state.meta.level).landmarks || []) {
    lines.push(`  ${entry.name} ${entry.key}——${entry.note}`);
  }
  return lines;
}

/**
 * 群众一览（用户明确要求的第二条主线）：每一批的类型、在哪儿、有没有人带路、恐慌到几分。
 * 这张表是「带领百姓躲避」在 CLI 上的全部界面。
 */
export function CivLines(state, view) {
  const derived = view || DeriveView(state);
  const summary = derived.civSummary;
  const lines = [];
  lines.push(`群众 ${summary.safe}/${summary.total} 批保全（保全率 ${(summary.ratio * 100).toFixed(0)}%）`
    + ` ｜ 地面 ${summary.inVillage} ｜ 地道 ${summary.inTunnel} ｜ 无人带路 ${summary.unescorted}`
    + ` ｜ 被抓 ${summary.captured} ｜ 罹难 ${summary.dead} ｜ 曾被逼出地面 ${summary.forcedOut}`);
  if (!CivGuidanceOn(state)) {
    lines.push("  （本幕地窖互不相连：群众进了窖就只能待着，没有「带路」这回事——恐慌也就无从谈起）");
  }
  // 地面群众按村给真实格号，并点名哪些村格上现在踩着看得见的敌军（R5 P1：光写村名判断不了贴不贴身）。
  const enemyAt = {};
  for (const foe of derived.visibleEnemies || []) {
    (enemyAt[foe.pos] = enemyAt[foe.pos] || []).push(foe.name || foe.type);
  }
  // 逐批的地面格号优先读 state.civs[id].hex（引擎新加的字段；缺席时退回本村格列表，不编造）
  const CivHex = (civ) => {
    const raw = (state.civs || {})[civ.id];
    return raw && typeof raw.hex === "string" && raw.hex ? raw.hex : null;
  };
  const villageHexText = {};
  for (const id of SortedKeys(state.map.villages)) {
    const village = state.map.villages[id];
    const keys = village.hexKeys || [];
    villageHexText[id] = keys.join(" ");
    const onGround = derived.civs.filter((civ) => civ.loc === "village" && civ.at === id);
    if (!onGround.length) continue;
    const spread = {};
    for (const civ of onGround) {
      const key = CivHex(civ);
      if (key) spread[key] = (spread[key] || 0) + 1;
    }
    const placed = Object.values(spread).reduce((sum, n) => sum + n, 0);
    const where = placed
      ? Object.keys(spread).sort().map((key) => `${key}×${spread[key]} 批`).join("、")
        + (placed < onGround.length ? `；另 ${onGround.length - placed} 批在村里（未落到具体格）` : "")
      : `村格 ${keys.join(" / ")}（本批次未记具体格）`;
    const hot = keys.filter((key) => enemyAt[key]);
    lines.push(`  ${village.name} 地面群众 ${onGround.length} 批＠${where}`
      + (hot.length
        ? ` ｜ ⚠ 敌已在村格 ${hot.map((key) => `${key}（${enemyAt[key].join("、")}）`).join(" ")}`
          + (Object.keys(spread).some((key) => enemyAt[key]) ? "——有群众正贴着敌人" : "")
        : " ｜ 村格上暂无可见敌军"));
  }
  for (const civ of derived.civs) {
    if (civ.loc === "lost") {
      lines.push(`  ${civ.id} ${civ.kindName}：已${civ.fate === "dead" ? "罹难" : "被抓"}（入代价簿）`);
      continue;
    }
    const hex = CivHex(civ);
    const where = civ.loc === "village"
      ? `地面 ${hex || `· ${(state.map.villages[civ.at] || {}).name || civ.at}（村格 ${villageHexText[civ.at] || "?"}）`}`
        + (hex ? ` · ${(state.map.villages[civ.at] || {}).name || civ.at}` : "")
      : `地道 ${civ.at}`;
    const escort = civ.loc === "cell" ? (civ.escorted ? "有人带路" : "无人带路") : "—";
    const danger = civ.loc === "village" && hex && enemyAt[hex]
      ? ` ｜ ⚠ 同格有敌：${enemyAt[hex].join("、")}` : "";
    lines.push(`  ${civ.id} ${civ.kindName}（速度 ${civ.speed} 格/回合，占 ${civ.slots} 铺）＠${where}`
      + ` ｜ ${escort} ｜ 恐慌 ${civ.panic}/${civ.panicMax}${danger}`);
  }
  return lines;
}

/** 幕次卡：剧情标题 + 三行「这一幕你要学会什么」+ 本幕新解锁（HUD 与 CLI 共用同一份数据）。 */
export function ActCardLines(state, view) {
  const derived = view || DeriveView(state);
  const act = derived.act;
  const lines = [`【第${act.act}幕《${act.name}》】${act.subtitle}（共 ${act.maxTurns} 回合）`];
  lines.push("这一幕你要学会什么：");
  for (const lesson of act.lessons) lines.push(`  ${lesson}`);
  if (act.unlocked.length) {
    lines.push("本幕新解锁：");
    for (const entry of act.unlocked) lines.push(`  · ${entry.name}——${entry.note}`);
  }
  return lines;
}

/** 幕目标进度条（常显目标行：当前多少、还差多少）。 */
export function ObjectiveProgressLines(state, view) {
  const derived = view || DeriveView(state);
  return derived.objectiveProgress.map((row) =>
    `  ${row.ok ? "✓" : "·"} ${row.label} ${row.have}/${row.need}${row.ok ? "" : `（还差 ${row.short}）`}`);
}

/** 终局复盘三段：付出了什么代价 / 学到了什么 / 解锁了什么。 */
export function DebriefLines(state, view) {
  const derived = view || DeriveView(state);
  if (!derived.debrief) return [];
  const result = derived.result;
  const lines = ["【复盘】"];
  lines.push(`  付出的代价：${derived.debrief.cost}`);
  const ledgerParts = Object.keys(TEXT.ledgerNames)
    .map((key) => `${TEXT.ledgerNames[key]} ${derived.debrief.ledger[key] || 0}`);
  lines.push(`    代价簿：${ledgerParts.join(" ｜ ")}`);
  lines.push(`    群众保全：${result.civSafe}/${result.civTotal} 批（${(result.civRatio * 100).toFixed(0)}%）`
    + `；曾被逼出地面 ${result.civForcedOut} 批`);
  lines.push(`  学到了什么：${derived.debrief.learned}`);
  lines.push(`  解锁了什么：${derived.debrief.unlocked}`);
  if (result.nextId) lines.push(`    下一幕：${result.nextId}《${result.nextName}》`);
  return lines;
}

/** 敌纵队意图（只取 DeriveView 给出的可见部分，绝不泄漏视野外情报）。 */
export function IntentLines(state, view) {
  const derived = view || DeriveView(state);
  const roleNames = { march: "行军/征粮", mobile: "机动队", sapper: "工兵队", scout: "斥候", spy: "便衣" };
  const lines = [];
  for (const arrow of derived.intentArrows) {
    if (arrow.mark === "?") {
      lines.push(`  纵队 ${arrow.columnId}＠${arrow.at || "?"}：正在响应目击，去向未明（?）`);
      continue;
    }
    const task = roleNames[arrow.task] || arrow.task || "行动";
    lines.push(`  纵队 ${arrow.columnId}＠${arrow.at}（${task}）下一步：${arrow.hexes.length ? arrow.hexes.join(" → ") : "原地"}`);
  }
  return lines;
}

/** 电报文案：波次入境预告只承诺「有敌入境」，不承诺你一定看得见（R2 修正）。 */
export function TelegraphText(telegraph) {
  if (!telegraph || !telegraph.text) return "";
  if (telegraph.kind === "wave") {
    return `${telegraph.text}——入境点若在你视野之外，次回合不会有可见事件播报，请自行派人去看`;
  }
  return telegraph.text;
}

/**
 * 单条勋记条件 → 「实测值 vs 门槛」的一句话。
 * 条件表由关卡数据（def.need / def.anyOf）驱动，关卡改了数值这里自动跟着变；
 * 认不出的条件键退回关卡自己的文案，绝不编造。
 */
function MedalFact(state, key, value, earned) {
  const report = GrainReport(state);
  const ledger = state.ledger || {};
  const ledgerParts = Object.keys(TEXT.ledgerNames)
    .filter((name) => (ledger[name] || 0) > 0)
    .map((name) => `${TEXT.ledgerNames[name]} ${ledger[name]}`);
  switch (key) {
    case "tunnelGrain": case "tunnelGrainAtLeast":
      return `洞存粮 ${report.hidden} 担（需 ≥${value}）`;
    case "grain": case "grainTotal": case "grainAtLeast":
      return `存粮合计 ${report.total} 担 = 明存 ${report.open} + 洞存 ${report.hidden}（需 ≥${value}）`;
    case "openGrain": case "openGrainAtLeast":
      return `明存粮 ${report.open} 担（需 ≥${value}）`;
    case "ledgerEmpty":
      return `代价簿${ledgerParts.length ? "：" + ledgerParts.join("、") : "全空"}`;
    case "civLedgerAtMost":
      return `群众被抓 ${ledger.civCaptured || 0} 批、罹难 ${ledger.civDead || 0} 批（需合计 ≤${value}）`;
    case "housesBurnedAtMost":
      return `房屋被焚 ${ledger.housesBurned || 0} 处（需 ≤${value}）`;
    case "alliesLostAtMost":
      return `战斗单位阵亡 ${(state.score && state.score.alliesLost) || 0}（需 ≤${value}）`;
    case "grainSeizedAtMost":
      return `粮秣被夺 ${ledger.grainSeized || 0} 担（需 ≤${value}）`;
    case "civLossAtMost":
      return `群众被抓 ${ledger.civCaptured || 0} 批、罹难 ${ledger.civDead || 0} 批（需合计 ≤${value}）`;
    case "expelled":
      return `敌${state.wave.expelled ? "被逼退（行动力池耗尽，提前收队）" : "按期收队，未被逼退"}`;
    case "wounded": case "woundedAtLeast":
      return `伤员保全 ${WoundedTotal(state)} 批（需 ≥${value}）`;
    case "trunkIntact": case "trunk":
      return `枣林庄—石槽村地道主干：${earned ? "贯通且无被毁段" : "未贯通，或有段被毁"}`;
    // —— R5 P1：以下几条以前认不出，只能退回复述条件（「○ 换气——通气孔不少于 2 处：通气孔不少于 2 处」）——
    case "civSafeAtLeast":
      return `群众保全 ${CivSafeCount(state)}/${CivTotal(state)} 批（需 ≥${value}）`;
    case "civSafeRatioAtLeast":
      return `群众保全率 ${(CivTotal(state) ? (CivSafeCount(state) / CivTotal(state)) * 100 : 0).toFixed(0)}%`
        + `（需 ≥${(value * 100).toFixed(0)}%）`;
    case "civLostAtMost":
      return `群众损失 ${CivTotal(state) - CivSafeCount(state)} 批（需 ≤${value}）`;
    case "largestNetworkAtLeast":
      return `最大地道连通块 ${LargestNetworkSize(state)} 格（需 ≥${value}）`;
    case "villagesLinkedAtLeast":
      return `同一片地道网串起 ${VillagesLinked(state)} 个村（需 ≥${value}）`;
    case "liveEntrancesAtLeast":
      return `未被搜出的地道口 ${LiveEntranceCount(state)} 个（需 ≥${value}）`;
    case "disguisedAtLeast":
      return `伪装口 ${DisguisedEntranceCount(state)} 个（需 ≥${value}）`;
    case "ventsAtLeast":
      return `通气孔 ${VentCount(state)} 处（需 ≥${value}）`;
    case "fightpostsUsedAtLeast": {
      const used = (state.score && state.score.fightpostsUsed) || [];
      return `开过火的不同射击孔 ${used.length} 处（需 ≥${value}）${used.length ? `：${used.join(" ")}` : ""}`;
    }
    case "forcedOutAtMost":
      return `被烟/水/憋闷逼出地面的群众 ${(state.score && state.score.civForcedOut) || 0} 批（需 ≤${value}）`;
    case "combatUnitsAtLeast": {
      const alive = SortedKeys(state.units)
        .filter((id) => state.units[id].side === "ally" && state.units[id].hp > 0
          && (unitDefinitions[state.units[id].type] || {}).atk > 0).length;
      return `战斗单位 ${alive} 支（需 ≥${value}）`;
    }
    case "surviveTurn":
      return `打到 T${state.meta.turn}（需撑到 T${value}）`;
    default:
      return null;
  }
}

/** 勋记逐枚说明：名称 + 条件 + 是否达成 + 实测归因（终局结算与网页共用）。 */
export function MedalReport(state) {
  let level = null;
  try { level = GetLevel(state.meta.level); } catch { level = null; }
  const defs = (level && level.medals) || [];
  const medals = state.medals || (state.result && state.result.medals) || [];
  const ledger = state.ledger || {};
  const ledgerParts = Object.keys(TEXT.ledgerNames)
    .filter((key) => (ledger[key] || 0) > 0)
    .map((key) => `${TEXT.ledgerNames[key]} ${ledger[key]}`);
  const won = !!(state.result && state.result.won);
  const report = GrainReport(state);
  return defs.map((def, index) => {
    const earned = !!medals[index];
    const facts = [];
    for (const [key, value] of Object.entries(def.need || {})) {
      const fact = MedalFact(state, key, value, earned);
      if (fact) facts.push(fact);
    }
    const anyFacts = [];
    for (const [key, value] of Object.entries(def.anyOf || {})) {
      const fact = MedalFact(state, key, value, earned);
      if (fact) anyFacts.push(fact);
    }
    if (anyFacts.length) facts.push(anyFacts.join(" 或 ") + "（两者满足其一即可）");
    // 关卡没给结构化条件时的兜底：按旧键名给实测归因
    if (!facts.length) {
      if (/^grain\d+$/.test(def.key || "")) {
        facts.push(`终局存粮 ${report.total} 担（明存 ${report.open} + 洞存 ${report.hidden}），门槛 ${def.key.replace(/\D/g, "")}`);
      } else if (def.key === "zeroCost") {
        facts.push(`代价簿${ledgerParts.length ? "：" + ledgerParts.join("、") : "全空"}；战斗单位阵亡 ${(state.score && state.score.alliesLost) || 0}`);
      } else if (def.key === "expelOrLow") {
        facts.push(`敌${state.wave.expelled ? "被逼退" : "未被逼退"}；粮秣被夺 ${ledger.grainSeized || 0} 担`);
      } else if (def.key === "wounded") {
        facts.push(`伤员保全 ${WoundedTotal(state)} 批`);
      } else if (def.key === "trunk") {
        facts.push(`地道主干${earned ? "贯通且无被毁段" : "未贯通，或有段被毁"}`);
      } else if (def.text) {
        facts.push(def.text);
      }
    }
    let note = facts.join("；");
    if (!won) note += "；本局失利，三枚勋记一律不计";
    return { key: def.key, name: def.name, text: def.text, earned, note };
  });
}

export function MedalLines(state) {
  const rows = MedalReport(state);
  const lines = [];
  for (const row of rows) {
    lines.push(`  ${row.earned ? "●" : "○"} ${row.name}——${row.text}：${row.note}`);
  }
  const count = rows.filter((row) => row.earned).length;
  lines.push(`  （勋记 ${count}/3 → 3 枚甲、2 枚乙、≤1 枚丙；失利一律丁。歼敌不计分。）`);
  return lines;
}

// ---------------------------------------------------------------------------
// 动作分类与「为什么这条动作不在列表里」诊断
// ---------------------------------------------------------------------------

const mainActionTypes = new Set(["Dig", "DigEntrance", "DigFacility", "DigDoor", "Disguise", "GuideCivs",
  "CoverTraces", "BreakRoad", "Ambush", "Hide", "Attack", "Feint", "HideGrain", "MoveCivs",
  "Organize", "Collapse", "Rest"]);

/** main=主动作（用掉即本单位本回合结束）｜move=只花 MP｜free=免费。 */
export function ActionKind(action) {
  if (!action || !action.type) return "free";
  if (action.type === "ToggleDoor") return "free";
  if (action.type === "Move") return "move";
  if (action.type === "UseEntrance") return action.dive ? "main" : "move";
  return mainActionTypes.has(action.type) ? "main" : "free";
}

export const actionKindNames = Object.freeze({
  main: "主动作（每单位每回合只能用 1 个，用后该单位本回合结束）",
  move: "移动类（只花 MP，不占主动作）",
  free: "免费动作（不花 MP 也不占主动作）",
});

/**
 * 常见「动作不在 legal 列表里」的原因提示（只读，措辞按真实原因给出）。
 * 说明：这里是解释器不是裁判——能不能做一律以 LegalActions 输出为准。
 */
export function ActionHints(state, unitId, legalActions) {
  const unit = state.units[unitId];
  if (!unit || unit.side !== "ally" || unit.hp <= 0) return [];
  const have = new Set((legalActions || []).map((action) => action.type));
  const def = UnitDef(unit);
  const hints = [];
  const hex = state.map.hexes[unit.pos];
  const terrain = TerrainOf(state, unit.pos);
  const entrance = state.tunnels.entrances[unit.pos];
  const cell = state.tunnels.cells[unit.pos];
  const village = hex && hex.villageId ? state.map.villages[hex.villageId] : null;
  const digPower = CFG.digPower[unit.type] || 0;

  if (unit.acted && !unit.freeMove) {
    hints.push("本单位的主动作已经用掉了——每单位每回合只有 1 个主动作，其余动作要等下回合。");
    return hints;
  }
  if (unit.mp <= 0) hints.push("移动力已耗尽（MP 0），本回合不能再移动或上下地道口。");

  // 伏击（设伏位三选一：可隐蔽地形 / 地道口格 / 挖得动散兵坑的可挖地形）
  if (!have.has("Ambush")) {
    const foxholeOk = (CFG.foxholeMinDig === undefined || digPower >= CFG.foxholeMinDig)
      && digPower > 0 && !!(terrain && terrain.diggable);
    const otherAmbusher = state.map.hexes[unit.pos] && AllyAmbusherAt(state, unit.pos, unit.id);
    if (def.atk <= 0) hints.push(`Ambush 不可用：${def.name}攻击力为 0，不能设伏。`);
    else if (unit.layer !== "surface") hints.push("Ambush 不可用：设伏须在地面（地下请改用枪眼 fightpost 开火）。");
    else if (unit.stance === "ambush") hints.push("Ambush 不可用：本单位已经处于伏击态（伏击是持续状态，不必每回合重按）。");
    else if (state.resources.ammo < CFG.ammoPerAttack) hints.push("Ambush 不可用：弹药池已空。");
    else if (otherAmbusher) {
      hints.push(`Ambush 不可用：${unit.pos} 已有 ${otherAmbusher} 在设伏——同一格同时只容 ${CFG.ambushPerHex ?? 1} 处伏点，换一格。`);
    } else if (!(terrain && terrain.hide) && !(entrance && !entrance.sealed) && !foxholeOk) {
      hints.push(`Ambush 不可用：${unit.pos} 是${terrain ? terrain.name : "该地形"}——既藏不住人、本格没有地道口，`
        + `${def.name}也挖不动散兵坑。设伏位只有三种：可隐蔽地形（村庄/农田/树林/坟地）、地道口格、`
        + "或者挖得动散兵坑的可挖地形（会留 1 点痕迹）。");
    }
  }
  // 野战攻击
  if (!have.has("Attack") && !def.fieldAttack) {
    hints.push(`Attack 不可用：${def.name}不能野战对射，只能靠 Ambush 伏击或在枪眼格开火。`);
  }
  // 隐蔽
  if (!have.has("Hide")) {
    if (unit.layer !== "surface") hints.push("Hide 不可用：地下单位敌军本来就看不见，不需要隐蔽。");
    else if (unit.stance === "hidden") hints.push("Hide 不可用：本单位已经处于隐蔽态。");
    else if (!(terrain && terrain.hide)) {
      hints.push(`Hide 不可用：${unit.pos} 是${terrain ? terrain.name : "该地形"}，藏不住人——`
        + "只有村庄/农田（青纱帐）/树林/坟地能隐蔽。");
    }
  }
  // 掩土（既减痕迹也减暴露豆，但每人每局有次数上限）
  if (!have.has("CoverTraces")) {
    const capPerUnit = CFG.coverUsesPerUnit;
    if (unit.layer !== "surface") hints.push("CoverTraces 不可用：掩土要在地面本格做（先 UseEntrance 上来）。");
    else if (!hex || (hex.traces || 0) <= 0) hints.push("CoverTraces 不可用：本格没有挖掘痕迹可掩。");
    else if (capPerUnit !== undefined && (unit.coverUses || 0) >= capPerUnit) {
      hints.push(`CoverTraces 不可用：本单位掩土次数已用尽（每人每役 ${capPerUnit} 次）。`);
    }
  }
  // 破路 / 塌口
  if (!have.has("BreakRoad") && unit.layer === "surface") {
    if (!hex || !hex.road) hints.push("BreakRoad 不可用：本格不是路格。");
    else if (hex.roadBroken) hints.push("BreakRoad 不可用：本格的路已经破过了。");
    else if (digPower <= 0) hints.push(`BreakRoad 不可用：${def.name}挖掘力为 0，破不了路。`);
  }
  if (!have.has("Collapse") && (!entrance || entrance.sealed)) {
    hints.push("Collapse 不可用：本格没有可自毁的地道口（塌口只能塌自己脚下这个口）。");
  }
  // 上下地道口
  if (!have.has("UseEntrance")) {
    if (!entrance || entrance.sealed) hints.push("UseEntrance 不可用：本格没有可用的地道口——口要在地下用 DigEntrance 自己开。");
    else if (unit.mp < 1) hints.push("UseEntrance 不可用：上下口要花 1 MP，本单位 MP 已耗尽。");
    else if (unit.layer === "surface" && !cell) hints.push("UseEntrance 不可用：口下面还没有地道格。");
  }
  // 挖掘
  if (!have.has("Dig") && !have.has("DigEntrance") && !have.has("DigFacility")) {
    if (digPower <= 0) hints.push(`挖掘类动作不可用：${def.name}挖掘力为 0（民兵 2 / 游击 1 / 联络员 0）。`);
    else if (unit.layer !== "under") hints.push("挖掘类动作不可用：施工须在地下层——先在地道口用 UseEntrance 下地。");
    else if (!cell) hints.push("挖掘类动作不可用：本格脚下没有地道格。");
  }
  if (unit.layer === "under" && cell && cell.facility && !have.has("DigFacility")) {
    const built = facilityDefinitions[cell.facility];
    hints.push(`DigFacility 不可用：${unit.pos} 已修有「${built ? built.name : cell.facility}」——一格地道只能修一种设施，要别的设施得换格。`);
  }
  if (unit.layer === "under" && entrance && !entrance.sealed && !have.has("DigEntrance")) {
    hints.push("DigEntrance 不可用：本格已经有地道口了（一格一个口）。");
  }
  // 藏粮
  if (!have.has("HideGrain")) {
    if (!village) hints.push("HideGrain 不可用：本单位不在村庄格。");
    else if (village.grainOpen <= 0) hints.push(`HideGrain 不可用：${village.name}已经没有明存粮了。`);
    else if (!VillageStorageEntrances(state, hex.villageId).length) {
      const anyStorage = SortedKeys(state.tunnels.cells).some((key) => state.tunnels.cells[key].facility === "storage");
      hints.push(anyStorage
        ? `HideGrain 不可用：村 1 格内的地道口连不到还有余量的储粮洞（本幕每洞上限 ${StorageCapOf(state)} 担，多半是装满了）。`
        : "HideGrain 不可用：地下还没有储粮洞——先在地道格上 DigFacility storage。");
    }
  }
  // 转移群众：区分「没有藏人室」与「铺位满了」
  if (!have.has("MoveCivs")) {
    if (!village) hints.push("MoveCivs 不可用：本单位不在村庄格。");
    else if (VillagePop(state, hex.villageId) <= 0) hints.push(`MoveCivs 不可用：${village.name}地面上已经没有群众了。`);
    else hints.push(`MoveCivs 不可用：${ShelterDiagnosis(state, unit.pos)}`);
  }
  // 带路（第二幕起）：说清楚「同格才带得动、一次带几批、走得了几格」
  if (!have.has("GuideCivs")) {
    if (!ActionUnlocked(state, "GuideCivs")) {
      hints.push("GuideCivs 不可用：本幕地窖互不相连，群众进去就只能待着——「带路」要到第二幕才开放。");
    } else if (unit.layer !== "under") {
      hints.push("GuideCivs 不可用：带路要在地道里（先 UseEntrance 下地，走到群众那一格）。");
    } else if (!CivsInCell(state, unit.pos).length) {
      hints.push("GuideCivs 不可用：本格没有等着带路的群众——带路必须与群众同格。");
    } else if (unit.mp <= 0) {
      hints.push("GuideCivs 不可用：MP 已耗尽（带路要跟着一起走）。");
    } else {
      hints.push(`GuideCivs 不可用：一步之内没有装得下的地道格。${UnitDef(unit).name}一次带 ${CFG.civ.guideCap[unit.type] || 0} 批，`
        + "最慢的一批（老弱/伤员）一回合只走 1 格。");
    }
  }
  // 伪装口（第二幕起）
  if (!have.has("Disguise") && ActionUnlocked(state, "Disguise")) {
    if (unit.layer !== "surface") hints.push("Disguise 不可用：伪装口要在地面做（灶台、水井、炕洞都在屋里屋外）。");
    else if (!entrance || entrance.sealed) hints.push("Disguise 不可用：本格没有可伪装的地道口。");
    else if (entrance.known) hints.push("Disguise 不可用：这个口已经被敌人记下了，伪装也没用。");
    else if (entrance.disguise) {
      hints.push(`Disguise 不可用：这个口已经做成了「${(disguiseDefinitions[entrance.disguise] || {}).name}」。`);
    } else if (digPower <= 0) hints.push(`Disguise 不可用：${def.name}挖掘力为 0，做不了这活。`);
  }
  // 组织（组织度的作用见 ActionNotes；这里只说为什么按不了）
  if (!have.has("Organize") && ActionUnlocked(state, "Organize")) {
    if (!village) hints.push("Organize 不可用：组织要在村庄格上做（本单位不在任何村格）。");
    else if (village.organize >= (CFG.organizeMax ?? 2)) {
      hints.push(`Organize 不可用：${village.name}组织度已到上限 ${CFG.organizeMax ?? 2}`
        + "（1 级=平静期自动藏粮+哨网；2 级=村 1 格内工地每回合免费 +1 进度）。");
    }
  }
  // 隔断门（第四幕起）：门是免费动作，但要人在门边的地道里，且每门每回合只动一次
  if (!have.has("ToggleDoor") && ActionUnlocked(state, "ToggleDoor")) {
    const doors = TunnelLinkReport(state).doors;
    if (!doors.length) hints.push("ToggleDoor 不可用：全网一道隔断门都还没装（先在段上 DigDoor，1 进度）。");
    else if (unit.layer !== "under") hints.push("ToggleDoor 不可用：门要在地道里开合（先 UseEntrance 下地，走到门边那一格）。");
    else if (!doors.some((segment) => EdgeEnds(segment.edge).includes(unit.pos))) {
      hints.push(`ToggleDoor 不可用：${unit.pos} 不邻接任何隔断门——现有的门在 `
        + `${doors.map((segment) => segment.edge).join("、")}。`);
    } else hints.push("ToggleDoor 不可用：邻接的门本回合已经开合过了（每门每回合只动一次）。");
  }
  // 本幕未解锁的动作：明说「不是你不会，是这一幕还没到」
  for (const type of ["Dig", "DigEntrance", "DigFacility", "DigDoor", "Ambush", "Attack", "Disguise"]) {
    if (!ActionUnlocked(state, type)) {
      hints.push(`${type} 不可用：第${GetLevel(state.meta.level).act}幕《${GetLevel(state.meta.level).name}》还没开放这一手。`);
    }
  }
  return hints;
}

/**
 * 「这些动作到底有什么用」速查（R5 P0-3：组织度以前全作没有一处解释）。
 * 只讲已解锁、且与该单位当前处境有关的那几条，避免变成第二份说明书。
 */
export function ActionNotes(state, unitId, legalActions) {
  const unit = state.units[unitId];
  if (!unit || unit.side !== "ally" || unit.hp <= 0) return [];
  const have = new Set((legalActions || []).map((action) => action.type));
  const notes = [];
  const hex = state.map.hexes[unit.pos];
  const village = hex && hex.villageId ? state.map.villages[hex.villageId] : null;

  if (village && ActionUnlocked(state, "Organize")) {
    const max = CFG.organizeMax ?? 2;
    const need = CFG.organizeNeed ?? 2;
    const freeRadius = CFG.organizeFreeDigRadius ?? 1;
    const stopRange = CFG.organizeStopEnemyRange ?? 2;
    const auto = CFG.autoHidePerTurn ?? 1;
    notes.push(`Organize（组织）＝把村子发动起来：${village.name}现在 ${village.organize}/${max} 级`
      + `（进度 ${village.organizeProgress || 0}/${need}，每按一次 +1 进度，占掉整个主动作）。`);
    notes.push(`  · 到 1 级：平静期本村每回合自动藏 ${auto} 担粮进储粮洞（须村下有连通的储粮洞），`
      + `并且村 2 格内的敌纵队意图常显（哨网——不用派人去看）。`
      + `${village.organize >= 1 ? "【本村已生效】" : "【本村尚未达到】"}`);
    notes.push(`  · 到 2 级：村 ${freeRadius} 格内每回合免费给一个工地 +1 进度（群众来帮工），`
      + `敌进到村 ${stopRange} 格内即停。${village.organize >= 2 ? "【本村已生效】" : "【本村尚未达到】"}`);
    if (village.organize >= 1 && !village.hexKeys.some((key) => StorageCellsUnder(state, key).length)) {
      notes.push("  · 注意：本村地下还没有连通的储粮洞，1 级的「自动藏粮」现在一担也藏不进去。");
    }
  }
  if (have.has("ToggleDoor")) {
    const report = TunnelLinkReport(state);
    const mine = report.doors.filter((segment) => EdgeEnds(segment.edge).includes(unit.pos));
    for (const segment of mine) {
      notes.push(`ToggleDoor ${segment.edge}：这道门现在【${segment.door === "open" ? "开着" : "关着"}】，`
        + `按下去会变成【${segment.door === "open" ? "关着" : "开着"}】。`
        + "关上＝挡烟、挡水、把气区切成两半（两边各自要够通气孔）；开着＝人和烟水都过得去。");
    }
  }
  const vents = VentSummary(state);
  if (FacilityUnlocked(state, "vent") && vents.zones.length) {
    notes.push(`通气孔：全网 ${vents.have} 个／按分区合计需 ${vents.need} 个`
      + `（每个气区要 ≥ 该区地道格数 ÷ ${vents.perCells}，凑不够敌工兵就能对那个区放烟）。`
      + "扩网会把比例拉低——多挖两格，就得多修一个孔。");
  }
  return notes;
}

/** 本格是否已经有别的我方单位在设伏（同格伏点唯一）。 */
function AllyAmbusherAt(state, pos, exceptId) {
  for (const id of SortedKeys(state.units)) {
    const unit = state.units[id];
    if (unit.side !== "ally" || unit.hp <= 0 || unit.id === exceptId) continue;
    if (unit.pos === pos && unit.layer === "surface" && unit.stance === "ambush") return unit.id;
  }
  return null;
}

/** 藏人室诊断：分清「没口 / 没室 / 室满」三种情况（原提示一律说成“未连通”会误导）。 */
function ShelterDiagnosis(state, pos) {
  const keys = [pos, ...HexNeighborKeys(pos)];
  let hasEntrance = false;
  let reachableShelter = false;
  let anyShelterInZone = false;
  for (const key of keys) {
    const entrance = state.tunnels.entrances[key];
    if (!entrance || entrance.sealed) continue;
    hasEntrance = true;
    if (ReachableFacilityCells(state, key, "shelter").length) reachableShelter = true;
    for (const cellKey of SortedKeys(state.tunnels.cells)) {
      if (state.tunnels.cells[cellKey].facility === "shelter") anyShelterInZone = true;
    }
  }
  if (!hasEntrance) return "本格与相邻格都没有可用地道口（口要在地下用 DigEntrance 自己开）。";
  if (reachableShelter) return "藏人室尚有余量，若仍不可用请核对本单位是否已行动。";
  if (anyShelterInZone) {
    return `连通的藏人室铺位都满了——每间 ${ShelterCapOf(state)} 铺（老弱/青壮各占 1 铺，伤员占 2 铺），再修一间或换个口。`;
  }
  return "连通的地道里还没有藏人室——先在地道格上 DigFacility shelter。";
}

// ---------------------------------------------------------------------------
// 主渲染
// ---------------------------------------------------------------------------

export function RenderAsciiMap(state, options = {}) {
  const layer = options.layer || "both";
  const view = options.view || DeriveView(state);
  const marks = CollectMarks(state, view);
  const { minX, maxX, minY, maxY } = GridBounds(state);
  const lines = [];
  const colCount = maxX - minX + 1;
  const blockWidth = labelWidth + colCount * (cellWidth + gutter.length);

  const Pad = (text, width) => (text.length >= width ? text : text + " ".repeat(width - text.length));

  const titleSurface = "【地上】格式 地形|开口|单位";
  const titleUnder = "【地下】格式 设施|内容|单位";
  if (layer === "both") lines.push(Pad(" ".repeat(labelWidth) + titleSurface, blockWidth + 2) + " ".repeat(labelWidth) + titleUnder);
  else lines.push(" ".repeat(labelWidth) + (layer === "surface" ? titleSurface : titleUnder));

  const colHeader = [];
  const rHeader = [];
  for (let x = minX; x <= maxX; x += 1) {
    colHeader.push(String(x).padStart(cellWidth) + gutter);
    rHeader.push(String(Math.floor(x / 2)).padStart(cellWidth) + gutter);
  }
  const colLine = Pad(" q=", labelWidth) + colHeader.join("");
  const rLine = Pad("r=y-", labelWidth) + rHeader.join("");
  if (layer === "both") {
    lines.push(Pad(colLine, blockWidth + 2) + colLine);
    lines.push(Pad(rLine, blockWidth + 2) + rLine);
  } else {
    lines.push(colLine);
    lines.push(rLine);
  }

  // 段（格与格之间通没通）画在格间：同行的段占格后的间隔位，上下与斜向的段占「段行」。
  // 只有真的挖通过段才插段行——第一幕三个窖互不相连，插了也全是空白。
  const showLinks = layer !== "surface" && Object.keys(state.tunnels.edges).length > 0;
  const Parity = (x) => ((x % 2) + 2) % 2;

  for (let y = minY; y <= maxY; y += 1) {
    let surfaceRow = "";
    let underRow = "";
    for (let x = minX; x <= maxX; x += 1) {
      const key = OffsetToKey(x, y);
      surfaceRow += SurfaceCell(state, key, marks) + gutter;
      underRow += UnderCell(state, key, marks);
      // 同一行的右邻永远是六角邻居（q 奇偶皆然），所以间隔位天然就是那条段的位置
      underRow += x < maxX ? LinkChar(state, key, OffsetToKey(x + 1, y), "-") : gutter;
    }
    const label = Pad(`y${String(y).padStart(2)}`, labelWidth);
    if (layer === "surface") lines.push(label + surfaceRow);
    else if (layer === "under") lines.push(label + underRow);
    else lines.push(Pad(label + surfaceRow, blockWidth + 2) + label + underRow);

    if (!showLinks || y >= maxY) continue;
    let underLink = "";
    for (let x = minX; x <= maxX; x += 1) {
      const key = OffsetToKey(x, y);
      underLink += `${LinkChar(state, key, OffsetToKey(x, y + 1), "|")}  `;   // 正上下的段（对齐设施位）
      if (x >= maxX) { underLink += gutter; continue; }
      // 跨列的第二条段：列号为偶数时是 ╱（左下↔右上），为奇数时是 ╲（左上↔右下）
      const slash = Parity(x) === 0;
      const from = slash ? OffsetToKey(x, y + 1) : OffsetToKey(x, y);
      const to = slash ? OffsetToKey(x + 1, y) : OffsetToKey(x + 1, y + 1);
      underLink += LinkChar(state, from, to, slash ? "/" : "\\");
    }
    const blank = Pad("", labelWidth);
    if (layer === "under") lines.push(blank + underLink);
    else lines.push(Pad("", blockWidth + 2) + blank + underLink);
  }

  lines.push("");
  for (const help of AxialHelpLines(state)) lines.push(help);
  lines.push("图例 地上 第1位 地形：V村 F农田 W树林 G坟地 R河 B桥 =路 x断路 .开阔");
  lines.push("     地上 第2位 开口：0-9 该地道口当前暴露豆（攒到阈值就被搜出） ! 已被搜出 # 已封堵 o通气孔 *通气孔被烟 ,挖掘痕迹 _敌已搜过");
  lines.push("     地上 第3位 单位：M民兵 G游击 R联络 +我方多单位｜J日军 P伪军 B工兵 S特务 ?身份不明 &我敌同格｜> < ^ v 敌意图箭头");
  lines.push("图例 地下 第1位 设施：o普通地道格 S储粮洞 H藏人室 O通气孔 X射击孔 T翻板 ·尚未挖通");
  lines.push("     地下 第2位 内容：g存粮 o老弱 y青壮 w伤员 !群众恐慌将满 *烟 ~水｜第3位 单位：M民兵 G游击 R联络 +多单位");
  if (showLinks) {
    lines.push("     地下 格与格之间＝段：- 横向 | 纵向 / \\ 斜向（都表示已挖通，人/烟/水过得去）");
    lines.push("                        D 这段上有隔断门·现在开着（通） ｜ # 隔断门·现在关着（人、烟、水都不通）｜ 空白＝未挖通");
  }
  lines.push("注：暴露豆与单位分列两位，站在地道口上也看得见自己的豆；详细数字见下方「地道口一览」「地道段一览」与「群众一览」。");
  return lines.join("\n");
}

/** 给 CLI/网页共用的「单位一览」行（含单位本回合还能不能做主动作）。 */
export function UnitLines(state, view) {
  const derived = view || DeriveView(state);
  const lines = [];
  for (const unit of derived.allies) {
    const raw = state.units[unit.id] || {};
    const def = unitDefinitions[unit.type] || {};
    lines.push(`  ${unit.id} ${unit.name} ＠${unit.pos}（${unit.layer === "under" ? "地下" : "地面"}）`
      + ` HP${unit.hp} MP${unit.mp}/${def.mp ?? "?"} ${TEXT.stance[unit.stance] || unit.stance}`
      + `｜主动作：${raw.acted ? "本回合已用掉" : "尚未使用"}`
      + `｜挖掘力 ${CFG.digPower[unit.type] || 0}${def.fieldAttack ? "｜可野战攻击" : "｜不可野战攻击"}`
      + `｜带路 ${CFG.civ.guideCap[unit.type] || 0} 批/次`
      + (unit.layer === "under" && CivsInCell(state, unit.pos).length ? `｜同格群众 ${CivsInCell(state, unit.pos).length} 批（有人照应）` : "")
      + (unit.breath ? `｜憋闷 ${unit.breath}/${CFG.breathThreshold}` : ""));
  }
  return lines;
}

export { allyChars, enemyChars, facilityChars };
