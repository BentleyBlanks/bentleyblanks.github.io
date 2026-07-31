// 《地下长城 · 冀中1942》 —— 双层 ASCII 战场 + CLI/网页共用的呈现报表。
//
// 本模块是纯逻辑（无 window/document/three/伪随机/时钟），只读 state 与 DeriveView 的输出，
// 绝不改状态、绝不自算敌军可见性（可见敌单位/意图箭头一律取 view.visibleEnemies / view.intentArrows）。
//
// 格位约定（R2 修正：暴露豆与单位不再抢同一字符位）：
//   地上 3 字/格 = [地形] [开口位：入口暴露豆 / 通风口 / 痕迹] [占用位：我方 > 敌方 > 意图箭头]
//   地下 3 字/格 = [设施] [内容位：烟 > 群众/伤员 > 存粮]      [占用位：地下单位]
// 坐标：动作用轴向键 "q,r"；本图列号 = q，行号 y = r + floor(q/2)（故 r = y - floor(q/2)）。

import { CFG, terrainDefinitions, facilityDefinitions, TEXT, unitDefinitions } from "./Data_Rules.mjs";
import { GetLevel } from "./Data_Levels.mjs";
import { HexNeighborKeys } from "./Script_Hex.mjs";
import {
  SortedKeys, KeyToOffset, OffsetToKey, GrainTotal, TerrainOf, UnitDef,
  ReachableFacilityCells, VillageStorageEntrances, WoundedTotal,
} from "./Script_State.mjs";
import { DeriveView } from "./Script_Visibility.mjs";

const allyChars = { militia: "M", guerrilla: "G", runner: "R" };
const enemyChars = { inf: "J", puppet: "P", spy: "S", sapper: "B", civilian: "?" };
const facilityChars = { storage: "S", shelter: "H", vent: "O", fightpost: "X" };

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

/** 地上格 3 字：地形位 + 开口位（暴露豆/通风口/痕迹） + 占用位（单位/箭头）。 */
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

/** 地下格 3 字：设施位 + 内容位（烟/群众/存粮） + 占用位（地下单位）。 */
function UnderCell(state, key, marks) {
  const cell = state.tunnels.cells[key];
  if (!cell) return state.map.hexes[key] ? "·  " : "   ";
  const base = cell.facility ? facilityChars[cell.facility] : "o";
  let content = " ";
  if (cell.grain > 0) content = "g";
  if (cell.civs > 0 || (marks.wounded[key] || 0) > 0) content = "c";
  if (cell.smoke > 0) content = "*";
  const occupant = marks.underUnits[key] || " ";
  return base + content + occupant;
}

