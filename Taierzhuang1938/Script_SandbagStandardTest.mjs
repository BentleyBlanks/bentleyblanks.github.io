// 沙袋唯一口径的静态门禁（docs/Data_SandbagStandard.md）。纯 node，不起浏览器。
//   1. 三件标准沙袋的包围盒与袋底高度（sole）和 Model_BattlefieldPack.glb 实测一致；
//   2. 贴地数学：最底一层袋底压进地面、顶面不动、下伸有上限；
//   3. 运行时代码不再用程序化椭圆袋（MakeSandbag）画沙袋，关卡不再摆 Model_Sandbag.glb；
//   4. 第一关里凡是画了袋缝（BagSeam）的白盒墙都已被标准模型替换，不留「蓝盒子 + 袋缝」的沙袋。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SANDBAG_ASSET_IDS, SANDBAG_METRICS, SANDBAG_GROUNDING, SandbagGroundedBottom, SandbagGroundedY,
  SandbagSoleHeight, SandbagRunPlacements,
} from "./Data_SandbagStandard.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- 1. GLB 实测
function ReadGlb(file) {
  const bytes = fs.readFileSync(path.join(root, "Model", file));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  return { bytes, json, bin: 20 + jsonLength + 8 };
}
const pack = ReadGlb("Model_BattlefieldPack.glb");
for (const id of SANDBAG_ASSET_IDS) {
  const nodeName = id[0].toUpperCase() + id.slice(1);
  const node = pack.json.nodes.find((n) => n.name === nodeName);
  assert.ok(node?.mesh != null, `${nodeName} exists in Model_BattlefieldPack.glb`);
  const scale = node.scale || [1, 1, 1], points = [];
  for (const primitive of pack.json.meshes[node.mesh].primitives) {
    const accessor = pack.json.accessors[primitive.attributes.POSITION];
    const view = pack.json.bufferViews[accessor.bufferView];
    const start = pack.bin + (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || 12;
    for (let i = 0; i < accessor.count; i++) {
      points.push([0, 1, 2].map((k) => pack.bytes.readFloatLE(start + i * stride + k * 4) * scale[k]));
    }
  }
  const min = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
  const size = max.map((v, k) => v - min[k]), metrics = SANDBAG_METRICS[id];
  assert.ok(Math.abs(size[0] - metrics.width) < 0.01 && Math.abs(size[1] - metrics.height) < 0.01
    && Math.abs(size[2] - metrics.depth) < 0.01, `${id}: box ${size.map((v) => v.toFixed(3))} matches metrics`);
  // 核心脚印（长 ±70%、宽 ±80%）逐格最低点的中位数。
  const cells = [];
  for (const fz of [-0.8, -0.4, 0, 0.4, 0.8]) for (const fx of [-0.7, -0.4, 0, 0.4, 0.7]) {
    const cx = (min[0] + max[0]) / 2 + fx * size[0] / 2, cz = (min[2] + max[2]) / 2 + fz * size[2] / 2;
    const near = points.filter((p) => Math.abs(p[0] - cx) < size[0] * 0.06 && Math.abs(p[2] - cz) < size[2] * 0.1);
    if (near.length) cells.push((Math.min(...near.map((p) => p[1])) - min[1]) / size[1]);
  }
  cells.sort((a, b) => a - b);
  const sole = cells[Math.floor(cells.length / 2)];
  assert.ok(Math.abs(sole - metrics.sole) <= 0.03, `${id}: measured sole ${sole.toFixed(3)} vs data ${metrics.sole}`);
}

// ---------------------------------------------------------------- 2. 贴地数学
{
  const slope = (x, z) => 0.3 * x + 0.1 * z;   // 30% 横坡
  const topY = 0.62;
  for (const asset of SANDBAG_ASSET_IDS) {
    const g = SandbagGroundedBottom(slope, { asset, x: 0, z: 0, ry: 0.4, halfWidth: 0.9, halfDepth: 0.35, topY, bottomY: 0.2 });
    const sole = g.bottom + SANDBAG_METRICS[asset].sole * g.height;
    assert.ok(Math.abs(g.bottom + g.height - topY) < 1e-9, `${asset}: top stays put`);
    assert.ok(sole <= g.ground - SANDBAG_GROUNDING.embedM + 1e-9 || g.bottom === 0.2 - SANDBAG_GROUNDING.maxDropM,
      `${asset}: sole ${sole.toFixed(3)} is pressed into the chosen footprint ground ${g.ground.toFixed(3)}`);
    assert.ok(g.bottom >= 0.2 - SANDBAG_GROUNDING.maxDropM - 1e-9, `${asset}: drop is capped`);
  }
  // 地面本来就比体块底高（体块埋进土里）时不往上抬。
  const buried = SandbagGroundedBottom(() => 1, { asset: SANDBAG_ASSET_IDS[0], x: 0, z: 0, halfWidth: 1, halfDepth: .4, topY: 1.4, bottomY: 0.5 });
  assert.equal(buried.bottom, 0.5, "a block already sunk into the ground keeps its bottom");
  const y = SandbagGroundedY(() => 2, { asset: "battlefieldSandbag03", x: 0, z: 0, scale: 0.5 });
  assert.ok(Math.abs(y + SandbagSoleHeight("battlefieldSandbag03", 0.5) - (2 - SANDBAG_GROUNDING.embedM)) < 1e-9,
    "single bag: its sole, not its box bottom, sits embedM below the ground");
  const run = SandbagRunPlacements({ a: { x: 0, z: 0 }, b: { x: 3, z: 0 }, layers: 3, layerM: 0.2, depthM: 0.4,
    groundAt: (x) => 0.1 * x, seed: "test" });
  assert.ok(run.length >= 6 && run.every((p) => SANDBAG_ASSET_IDS.includes(p.asset)), "a run is built from the standard model");
  const firstRow = run.filter((p) => p.y < 0.1 * p.x - 0.01);
  assert.ok(firstRow.length >= 2, "the bottom course is sunk below the local ground");
  assert.deepEqual(run, SandbagRunPlacements({ a: { x: 0, z: 0 }, b: { x: 3, z: 0 }, layers: 3, layerM: 0.2, depthM: 0.4,
    groundAt: (x) => 0.1 * x, seed: "test" }), "runs are seed-deterministic");
}

// ---------------------------------------------------------------- 3. 旧沙袋画法不许回来
{
  // 程序化椭圆袋只剩定义（Script_Geo）与调试探针页（Script_Probe，非正片）。
  const allowed = new Set(["Script_Geo.mjs", "Script_Probe.mjs", "Script_SandbagStandardTest.mjs"]);
  const offenders = fs.readdirSync(root).filter((f) => /\.mjs$/.test(f) && !allowed.has(f))
    .filter((f) => /\bMakeSandbag\s*\(/.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(offenders, [], "runtime code must not draw sandbags with MakeSandbag");
  const placementFiles = fs.readdirSync(root).filter((f) => /^(Data_Dressing_|Data_PropPcg|Script_ExternalProps)/.test(f));
  const oldModel = placementFiles.filter((f) => /asset:\s*"sandbag"/.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(oldModel, [], "levels must not place Model_Sandbag.glb (asset \"sandbag\")");
  const cutsceneBoxes = fs.readdirSync(root).filter((f) => /^Data_Cutscene.*\.mjs$/.test(f))
    .filter((f) => /kind:\s*"box"[^}]*name:\s*"[^"]*(土袋|沙袋|街垒)/.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(cutsceneBoxes, [], "cutscene sandbags use kind \"sandbag\", not textured boxes");
}

// ---------------------------------------------------------------- 4. 第一关：画了袋缝的白盒墙都已换成模型
{
  const { MISSION_LAYOUT } = await import("./Data_FirstLevelMissionLayout.mjs");
  const { IsMissionSandbagBlock } = await import("./Data_FirstLevelMissionFortifications.mjs");
  const ids = new Set(MISSION_LAYOUT.blocks.map((b) => b.id));
  const seamOwners = [...new Set(MISSION_LAYOUT.blocks.filter((b) => b.id.includes("BagSeam"))
    .map((b) => b.id.slice(0, b.id.indexOf("BagSeam"))))];
  const painted = seamOwners.filter((owner) => ids.has(owner) && !IsMissionSandbagBlock(owner));
  assert.deepEqual(painted, [], "every seamed wall is replaced by the standard sandbag model");
  for (const id of ["GapLastCover", "ObservationParapet", "ReceptionSecondCover", "ReceptionGateSandbags"]) {
    assert.ok(ids.has(id) && IsMissionSandbagBlock(id), `${id} is filled with the standard model`);
  }
  assert.ok(!MISSION_LAYOUT.blocks.some((b) => /^ReceptionGateSandbagCourse/.test(b.id)), "no canvas course strips on the gate sandbags");
  console.log(`SandbagStandardTest: GLB metrics/sole, grounding math, no legacy sandbag paths, ${seamOwners.length} seamed walls all replaced`);
}
