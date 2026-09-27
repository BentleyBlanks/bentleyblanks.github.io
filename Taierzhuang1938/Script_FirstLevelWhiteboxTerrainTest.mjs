// Script_FirstLevelWhiteboxTerrainTest.mjs - 05–18 白盒局部地形修饰钩子的门禁（纯 node）。
// 口径：Data_FirstLevelWhiteboxTerrain.mjs 文件头、docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。
//   1. 四区表结构：id 唯一、box 互不重叠、形状字段合法、形状（连羽化）完全落在本区 box 内。
//   2. 采样器：任何形状影响框之外，SampleMissionTerrain 与「去掉 whiteboxTerrain 的同一份 spec」逐位相同；
//      表全空时整片 05–18 逐位相同（改前改后零差异）。
//   3. 河槽与浅滩：RiverCutAt>0 的点不受修饰影响（河归 Topology）。
//   4. 钩子本身：自造表验证 level/raise/cut 的叠加（同 op 取最大不相加）、折线逐点 dy 插值、box 硬裁剪。
//   5. Front 体块包（05–07）不挡任何冻结路线（0.35 m 胶囊）；06 担架点位 0.625 m 净空。
//   --digest 打印 05–18 采样网格的 sha256（给后续「不该改变地形」的重构自查用）。
// 用法：node Taierzhuang1938/Script_FirstLevelWhiteboxTerrainTest.mjs [--digest]
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MISSION_TERRAIN, SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_NORTH_RIVER, RiverCutAt } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ROUTES as routes, MISSION_PLACEMENT as placement } from "./Data_FirstLevelMissionLayout.mjs";
import { BuildFrontWhitebox } from "./Data_FirstLevelWhiteboxFront.mjs";
import {
  WHITEBOX_TERRAIN, WHITEBOX_TERRAIN_REGIONS as REGIONS, WHITEBOX_TERRAIN_KINDS as KINDS, WHITEBOX_TERRAIN_OPS as OPS,
  WhiteboxShapeBounds, CompileWhiteboxTerrain,
} from "./Data_FirstLevelWhiteboxTerrain.mjs";

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const Finite = (v) => typeof v === "number" && Number.isFinite(v);

// 1. 表结构 -----------------------------------------------------------------
ok(MISSION_TERRAIN.whiteboxTerrain === WHITEBOX_TERRAIN, "MISSION_TERRAIN carries the compiled whitebox terrain hook");
ok(new Set(REGIONS.map((r) => r.id)).size === REGIONS.length, "region ids unique");
const allBoxes = REGIONS.flatMap((r) => r.boxes.map((b) => ({ ...b, region: r.id })));
for (const b of allBoxes) ok(b.minX < b.maxX && b.minZ < b.maxZ, `${b.region}/${b.id} box is non-empty`);
for (let i = 0; i < allBoxes.length; i++) for (let j = i + 1; j < allBoxes.length; j++) {
  const a = allBoxes[i], b = allBoxes[j];
  const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
  ok(!overlap, `boxes ${a.region}/${a.id} and ${b.region}/${b.id} do not overlap`);
}
let shapeCount = 0;
for (const region of REGIONS) {
  ok(Array.isArray(region.stages) && region.stages.length > 0, `${region.id} lists its stages`);
  const ids = new Set();
  for (const s of region.shapes) {
    shapeCount++;
    const tag = `${region.id}/${s.id}`;
    ok(typeof s.id === "string" && !ids.has(s.id), `${tag}: id present and unique in region`); ids.add(s.id);
    ok(KINDS.includes(s.kind), `${tag}: kind ${s.kind} is one of ${KINDS}`);
    ok(OPS.includes(s.op), `${tag}: op ${s.op} is one of ${OPS}`);
    ok(Finite(s.dy) && Math.abs(s.dy) <= 8, `${tag}: dy finite, |dy| <= 8 m`);
    if (s.op !== "level") ok(s.dy >= 0, `${tag}: raise/cut use dy >= 0 (direction comes from op)`);
    ok(Finite(s.feather) && s.feather >= 0.75, `${tag}: feather >= 0.75 m (one heightfield cell)`);
    if (s.kind === "disc") ok(Finite(s.x) && Finite(s.z) && s.radius > 0, `${tag}: disc x/z/radius`);
    if (s.kind === "box") ok(Finite(s.x) && Finite(s.z) && s.w > 0 && s.d > 0, `${tag}: box x/z/w/d`);
    if (s.kind === "polygon") ok(s.points?.length >= 3 && s.points.every((p) => Finite(p.x) && Finite(p.z)), `${tag}: polygon >= 3 points`);
    if (s.kind === "line") {
      ok(s.points?.length >= 2 && s.points.every((p) => Finite(p.x) && Finite(p.z) && (p.dy == null || Finite(p.dy))), `${tag}: line >= 2 points`);
      ok(s.halfW >= 0, `${tag}: line halfW >= 0`);
    }
    const b = WhiteboxShapeBounds(s);
    ok(region.boxes.some((box) => b.minX >= box.minX && b.maxX <= box.maxX && b.minZ >= box.minZ && b.maxZ <= box.maxZ),
      `${tag}: shape incl. feather lies inside one ${region.id} box (bounds ${[b.minX, b.maxX, b.minZ, b.maxZ].map((v) => v.toFixed(1))})`);
  }
}

