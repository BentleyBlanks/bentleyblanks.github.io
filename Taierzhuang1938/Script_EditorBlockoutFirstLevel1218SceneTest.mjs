// Script_EditorBlockoutFirstLevel1218SceneTest.mjs —— 11–18 白盒（第三版，北沙河村）场景生成器的 node 回归
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218SceneTest.mjs
// 钉住 10-26 契约「必须成立」的七条：
//   1 村南口 → 土路 → 官道 → 板桥 → 主街 → 救护所院门连续、宽 ≥ 2.5 m 没有挡路的块、坡缓（驴车过得去）；与 0610 地面接缝最大差 0；
//   2 村口沟截断官道：沟里人站着看不到沟沿外；村北沿除板桥外车过不去（沟或战壕把每一条南北线都切断）；
//   3 13：沟口战壕里的人看得见沟北边的车和坟头；车的位置在沟北沿外；
//   4 救护所院门 → 村西 → 铁路桥北头走得通；桥面（枕木）连续、能走人；北段路基没轨、桥南有轨；
//   5 沙河：两岸陡坎、河床有沙有水，人能从滑坡道下到河床再上对岸；
//   6 18：桥北土坎后蹲着的人北边机枪位看不见、离开土坎就看得见；南头河堤上的人看得见机枪位；
//   7 没有第二版的石板桥、渡口、浮桥、旧河堤 / 北沙河、豁子的残留。
// 另查：生成两次逐字相同、过 ValidateBlockoutScene；地标齐、都在场地里、过校验；涂色；救护所（院门、厢房门与门槛、两处洞能钻进去）、女娃家（塌了半截的墙）；
// 教堂比民房高、院门朝街；老汉 / 钻洞一家 / 枕木垛 / 标语；北门门洞与城墙；五个信号的随信号体块齐全。

import assert from "node:assert/strict";
import { ValidateBlockoutScene, NormalizeLandmarks } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import {
  BuildFirstLevel1218Scene, CompareWith0610, RouteProfile, BlocksNearLine, RectDist, L1218SightChecks, BlockCenterY, SolidBlocks, L1218_CART_ROUTE, L1218_HOLES,
  HoleWorld, AT_FLOOR_BOX, HECHA_FLOOR_Y, HECHA_END,
} from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_GROUND, L1218_HEIGHTS as H, L1218_AT_DITCH as AT, L1218_PLANK as PK, L1218_TRENCH as TR, L1218_VILLAGE as VL, L1218_YARDS, L1218_CHURCH as CH,
  L1218_AID as A, L1218_GIRL_YARD as GY, L1218_RAIL as RL, L1218_RAIL_BRIDGE as RB, L1218_RIVER as RV, L1218_BANK as BK, L1218_LEVEE as LV, L1218_NORTH_GATE as NG,
  L1218_FIELD_PATH as FP, L1218_LANES, L1218_RAIL_RAMPS, L1218_SOUTH_ROAD, L1218_SIGNALS as SIG, L1218_PLACES as PL, L1218_BOUNDS as B, L1218_SLEEPER_PILES, L1218_SLOGANS, L1218_OLD_MAN, L1218_FAMILY_HOLE,
  RiverAtX, StreetFrame,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { ReadBlockoutSceneDocSync } from "./Script_SceneNode.mjs";

// 2026-10-31：场景生成器退休，场景以 Scenes/FirstLevelWhitebox 为准（三段合一，docs/Data_Scene.md）；
// 下面的设计约束改查场景按 FirstLevel1218 的范围取出来的那一块——在场景编辑器里改坏了，这里会报。
const a = ReadBlockoutSceneDocSync("FirstLevel1218");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));

const sample = HeightGridSampler(a.terrain);
const stand = BlockStandSampler(a.blocks, a.gates, sample, () => false);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");
assert.ok(a.blocks.every((x) => !x.signal && !x.appearSignal), "blocks 里不许带信号");
const s = L1218SightChecks(a, sample, stand);
const Clear = (r, what) => assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block} 挡` : `地面挡 ${r.ground}`}`);
const Blocked = (r, what) => assert.ok(r.ground > 0.1 || r.block, `${what}（地面挡 ${r.ground}）`);

