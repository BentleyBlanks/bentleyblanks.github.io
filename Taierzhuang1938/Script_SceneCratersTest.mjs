// 场景声明式弹坑与升级版弹坑形态纯 Node 测试（零浏览器、毫秒级）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPLOSIVES, TERRAIN_DEFORMATION } from "./Data_Explosives.mjs";
import {
  CRATER_AGES, CraterAgeParams, CraterCavityProfile, CraterContourFactor,
  CraterRimDirectionalScale, CraterRimParams, IncomingToHorizontalDir,
  SceneCraterIssues, NormalizeSceneCraters, CarveSceneCraters, CompileSceneCraterField,
  SliceSceneCraters,
} from "./Script_SceneCraters.mjs";
import { TerrainDeformation } from "./Script_TerrainDeformation.mjs";
import { DecodeSceneHeights, ValidateScene, BlockoutDocFromScene } from "./Script_SceneDoc.mjs";
import { DecodeTrenchDatum, PrepareSceneTerrain } from "./Script_SceneTrenches.mjs";
import { ResolveInheritedScene } from "./Script_SceneInherit.mjs";
import { LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// 1. 剖面单调性、平底比例与陈化档差异
for (const age of Object.keys(CRATER_AGES)) {
  assert.equal(CraterCavityProfile(0, age), 1, `${age} center is 1`);
  assert.equal(CraterCavityProfile(1, age), 0, `${age} rim edge is 0`);
  let prev = 1;
  for (let i = 1; i <= 20; i++) {
    const val = CraterCavityProfile(i / 20, age);
    assert.ok(val <= prev + 1e-12 && val >= 0, `${age} cavity profile is monotone decreasing`);
    prev = val;
  }
}
assert.ok(CraterCavityProfile(0.35, "flooded") > CraterCavityProfile(0.35, "fresh"),
  "flooded craters have a wider flattened floor sump than fresh funnels");

// 2. 按口径自适应坑沿宽度与高度
const gRim = CraterRimParams(EXPLOSIVES.Grenade.craterRadiusM, EXPLOSIVES.Grenade.craterDepthM);
const s75Rim = CraterRimParams(EXPLOSIVES.Shell75.craterRadiusM, EXPLOSIVES.Shell75.craterDepthM);
const b50Rim = CraterRimParams(EXPLOSIVES.Bomb50kg.craterRadiusM, EXPLOSIVES.Bomb50kg.craterDepthM);
assert.ok(gRim.width < s75Rim.width && s75Rim.width < b50Rim.width, "rim width scales with ordnance radius");
assert.ok(gRim.height < s75Rim.height && s75Rim.height < b50Rim.height && b50Rim.height <= TERRAIN_DEFORMATION.maxRimM,
  "rim height scales with ordnance depth and stays capped at maxRimM");
assert.ok(CraterRimParams(2.2, 0.7, TERRAIN_DEFORMATION, "flooded").height < CraterRimParams(2.2, 0.7, TERRAIN_DEFORMATION, "fresh").height,
  "weathered/flooded rims settle lower than fresh craters");

// 3. 斜射方向转换与下风向抛土偏置
const flatDir = IncomingToHorizontalDir({ x: 0, y: -0.2, z: 1 });
const steepDir = IncomingToHorizontalDir({ x: 0, y: -5, z: 1 });
assert.ok(flatDir.oblique > steepDir.oblique && flatDir.dirZ > 0.99, "horizontal trajectory yields stronger oblique bias");
const downrange = CraterRimDirectionalScale(0, 3, 0, 1, 0.6);
const uprange = CraterRimDirectionalScale(0, -3, 0, 1, 0.6);
assert.ok(downrange > 1.15 && uprange < 0.85, "oblique impact thickens downrange rim and thins uprange entry");

// 4. 动态 TerrainDeformation 斜射与陈化向后兼容
const dyn = new TerrainDeformation({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } });
const hit = dyn.ApplyBlast({ x: 0, y: 0, z: 0 }, "Shell105", { incoming: { x: 0, y: -0.5, z: 1 } });
assert.ok(hit && hit.oblique > 0.4 && hit.dirZ > 0.99, "dynamic ApplyBlast accepts incoming vector");
let southRim = 0, northRim = 0;
for (let iz = 1; iz <= 24; iz++) {
  southRim = Math.max(southRim, -dyn.Node(0, iz));
  northRim = Math.max(northRim, -dyn.Node(0, -iz));
}
assert.ok(southRim >= northRim, "downrange (+Z) rim is at least as tall as uprange (-Z) rim");