// 2. 零差异 -------------------------------------------------------------------
const bare = { ...MISSION_TERRAIN, whiteboxTerrain: null };
const influence = WHITEBOX_TERRAIN.shapes.map((s) => s.clips).flat();
const Influenced = (x, z) => influence.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
let sampled = 0, outsideDiff = 0, insideChanged = 0, maxAbs = 0;
const digest = crypto.createHash("sha256");
for (const box of allBoxes) for (let z = box.minZ; z <= box.maxZ; z += 1) for (let x = box.minX; x <= box.maxX; x += 1) {
  const h = SampleMissionTerrain(x, z), h0 = SampleMissionTerrain(x, z, bare);
  digest.update(Buffer.from(new Float64Array([h]).buffer)); sampled++;
  if (Influenced(x, z)) { if (!Object.is(h, h0)) { insideChanged++; maxAbs = Math.max(maxAbs, Math.abs(h - h0)); } }
  else if (!Object.is(h, h0)) outsideDiff++;
}
ok(outsideDiff === 0, `outside every shape's influence box the ground is bit-identical (${outsideDiff} of ${sampled} differ)`);
if (shapeCount === 0) ok(insideChanged === 0 && WHITEBOX_TERRAIN.bounds === null, "empty tables leave 05–18 bit-identical");

// 3. 河槽 ---------------------------------------------------------------------
let riverPts = 0;
for (let z = MISSION_NORTH_RIVER.z - 15; z <= MISSION_NORTH_RIVER.z + 15; z += .5) for (let x = -100; x <= 125; x += 1) {
  if (RiverCutAt(x, z, MISSION_NORTH_RIVER) <= 0) continue;
  const h = SampleMissionTerrain(x, z), h0 = SampleMissionTerrain(x, z, bare);
  // River takes min(height, natural - cut) after the hook: modifiers may not dig below the channel profile.
  if (h0 <= h + 1e-9 && h <= h0 + 1e-9) riverPts++;
  else assert.fail(`river channel at ${x},${z} changed by a whitebox modifier (${h0.toFixed(3)} -> ${h.toFixed(3)})`);
}
ok(riverPts > 1000, `river channel untouched (${riverPts} samples)`);