// --- 1. 驴车那条路：连续、宽 ≥ 2.5 m、坡缓；接缝差 0 ---
const cmp = CompareWith0610(sample);
assert.ok(cmp.worst <= 0.001, `接缝 z ${L1218_GROUND.seamZ}±1 与 0610 地面不一致：最大差 ${cmp.worst} m（(${cmp.at?.x},${cmp.at?.z})）`);
if (cmp.file) assert.ok(cmp.file.worst <= 0.02, `耿家庄村南那一截与 0610 场景文件不一致：最大差 ${cmp.file.worst} m（(${cmp.file.at.x},${cmp.file.at.z})）`);
else console.log("提示：没有 Blockout/FirstLevel0610.scene.json，跳过与场景文件的比对");
const route = RouteProfile(stand, L1218_CART_ROUTE, { fromZ: 547 });
assert.ok(route.points.length > 300, "驴车那条路要连成一条（村南口到救护所院门外）");
assert.ok(route.maxStep <= 0.12, `驴车那条路每 0.5 m 落差最大 ${route.maxStep}（(${route.stepAt?.x},${route.stepAt?.z})，要 ≤ 0.12）`);
assert.ok(route.maxLat <= 0.2, `驴车那条路横向（±1.25 m）高差最大 ${route.maxLat}（(${route.at?.x},${route.at?.z})）`);
const routeBlocks = BlocksNearLine(a.blocks, L1218_CART_ROUTE.filter((p) => p.z >= 547), 1.25).filter((id) => !/^Plank_/.test(id));
assert.deepEqual(routeBlocks, [], `驴车那条路离中线 1.25 m 内有挡路的块：${routeBlocks.join(",")}`);
assert.ok(Math.hypot(L1218_CART_ROUTE[0].x - PL.villageSouth.x, L1218_CART_ROUTE[0].z - PL.villageSouth.z) < 0.1 && Math.hypot(L1218_CART_ROUTE.at(-1).x - PL.aidGateOut.x, L1218_CART_ROUTE.at(-1).z - PL.aidGateOut.z) < 0.1, "路从村南口起、到救护所院门外止");
const planks = a.blocks.filter((x) => x.plank);
assert.ok(planks.length >= 2 && planks.every((p) => p.deck), "板桥是几块门板（deck）");
const plankW = Math.max(...planks.map((p) => p.x + p.w / 2)) - Math.min(...planks.map((p) => p.x - p.w / 2));
assert.ok(plankW >= 2.5 && plankW <= 2.8, `板桥宽 ${plankW.toFixed(2)}（契约 2.6，够一辆车）`);
for (const p of planks) assert.ok(p.z - p.d / 2 <= AT.z - AT.topW / 2 + 0.05 && p.z + p.d / 2 >= AT.z + AT.topW / 2 - 0.05, `${p.id} 要盖住沟顶宽`);
for (let z = PK.fromZ; z <= PK.toZ; z += 0.25) for (const dx of [-1.2, 0, 1.2]) Near(stand(PK.x + dx, z), H.plankDeckY, 0.15, `板桥 (${PK.x + dx},${z}) 站上去的高度`);
Near(sample(PK.x, PK.fromZ - 0.6), H.plankDeckY, 0.1, "板桥北头与官道路面齐平");
Near(sample(PK.x, PK.toZ + 0.6), H.plankDeckY, 0.1, "板桥南头与主街路面齐平");

// --- 2. 村口沟截断官道：沟里人站着看不到沟沿外；除板桥外车过不去 ---
Near(sample(88, AT.z), AT.floorY, 0.05, "沟底");
assert.ok(H.plain - AT.floorY >= 2.5 && H.plain - AT.floorY <= 3.0, "沟深 2.5–3 m");
Blocked(s.ditchToNorth, "沟底站着的人看不到北沟沿外");
Blocked(s.ditchToSouth, "沟底站着的人看不到南沟沿外");
assert.ok(AT.toX - AT.fromX >= 28 && AT.topW >= 3.8, "沟长约 30、宽约 4");
for (let x = AT.fromX + 1; x <= AT.toX - 1; x += 0.5) {
  if (Math.abs(x - PK.x) < PK.w / 2 + 0.6) continue;
  let drop = 0;
  for (let z = AT.z - AT.topW / 2 - 0.3; z <= AT.z; z += 0.25) drop = Math.max(drop, sample(x, z - 1.0) - sample(x, z));
  assert.ok(drop >= 2.0, `沟壁 x${x} 不够陡：1 m 内只落 ${drop.toFixed(2)}`);
}
// 村北沿每一条南北线（x 52…204）都被沟或战壕切断（除板桥那一条）：壕 ≥ 1 m 深、沟 ≥ 2.5 m 深
for (let x = 53; x <= 203; x += 1) {
  if (Math.abs(x - PK.x) < PK.w / 2 + 0.6) continue;
  let low = Infinity;
  for (let z = 626; z <= 646; z += 0.25) low = Math.min(low, sample(x, z));
  assert.ok(low <= H.plain - 1.0, `村北沿 x${x} 没被沟 / 战壕切断（最低 ${low.toFixed(2)}）`);
}
const abatis = a.blocks.filter((x) => x.abatis);
assert.ok(abatis.length >= 6 && abatis.every((x) => x.z > AT.z + AT.topW / 2 && x.semantic === "foliage") && !abatis.some((x) => Math.abs(x.x - PK.x) < x.w / 2 + 1.2), "沟南沿堆杂木、板桥口子留空");
assert.ok(a.blocks.filter((x) => x.wire).length >= 30, "铁丝网（桩 + 横线）");
assert.ok(a.ways.trenches.length >= 3, "ways 里有战壕与沟");

