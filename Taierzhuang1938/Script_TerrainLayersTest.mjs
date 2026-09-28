// 分层地形材质的离线闸门（纯 Node，毫秒级）。口径：docs/Data_TerrainLayers.md。
//
// 管五件浏览器测试要跑完整个开机才看得见的事：
//   1. 调参表的每层三张图真的在 Texture/ 下，尺寸对（Base 1024² / Normal、Orh 512²）；
//   2. 体积红线：整套 ≤ SET_BUDGET_BYTES、单张 ≤ SINGLE_LIMIT_BYTES（Pages 线上 0.5 MB/s）；
//   3. 远近平铺不成整数倍（整数倍 = 两套网格每隔几格重合一次，远处照样排成格子）；
//   4. 烘焙脚本里的 tileM 与调参表同步（法线斜率按米算，错了坡度就是错的）；
//   5. 第一关 splat 采样器：权重都在 [0,1]、车道中心是车道、沟底是翻土、开阔地允许草茬、
//      铁轨旁保留旧的道砟灰，且整片地块上三种权重都真的出现过。
//
// 用法：node Taierzhuang1938/Script_TerrainLayersTest.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TERRAIN_SETS, TERRAIN_QUALITY, TERRAIN_RUTS, TerrainLayerUrls, TerrainQualityOf } from "./Data_Tuning_Terrain.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN } from "./Data_FirstLevelMissionTerrain.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const SET_BUDGET_BYTES = 3 * 1024 * 1024;
const SINGLE_LIMIT_BYTES = 600 * 1024;

/** WebP 画布尺寸（VP8 / VP8L / VP8X 三种头都认）。 */
function WebpSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4), "RIFF", `${file} 不是 RIFF`);
  assert.equal(b.toString("ascii", 8, 12), "WEBP", `${file} 不是 WebP`);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`${file}: 未知 WebP 块 ${chunk}`);
}

let checks = 0;
const Check = (fn) => { fn(); checks += 1; };

// --- 1–3. 图、尺寸、体积、平铺 ------------------------------------------------------
for (const [setName, set] of Object.entries(TERRAIN_SETS)) {
  let total = 0;
  const layers = TerrainLayerUrls(setName);
  Check(() => assert.equal(layers.length, 4, `${setName}: 着色器按四层展开`));
  for (const [index, urls] of layers.entries()) {
    for (const [kind, url] of Object.entries(urls)) {
      if (kind === "id") continue;
      const file = path.join(project, url.replace(/^\.\//, "").split("?")[0]);
      Check(() => assert.ok(fs.existsSync(file), `缺图：${file}`));
      const bytes = fs.statSync(file).size;
      total += bytes;
      Check(() => assert.ok(bytes <= SINGLE_LIMIT_BYTES, `${path.basename(file)} ${bytes} 字节超单张上限`));
      const expected = kind === "base" ? set.textureSize : set.textureSize / 2;
      Check(() => assert.deepEqual(WebpSize(file), [expected, expected], `${path.basename(file)} 尺寸`));
    }
    const layer = set.layers[index];
    const ratio = layer.farTileM / layer.tileM;
    Check(() => assert.ok(Math.abs(ratio - Math.round(ratio)) > 0.15,
      `${layer.id}: 远近平铺 ${layer.farTileM}/${layer.tileM} 接近整数倍，两套网格会周期重合`));
  }
  Check(() => assert.ok(total <= SET_BUDGET_BYTES, `${setName}: 整套 ${total} 字节超预算 ${SET_BUDGET_BYTES}`));
  Check(() => assert.ok(set.albedoScale > 0.5 && set.albedoScale <= 1, `${setName}: albedoScale 越界`));
  console.log(`ok  ${setName}: ${layers.length} 层 ${(total / 1024 / 1024).toFixed(2)} MB`);
}

// --- 4. 烘焙脚本的平铺米数与表同步 ----------------------------------------------------
{
  const bake = fs.readFileSync(path.join(project, "_import", "Script_BakeTerrainLayers.py"), "utf8");
  for (const layer of TERRAIN_SETS.MissionPlain.layers) {
    const match = bake.match(new RegExp(`"${layer.file}": dict\\([^)]*?tileM=([0-9.]+)`));
    Check(() => assert.ok(match, `烘焙脚本缺层 ${layer.file}`));
    Check(() => assert.equal(Number(match[1]), layer.tileM, `${layer.file}: 烘焙 tileM ${match[1]} ≠ 表 ${layer.tileM}`));
  }
}
Check(() => assert.deepEqual(TerrainQualityOf("nonexistent"), TERRAIN_QUALITY.high));
Check(() => assert.equal(TERRAIN_QUALITY.low.antiTile, false));

// --- 5. 第一关 splat 采样 --------------------------------------------------------------
{
  const Sample = MISSION_LAYOUT.SampleGroundSurface;
  Check(() => assert.equal(typeof Sample, "function"));
  Check(() => assert.equal(MISSION_LAYOUT.ground.terrainLayers, "MissionPlain"));
  const color = [0, 0, 0], layers = [0, 0, 0];
  const road = MISSION_TERRAIN.roads[0].points[1];
  Sample(road.x, road.z, color, layers);
  Check(() => assert.ok(layers[0] > 0.99 && layers[2] < 0.01, `车道中心 ${layers}`));
  // 2026-09-23 01-06 space rebuild: the old rear traverse (FrontTraverse) became the west leg of BunkerTrench.
  const trench = MISSION_TERRAIN.trenches.find((t) => t.id === "BunkerTrench").points[1];
  Sample(trench.x, trench.z, color, layers);
  Check(() => assert.ok(layers[1] > 0.99 && layers[2] < 0.01, `沟底 ${layers}`));
  Sample(-77, 0, color, layers);
  Check(() => assert.ok(color[0] < 0.5 && color[1] < 0.5, `铁轨旁道砟灰 ${color}`));
  const bounds = MISSION_LAYOUT.bounds, seen = [0, 0, 0];
  for (let x = bounds.minX; x <= bounds.maxX; x += 3) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 3) {
      Sample(x, z, color, layers);
      for (let i = 0; i < 3; i++) {
        assert.ok(layers[i] >= 0 && layers[i] <= 1, `权重越界 (${x},${z}) ${layers}`);
        if (layers[i] > 0.5) seen[i] += 1;
      }
      for (const c of color) assert.ok(c >= 0 && c <= 1, `底色越界 (${x},${z}) ${color}`);
    }
  }
  checks += 1;
  Check(() => assert.ok(seen.every((n) => n > 50), `三路权重都应在地块上出现：${seen}`));
  console.log(`ok  MissionPlain splat: track ${seen[0]} / spoil ${seen[1]} / open ${seen[2]} samples (3 m grid)`);
}

