// 城内布设「户口册」导出：真浏览器把全城切片建起来，抄出每一格院子
// 最终盖成什么（kind / 朝向 / 战损），连同街表、地标、缺口、外部道具目录与
// 各件 GLB 的实测尺寸，落成一份 JSON 给并行布设包与校验器用。
//
// 用法：node Taierzhuang1938/Script_TownDressingDump.mjs
// 产物：Taierzhuang1938/_import/TownDressingCells.json（入库 —— 校验器按它跑，
//       城的布局改了就重跑本脚本刷新）。
//
// 为什么走浏览器：PlanBlocks 住在 Script_TengxianCity 里，那个模块 import three，
// node 下解析不了；而格子表只有生成器自己算的才是真相，抄公式必然漂移。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import {
  CITY, GATES, CROSSROAD, STREETS, SIGHT_CORRIDOR, LANDMARKS, CITY_FEATURES,
} from "./Data_Tengxian.mjs";
import { PHASES } from "./Data_Battle.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outFile = path.join(projectDir, "_import", "TownDressingCells.json");

// --- GLB 尺寸：只读 JSON chunk 的 accessor min/max，不启动 three。 ---------
// 注意这是**忽略节点变换**的近似（烘焙脚本已把每件落地居中，平移只剩展示排
// 的偏移，量尺寸够用）；校验器在此之上另加余量。
// 已知失真：靠**节点缩放**定尺寸的老整包资产（fence = Model_WoodFence，
// accessor 原始尺寸 29×284×147 m，运行时由节点 scale 缩到 2.1 m）在这张表里
// 是坏数 —— 运行时 PrepareAsset 走真实包围盒不受影响，但布设包别拿这张表
// 给 fence 定余量（西关包实测后弃用了它）。三个下载包的件全部烘到顶点上，无此问题。
function GlbNodeDims(fileName) {
  const bytes = fs.readFileSync(path.join(projectDir, "Model", fileName));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const perNode = new Map();
  for (const node of json.nodes ?? []) {
    if (node.mesh == null) continue;
    const mesh = json.meshes[node.mesh];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0, prims = 0;
    for (const primitive of mesh.primitives) {
      const positions = json.accessors[primitive.attributes.POSITION];
      const indexCount = primitive.indices == null
        ? positions.count : json.accessors[primitive.indices].count;
      triangles += indexCount / 3;
      prims += 1;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], positions.min[axis]);
        max[axis] = Math.max(max[axis], positions.max[axis]);
      }
    }
    perNode.set(node.name, {
      dims: max.map((value, axis) => +(value - min[axis]).toFixed(3)),
      triangles: Math.round(triangles), meshes: prims,
    });
  }
  return perNode;
}

function AssetDims(catalog) {
  const byFile = new Map();
  const result = {};
  for (const entry of catalog) {
    const fileName = entry.url.replace(/^\.\/Model\//, "").replace(/\?.*$/, "");
    if (!byFile.has(fileName)) byFile.set(fileName, GlbNodeDims(fileName));
    const nodes = byFile.get(fileName);
    if (entry.node && nodes.has(entry.node)) {
      result[entry.id] = { ...nodes.get(entry.node), solid: entry.solid, tag: entry.tag };
      continue;
    }
    // 整包型资产：所有网格节点的并集
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0, meshes = 0;
    for (const spec of nodes.values()) {
      triangles += spec.triangles;
      meshes += spec.meshes;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], 0);
        max[axis] = Math.max(max[axis], spec.dims[axis]);
      }
    }
    result[entry.id] = {
      dims: max.map((value, axis) => +(value - min[axis]).toFixed(3)),
      triangles, meshes, solid: entry.solid, tag: entry.tag, union: true,
    };
  }
  return result;
}

// --- 每关的 LOD 档位（quality=high 的系数 1；照 Script_Main 的取值） ---------
function TierFor(cell, phase) {
  const b = phase.bounds;
  const pad = 20;
  if (cell.x < b.minX - pad || cell.x > b.maxX + pad
    || cell.z < b.minZ - pad || cell.z > b.maxZ + pad) return null;
  let best = Infinity;
  for (const zone of phase.zones) {
    best = Math.min(best, Math.hypot(cell.x - zone.x, cell.z - zone.z));
  }
  const detail = phase.detailRadius ?? 100;
  const mid = phase.midRadius ?? 210;
  return best < detail ? "detail" : best < mid ? "mid" : "far";
}

// --- 浏览器侧：抄格子表与目录 ------------------------------------------------
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (error) => console.error(`PAGEERROR ${String(error).slice(0, 200)}`));