// --- 3. 13：战壕里看得见沟北边的车和坟头；车在沟北沿外 ---
Near(sample(PL.trenchSquad.x, PL.trenchSquad.z), TR.floorY, 0.08, "沟口东段战壕底");
Clear(s.trenchToTank1, "沟口战壕里要看得见沟北沿外的车 1");
Clear(s.trenchToTank2, "沟口战壕里要看得见后头的车 2");
for (const g of s.trenchToGraves) Clear(g, `沟口战壕里要看得见坟头 ${g.id}`);
for (const t of [PL.tankette1, PL.tankette2]) assert.ok(t.z < AT.z - AT.topW / 2 - 3.36 / 2 - 0.5 && sample(t.x, t.z) > H.plain - 0.45, `车 (${t.x},${t.z}) 要停在沟北沿外的平地上`);

// --- 4. 救护所院门 → 村西 → 铁路桥北头走得通；桥面能走；北段没轨 ---
const Walkable = (line, what, maxStepM = 0.5) => {
  const hits = BlocksNearLine(a.blocks.filter((x) => !(Number.isFinite(x.y) && x.y - x.h / 2 - sample(x.x, x.z) > 2.2)), line, 0.45, 0.6);   // 头顶上的（门洞上方）不算
  assert.deepEqual(hits, [], `${what} 被块挡住：${hits.join(",")}`);
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1], q = line[i], n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.5);
    for (let k = 1; k <= n; k++) {
      const a0 = { x: p.x + (q.x - p.x) * (k - 1) / n, z: p.z + (q.z - p.z) * (k - 1) / n }, a1 = { x: p.x + (q.x - p.x) * k / n, z: p.z + (q.z - p.z) * k / n };
      const d = Math.abs(stand(a1.x, a1.z) - stand(a0.x, a0.z));
      assert.ok(d <= maxStepM, `${what} 在 (${a1.x.toFixed(1)},${a1.z.toFixed(1)}) 一步高差 ${d.toFixed(2)}`);
    }
  }
};
const SL = L1218_LANES.southLane, WX = L1218_LANES.westExit;
const toBridge = [PL.aidGateOut, { x: SL.c, z: 692 }, { x: SL.c, z: WX.c }, { x: WX.from, z: WX.c }, ...FP.line.slice(1), PL.railRampTop, { x: RL.x, z: RB.northZ - 1.5 }];
Walkable(toBridge, "救护所院门 → 村西口 → 田间小路 → 上路基的土坡 → 桥北头", 0.3);
Walkable([PL.aidGateOut, PL.aidGateIn, { x: 80, z: 690.5 }, { x: A.xiang.box.maxX + 1.3, z: A.xiang.door.z }], "院门 → 院里 → 厢房门口");
Walkable([L1218_LANES.north.from > 0 ? { x: 60, z: L1218_LANES.north.c } : null, { x: 97, z: L1218_LANES.north.c }, { x: 97, z: 687 }].filter(Boolean), "北头小巷 → 救护所门前");
Near(sample(RL.x, 700), RL.topY, 0.02, "北段路基顶");
assert.ok(sample(RL.x, 700) - sample(RL.x + 9, 700) >= 2.0, "路基比人高（≥ 2 m）");
const sleepers = all.filter((x) => x.sleeper).sort((p, q) => p.z - q.z);
assert.ok(sleepers.length >= 60, `桥面枕木 ${sleepers.length} 根`);
assert.ok(sleepers[0].z - sleepers[0].d / 2 - RB.northZ <= 0.45 && RB.southZ - (sleepers.at(-1).z + sleepers.at(-1).d / 2) <= 0.45, "枕木从北桥头铺到南桥头");
for (let i = 1; i < sleepers.length; i++) {
  const gap = sleepers[i].z - sleepers[i].d / 2 - (sleepers[i - 1].z + sleepers[i - 1].d / 2);
  assert.ok(gap >= 0.2 && gap <= 0.42, `枕木缝 ${gap.toFixed(2)} m（缝里看得见底下、人能一格一格踩过去）`);
}
assert.ok(sleepers.every((x) => Math.abs(x.y + x.h / 2 - H.sleeperTopY) < 0.01 && Math.abs(H.sleeperTopY - RL.topY) <= 0.08 && x.w >= 2.5), "枕木顶与路基顶差 ≤ 8 cm、枕木够长");
assert.ok(sample(RL.x, RB.northZ - 0.3) >= RL.topY - 0.05 && sample(RL.x, RB.southZ + 0.3) >= RL.topY - 0.05, "两头路基顶接桥面");
const rails = all.filter((x) => /^Rail(Track|Line)_/.test(x.id));
assert.ok(rails.length > 0 && rails.every((x) => x.z - x.d / 2 >= RB.northZ - 0.01), "北段（桥北）光路基：没有轨");
assert.ok(all.filter((x) => /^RailBed_/.test(x.id)).every((x) => x.z > RB.southZ) && rails.some((x) => x.z > RB.southZ + 20), "桥南有轨有枕木");
assert.equal(a.blocks.filter((x) => /^RailPier_/.test(x.id)).length, RB.spans - 1, "三座石墩");
assert.ok(all.filter((x) => /^RailGirder_/.test(x.id)).length === RB.spans * 2 && !all.some((x) => /^Rail/.test(x.id) && x.semantic === "foliage"), "四孔钢梁，每孔两根");
assert.ok(!all.some((x) => /Railing|Handrail/.test(x.id)), "铁路桥无栏杆");
// 演员站得上桥面（standOn 走道，2026-10-26）：从北桥头到南桥头每 0.25 m 站人取地都是枕木顶，枕木缝里也不掉下去
const walks = a.blocks.filter((x) => x.walkway);
assert.ok(walks.length === RB.spans && walks.every((x) => x.standOn === true && x.visual === false && Math.abs(x.y + x.h / 2 - H.sleeperTopY) < 0.01), "每孔一条看不见的 standOn 走道，顶在枕木顶");
for (let z = RB.northZ + 0.7; z < RB.southZ - 0.7; z += 0.25) for (const dx of [-1.0, 0, 1.0]) Near(stand(RL.x + dx, z), H.sleeperTopY, 0.01, `铁路桥面 (${(RL.x + dx).toFixed(1)},${z.toFixed(2)}) 站上去的高度`);
for (let z = RB.northZ - 1.5; z < RB.southZ + 1.5; z += 0.5) assert.ok(Math.abs(stand(RL.x, z + 0.5) - stand(RL.x, z)) <= 0.15, `北桥头 → 枕木桥面 → 南桥头 z${z} 一步高差`);   // 桥墩、钢梁在桥面底下，不算挡