// 4. 钩子自检（自造表） --------------------------------------------------------
{
  const region = (shapes) => [{ id: "T", stages: [0], boxes: [{ id: "B", minX: 0, maxX: 100, minZ: 0, maxZ: 100 }], shapes }];
  const H = CompileWhiteboxTerrain(region([
    { id: "a", kind: "disc", op: "raise", x: 20, z: 20, radius: 2, feather: 2, dy: 1 },
    { id: "b", kind: "disc", op: "raise", x: 21, z: 20, radius: 2, feather: 2, dy: .6 },
    { id: "c", kind: "line", op: "cut", points: [{ x: 50, z: 10, dy: 0 }, { x: 50, z: 30, dy: 2 }], halfW: 1, feather: 1 },
    { id: "d", kind: "line", op: "cut", points: [{ x: 50, z: 20 }, { x: 60, z: 20 }], halfW: 1, feather: 1, dy: 1 },
    { id: "e", kind: "box", op: "level", x: 80, z: 80, w: 10, d: 6, feather: 2, dy: .5 },
    { id: "f", kind: "polygon", op: "raise", points: [{ x: 5, z: 60 }, { x: 15, z: 60 }, { x: 10, z: 70 }], feather: 1, dy: .3 },
    { id: "g", kind: "disc", op: "raise", x: 99, z: 50, radius: 3, feather: 2, dy: 1 },
  ]));
  ok(H.Apply(20.5, 20, 0, 0) === 1, "raise overlap takes the max (1), not the sum (1.6)");
  ok(Math.abs(H.Apply(50, 20, 0, 0) + 1) < 1e-12, "cut overlap takes the max: line c at mid depth 1 and line d depth 1 -> -1");
  ok(Math.abs(H.Apply(50, 25, 0, 0) + 1.5) < 1e-12, "line per-point dy interpolates along the segment (1.5 at 3/4)");
  ok(Math.abs(H.Apply(80, 80, 3, 0) - .5) < 1e-12, "level pulls to natural + dy inside the core");
  ok(H.Apply(80, 87, 3, 0) === 3, "level has no effect beyond its feather");
  ok(Math.abs(H.Apply(10, 63, 0, 0) - .3) < 1e-12, "polygon interior gets full dy");
  ok(H.Apply(100.5, 50, 7, 0) === 7, "shape clipped to its region box: no effect outside the box");
  ok(H.Apply(99, 50, 0, 0) === 1, "inside the box the clipped disc still applies");
  ok(H.Apply(30, 40, 4.25, 0) === 4.25, "untouched point returns the incoming height unchanged");
  ok(CompileWhiteboxTerrain(region([])).bounds === null, "empty table compiles to a no-op");
}

// 5. Front 体块包 ---------------------------------------------------------------
{
  const front = BuildFrontWhitebox(SampleMissionTerrain);
  ok(new Set(front.blocks.map((b) => b.id)).size === front.blocks.length, "Front whitebox ids unique");
  const Hits = (p, b, r) => {
    const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), dx = p.x - b.x, dz = p.z - b.z, g = SampleMissionTerrain(p.x, p.z);
    return Math.abs(dx * c - dz * s) < b.w / 2 + r && Math.abs(dx * s + dz * c) < b.d / 2 + r && b.y + b.h / 2 > g + .3 && b.y - b.h / 2 < g + 1.7;
  };
  for (const [name, pts] of Object.entries(routes)) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .2);
    for (let j = 0; j <= n; j++) {
      const p = { x: a.x + (b.x - a.x) * j / (n || 1), z: a.z + (b.z - a.z) * j / (n || 1) };
      const hit = front.blocks.find((blk) => blk.solid !== false && Hits(p, blk, .35));
      if (hit) assert.fail(`route ${name} blocked by ${hit.id} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    }
  }
  checks++;
  for (const p of placement.collection.litters) ok(!front.blocks.some((b) => Hits(p, b, .625)), `06 litter at ${p.x},${p.z} clear of Front masses`);
}

console.log(`FirstLevelWhiteboxTerrainTest: ${checks} checks passed · ${shapeCount} shapes in ${REGIONS.length} regions · `
  + `${sampled} samples, ${insideChanged} modified (max |dh| ${maxAbs.toFixed(3)} m)`);
if (process.argv.includes("--digest")) console.log("05-18 terrain digest (1 m grid over region boxes):", digest.digest("hex"));
