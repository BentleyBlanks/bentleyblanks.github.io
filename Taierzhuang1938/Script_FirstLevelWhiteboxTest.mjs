import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CHAPTER as CH1 } from "./Data_MissionCh1.mjs";
import {
  FIRST_LEVEL_WHITEBOX_LEVEL_ID,
  FIRST_LEVEL_WHITEBOX_LAYOUT,
  FIRST_LEVEL_WHITEBOX_PHASE,
} from "./Data_FirstLevelWhitebox.mjs";
import {
  EvaluateFirstLevelObjectiveGate, PhaseContentId,
} from "./Script_FirstLevelWhiteboxFlow.mjs";

const phase = FIRST_LEVEL_WHITEBOX_PHASE;
const layout = FIRST_LEVEL_WHITEBOX_LAYOUT;
const whitebox = phase.whitebox;

assert.equal(CH1.tuning.whitebox, undefined, "正式第一章不得挂测试场地配置");
assert.equal(phase.id, FIRST_LEVEL_WHITEBOX_LEVEL_ID, "白盒保留稳定的独立场景 id");
assert.equal(PhaseContentId(phase), CH1.id, "白盒必须复用正式第一章内容 id");
assert.equal(PhaseContentId(CH1), CH1.id, "普通章节内容 id 不得被重写");
assert.ok(phase.sandbox && phase.sandboxKey === "firstLevelWhitebox", "选章直达入口必须稳定");
assert.equal(phase.sky, "whiteboxDay", "纯白材质必须使用不会剪白形体的专用中性光照");

const ids = [...layout.blocks, ...layout.gates].map((block) => block.id);
assert.equal(new Set(ids).size, ids.length, "每个白盒体块必须有唯一 id");
assert.ok(layout.blocks.length >= 45, "新场地必须由足够多的可读实体体块构成");
assert.equal(layout.gates.length, 2, "护送出口与折返出口必须各有一扇实体门");
for (const block of [...layout.blocks, ...layout.gates]) {
  assert.ok(block.w > 0 && block.d > 0 && block.h > 0, `${block.id} 尺寸必须为正`);
  assert.equal("texture" in block || "model" in block || "asset" in block, false,
    `${block.id} 不得引用贴图、模型或外部资产`);
}

assert.equal(layout.sections.length, phase.zones.length, "每个目标段必须对应一种空间横截面");
const widths = layout.sections.map((section) => section.widthM);
assert.ok(Math.min(...widths) <= 10 && Math.max(...widths) >= 48,
  "路线必须在狭窄检查口与开阔选择区之间显著变宽变窄");
assert.ok(Math.max(...widths) - Math.min(...widths) >= 35, "横截面变化不得只是微调");
for (const section of layout.sections) {
  assert.ok(section.verb && section.change, `${section.id} 必须同时声明玩家动作与世界变化`);
}

const route = [phase.spawn, ...phase.zones];
let routeLength = 0;
for (let i = 1; i < route.length; i += 1) {
  routeLength += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
}
assert.ok(routeLength >= 400 && routeLength <= 520,
  `首关白盒主路线应保持约 400—520 m，实际 ${routeLength.toFixed(1)} m`);
for (const zone of phase.zones) {
  assert.ok(zone.x >= layout.bounds.minX && zone.x <= layout.bounds.maxX
    && zone.z >= layout.bounds.minZ && zone.z <= layout.bounds.maxZ,
  `${zone.id} 必须落在实体围挡内`);
}

function OccupiesFeet(block, point, margin = 0.35) {
  const bottom = block.y - block.h * 0.5;
  if (bottom > 1.6) return false;
  const dx = point.x - block.x;
  const dz = point.z - block.z;
  const c = Math.cos(block.ry || 0);
  const s = Math.sin(block.ry || 0);
  const localX = c * dx - s * dz;
  const localZ = s * dx + c * dz;
  return Math.abs(localX) <= block.w * 0.5 + margin
    && Math.abs(localZ) <= block.d * 0.5 + margin;
}
for (const point of [phase.spawn, ...phase.zones]) {
  const blockers = layout.blocks.filter((block) => OccupiesFeet(block, point));
  assert.deepEqual(blockers, [], `${point.id || "Spawn"} 必须是真正可站的空间，不能埋进白盒体块`);
}