// --- 5. 沙河：陡坎、沙床、一股水；滑坡道下去再上来 ---
for (const x of [-150, -60, 0, 60, 120, 200]) {
  const r = RiverAtX(x);
  const bedZ = r.streamZ - r.northToe > r.southToe - r.streamZ ? r.northToe + 2.5 : r.southToe - 2.5;
  assert.ok(Math.abs(bedZ - r.streamZ) > 5, `河床取样点离水太近 x${x}`);
  Near(sample(x, bedZ), H.riverBedY, 0.08, `河床（沙） x${x}`);
  const northDrop = sample(x, r.northTop - 0.3) - sample(x, r.northToe + 0.3);
  const southDrop = sample(x, r.southTop + 0.3) - sample(x, r.southToe - 0.3);
  if (!RV.slides.some((sl) => Math.abs(x - sl.x) < 4) && Math.abs(x - RL.x) > 4) assert.ok(northDrop >= 2.6 && southDrop >= 2.6, `沙河 x${x} 两岸要陡（2.6 m 落差在 ${(RV.cliffM + 0.6).toFixed(1)} m 内）：北 ${northDrop.toFixed(2)} / 南 ${southDrop.toFixed(2)}`);
  Near(sample(x, r.streamZ), H.streamFloorY, 0.06, `沙河 x${x} 中间那一股水的底`);
}
const water = a.blocks.filter((x) => /^SandRiverWater_/.test(x.id));
assert.ok(water.length >= 40 && water.every((x) => x.semantic === "water" && x.solid === false && Math.abs(x.y + x.h / 2 - H.streamTopY) < 0.01 && x.d >= 6 && x.d <= 8), "那一股水：宽 6–8、齐小腿（水块）");
assert.ok(H.streamTopY - H.streamFloorY >= 0.3 && H.streamTopY - H.streamFloorY <= 0.5, "水深约 0.4");
const sand = a.paint.find((p) => p.id === "SandBed");
assert.ok(sand && sand.poly.length >= 20, "河床涂成沙");
const slideN = RV.slides.find((x) => x.bank === "north"), slideS = RV.slides.find((x) => x.bank === "south");
const rn = RiverAtX(slideN.x), rs = RiverAtX(slideS.x);
const wade = [{ x: slideN.x, z: rn.northTop - 6 }, { x: slideN.x, z: rn.northToe + 5 }, { x: slideS.x, z: rs.southToe - 5 }, { x: slideS.x, z: rs.southTop + 2 }];
Walkable(wade, "北岸 → 滑坡道 → 河床 → 蹚水 → 滑坡道 → 南岸", 0.35);

