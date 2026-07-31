// 《地下长城 · 冀中1942》 —— 双层 ASCII 战场（CLI/审查 Agent 用）。
// 左：地上层；右：地下层；随后图例。敌单位按 DeriveView 可见性给出（未识破特务显 '?'）。
// 注意：本图为文本近似（六角错列以行列直排表达，奇数列在世界坐标中略低半格）。

import { CFG, terrainDefinitions } from "./Data_Rules.mjs";
import { SortedKeys, KeyToOffset, OffsetToKey, EntranceThreshold, CompareIds } from "./Script_State.mjs";
import { DeriveView } from "./Script_Visibility.mjs";

const allyChars = { militia: "M", guerrilla: "G", runner: "R" };
const enemyChars = { inf: "J", puppet: "P", spy: "S", sapper: "B", civilian: "?" };
const facilityChars = { storage: "S", shelter: "H", vent: "O", fightpost: "X" };

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

/** 地上格：2 字符 = 地形位 + 叠加位。 */
function SurfaceCell(state, view, key, marks) {
  const hex = state.map.hexes[key];
  if (!hex) return "  ";
  let base = terrainDefinitions[hex.terrain].char;
  if (hex.bridge) base = hex.roadBroken ? "x" : "B";
  else if (hex.road) base = hex.roadBroken ? "x" : (hex.terrain === "open" ? "=" : base);
  let overlay = " ";
  const entrance = state.tunnels.entrances[key];
  const vent = state.tunnels.vents[key];
  if (entrance) {
    overlay = entrance.sealed ? "#" : entrance.known ? "!" : String(Math.min(9, entrance.expose));
  } else if (vent) {
    overlay = vent.smoked ? "*" : vent.known ? "!" : "o";
  } else if (hex.traces > 0) {
    overlay = ",";
  } else if (hex.searched) {
    overlay = "_";
  }
  if (marks.arrows[key]) overlay = marks.arrows[key];
  const foes = marks.enemies[key];
  if (foes) overlay = foes;
  const allies = marks.allies[key];
  if (allies) overlay = allies;
  return base + overlay;
}

/** 地下格：2 字符 = 设施位 + 占用位。 */
function UnderCell(state, key, marks) {
  const cell = state.tunnels.cells[key];
  if (!cell) return state.map.hexes[key] ? "· " : "  ";
  let base = cell.facility ? facilityChars[cell.facility] : "o";
  let overlay = " ";
  if (cell.smoke > 0) overlay = "*";
  if (cell.grain > 0) overlay = "g";
  if (cell.civs > 0 || (marks.wounded[key] || 0) > 0) overlay = "c";
  const under = marks.underUnits[key];
  if (under) overlay = under;
  return base + overlay;
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

export function RenderAsciiMap(state, options = {}) {
  const layer = options.layer || "both";
  const view = options.view || DeriveView(state);
  const marks = CollectMarks(state, view);
  const { minX, maxX, minY, maxY } = GridBounds(state);
  const lines = [];
  const width = (maxX - minX + 1) * 3;
  if (layer === "both") lines.push(`    ${"【地上】"}${" ".repeat(Math.max(1, width - 6))}【地下】`);
  else lines.push(layer === "surface" ? "    【地上】" : "    【地下】");
  const header = ["   "];
  for (let x = minX; x <= maxX; x += 1) header.push(String(x).padStart(2) + " ");
  const headerLine = header.join("");
  lines.push(layer === "both" ? `${headerLine}   ${headerLine.slice(3)}` : headerLine);
  for (let y = minY; y <= maxY; y += 1) {
    const surfaceRow = [];
    const underRow = [];
    for (let x = minX; x <= maxX; x += 1) {
      const key = OffsetToKey(x, y);
      surfaceRow.push(SurfaceCell(state, view, key, marks) + " ");
      underRow.push(UnderCell(state, key, marks) + " ");
    }
    const label = String(y).padStart(2) + " ";
    if (layer === "surface") lines.push(label + surfaceRow.join(""));
    else if (layer === "under") lines.push(label + underRow.join(""));
    else lines.push(label + surfaceRow.join("") + "  " + label + underRow.join(""));
  }
  lines.push("");
  lines.push("图例 地上：V村 F农田 W树林 G坟地 R河 B桥 =路 x断路 .开阔｜M民兵 G*游击 R*联络(叠加位) J日军 P伪军 B工兵 S特务 ?行人 +多单位");
  lines.push("     叠加位：0-9入口暴露豆 !已搜出 #已封 o通风口 *被烟熏 ,挖掘痕迹 _已搜过 ></^v敌意图箭头");
  lines.push("图例 地下：o地道格 S储粮 H藏人 O通风 X枪眼 ·无地道｜叠加位：单位字母 c群众/伤员 g存粮 *烟");
  return lines.join("\n");
}
