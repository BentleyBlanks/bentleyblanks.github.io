// 「序 · 界河」微地形冒烟：高差必须可读，排水沟必须真的挡弹。
//
// 用法：node Taierzhuang1938/Script_JieheTerrainTest.mjs
// 退出码即成败。测试走真浏览器和 PhysicsWorld.RaycastTerrain，不读源码猜结果。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

function Check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) problems.push(name);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=0&quality=high&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(60));

  const result = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const terrain = await import("./Script_JieheField.mjs");
    const height = await import("./Script_JieheHeight.mjs");
    const heightmap = await import("./Heightmap/Data_TaierzhuangHeightmap.mjs");
    const field = T.battlefield;
    const outfieldModule = await import("./Script_TengxianOutfield.mjs");

    // 只量真正交火的南岸核心区，避开本来就有 1.9 m 落差的界河河槽。
    let minY = Infinity, maxY = -Infinity;
    for (let x = -480; x <= 480; x += 20) {
      for (let z = -1460; z <= -980; z += 16) {
        const y = field.GroundHeight(x, z);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    const laneChecks = [];
    for (const lane of terrain.JIEHE_TACTICAL_TERRAIN.lanes) {
      const x = (lane.from[0] + lane.to[0]) * 0.5;
      const z = (lane.from[1] + lane.to[1]) * 0.5;
      const dx = lane.to[0] - lane.from[0], dz = lane.to[1] - lane.from[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const centerY = field.GroundHeight(x, z);
      const lowHits = [];
      const shoulders = [];
      for (const side of [-1, 1]) {
        const shoulderX = x + nx * lane.outer * 1.35 * side;
        const shoulderZ = z + nz * lane.outer * 1.35 * side;
        const shoulderY = field.GroundHeight(shoulderX, shoulderZ);
        shoulders.push(shoulderY - centerY);
        const hit = T.Debug.Ray(x, centerY + 0.62, z, nx * side, 0, nz * side,
          lane.outer * 1.9, true);
        lowHits.push(hit ? hit.tag : null);
      }
      laneChecks.push({ id: lane.id, shoulders, lowHits });
    }

    // PhysicsWorld 把解析地表统一标成 dirt（命中反馈要播泥土声），不是 terrain。
    const terrainHits = laneChecks.reduce((n, lane) => n
      + lane.lowHits.filter((tag) => tag === "dirt").length, 0);
    const usefulLanes = laneChecks.filter((lane) => lane.shoulders.some((h) => h > 0.85)
      && lane.lowHits.includes("dirt")).length;
    // 当前关卡所有落地碰撞体都应贴着最终高度图地面。prop 里含“栽在堤顶的树”，
    // bridge 本来就悬空，二者不纳入地面锚点。
    const groundTags = new Set([
      "parapet", "grave", "balk", "kan", "fieldBank", "embankment", "wall", "platform",
    ]);
    let matchedAnchors = 0, anchorCount = 0, worstAnchorGap = 0;
    const badAnchors = [];
    for (const box of field.colliders) {
      if (!groundTags.has(box.tag)) continue;
      const cx = box.c ? box.c[0] : (box.min[0] + box.max[0]) * 0.5;
      const cz = box.c ? box.c[2] : (box.min[2] + box.max[2]) * 0.5;
      // 基础可以埋进坡里（负值），只把底面高于地面的正间隙算“悬空”。
      const gap = Math.max(0, box.min[1] - field.GroundHeight(cx, cz));
      anchorCount += 1;
      if (gap < 0.08) matchedAnchors += 1;
      else if (badAnchors.length < 12) badAnchors.push({ tag: box.tag, x: cx, z: cz, gap });
      worstAnchorGap = Math.max(worstAnchorGap, gap);
    }

    let samplerError = 0;
    for (let x = -620; x <= 620; x += 124) {
      for (let z = -1620; z <= -900; z += 90) {
        samplerError = Math.max(samplerError,
          Math.abs(field.GroundHeight(x, z) - height.SampleJieheHeight(x, z)));
      }
    }

    // 高度图接入后的视觉回归：长条耕地/麦垄/道路必须逐顶点贴地，不能只拿
    // 中心点对齐后让四角悬空。薄层允许的最高露出是麦苗 0.18 m。
    const groundLayerMaterials = new Set([
      "FieldSoil", "FieldSoilDark", "WheatRow", "WheatRowDry", "CartRoad", "RiverSand",
    ]);
    let groundLayerVertices = 0, minGroundLayerGap = Infinity, maxGroundLayerGap = -Infinity;
    for (const mesh of field.outfield.meshes) {
      const materialName = mesh.name.split("|").at(-1).replace("Static_", "");
      if (!groundLayerMaterials.has(materialName)) continue;
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const gap = position.getY(i) - field.GroundHeight(position.getX(i), position.getZ(i));
        groundLayerVertices += 1;
        minGroundLayerGap = Math.min(minGroundLayerGap, gap);
        maxGroundLayerGap = Math.max(maxGroundLayerGap, gap);
      }
    }

    // 村子不只要“数据里存在”，还要落在玩家走线的 460 m 远平面内。
    const villageSpec = outfieldModule.OutfieldSpec("L0_Jiehe").villages || [];
    const routeProbes = [[0, -1470], [0, -1255]];
    const openingVillages = villageSpec.filter((v) => v.z >= -1500
      && Math.hypot(v.x, v.z + 1470) < field.cameraFar).map((v) => v.id);
    // 远平面内不代表玩家开场真能读到。这里只数离出生点 180 m 内、院落边缘
    // 落入主视锥附近的近景村院，并确认左右都有轮廓、中央撤退走廊仍畅通。
    const openingCompounds = villageSpec.filter((v) => !v.far
      && Math.hypot(v.x, v.z + 1470) <= 180
      && Math.abs(v.x) - v.w / 2 <= 125).map((v) => v.id);
    const openingSides = {
      west: villageSpec.some((v) => openingCompounds.includes(v.id) && v.x < 0),
      east: villageSpec.some((v) => openingCompounds.includes(v.id) && v.x > 0),
    };
    const openingClearance = villageSpec.filter((v) => openingCompounds.includes(v.id))
      .reduce((best, v) => Math.min(best, Math.abs(v.x) - v.w / 2 - (v.stoneWall ? 8 : 0)), Infinity);
    const routeVillages = [...new Set(villageSpec.filter((v) => routeProbes.some(([x, z]) =>
      v.z >= z - 40 && Math.hypot(v.x - x, v.z - z) < field.cameraFar)).map((v) => v.id))];
    const villageStats = JSON.parse(JSON.stringify(field.outfield.stats));
    const roof = outfieldModule.VillageRoofLayout(10, 5.2, 2.65);
    const roofSlopeDirections = roof.halves.map((half) => ({
      side: half.side,
      rotationX: half.rotationX,
      localZ: half.localZ,
    }));
    return {
      level: T.Debug.Level().id,
      minY, maxY, range: maxY - minY,
      terrainHits, usefulLanes, laneChecks,
      physics: T.Debug.Physics(),
      heightmapId: heightmap.TAIZHUANG_HEIGHTMAP.id,
      heightmapSamples: heightmap.TAIZHUANG_HEIGHTS_DM.length,
      sourceUrl: heightmap.TAIZHUANG_HEIGHTMAP.source.url,
      samplerError,
      matchedAnchors, anchorCount, worstAnchorGap, badAnchors,
      groundLayerVertices, minGroundLayerGap, maxGroundLayerGap,
      openingVillages, openingCompounds, openingSides, openingClearance, routeVillages,
      villageStats,
      villageArchetypes: [...outfieldModule.VILLAGE_BUILDING_ARCHETYPES],
      roofRidgeY: roof.ridgeY, roofOuterY: roof.outerY, roofSlopeDirections,
    };
  });

  Check("加载的是第一关界河", result.level === "L0_Jiehe", result.level);
  Check("运行时读取台儿庄 SRTM 高度图",
    result.heightmapId === "TaierzhuangSrtmN34E117" && result.heightmapSamples === 257 * 193
      && /N34E117\.hgt\.gz$/.test(result.sourceUrl),
    `${result.heightmapId}，${result.heightmapSamples} 样本`);
  Check("渲染/物理与 CLI 共用唯一高度采样器", result.samplerError < 1e-9,
    `最大误差 ${result.samplerError.toExponential(2)} m`);
  Check("核心交火区不再是一张平板", result.range >= 5.0,
    `高程 ${result.minY.toFixed(2)}…${result.maxY.toFixed(2)} m，落差 ${result.range.toFixed(2)} m`);
  Check("至少三条下切通道形成真实地形掩蔽", result.usefulLanes >= 3,
    `${result.usefulLanes}/${result.laneChecks.length} 条；terrain 命中 ${result.terrainHits} 次`);
  Check("地物碰撞仍完整灌进物理世界",
    result.physics && result.physics.solids >= result.physics.fieldColliders * 0.99,
    result.physics ? `${result.physics.solids}/${result.physics.fieldColliders}` : "无物理数据");
  Check("现有布设碰撞体已重新贴合高度图",
    result.anchorCount > 300 && result.matchedAnchors >= result.anchorCount * 0.995,
    `${result.matchedAnchors}/${result.anchorCount} 个地面锚点；最大偏差 ${result.worstAnchorGap.toFixed(3)} m`);
  Check("耕地、麦垄与道路逐顶点贴地",
    result.groundLayerVertices > 100000
      && result.minGroundLayerGap >= -0.09 && result.maxGroundLayerGap <= 0.19,
    `${result.groundLayerVertices} 顶点；离地 ${result.minGroundLayerGap.toFixed(3)}…${result.maxGroundLayerGap.toFixed(3)} m`);
  Check("目标走线上能看到一至两个村落",
    result.openingVillages.length >= 1 && result.routeVillages.length >= 2,
    `开场 ${result.openingVillages.join("/") || "无"}；全程 ${result.routeVillages.join("/") || "无"}`);
  Check("出生镜头左右两侧都有近景院落且中央走廊畅通",
    result.openingCompounds.length >= 2
      && result.openingSides.west && result.openingSides.east
      && result.openingClearance >= 28,
    `${result.openingCompounds.join("/") || "无"}；最窄净空 ${result.openingClearance.toFixed(1)} m`);
  Check("村屋扩充为至少七种组合原型",
    result.villageArchetypes.length >= 7
      && new Set(result.villageArchetypes).size === result.villageArchetypes.length,
    result.villageArchetypes.join("/"));
  Check("界河沿线生成足够多的房屋与生活细节",
    result.villageStats.villageBuildings >= 105 && result.villageStats.villageDetails >= 760,
    `${result.villageStats.villageBuildings} 栋，${result.villageStats.villageDetails} 组细节`);
  Check("近景土坎、掩体、弹坑和树带达到战术密度",
    result.villageStats.banks >= 5 && result.villageStats.pits >= 25
      && result.villageStats.craters >= 35 && result.villageStats.graves >= 40
      && result.villageStats.trees >= 250,
    `土坎 ${result.villageStats.banks} / 散兵坑 ${result.villageStats.pits}`
      + ` / 弹坑 ${result.villageStats.craters} / 坟丘 ${result.villageStats.graves}`
      + ` / 树木 ${result.villageStats.trees}`);
  Check("硬山顶从正脊向前后檐下降且坡向相反",
    result.roofRidgeY > result.roofOuterY
      && result.roofSlopeDirections.length === 2
      && result.roofSlopeDirections.every((half) => half.side * half.rotationX > 0
        && half.side * half.localZ > 0),
    `脊 ${result.roofRidgeY.toFixed(2)} m，檐 ${result.roofOuterY.toFixed(2)} m`);
  for (const lane of result.laneChecks) {
    console.log(`    ${lane.id.padEnd(22)} 肩高=${lane.shoulders.map((v) => v.toFixed(2)).join("/")} m  命中=${lane.lowHits.join("/")}`);
  }
  for (const anchor of result.badAnchors) {
    console.log(`    锚点偏差 ${anchor.tag.padEnd(10)} (${anchor.x.toFixed(1)},${anchor.z.toFixed(1)}) ${anchor.gap.toFixed(3)} m`);
  }
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 300)}`);
}

await browser.close();
server.close();
if (problems.length) {
  console.error(`\n界河地形冒烟失败：${problems.length} 项`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("\n界河地形冒烟通过。地表高差与挡弹沟槽均为运行时实测。\n");