// --- 6. 18：土坎后蹲着的人机枪看不见、离开就看得见；河堤上看得见机枪 ---
Blocked(s.mgToCover, "田里那挺机枪要看不见桥北土坎后头蹲着的人");
Clear(s.mgToExposed, "离开土坎往桥头跑的人机枪要看得见");
Clear(s.leveeToMg, "南头河堤上趴着的人要看得见机枪位");
Near(sample(-80, BK.z), BK.topY, 0.05, "土坎顶（高 1 m）");
assert.ok(BK.z < RB.northZ - 25 && BK.z > RB.northZ - 40 && BK.fromX > RL.x + 6, "土坎在桥北 25–40 m、路基东侧");
assert.ok(PL.ijaMg18.z < BK.z - 20 && Math.abs(sample(PL.ijaMg18.x, PL.ijaMg18.z) - H.plain) < 0.2, "机枪位在北边田里");
Near(sample(PL.leveePlayer.x, PL.leveePlayer.z), LV.crestY, 0.05, "南头河堤顶（1.5 m）");
{ const fx = (LV.foxhole.fromX + LV.foxhole.toX) / 2, dep = sample(fx, LV.foxhole.z + 2.2) - sample(fx, LV.foxhole.z); assert.ok(dep >= 0.45 && dep <= 0.8, `堤后的散兵坑（浅）深 ${dep.toFixed(2)}`); }
Walkable([{ x: RL.x, z: RB.southZ + 1.5 }, { x: RL.x, z: L1218_RAIL_RAMPS[1].to.z }, L1218_RAIL_RAMPS[1].to, L1218_RAIL_RAMPS[1].from, ...L1218_SOUTH_ROAD.line.slice(1), { x: NG.gate.x, z: NG.wall.z + NG.wall.t / 2 + 1.5 }], "桥南头 → 路基顶 → 下路基的土坡 → 南岸路 → 北门", 0.3);
Clear(s.leveeToNorthBank, "南头河堤上看得见北岸桥头路基上的人");

