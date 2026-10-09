// 第一关植被撒点的纯 Node 门禁（docs/Data_FirstLevelVegetationProps.md）。
//   · 确定性：同一布局 + 同一画质 → 逐件相同；
//   · 上限：每档不超过 maxInstances，低档不多于高档；高档不是空的；
//   · 禁区：不进路线走廊、锚点 / 交互点、实体块脚印、屋顶下、水面、壕沟沟底与沟壁、弹坑、路面（track）；
//   · 视线：高于 0.6 m 的卡片只在河岸、墙根（且离路线 ≥ 3 m）或离路线 ≥ tallRouteClearM；锚点附近只有矮草；
//   · 所有 foliage 盒（原 25 个；2026-09-30 河拓宽后芦苇丛/岸草/沙滩草共 40 个）全部由植被接管；
//   · 卡片表与图集烘焙记录（_import/TextureBakes）一致，图集是 2 的幂、单张 ≤ 600 KB。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import {
  VEGETATION, VEGETATION_ATLAS, VEGETATION_CARDS, VEGETATION_QUALITY,
  PlanFirstLevelVegetation, MissionDressingContext, FitVegetationToCrown,
} from "./Data_FirstLevelVegetation.mjs";
import { RouteIndex, PointIndex } from "./Data_FirstLevelPropDressing.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
function Check(ok, message) {
  if (ok) console.log(`ok  ${message}`);
  else { failures++; console.log(`FAIL ${message}`); }
}

const ctx = MissionDressingContext(MISSION_LAYOUT, SampleMissionTerrain);
const crownFixtures=[0,1,2,3,4].map(x=>({id:x,x,z:0,y:x===3?2:0,yaw:.4,card:0,scale:.4,tint:.5,keep:.2}));
const crownBefore=JSON.stringify(crownFixtures);
const crownFit=FitVegetationToCrown(crownFixtures,x=>[0,.1,2,1,.001][x]);
Check(crownFit.adjusted===1&&crownFit.hidden===1,'可见土冠只修正覆盖的植物，完全埋住的卡片移除');
Check(JSON.stringify(crownFixtures)===crownBefore,'土冠接地不修改原始撒点计划');
Check(crownFit.instances.filter(it=>it.id!==1).every(it=>it===crownFixtures[it.id]),'沟外、原高台与微小误差的植物保持原值');
Check(crownFit.instances.every(it=>{
  const original=crownFixtures[it.id],h=VEGETATION_CARDS[it.card].heightM;
  return it.x===original.x&&it.z===original.z&&it.yaw===original.yaw&&it.scale<=original.scale
    &&Math.abs(it.y+h*it.scale-(original.y+h*original.scale))<1e-9;
}),'抬高根部并缩短卡片，顶部和视线高度不增加，平面占地不扩张');
const plans = {};
for (const quality of Object.keys(VEGETATION_QUALITY)) plans[quality] = PlanFirstLevelVegetation(ctx, quality);
const high = plans.high;

// ---- 确定性与上限 ------------------------------------------------------------
const again = PlanFirstLevelVegetation(MissionDressingContext(MISSION_LAYOUT, SampleMissionTerrain), "high");
Check(JSON.stringify(again.instances) === JSON.stringify(high.instances), `高档撒点确定（${high.instances.length} 件）`);
for (const [quality, plan] of Object.entries(plans))
  Check(plan.instances.length <= VEGETATION_QUALITY[quality].maxInstances,
    `${quality} 档 ${plan.instances.length} ≤ 上限 ${VEGETATION_QUALITY[quality].maxInstances}（撒出 ${plan.stats.planned}）`);