// ★ 走**全城俯瞰**那条入口（`?phase=overview`，Data_Menu.OVERVIEW_PHASE，
// bounds 就是 Data_Battle.OVERVIEW_BOUNDS）。
//
// 为什么必须是它而不是随便一章：`PlanBlocks` 只在 bounds 之内排院子，
// 拿某一章的切片起页面，抄回来的户口册就只有那一角的格子 —— 而校验器
// （Script_TownDressingTest 规则 9「每一件都要完整落进某一格院子」）是拿这张表
// 当**几何真相**用的，缺了格子就会把好好的布设判成「没落进任何院子」。
// 重制之后七章里没有哪一章会生成整座城，所以 2026-08-29 补了这条入口。
await page.goto(
  `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=overview&quality=high&scale=small`,
  { waitUntil: "load", timeout: 120000 });
// 城内关卡的 battlefield 是 TengxianField，格子表在它包着的 city 上。
await page.waitForFunction(
  () => window.Taierzhuang?.battlefield?.city?.cells?.length > 0, null, { timeout: 180000 });
const dump = await page.evaluate(async () => {
  const b = window.Taierzhuang.battlefield.city;
  const m = await import("./Script_ExternalProps.mjs");
  return {
    cells: b.cells.map((c) => ({
      x: +c.x.toFixed(2), z: +c.z.toFixed(2), w: +c.w.toFixed(2), d: +c.d.toFixed(2),
      seed: c.seed, shop: !!c.shop, kind: c.kind || null, ry: +(c.ry || 0).toFixed(4),
      damage: +(c.damage ?? 0).toFixed(3), state: c.state || null, burnt: !!c.burnt,
    })),
    breaches: b.breaches,
    catalog: m.ExternalPropCatalog(),
    basePlacements: m.BasePlacements(),
  };
});
await browser.close();
server.close();

const cityPhases = PHASES.map((phase) => ({
  id: phase.id, bounds: phase.bounds,
  spawn: { x: phase.spawn.x, z: phase.spawn.z },
  zones: phase.zones.map((zone) => ({ id: zone.id, x: zone.x, z: zone.z, radius: zone.radius })),
  detailRadius: phase.detailRadius ?? 100, midRadius: phase.midRadius ?? 210,
}));
for (const cell of dump.cells) {
  cell.tiers = {};
  for (const phase of cityPhases) {
    const tier = TierFor(cell, phase);
    if (tier) cell.tiers[phase.id] = tier;
  }
}

// 缺口的世界坐标。沿墙局部 at → 世界要走 WALL_SIDES 的旋转（HitsRamp 同款
// `rz = side.z − sin(ry)·lx`）：South x=+at、West z=+at，但 **East z=−at、
// North x=−at** —— 东门 at=65 → z=−65 可反证。第一版把 East 写成 +at，
// 是城防工作包实拍取证抓出来的（(305,70) 那面墙完好无损）。
const breachPoints = [
  ...dump.breaches.South.map((b) => ({ wall: "South", x: b.at, z: CITY.wallCenter, width: b.width })),
  ...dump.breaches.East.map((b) => ({ wall: "East", x: CITY.wallCenter, z: -b.at, width: b.width })),
  ...dump.breaches.North.map((b) => ({ wall: "North", x: -b.at, z: -CITY.wallCenter, width: b.width })),
  ...dump.breaches.West.map((b) => ({ wall: "West", x: -CITY.wallCenter, z: b.at, width: b.width })),
];

const payload = {
  note: "由 Script_TownDressingDump.mjs 生成；城布局改动后必须重跑刷新。"
    + " cells 是 PlanBlocks+BuildBlock 的最终结果（世界坐标，X 东 Z 南）。",
  city: {
    wallCenter: CITY.wallCenter, wallBaseWidth: CITY.wallBaseWidth,
    innerRingWidth: CITY.innerRingWidth, platformY: CITY.platformY,
    innerLimit: CITY.wallCenter - CITY.wallBaseWidth / 2 - CITY.innerRingWidth,
  },
  crossroad: CROSSROAD,
  sightCorridor: SIGHT_CORRIDOR,
  gates: GATES.map((gate) => ({ id: gate.id, name: gate.name, x: gate.x, z: gate.z })),
  streets: STREETS,
  landmarks: LANDMARKS,
  cityFeatures: CITY_FEATURES,
  breaches: breachPoints,
  phases: cityPhases,
  assetDims: AssetDims(dump.catalog),
  basePlacements: dump.basePlacements,
  cells: dump.cells,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(payload, null, 1));
console.log(`TOWN_DRESSING_DUMP_OK cells=${payload.cells.length}`
  + ` assets=${Object.keys(payload.assetDims).length} -> ${outFile}`);