// --- 7. 没有第二版的残留 ---
const OLD = /^(StoneDeck|StonePier_|BridgeWater$|Deck_\d|Boat_\d|Post_[WE]\d|LanternPost_|BridgeLantern_|FerryHouse_|FerryPlatform|Yard(North|South|West|East|MainHouse|Kitchen|GateLamp|GateLintel|Lantern)|Xiang|TrenchSandbags_|Breach|RiverWater$|Debris(Deck|Boat)_|Charge_\d|Fuse$|CityWall|GateHouse_|HechaWater_|OverturnedCart_)/;
// 三段合一（2026-10-31）后这一块会多带场地外 64 m 内 06–10 的东西（村子边上的房子），残留只查场地里的
const InSite = (x) => x.x >= B.minX && x.x <= B.maxX && x.z >= B.minZ && x.z <= B.maxZ;
assert.deepEqual(all.filter((x) => OLD.test(x.id) && InSite(x)).map((x) => x.id), [], "第二版的块（石板桥、渡口、浮桥、接收院、豁子、旧北门）不该还在");
for (const id of ["VillageWestEdge_1", "VillageSouthEdge_1", "Wall_x535_1", "Fence_SW1b_N"]) assert.ok(byId.has(id), `0610 的 ${id} 照原样带过来（第二版的豁子不要了）`);
for (const [x, z, what] of [[-40, 636, "旧北堤"], [-40, 714, "旧南堤"], [-8, 675, "旧北沙河"], [-40, 675, "旧北沙河"], [17, 628, "旧低洼"], [34.5, 600, "河汊子往南"], [34.5, 640, "河汊子往南"]]) {
  assert.ok(Math.abs(sample(x, z) - H.plain) < 0.45, `${what} (${x},${z}) 不该还在：${sample(x, z).toFixed(2)}`);
}
Near(sample(34.5, 560), HECHA_FLOOR_Y, 0.05, "河汊子直段接着 0610");
assert.ok(sample(34.5, HECHA_END.endZ + 1) > H.plain - 0.3, "河汊子在沟尾收住");
for (const x of all) if (x.z >= 556) assert.ok(x.x >= B.minX && x.x <= B.maxX && x.z <= B.maxZ, `${x.id} 在场地外 (${x.x},${x.z})`);

// --- 地标与涂色 ---
assert.ok(Array.isArray(a.landmarks) && a.landmarks.length >= 40, "地标齐");
const lms = NormalizeLandmarks(a.landmarks);
assert.equal(lms.length, a.landmarks.length, "地标都过归一化");
for (const lm of lms) assert.ok(lm.x >= B.minX && lm.x <= B.maxX && lm.z >= B.minZ && lm.z <= B.maxZ, `地标 ${lm.id} 在场地外`);
const LM = new Map(lms.map((x) => [x.id, x]));
// 三段合一（2026-10-31）：和 06–10 重名的三个地标（官道、主街、河）在场景里改名带 _1218
for (const id of ["LmVillageSouth", "LmDirtRoad", "LmPostRoad_1218", "LmAtDitch", "LmPlank", "LmMainStreet_1218", "LmChurch", "LmAid", "LmRailNorth", "LmRailBridge", "LmRiver_1218", "LmBank", "LmLevee", "LmNorthGate", "LmGirlYard", "LmOldMan", "LmVillageWest"]) assert.ok(LM.has(id), `缺地标 ${id}`);
assert.ok(Math.abs(LM.get("LmPlank").x - PK.x) < 0.05 && Math.abs(LM.get("LmAtDitch").z - AT.z) < 0.05, "板桥、沟的地标框对得上");
assert.ok(LM.get("LmAidHoleA").y < H.plain && LM.get("LmAidHoleA").y - LM.get("LmAidHoleA").h / 2 <= H.holeFloorY + 0.05, "洞的地标框从洞底立到地面");
for (const id of ["Fields", "Village", "SandBed", "Stream", "Road_DirtRoad", "Road_PostRoadNorth", "Road_MainStreet", "RailNorth", "RailSouth"]) assert.ok(a.paint.some((p) => p.id === id), `缺涂色 ${id}`);

