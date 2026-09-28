// 第一关「平色道具盒 → 外部模型」替换表与碎砖瓦撒点的纯 Node 门禁（docs/Data_FirstLevelVegetationProps.md）。
//   · 替换表里每一块（和它的附属件）都在正式第一关布局里，没有重复，不碰交互件（missionRoute 语义）；
//   · 每件资产都登记在 Script_ExternalProps 的目录里，GLB 与节点存在；
//   · 按 GLB 实测尺寸配到盒子：外观包围盒与碰撞盒逐轴误差 ≤ PROP_FIT_TOLERANCE，压扁/拉长 ≤ maxStretch；
//   · 碎砖瓦：件数上限、单件高度、离路线 / 锚点的退让、只换不实心的散块、两次撒点逐件相同。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import {
  PROP_DRESSING, PROP_DRESSING_ASSETS, PROP_FIT_TOLERANCE, PROP_RUBBLE, PROP_SPECIAL_ASSETS, PROP_MATERIAL_OVERRIDE,
  PlanPropDressing, PlanRubbleScatter, FitPropToBox, RouteIndex, PointIndex,
} from "./Data_FirstLevelPropDressing.mjs";
import { MissionDressingContext } from "./Data_FirstLevelVegetation.mjs";
import { ExternalPropCatalog } from "./Script_ExternalProps.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const blocks = MISSION_LAYOUT.blocks;
const byId = new Map(blocks.map((block) => [block.id, block]));
let failures = 0;
function Check(ok, message) {
  if (ok) console.log(`ok  ${message}`);
  else { failures++; console.log(`FAIL ${message}`); }
}

// ---- 1. 替换表 ------------------------------------------------------------
const seen = new Set();
const dupes = [], missing = [], interactive = [];
for (const entry of PROP_DRESSING) {
  for (const id of [entry.block, ...(entry.hide || [])]) {
    if (seen.has(id)) dupes.push(id);
    seen.add(id);
    const block = byId.get(id);
    if (!block) missing.push(id);
    else if (block.semantic === "missionRoute" || /^Weapon(Check|Issue)/.test(id) || block.dynamic || block.treeModel) interactive.push(id);
  }
}
Check(missing.length === 0, `替换表的块全在布局里（缺：${missing.join(",") || "无"}）`);
Check(dupes.length === 0, `没有一块被两条替换（重复：${dupes.join(",") || "无"}）`);
Check(interactive.length === 0, `不替换交互件 / 动态件 / 树（${interactive.join(",") || "无"}）`);
Check(PROP_DRESSING.length >= 90, `替换表覆盖第一关的道具盒（${PROP_DRESSING.length} 条）`);

// ---- 2. 资产登记与 GLB 实测尺寸 ---------------------------------------------
const catalog = new Map(ExternalPropCatalog().map((spec) => [spec.id, spec]));
const unregistered = PROP_DRESSING_ASSETS.filter((id) => !catalog.has(id));
Check(unregistered.length === 0, `资产都登记在 Script_ExternalProps（未登记：${unregistered.join(",") || "无"}）`);