// --- 6. 2026-09-28 地面：洼地是场地、白盒交通沟是裸土、车辙横向坐标（docs/Data_TerrainLayers.md §8） ------
{
  const Sample = MISSION_LAYOUT.SampleGroundSurface;
  const color = [0, 0, 0], layers = [0, 0, 0, 1];
  // 06 集结洼地：壕沟 CollectionLink 穿进来，但洼地底是踩实的场地，不是沟底土。
  Sample(-36, -100, color, layers);
  Check(() => assert.ok(layers[0] > 0.99 && layers[1] < 0.01, `06 洼地应为车道层 ${layers}`));
  // 07 白盒交通沟（SouthWalkCut）沟底：裸土，不长草茬。
  Sample(-15.8, -52, color, layers);
  Check(() => assert.ok(layers[1] > 0.99 && layers[2] < 0.01 && layers[0] < 0.01, `07 交通沟沟底应为翻土层 ${layers}`));
  // 车辙：道路中线上横向坐标 0，偏 halfGaugeM 处正好在槽心；ruts:false 的村落场坪与开阔地写 1。
  const [a, b] = MISSION_TERRAIN.roads[0].points;
  const len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  Sample(mx, mz, color, layers);
  Check(() => assert.ok(Math.abs(layers[3]) < 1e-6, `路中线横向坐标应为 0：${layers[3]}`));
  Sample(mx + nx * TERRAIN_RUTS.halfGaugeM, mz + nz * TERRAIN_RUTS.halfGaugeM, color, layers);
  Check(() => assert.ok(Math.abs(Math.abs(layers[3] * TERRAIN_RUTS.encodeRangeM) - TERRAIN_RUTS.halfGaugeM) < 1e-6, `槽心横向坐标 ${layers[3]}`));
  const village = MISSION_TERRAIN.pads.find((p) => p.ruts === false);
  Sample(village.x, village.z, color, layers);
  Check(() => assert.ok(Math.abs(layers[3]) > 0.999, `村落场坪里不画车辙：${layers[3]}`));
  layers[3] = 0.5;
  Sample(-150, -60, color, layers);
  Check(() => assert.equal(layers[3], 1, "开阔地横向坐标写 1"));
  console.log("ok  2026-09-28 ground: 06 hollow = yard, 07 cut = bare earth, rut lateral coordinate");
}

console.log(`TerrainLayersTest: ${checks} checks passed`);