// 两扇门打开后的完整主路线必须在 1 m 角色半径网格上连通。这里只读体块表，
// 不借运行时导航的“吸到最近开放格”兜底，防止目标点又落进房子里却被测试掩盖。
const cell = 1;
const width = Math.ceil((layout.bounds.maxX - layout.bounds.minX) / cell);
const height = Math.ceil((layout.bounds.maxZ - layout.bounds.minZ) / cell);
const blocked = new Uint8Array(width * height);
const CellPoint = (index) => ({
  x: layout.bounds.minX + (index % width + 0.5) * cell,
  z: layout.bounds.minZ + (Math.floor(index / width) + 0.5) * cell,
});
for (let index = 0; index < blocked.length; index += 1) {
  const point = CellPoint(index);
  blocked[index] = layout.blocks.some((block) => OccupiesFeet(block, point)) ? 1 : 0;
}
const CellIndex = (point) => {
  const x = Math.floor((point.x - layout.bounds.minX) / cell);
  const z = Math.floor((point.z - layout.bounds.minZ) / cell);
  return z * width + x;
};
const visited = new Uint8Array(blocked.length);
const queue = new Int32Array(blocked.length);
let head = 0;
let tail = 0;
const start = CellIndex(phase.spawn);
visited[start] = 1;
queue[tail++] = start;
for (; head < tail; head += 1) {
  const current = queue[head];
  const x = current % width;
  const z = Math.floor(current / width);
  for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + ox;
    const nz = z + oz;
    if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
    const next = nz * width + nx;
    if (blocked[next] || visited[next]) continue;
    visited[next] = 1;
    queue[tail++] = next;
  }
}
for (const zone of phase.zones) {
  assert.equal(visited[CellIndex(zone)], 1, `${zone.id} 在剧情门打开后必须从出生点真实可达`);
}

assert.equal(whitebox.objectiveGates.length, phase.zones.length,
  "每个路标必须有一条事实门，不能退回走圈打勾");
assert.equal(whitebox.escortWaypoints[0].zone, undefined, "后送队必须先从实体院内出发");
assert.ok(whitebox.firstContact.atS >= 20 && whitebox.firstContact.atS <= 30,
  "首敌仍需在取得控制 20—30 秒后出现");
assert.ok(whitebox.firstContact.fullWaveAtS < 60, "完整交火必须在一分钟内展开");

assert.deepEqual(EvaluateFirstLevelObjectiveGate({ minTimeS: 24, minEnemyDeaths: 1 }, {
  elapsed: 23.9, enemyDeaths: 1,
}).missing, "time", "时间未到时路标不得推进");
assert.deepEqual(EvaluateFirstLevelObjectiveGate({ minTimeS: 24, minEnemyDeaths: 1 }, {
  elapsed: 25, enemyDeaths: 0,
}).missing, "enemyDeaths", "未解除威胁时路标不得推进");
assert.equal(EvaluateFirstLevelObjectiveGate({ signal: "EscortCall" }, {
  signals: new Set(["EscortCall"]),
}).ok, true, "正式剧情信号必须能放行目标");
assert.equal(EvaluateFirstLevelObjectiveGate({ voice: "ch1_shangbing_04" }, {
  voices: ["ch1_shangbing_04"],
}).ok, true, "人物实际说完关键台词才能放行最终段");

const fieldSource = fs.readFileSync(fileURLToPath(new URL("./Script_FirstLevelWhiteboxField.mjs",
  import.meta.url)), "utf8");
assert.match(fieldSource, /new THREE\.MeshStandardMaterial\(/, "白盒必须是真正受光的标准材质");
assert.match(fieldSource, /color:\s*0xffffff/, "白盒材质必须是程序化纯白");
assert.doesNotMatch(fieldSource, /TextureLoader|GLTF|\.glb|\.png|\.webp/,
  "白盒场景实现不得加载贴图或模型");

console.log(`FirstLevelWhiteboxTest PASS：${layout.blocks.length + layout.gates.length} 个纯白体块，`
  + `${routeLength.toFixed(1)} m 路线，7 段动作/变化与正式第一章内容已接通`);