Check(plans.low.instances.length <= plans.high.instances.length, "低档不多于高档");
Check(high.instances.length > 5000, "高档确实长了草（> 5000 件）");
Check(high.stats.thicket >= 200 && high.stats.bankTop > 10, `有低矮灌木丛（${high.stats.thicket} 丛）与坎上矮草（${high.stats.bankTop} 件）`);
const reeds = VEGETATION_CARDS.find((c) => c.id === "Reeds");
Check(reeds.shade && reeds.shade.every((v) => v < 0.75), "芦苇顶点色压暗（不发白）");
const counts = {};
for (const it of high.instances) counts[VEGETATION_CARDS[it.card].id] = (counts[VEGETATION_CARDS[it.card].id] || 0) + 1;
Check(VEGETATION_CARDS.every((card) => counts[card.id] > 50), `八种卡片都用上了（${JSON.stringify(counts)}）`);
// 抽稀要均匀：南北两半的密度比不能因为截断而塌掉。
const midZ = (MISSION_LAYOUT.bounds.minZ + MISSION_LAYOUT.bounds.maxZ) / 2;
const north = high.instances.filter((it) => it.z < midZ).length, south = high.instances.length - north;
Check(north > 800 && south > 800, `抽稀没有按扫描顺序截断（北 ${north} / 南 ${south}）`);

// ---- 禁区 ------------------------------------------------------------------
const routes = RouteIndex(ctx.routes), anchors = PointIndex(ctx.anchors);
const solidBlocks = MISSION_LAYOUT.blocks.filter((b) => b.solid !== false && !b.dynamic
  && b.y - b.h / 2 < SampleMissionTerrain(b.x, b.z) + 0.5 && b.y + b.h / 2 > SampleMissionTerrain(b.x, b.z));
const roofs = MISSION_LAYOUT.blocks.filter((b) => b.semantic === "roof" && b.y - b.h / 2 > SampleMissionTerrain(b.x, b.z) + 1.4);
const Inside = (it, b, pad = 0) => {
  const dx = it.x - b.x, dz = it.z - b.z, c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
  return Math.abs(dx * c - dz * s) < b.w / 2 - pad && Math.abs(dx * s + dz * c) < b.d / 2 - pad;
};
// 墙根判定和撒点用同一套块：布局块 + scenario 各态的块（关尾夜门那几堵墙）。
const walls = [...solidBlocks, ...ctx.scenarioBlocks.filter((b) => b.solid !== false)].filter((b) => b.h >= VEGETATION.wallMinHeightM);
const NearWall = (it, band) => walls.some((b) => {
  const dx = it.x - b.x, dz = it.z - b.z, c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - b.w / 2), Math.max(0, Math.abs(dx * s + dz * c) - b.d / 2)) < band;
});
const foliageIds = new Set(MISSION_LAYOUT.blocks.filter((b) => b.semantic === "foliage").map((b) => b.id));
const nearFoliage = (it) => MISSION_LAYOUT.blocks.some((b) => foliageIds.has(b.id) && Math.hypot(it.x - b.x, it.z - b.z) < Math.max(b.w, b.d) / 2 + 1.6);
const layers = [0, 0, 0], color = [0, 0, 0];
const bad = { route: 0, anchor: 0, solid: 0, roof: 0, trench: 0, track: 0, crater: 0, tall: 0, anchorTall: 0, lipTall: 0, frontTall: 0 };
const examples = {};
const Mark = (key, it) => { bad[key]++; examples[key] ||= `${it.x.toFixed(1)},${it.z.toFixed(1)}`; };
for (const it of high.instances) {
  const card = VEGETATION_CARDS[it.card], clusterSlack = Math.max(VEGETATION.clusterSpreadM, VEGETATION.thicketSpreadM) * 1.42;
  const dRoute = routes.Distance(it.x, it.z, 20);
  if (dRoute < VEGETATION.routeClearM - clusterSlack) Mark("route", it);
  const dAnchor = anchors.Distance(it.x, it.z, 20);
  if (dAnchor < VEGETATION.anchorClearM - clusterSlack) Mark("anchor", it);
  if (solidBlocks.some((b) => Inside(it, b, clusterSlack))) Mark("solid", it);
  if (roofs.some((b) => Inside(it, b, clusterSlack))) Mark("roof", it);
  const corridor = ctx.trenchCorridor(it.x, it.z);
  if (corridor && corridor.d < corridor.halfFloor + corridor.bank - clusterSlack) Mark("trench", it);
  if (!nearFoliage(it)) {
    ctx.surfaceAt(it.x, it.z, color, layers);
    // 路面 / 场坪上只准两种：墙脚那一窄条，或离路线 ≥ trackOpenRouteM 的稀疏草。
    // 簇里的成员离簇心最多 0.45 m，路面层在路肩上 1.8 m 从 1 淡到 0，所以成员处的 track 最多比簇心高 ~0.35。
    if (layers[0] > VEGETATION.trackMax + 0.35 && dRoute < VEGETATION.trackOpenRouteM - clusterSlack
      && !NearWall(it, VEGETATION.wallTrackBandM + clusterSlack)) Mark("track", it);
  }
  if (ctx.craters.some((c) => Math.hypot(it.x - c.x, it.z - c.z) < c.radius - clusterSlack)) Mark("crater", it);
  const height = card.heightM * it.scale;
  if (height > 0.6 && !nearFoliage(it)) {
    const bank = Math.abs(it.z - ctx.river.z) < 17.5;
    if (!bank && dRoute < 3 - clusterSlack) Mark("tall", it);
  }
  if (dAnchor < VEGETATION.lowNearAnchorM - clusterSlack - 0.5 && height > VEGETATION.lowMaxHeightM * 1.25 && !nearFoliage(it)) Mark("anchorTall", it);
  // 沟沿（离沟边 1 m 以内）与前沿交战区的高度门槛。
  if (corridor && corridor.d < corridor.halfFloor + corridor.bank + 1 - clusterSlack && height > VEGETATION.trenchLipMaxHeightM + 1e-6
    && !NearWall(it, VEGETATION.wallFootBandM + clusterSlack)) Mark("lipTall", it);
  if (it.z < VEGETATION.frontZ - clusterSlack && height > VEGETATION.frontMaxHeightM + 1e-6
    && !NearWall(it, VEGETATION.wallFootBandM + clusterSlack)) Mark("frontTall", it);
}
for (const [key, value] of Object.entries(bad)) Check(value === 0, `禁区 ${key}：${value} 件${value ? `（例 ${examples[key]}）` : ""}`);