// 5. doc.craters 校验规则
{
  const okErr = [];
  SceneCraterIssues([
    { id: "C1", x: 10, z: 20, kind: "Shell105", age: "fresh", dirDeg: 170, oblique: 0.4 },
    { id: "C2", x: 14, z: 22, radius: 2.5, depth: 0.7, age: "flooded", water: 0.9 },
  ], okErr);
  assert.deepEqual(okErr, [], "valid craters pass validation");

  const badErr = [];
  SceneCraterIssues([
    { id: "Dup", x: 0, z: 0, kind: "UnknownAmmo" },
    { id: "Dup", x: NaN, z: 0, age: "ancient", extraBad: 1 },
  ], badErr);
  assert.ok(badErr.length >= 5, `invalid craters are caught (${badErr.length} issues)`);
}

// 6. CarveSceneCraters 单调叠加、坡度约束与保护区
{
  const terrain = { minX: -20, minZ: -20, cellM: 0.5, cols: 80, rows: 80 };
  const flat = new Float32Array((terrain.cols + 1) * (terrain.rows + 1));
  const c1 = [{ id: "A", x: 0, z: 0, kind: "Shell105", age: "fresh", seed: 11 }];
  const after1 = CarveSceneCraters(terrain, flat, c1, { protect: (x) => x >= 4 });
  const w = terrain.cols + 1;
  const H = (arr, x, z) => arr[Math.round((z - terrain.minZ) / terrain.cellM) * w + Math.round((x - terrain.minX) / terrain.cellM)];
  assert.ok(H(after1, 0, 0) < -0.5, "static crater carves real pit");
  assert.equal(H(after1, 4, 0), 0, "protected foundation remains untouched");

  const c2 = [...c1, { id: "B", x: 2.5, z: 0.5, kind: "Shell105", age: "fresh", seed: 22 }];
  const after2 = CarveSceneCraters(terrain, flat, c2, { protect: (x) => x >= 4 });
  assert.ok(H(after2, 0, 0) <= H(after1, 0, 0) + 1e-5, "overlapping crater never fills an earlier cavity");
  for (let iz = 1; iz < terrain.rows; iz++) for (let ix = 1; ix < terrain.cols; ix++) {
    const a = after2[iz * w + ix];
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const b = after2[(iz + dz) * w + (ix + dx)];
      assert.ok(Math.abs(a - b) <= TERRAIN_DEFORMATION.maxAxisGrade * terrain.cellM * Math.hypot(dx, dz) + 2e-4,
        `static crater grid stays walkable at ${ix},${iz}`);
    }
  }
}

// 7. CompileSceneCraterField 表面属性与区域切片
{
  const field = CompileSceneCraterField([
    { id: "F", x: 0, z: 0, kind: "Shell105", age: "fresh" },
    { id: "W", x: 30, z: 0, kind: "Shell105", age: "flooded", water: 0.95 },
  ]);
  const fCenter = field.SampleSurface(0, 0, [0, 0, 0, 0]);
  const wCenter = field.SampleSurface(30, 0, [0, 0, 0, 0]);
  const far = field.SampleSurface(100, 100, [0, 0, 0, 0]);
  assert.ok(fCenter[0] > 0.7 && fCenter[1] > 0.9 && fCenter[2] > 0.5 && fCenter[3] === 0, "fresh crater has high cavity/wear/scorch and zero water");
  assert.ok(wCenter[0] > 0.5 && wCenter[3] > 0.8 && wCenter[2] < fCenter[2], "flooded crater has high pit water and softer scorch");
  assert.deepEqual(far, [0, 0, 0, 0], "untouched ground outside craters returns zeros");
  assert.equal(SliceSceneCraters(field.craters, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }).length, 1, "SliceSceneCraters keeps only overlapping craters");
}