// --- 北沙河村：老汉、钻洞一家、枕木垛、标语、教堂 ---
assert.ok(L1218_YARDS.length >= 18, "主街两边院子");
for (const y of L1218_YARDS) {
  for (const corner of [[y.box.minX, y.box.minZ], [y.box.maxX, y.box.minZ], [y.box.minX, y.box.maxZ], [y.box.maxX, y.box.maxZ]]) {
    assert.ok(Math.abs(StreetFrame(corner[0], corner[1]).d) >= 3.4 || StreetFrame(corner[0], corner[1]).s < -2 || StreetFrame(corner[0], corner[1]).s > 142, `${y.id} 的角 (${corner}) 压到主街`);
  }
  assert.ok(a.blocks.some((x) => x.id.startsWith(`${y.id}_House`)) && a.blocks.some((x) => x.id === `${y.id}_House1_Roof`), `${y.id} 有房子和草顶`);
}
const oldMan = L1218_OLD_MAN.at, s1 = L1218_YARDS.find((y) => y.oldMan);
assert.ok(Math.abs(oldMan.x - s1.box.maxX) < 2 && StreetFrame(oldMan.x, oldMan.z).s < 25 && byId.has("OldManStool"), "老汉坐在主街靠沟口那头、自家院门口");
const fam = L1218_FAMILY_HOLE, famIn = HoleWorld(fam, fam.rampM + fam.chamber.d / 2, 0);
Near(sample(famIn.x, famIn.z), H.holeFloorY, 0.05, "钻洞那家的洞底");
assert.equal(byId.get("FamilyHoleMat").appearSignal, SIG.familyHidden, "钻洞那家的席子随 FamilyHidden 出现");
assert.equal(L1218_SLEEPER_PILES.filter((p) => byId.has(p.id)).length, 3, "三垛枕木");
assert.ok(L1218_SLOGANS.every((x) => byId.get(x.id)?.slogan) && L1218_SLOGANS.length >= 3, "几面朝街的墙上贴标语");
const hall = byId.get("Church_Hall"), tower = byId.get("Church_Tower");
assert.ok(hall.h >= 5.5 && tower.h >= 9 && hall.h > VL.houseH + 2, "教堂正房比民房高、有钟楼");
const front = a.blocks.filter((x) => /^Church_WallFront/.test(x.id));
assert.ok(front.length === 2, "教堂院门朝街开（前墙留门洞）");
Clear(s.turnToChurch, "主街往西拐的地方看得见教堂院门");
Clear(s.villageSouthToDitch, "村南口往南看得见村口一带");

// --- 救护所、女娃家 ---
const east = a.blocks.filter((x) => x.id.startsWith("AidWallE")).sort((p, q) => p.z - q.z);
const gateW = east[1].z - east[1].d / 2 - (east[0].z + east[0].d / 2);
assert.ok(gateW >= 1.8 && Math.abs(east[0].x - A.box.maxX) < 0.01, `救护所院门 ${gateW.toFixed(2)} m、开在东墙`);
const xe = a.blocks.filter((x) => x.id.startsWith("AidXiangE")).sort((p, q) => p.z - q.z);
const doorW = xe[1].z - xe[1].d / 2 - (xe[0].z + xe[0].d / 2);
assert.ok(doorW >= 1.1, `厢房门洞 ${doorW.toFixed(2)} m`);
const th = byId.get("AidXiangThreshold");
assert.ok(th && th.h >= 0.12 && th.h <= 0.2 && Math.abs(th.x - A.xiang.box.maxX) < 0.01, "厢房门槛");
Near(stand(A.xiang.box.maxX, A.xiang.door.z) - sample(A.xiang.box.maxX, A.xiang.door.z), th.h, 0.01, "门槛站上去抬高");
const lintel = byId.get("AidXiangDoorLintel");
assert.ok(BlockCenterY(lintel, sample) - lintel.h / 2 - sample(A.xiang.box.maxX, A.xiang.door.z) >= 1.95, "厢房门洞高 ≥ 1.95");
assert.ok(!a.blocks.some((x) => x.house && x.x > A.xiang.box.minX + 0.5 && x.x < A.xiang.box.maxX && x.z > A.xiang.box.minZ && x.z < A.xiang.box.maxZ), "厢房是空心的");
Near(sample(A.dongguaInside.x, A.dongguaInside.z), VL.y, 0.05, "厢房里地面");
for (const hole of A.holes) {
  const mid = HoleWorld(hole, hole.rampM + hole.chamber.d / 2, 0), roof = all.filter((x) => x.holeRoof === hole.id);
  Near(sample(mid.x, mid.z), H.holeFloorY, 0.05, `${hole.id} 洞底`);
  assert.ok(roof.length >= 1 && roof.every((r) => r.y - r.h / 2 - H.holeFloorY >= 1.5), `${hole.id} 有洞顶、洞里净高 ≥ 1.5（人能钻进去）`);
  let step = 0;
  for (let u = -0.5; u < hole.rampM + 1; u += 0.25) { const p = HoleWorld(hole, u, 0), q = HoleWorld(hole, u + 0.25, 0); step = Math.max(step, Math.abs(sample(q.x, q.z) - sample(p.x, p.z))); }
  assert.ok(step <= 0.25, `${hole.id} 坡道每 0.25 m 落差 ${step.toFixed(2)}（拖得下去）`);
}
assert.ok(A.holes[0].mouth && Math.hypot(A.holes[0].mouth.x - A.wallRootDonggua.x, A.holes[0].mouth.z - A.wallRootDonggua.z) >= 7 && Math.hypot(A.holes[0].mouth.x - A.wallRootDonggua.x, A.holes[0].mouth.z - A.wallRootDonggua.z) <= 14, "墙根到洞口十几步（7–14 m）");
const dragCover = BlocksNearLine(a.blocks, [A.wallRootDonggua, A.holes[0].mouth], 0.7, 0.4);
assert.deepEqual(dragCover, [], `墙根到洞口中间有挡的块：${dragCover.join(",")}`);
assert.ok(byId.get("AidWallS_Collapsed").h <= 0.8 && a.blocks.some((x) => x.id.startsWith("AidWallS_")) && !a.blocks.some((x) => /^AidWallS(_\d)?$/.test(x.id) && x.x > GY.collapsed.fromX && x.x < GY.collapsed.toX), "救护所南墙（女娃家北墙）东半截塌了");
Clear(s.wallToGirlHole, "救护所墙根越过塌了的墙看得见女娃家的洞口");
assert.equal(byId.get("GirlHoleMat").appearSignal, SIG.girlHoleCovered, "女娃家洞口的席子随 GirlHoleCovered 出现");