function CollectMarks(state, view) {
  const marks = { allies: {}, enemies: {}, underUnits: {}, arrows: {}, wounded: {} };
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
  for (const key of SortedKeys(state.wounded.inCells)) marks.wounded[key] = state.wounded.inCells[key];
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
      grainOpen: village.grainOpen, pop: village.pop, popStart: village.popStart,
      organize: village.organize, hasHq: !!village.hasHq,
    });
    open += village.grainOpen;
  }
  const cells = [];
  let hidden = 0;
  for (const key of SortedKeys(state.tunnels.cells)) {
    const cell = state.tunnels.cells[key];
    if (cell.grain > 0) {
      cells.push({ key, grain: cell.grain, cap: CFG.storageGrainCap, facility: cell.facility });
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

/** 地道口 / 通风口 / 挖掘痕迹一览（暴露豆全程明牌，且不再被单位字母盖住）。 */
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
    entrances.push({
      key, expose: badge.expose, threshold: badge.threshold, known: badge.known, sealed: badge.sealed,
      terrain: TerrainOf(state, key) ? TerrainOf(state, key).name : "?",
      village: village ? village.name : null,
      allies: allyAt[key] || [],
      traces: hex.traces || 0,
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
    lines.push(`  地道口 ${entry.key}（${entry.village ? entry.village + " " : ""}${entry.terrain}）${status}`
      + `${entry.traces ? ` 本格痕迹 ${entry.traces}` : ""}`
      + `${entry.allies.length ? ` ｜ 我方在此：${entry.allies.join("、")}` : ""}`);
  }
  for (const vent of report.vents) {
    lines.push(`  通风口 ${vent.key} ${vent.known ? "已被搜出" : `暴露豆 ${vent.expose}/${vent.threshold}`}${vent.smoked ? " · 已被灌烟（失效）" : ""}`);
  }
  if (report.traces.length) {
    lines.push("  挖掘痕迹：" + report.traces.map((entry) => `${entry.key}×${entry.traces}`).join(" "));
  }
  return lines;
}

const victoryLabels = {
  surviveTurn: (v) => `撑到 T${v}`,
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

/** 关键地点：村庄格、区队部所在（L2 的即败条件与之绑定，必须给坐标）。 */
export function LandmarkLines(state) {
  const lines = [];
  for (const id of SortedKeys(state.map.villages)) {
    const village = state.map.villages[id];
    lines.push(`  ${village.name}${village.hasHq ? "【区队部】" : ""} 格 ${village.hexKeys.join(" / ")}`
      + ` ｜ 人口 ${village.pop}/${village.popStart} 批 ｜ 明存粮 ${village.grainOpen} 担 ｜ 组织度 ${village.organize}`
      + (village.burnedHexes ? ` ｜ 被焚 ${village.burnedHexes} 处` : ""));
  }
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

const mainActionTypes = new Set(["Dig", "DigEntrance", "DigFacility", "DigDoor", "CoverTraces",
  "BreakRoad", "Ambush", "Hide", "Attack", "Feint", "HideGrain", "MoveCivs", "MoveWounded",
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
        ? `HideGrain 不可用：村 1 格内的地道口连不到还有余量的储粮洞（每洞上限 ${CFG.storageGrainCap} 担，可能是装满了）。`
        : "HideGrain 不可用：地下还没有储粮洞——先在地道格上 DigFacility storage。");
    }
  }
  // 转移群众 / 伤员：区分「没有藏人室」与「藏人室满了」
  if (!have.has("MoveCivs") || !have.has("MoveWounded")) {
    const shelterState = ShelterDiagnosis(state, unit.pos);
    if (!have.has("MoveCivs")) {
      if (!village) hints.push("MoveCivs 不可用：本单位不在村庄格。");
      else if (village.pop <= 0) hints.push(`MoveCivs 不可用：${village.name}地面上已经没有群众了。`);
      else hints.push(`MoveCivs 不可用：${shelterState}`);
    }
    if (!have.has("MoveWounded") && state.meta.level === "L2" && village
        && (state.wounded.atVillage[hex.villageId] || 0) > 0) {
      hints.push(`MoveWounded 不可用：${shelterState}`);
    }
  }
  return hints;
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
    return `连通的藏人室都满了——每间藏人室容量 ${CFG.shelterCivCap} 批（群众与伤员合计），再修一间或换个口。`;
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

  for (let y = minY; y <= maxY; y += 1) {
    const surfaceRow = [];
    const underRow = [];
    for (let x = minX; x <= maxX; x += 1) {
      const key = OffsetToKey(x, y);
      surfaceRow.push(SurfaceCell(state, key, marks) + gutter);
      underRow.push(UnderCell(state, key, marks) + gutter);
    }
    const label = Pad(`y${String(y).padStart(2)}`, labelWidth);
    if (layer === "surface") lines.push(label + surfaceRow.join(""));
    else if (layer === "under") lines.push(label + underRow.join(""));
    else lines.push(Pad(label + surfaceRow.join(""), blockWidth + 2) + label + underRow.join(""));
  }

  lines.push("");
  for (const help of AxialHelpLines(state)) lines.push(help);
  lines.push("图例 地上 第1位 地形：V村 F农田 W树林 G坟地 R河 B桥 =路 x断路 .开阔");
  lines.push("     地上 第2位 开口：0-9 该地道口当前暴露豆（攒到阈值就被搜出） ! 已被搜出 # 已封堵 o通风口 *通风口被烟 ,挖掘痕迹 _敌已搜过");
  lines.push("     地上 第3位 单位：M民兵 G游击 R联络 +我方多单位｜J日军 P伪军 B工兵 S特务 ?身份不明 &我敌同格｜> < ^ v 敌意图箭头");
  lines.push("图例 地下 第1位 设施：o普通地道格 S储粮洞 H藏人室 O通风口 X枪眼 ·尚未挖通");
  lines.push("     地下 第2位 内容：g存粮 c群众/伤员 *烟｜第3位 单位：M民兵 G游击 R联络 +多单位");
  lines.push("注：暴露豆与单位分列两位，站在地道口上也看得见自己的豆；详细数字见下方「地道口一览」。");
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
      + (unit.breath ? `｜憋闷 ${unit.breath}/${CFG.breathThreshold}` : ""));
  }
  return lines;
}

export { allyChars, enemyChars, facilityChars };