// 8. 生产场景实测：FirstLevelEncounter + FirstLevelMerged 继承、零接缝、全校验与 Layout 贯穿
{
  const encDoc = JSON.parse(fs.readFileSync(path.join(here, "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json"), "utf8"));
  const encH = DecodeSceneHeights(fs.readFileSync(path.join(here, "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.height.bin")), encDoc.terrain);
  const encDBytes = fs.readFileSync(path.join(here, "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.trench.bin"));
  const encD = DecodeTrenchDatum(encDoc.trenches.datum, encDBytes);

  const mrgDoc = JSON.parse(fs.readFileSync(path.join(here, "Scenes/FirstLevelMerged/Scene_FirstLevelMerged.json"), "utf8"));
  const mrgH = DecodeSceneHeights(fs.readFileSync(path.join(here, "Scenes/FirstLevelMerged/Scene_FirstLevelMerged.height.bin")), mrgDoc.terrain);
  const mrgDBytes = fs.readFileSync(path.join(here, "Scenes/FirstLevelMerged/Scene_FirstLevelMerged.trench.bin"));
  const mrgD = DecodeTrenchDatum(mrgDoc.trenches.datum, mrgDBytes);

  assert.ok(Array.isArray(encDoc.craters) && encDoc.craters.length >= 60, `Encounter has dense north craters (${encDoc.craters?.length})`);
  assert.ok(Array.isArray(mrgDoc.craters) && mrgDoc.craters.length >= 60, `Merged has dense south craters (${mrgDoc.craters?.length})`);
  assert.ok(encDoc.craters.every((c) => c.z < 355), "Encounter craters live strictly north of z=355");
  assert.ok(mrgDoc.craters.every((c) => c.z >= 355), "Merged craters live strictly south of z=355");

  assert.equal(ValidateScene(encDoc).ok, true, "FirstLevelEncounter validates with doc.craters");
  assert.equal(ValidateScene(mrgDoc).ok, true, "FirstLevelMerged validates with doc.craters");

  const resolved = ResolveInheritedScene(mrgDoc, mrgH, mrgD, { doc: encDoc, heights: encH, datum: encD });
  assert.equal(ValidateScene(resolved.doc).ok, true, "Resolved FirstLevelMerged validates with inherited craters");
  assert.equal(resolved.doc.craters.length, encDoc.craters.length + mrgDoc.craters.length, "Resolved scene inherits all north craters without duplication");

  const prepEnc = PrepareSceneTerrain(encDoc, encH, encDBytes);
  const prepMrg = PrepareSceneTerrain(mrgDoc, mrgH, mrgDBytes);
  const prepRes = PrepareSceneTerrain(resolved.doc, resolved.heights, null);
  const splitRow = Math.round((355 - encDoc.terrain.minZ) / encDoc.terrain.cellM);
  const w = encDoc.terrain.cols + 1;
  let maxSeamStep = 0;
  for (let ix = 0; ix < w; ix++) {
    maxSeamStep = Math.max(
      maxSeamStep,
      Math.abs(prepEnc.heights[splitRow * w + ix] - prepMrg.heights[ix]),
      Math.abs(prepEnc.heights[splitRow * w + ix] - prepRes.heights[splitRow * w + ix]),
    );
  }
  assert.ok(maxSeamStep < 1e-4, `z=355 inheritance seam has zero crater step (${maxSeamStep})`);

  // 验证 BlockoutDocFromScene -> LayoutFromSceneDoc 完整带出 SampleCraterSurface
  const sliceDoc = BlockoutDocFromScene(resolved.doc, prepRes.heights, {
    level: "FirstLevelMerged", region: { minX: -80, maxX: 280, minZ: 140, maxZ: 540 }, trenchPlan: prepRes.plan,
  });
  const layout = LayoutFromSceneDoc(sliceDoc);
  assert.equal(typeof layout.SampleCraterSurface, "function", "LayoutFromSceneDoc exposes SampleCraterSurface");
  assert.ok(layout.craters.length >= 150, `Layout carries sliced craters (${layout.craters.length})`);
  const first = layout.craters[0];
  const sAt = layout.SampleCraterSurface(first.x, first.z, [0, 0, 0, 0]);
  assert.ok(sAt[0] > 0.2 && sAt[1] > 0.8, "SampleCraterSurface reports crater cavity & wear at crater center");
}

console.log("PASS SceneCratersTest: morphology, oblique bias, schema, monotone carving, surface field, Encounter/Merged inheritance & zero-seam check");