// --- 北门 ---
const wall = a.blocks.filter((x) => x.id.startsWith("NgCityWall")).sort((p, q) => p.x - q.x);
assert.equal(wall.length, 2, "城墙两段");
Near(wall[1].x - wall[1].w / 2 - (wall[0].x + wall[0].w / 2), NG.gate.w, 0.01, "北门门洞宽");
assert.ok(wall.every((x) => x.h === NG.wall.h && x.d === NG.wall.t) && wall[0].x - wall[0].w / 2 > RL.x + RL.topW / 2, "城墙高 8、厚 6、在铁路东边");
assert.ok(NG.wall.z - RB.southZ >= 120 && NG.wall.z - RB.southZ <= 170, "北门在南岸往南约 150 m");

// --- 随信号体块 ---
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
for (const sg of Object.values(SIG)) assert.ok(signals.has(sg), `随信号体块缺信号 ${sg}`);
assert.equal(byId.get("OverturnedCart").appearSignal, SIG.cartOverturned, "救护所门前翻倒的车随 CartOverturned 出现");
assert.ok(Math.abs(byId.get("OverturnedCart").x - PL.aidGateOut.x) < 6 && Math.abs(byId.get("OverturnedCart").z - PL.aidGateOut.z) < 6, "翻倒的车在救护所院门口");
const spanLen = (RB.southZ - RB.northZ) / RB.spans;
const blownZ = RB.northZ + spanLen * RB.blownSpans.length;
assert.ok(all.filter((x) => /^Rail(Girder|Sleeper|Track)_/.test(x.id)).every((x) => (x.z < blownZ) === (x.signal === SIG.bridgeBlown)), "北头两孔的钢梁、枕木、轨随 BridgeBlown 消失，其余不动");
assert.ok(a.gates.filter((g) => /^FallenGirder_/.test(g.id) && g.appearSignal === SIG.bridgeBlown).every((g) => g.y - g.h / 2 <= H.riverBedY + 0.6 && g.z > RB.northZ && g.z < blownZ + 1) && a.gates.some((g) => /^FallenGirder_/.test(g.id)), "断梁砸进河床");
assert.ok(a.gates.filter((g) => /^RailCharge_/.test(g.id)).length === RB.charges.length && byId.get("RailFuse_Bridge").appearSignal === SIG.chargesSet && byId.get("RailFuse_Bank").appearSignal === SIG.chargesSet, "桥墩上的炸药 + 引线（拉到河堤后）");
assert.ok(SolidBlocks(a, [SIG.bridgeBlown]).filter((x) => x.sleeper).length < SolidBlocks(a, []).filter((x) => x.sleeper).length, "炸了以后桥面少了一截");

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格，${(JSON.stringify(a).length / 1024 / 1024).toFixed(2)} MB；接缝最大差 ${cmp.worst} m；`
  + `驴车路最陡 ${route.maxStep}、横向 ${route.maxLat}；沟深 ${(H.plain - AT.floorY).toFixed(1)}；战壕→车 ${s.trenchToTank1.distM} m；机枪→坎后被挡 ${s.mgToCover.ground}；河堤→机枪 ${s.leveeToMg.distM} m；`
  + `院门 ${gateW.toFixed(2)}、厢房门 ${doorW.toFixed(2)}；枕木 ${sleepers.length} 根`);