// ---- foliage 盒接管 ---------------------------------------------------------
Check(foliageIds.size === 37 && [...foliageIds].every((id) => high.replaced.has(id)), `37 个平色 foliage 盒由植被接管（${high.replaced.size}）`);

// ---- 图集与烘焙记录 ----------------------------------------------------------
const record = JSON.parse(fs.readFileSync(path.join(root, "_import/TextureBakes/Texture_FirstLevelVegetationAtlas.json"), "utf8"));
const atlasFile = path.join(root, VEGETATION_ATLAS.url.replace(/^\.\//, "").replace(/\?.*$/, ""));
Check(fs.existsSync(atlasFile), "图集文件存在");
const bytes = fs.existsSync(atlasFile) ? fs.statSync(atlasFile).size : 0;
Check(bytes === record.outputs[0].bytes && bytes === VEGETATION_ATLAS.bytes && bytes <= 600 * 1024,
  `图集字节与烘焙记录一致且 ≤ 600 KB（${bytes}）`);
const size = [record.outputs[0].width, record.outputs[0].height];
Check(size.every((v) => (v & (v - 1)) === 0), `图集尺寸是 2 的幂（${size.join("×")}）`);
Check(/\?v=/.test(VEGETATION_ATLAS.url), "图集 URL 带 ?v= 戳");
const cardMismatch = VEGETATION_CARDS.filter((card) => {
  const baked = record.cards.find((c) => c.id === card.id);
  return !baked || baked.uv.some((v, i) => Math.abs(v - card.uv[i]) > 1e-4) || Math.abs(baked.aspect - card.aspect) > 1e-3
    || Math.abs(baked.heightM - card.heightM) > 1e-6;
});
Check(cardMismatch.length === 0, `卡片 UV / 宽高比 / 高度照抄烘焙记录（不一致：${cardMismatch.map((c) => c.id).join(",") || "无"}）`);

if (failures) { console.log(`\n${failures} 项失败`); process.exit(1); }
console.log("\nFirstLevelVegetationTest 全部通过");