function ReadGlb(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file}: glTF magic`);
  const jsonLength = bytes.readUInt32LE(12);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim()), bin: 20 + jsonLength + 8 };
}
function NodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation || [0, 0, 0], [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
function Multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** 与 Script_ExternalProps.PrepareAsset 同一口径：取出节点、清掉它自己的平移与旋转、保留缩放，量顶点包围盒。 */
function MeasureAsset(spec) {
  const glb = ReadGlb(path.join(root, spec.url.replace(/^\.\//, "").replace(/\?.*$/, "")));
  const nodes = glb.json.nodes;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const Visit = (index, parent, isRoot) => {
    const node = nodes[index];
    const local = isRoot ? NodeMatrix({ scale: node.scale }) : NodeMatrix(node);
    const matrix = parent ? Multiply(parent, local) : local;
    if (node.mesh != null) for (const primitive of glb.json.meshes[node.mesh].primitives) {
      const accessor = glb.json.accessors[primitive.attributes.POSITION], view = glb.json.bufferViews[accessor.bufferView];
      const start = glb.bin + (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || 12;
      for (let v = 0; v < accessor.count; v++) {
        const x = glb.bytes.readFloatLE(start + v * stride), y = glb.bytes.readFloatLE(start + v * stride + 4), z = glb.bytes.readFloatLE(start + v * stride + 8);
        const p = [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }
    for (const child of node.children || []) Visit(child, matrix, false);
  };
  if (spec.node) {
    const index = nodes.findIndex((node) => node.name === spec.node);
    assert.ok(index >= 0, `${spec.id}: GLB 里有节点 ${spec.node}`);
    Visit(index, null, true);
  } else {
    for (const index of glb.json.scenes[glb.json.scene || 0].nodes) Visit(index, null, false);
  }
  return max.map((value, k) => value - min[k]);
}
const sizes = new Map();
for (const id of PROP_DRESSING_ASSETS) if (catalog.has(id)) sizes.set(id, MeasureAsset(catalog.get(id)));
/** 特殊件（撤运车残骸）：按运行时同一口径量 —— 去掉主要蒙在 dropBone 上的三角形之后的顶点包围盒。 */
function MeasureWreck(spec) {
  const glb = ReadGlb(path.join(root, spec.url.replace(/^\.\//, "")));
  const skin = glb.json.skins[0], drop = skin.joints.findIndex((j) => glb.json.nodes[j].name === spec.dropBone);
  const Reader = (ai) => {
    const a = glb.json.accessors[ai], v = glb.json.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], size = { 5126: 4, 5123: 2, 5121: 1, 5125: 4 }[a.componentType];
    const stride = v.byteStride || comps * size, start = glb.bin + (v.byteOffset || 0) + (a.byteOffset || 0);
    const read = (o) => a.componentType === 5126 ? glb.bytes.readFloatLE(o) : a.componentType === 5123 ? glb.bytes.readUInt16LE(o)
      : a.componentType === 5125 ? glb.bytes.readUInt32LE(o) : glb.bytes[o];
    return { count: a.count, get: (i, c = 0) => read(start + i * stride + c * size) };
  };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let dropped = 0;
  for (const mesh of glb.json.meshes) for (const primitive of mesh.primitives) {
    const P = Reader(primitive.attributes.POSITION), J = Reader(primitive.attributes.JOINTS_0), W = Reader(primitive.attributes.WEIGHTS_0);
    const I = Reader(primitive.indices);
    const Dominant = (i) => { let best = -1, w = -1; for (let c = 0; c < 4; c++) if (W.get(i, c) > w) { w = W.get(i, c); best = J.get(i, c); } return best; };
    for (let t = 0; t < I.count; t += 3) {
      const tri = [I.get(t), I.get(t + 1), I.get(t + 2)];
      if (tri.every((i) => Dominant(i) === drop)) { dropped++; continue; }
      for (const i of tri) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P.get(i, k)); max[k] = Math.max(max[k], P.get(i, k)); }
    }
  }
  Check(dropped > 100, `${spec.url}: 去掉了 ${spec.dropBone} 那只轮子（${dropped} 个三角形）`);
  return max.map((v, k) => v - min[k]);
}
for (const [id, spec] of Object.entries(PROP_SPECIAL_ASSETS)) {
  Check(fs.existsSync(path.join(root, spec.url.replace(/^\.\//, ""))), `特殊件 ${id} 的模型文件存在`);
  sizes.set(id, MeasureWreck(spec));
}
Check([...sizes.values()].every((size) => size.every((v) => v > 0.05 && v < 7)), "资产尺寸是米制、非退化（0.05–7 m）");
Check(Object.keys(PROP_MATERIAL_OVERRIDE).every((id) => PROP_DRESSING.some((e) => e.asset === id)), "换材质表的资产都在替换表里");

// ---- 3. 外观与碰撞盒 --------------------------------------------------------
const plan = PlanPropDressing(blocks, SampleMissionTerrain, sizes);
Check(plan.missing.length === 0, `每条替换都出了摆位（缺：${plan.missing.join(",") || "无"}）`);
const fitErrors = [], stretchErrors = [];
for (const placement of plan.placements) {
  const entry = PROP_DRESSING.find((e) => e.block === placement.block);
  const box = [placement.box.w, placement.box.h, placement.box.d];
  placement.visual.forEach((value, axis) => {
    const error = Math.abs(value - box[axis]);
    if (error > Math.max(PROP_FIT_TOLERANCE.relative * box[axis], PROP_FIT_TOLERANCE.absoluteM))
      fitErrors.push(`${placement.id}[${"whd"[axis]}] ${value.toFixed(2)} vs ${box[axis].toFixed(2)}`);
  });
  // 逐轴缩放都夹在「几何平均 ÷ k … × k」里，所以任意两轴之比 ≤ k²。
  const s = placement.scale, k = entry.maxStretch ?? 1.35;
  if (s.some((v) => !(v > 0)) || Math.max(...s) / Math.min(...s) > k * k + 1e-6) stretchErrors.push(placement.id);
}
Check(fitErrors.length === 0, `外观包围盒贴着碰撞盒（${plan.placements.length} 件；超差：${fitErrors.slice(0, 6).join("；") || "无"}）`);
Check(stretchErrors.length === 0, `模型压扁 / 拉长都在 maxStretch 以内（${stretchErrors.slice(0, 6).join(",") || "无"}）`);
// 碰撞仍归原块：实心块替换后照旧 solid / cover，块本身一字不改（布局是 frozen 的，这里核对语义）。
const solidReplaced = [...plan.replaced].map((id) => byId.get(id)).filter((block) => block.solid !== false);
Check(solidReplaced.length > 40 && solidReplaced.every((block) => block.w > 0 && block.h > 0 && block.d > 0),
  `换外观的实心块仍登记碰撞（${solidReplaced.length} 块，掩体 ${solidReplaced.filter((b) => b.cover).length} 块）`);
// 放倒 / 转向的配法自洽：一只扁盒配车轮取「薄轴对薄轴」。
const wheel = FitPropToBox([0.543, 1.1, 1.065], { w: 1.25, h: 1.25, d: 0.12 }, { maxStretch: 3.2 });
Check(wheel.swap && Math.abs(wheel.visual[2] - 0.12) < 1e-6, "车轮薄轴转到盒子的薄轴上");
const lying = FitPropToBox([0.543, 1.1, 1.065], { w: 1.1, h: 0.12, d: 1.1 }, { maxStretch: 3.2, rollDeg: 90 });
Check(Math.abs(lying.visual[1] - 0.12) < 1e-6, "平躺的车轮先放倒再配");

// ---- 4. 碎砖瓦 --------------------------------------------------------------
const ctx = MissionDressingContext(MISSION_LAYOUT, SampleMissionTerrain);
const rubble = PlanRubbleScatter(ctx), again = PlanRubbleScatter(ctx);
Check(JSON.stringify(rubble.pieces) === JSON.stringify(again.pieces), `碎砖瓦撒点确定（${rubble.pieces.length} 件）`);
Check(rubble.pieces.length > 800 && rubble.pieces.length <= PROP_RUBBLE.maxPieces, `件数在 800–${PROP_RUBBLE.maxPieces} 之间`);
Check(rubble.pieces.every((p) => p.size[1] <= PROP_RUBBLE.maxHeightM + 1e-9), `单件高 ≤ ${PROP_RUBBLE.maxHeightM} m`);
const routes = RouteIndex(ctx.routes), anchors = PointIndex(ctx.anchors);
const hiddenIds = new Set(rubble.hidden);
const inLoose = (p) => [...hiddenIds].some((id) => { const b = byId.get(id); return Math.hypot(p.x - b.x, p.z - b.z) < Math.max(b.w, b.d); });
const onRoute = rubble.pieces.filter((p) => !inLoose(p) && routes.Distance(p.x, p.z, 2) < PROP_RUBBLE.routeClearM - 1e-6);
const onAnchor = rubble.pieces.filter((p) => !inLoose(p) && anchors.Distance(p.x, p.z, 3) < PROP_RUBBLE.anchorClearM - 1e-6);
Check(onRoute.length === 0, `补撒的碎块不进路线走廊（${onRoute.length}）`);
Check(onAnchor.length === 0, `补撒的碎块不压交互点 / 锚点（${onAnchor.length}）`);
const hiddenSolid = [...hiddenIds].filter((id) => byId.get(id).solid !== false || byId.get(id).cover);
Check(hiddenSolid.length === 0 && hiddenIds.size > 100, `只换不实心、非掩体的散块（${hiddenIds.size} 块，违规 ${hiddenSolid.length}）`);
const overlap = [...hiddenIds].filter((id) => plan.replaced.has(id));
Check(overlap.length === 0, "散块与道具替换表不重叠");

if (failures) { console.log(`\n${failures} 项失败`); process.exit(1); }
console.log("\nFirstLevelPropDressingTest 全部通过");
