// Script_EditorBlockoutFirstLevel1218SceneTest.mjs —— 11–18 白盒（第四版，北沙河村，2026-11-02）场地的 node 回归
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218SceneTest.mjs
// 查的是场景 Scenes/FirstLevelWhitebox 按 FirstLevel1218 的范围取出来的那一块（场景文件为准；在场景编辑器里改坏了这里会报）。
// 钉住契约（tmp/Contract1218_v4.md 第四节 A）「必须成立」的十一条：
//   ① 村南口 → 土路 → 官道 → 板桥 → 官道 → 南街 → 出村小路 → 救护所门前 车走得通、坡缓、离中线 1.25 m 内无挡，与 0610 接缝差 0；
//   ② 沟里看不到两边、村北沿每条南北线都被沟或壕切断（板桥除外）；
//   ③ 沟口东段战壕看得见北边坟头与田埂；
//   ④ 救护所院门 → 出村小路 → 北岸土路 → 土坡 → 铁路桥北头 → 枕木桥面 → 南头 → 南岸路 走得通，北段无轨桥南有轨；
//   ⑤ 沙河两岸陡、沙床、那股水、滑坡道走得通；
//   ⑥ 机枪 / 土坎 / 河堤三条视线；
//   ⑦ 南街口望得见官道桥；
//   ⑧ 救护所院门、厢房门与门槛、院里两处洞 + 女娃家的洞 + 挨炸那家的洞能钻进去、塌墙看得见女娃家洞口、墙根到洞口中间无挡；
//   ⑨ 没有第三版的老汉、钻洞一家、北门、村西口田间小路、x −104 的路基、东西向的旧沙河；
//   ⑩ 七个剧情事件的体块齐、事件名有中文；
//   ⑪ 场地 bounds 与高度图加长后这一块取得出来、过校验（0105 / 0610 的门禁另跑）。
// 另查：村子（35–45 个院子、随街转、离路 ≥ 0.6、每家有房有顶有门）、教堂比民房高、三口井、两处水塘、三垛枕木、四条标语、亮灯的院子、李子行五个空院、地标与涂色。
// ⑫ 18 引导（2026-11-02 第二轮）：北岸土路边三处小场景离路中线 ≤ 10 m、按走路顺序相邻 40–80 m、从路上看得见；铁路沿线电线杆 ≥ 12 根、7 m 高、35 m 一根、两岸都有；
//    夕阳 sunWest 在土路长直段 (100,868) → 桥北头 (−80,918) 延长线 ±5° 内、在场地里；路上 (60,880) 看得见桥北头与桥边的电线杆顶。

import assert from "node:assert/strict";
import { ValidateBlockoutScene, NormalizeLandmarks } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { SCENE_EVENTS } from "./Data_SceneEvents.mjs";
import {
  CompareWith0610, RouteProfile, BlocksNearLine, L1218SightChecks, BlockCenterY, SolidBlocks, BlockSight, L1218_CART_ROUTE, L1218_STRETCHER_ROUTE, L1218_HOLES,
  HoleWorld, HECHA_FLOOR_Y, HECHA_END, DitchZAtX, AllYards, YardConflicts, YardCorners, PlainHeight, L1218RoadsideSpots, TelegraphPoleZs,
} from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_GROUND, L1218_HEIGHTS as H, L1218_AT_DITCH as AT, L1218_PLANK as PK, L1218_TRENCH as TR, L1218_VILLAGE as VL, L1218_CHURCH as CH,
  L1218_AID as A, L1218_GIRL_YARD as GY, L1218_RAIL as RL, L1218_RAIL_BRIDGE as RB, L1218_RIVER as RV, L1218_BANK as BK, L1218_LEVEE as LV, L1218_GUANDAO_BRIDGE as GB,
  L1218_ROADS, L1218_RAIL_RAMPS, L1218_SIGNALS as SIG, L1218_PLACES as PL, L1218_BOUNDS as B, L1218_WELLS, L1218_PONDS, L1218_LIZIHANG as LZ, L1218_SLOGAN_TEXTS,
  L1218_ROADSIDE as RS, L1218_TELEGRAPH as TG,
  RiverAtX, RiverFrame, RiverPoint, RiverArcAtX,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { ReadBlockoutSceneDocSync } from "./Script_SceneNode.mjs";

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
const south = all.filter((x) => x.z >= L1218_GROUND.seamZ);
const s = L1218SightChecks(a, sample, stand);
const Clear = (r, what) => assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block} 挡` : `地面挡 ${r.ground}`}`);
const Blocked = (r, what) => assert.ok(r.ground > 0.1 || r.block, `${what}（地面挡 ${r.ground}）`);
const Walkable = (line, what, maxStepM = 0.5) => {
  const hits = BlocksNearLine(a.blocks.filter((x) => !(Number.isFinite(x.y) && x.y - x.h / 2 - sample(x.x, x.z) > 2.2)), line, 0.45, 0.6);   // 头顶上的（门洞上方、钢梁）不算
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

// --- ⑪ 场地：bounds 与高度图加长后取得出来 ---
assert.deepEqual(a.bounds, { ...B }, "这一块的范围 = 第四版场地 x −160…320、z 480…1080");
assert.ok(a.terrain.minZ + a.terrain.rows * a.terrain.cellM >= B.maxZ - 0.01, "高度图盖到 z 1080");
assert.ok(a.terrain.minX <= B.minX && a.terrain.minX + a.terrain.cols * a.terrain.cellM >= B.maxX, "高度图盖住 x −160…320");
assert.ok(Math.abs(sample(0, 1070) - H.plain) < 0.45 && Math.abs(sample(300, 1000) - H.plain) < 0.45, "新加长的南片是平地");

// --- ① 驴车那条路：连续、坡缓、无挡；接缝差 0 ---
const cmp = CompareWith0610(sample);
assert.ok(cmp.worst <= 0.001, `接缝 z ${L1218_GROUND.seamZ}±1 与 0610 地面不一致：最大差 ${cmp.worst} m（(${cmp.at?.x},${cmp.at?.z})）`);
const route = RouteProfile(stand, L1218_CART_ROUTE, { fromZ: 547 });
assert.ok(route.points.length > 600, `驴车那条路要连成一条（村南口到救护所门前，${route.points.length} 点）`);
assert.ok(route.maxStep <= 0.12, `驴车那条路每 0.5 m 落差最大 ${route.maxStep}（(${route.stepAt?.x},${route.stepAt?.z})，要 ≤ 0.12）`);
assert.ok(route.maxLat <= 0.2, `驴车那条路横向（±1.25 m）高差最大 ${route.maxLat}（(${route.at?.x},${route.at?.z})）`);
const routeBlocks = BlocksNearLine(a.blocks, L1218_CART_ROUTE.filter((p) => p.z >= 547), 1.25).filter((id) => !/^Plank_/.test(id));
assert.deepEqual(routeBlocks, [], `驴车那条路离中线 1.25 m 内有挡路的块：${routeBlocks.join(",")}`);
assert.ok(Math.hypot(L1218_CART_ROUTE[0].x - PL.villageSouth.x, L1218_CART_ROUTE[0].z - PL.villageSouth.z) < 0.1 && Math.hypot(L1218_CART_ROUTE.at(-1).x - PL.cartPark.x, L1218_CART_ROUTE.at(-1).z - PL.cartPark.z) < 0.1, "路从村南口起、到救护所门前的驴车停处止");
for (const p of [PL.junction, PL.southStreetCorner, { x: 121, z: 783 }]) assert.ok(L1218_CART_ROUTE.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.1), `路过 (${p.x},${p.z})`);
const planks = a.blocks.filter((x) => x.plank);
assert.ok(planks.length >= 2 && planks.every((p) => p.deck), "板桥是几块门板（deck）");
const plankW = Math.max(...planks.map((p) => p.x + p.w / 2)) - Math.min(...planks.map((p) => p.x - p.w / 2));
assert.ok(plankW >= 2.5 && plankW <= 2.8, `板桥宽 ${plankW.toFixed(2)}（契约 2.6，够一辆车）`);
for (const p of planks) assert.ok(p.z - p.d / 2 <= DitchZAtX(p.x) - AT.topW / 2 + 0.05 && p.z + p.d / 2 >= DitchZAtX(p.x) + AT.topW / 2 - 0.05, `${p.id} 要盖住沟顶宽`);
for (let z = PK.fromZ; z <= PK.toZ; z += 0.25) for (const dx of [-1.2, 0, 1.2]) Near(stand(PK.x + dx, z), H.plankDeckY, 0.15, `板桥 (${PK.x + dx},${z}) 站上去的高度`);
Near(sample(PK.x, PK.fromZ - 0.6), H.plankDeckY, 0.1, "板桥北头与官道路面齐平");
Near(sample(PK.x, PK.toZ + 0.6), H.plankDeckY, 0.1, "板桥南头与主街路面齐平");
Near(sample(34.5, 592.5), PlainHeight(34.5, 592.5) - 0.12, 0.1, "官道过河汊子沟尾的地方是平地（路面，没有沟）");

// --- ② 村口沟截断村北沿：沟里人站着看不到沟沿外；除板桥外车过不去 ---
Near(sample(PL.ditchFloor.x, PL.ditchFloor.z), AT.floorY, 0.05, "沟底");
assert.ok(H.plain - AT.floorY >= 2.5 && H.plain - AT.floorY <= 3.0, "沟深 2.5–3 m");
Blocked(s.ditchToNorth, "沟底站着的人看不到北沟沿外");
Blocked(s.ditchToSouth, "沟底站着的人看不到南沟沿外");
assert.ok(AT.line[0].x <= 40 && AT.line.at(-1).x >= 178 && AT.topW >= 3.8, "沟从 x 40 到 178、宽约 4");
for (let x = AT.line[0].x + 2; x <= AT.line.at(-1).x - 2; x += 1) {
  if (Math.abs(x - PK.x) < PK.plugHalfW + 0.6) continue;   // 板桥底下垫的土墩（顶 −0.75）那一截不算
  const zc = DitchZAtX(x);
  let drop = 0;
  for (let z = zc - AT.topW / 2 - 0.3; z <= zc; z += 0.25) drop = Math.max(drop, sample(x, z - 1.0) - sample(x, z));
  assert.ok(drop >= 2.0, `沟壁 x${x} 不够陡：1 m 内只落 ${drop.toFixed(2)}`);
}
// 村北沿每一条南北线（x 37…215）都被沟或战壕切断（除板桥那一条）：壕 ≥ 1 m 深、沟 ≥ 2.5 m 深
for (let x = 37; x <= 215; x += 1) {
  if (Math.abs(x - PK.x) < PK.w / 2 + 0.6) continue;
  let low = Infinity;
  for (let z = 630; z <= 668; z += 0.25) low = Math.min(low, sample(x, z));
  assert.ok(low <= H.plain - 1.0, `村北沿 x${x} 没被沟 / 战壕切断（最低 ${low.toFixed(2)}）`);
}
assert.ok(a.trenchPlan && a.trenchPlan.segments.map((t) => t.id).sort().join() === "VillageNorthEast,VillageNorthWest", "这一块带村北沿两段样条沟");
for (const [x, z] of [[60, 656.1], [120, 648.2], [200, 656.5]]) assert.ok(sample(x, z) <= TR.floorY + 0.2, `战壕底 (${x},${z}) ${sample(x, z).toFixed(2)}`);
assert.ok(sample(120, 647) > sample(120, 649.5) + 0.15 && sample(120, 647) > H.plain + 0.15, "战壕的弃土堆在北沿");
const abatis = a.blocks.filter((x) => x.abatis);
assert.ok(abatis.length >= 20 && abatis.every((x) => x.z > DitchZAtX(x.x) + AT.topW / 2 - 0.3 && x.semantic === "foliage") && !abatis.some((x) => Math.abs(x.x - PK.x) < x.w / 2 + 1.2), "沟南沿堆杂木、板桥口子留空");
assert.ok(!abatis.some((x) => x.x > 106 && x.x < 124), "沟口东段战壕前头那 18 m 还没堆杂木（战壕里看得出去）");
assert.ok(a.blocks.filter((x) => x.wire).length >= 40, "铁丝网（桩 + 横线）");
assert.ok(a.ways.trenches.some((l) => l.length >= 4 && Math.abs(l[0].x - AT.line[0].x) < 0.1), "ways 里有反坦克沟的中线");

// --- ③ 13：战壕里看得见沟北边的坟头与田埂；机枪看得见村南口 ---
Near(sample(PL.trenchSquad.x, PL.trenchSquad.z), TR.floorY, 0.1, "沟口东段战壕底");
for (const g of s.trenchToGraves) Clear(g, `沟口战壕里要看得见坟头 ${g.id}`);
Clear(s.trenchToRidge, "沟口战壕里要看得见沟北的田埂");
Clear(s.mgToVillageSouth, "七二七团机枪要看得见耿家庄村南口冒出来的钢盔");
for (const id of ["G_N1", "G_N2"]) { const lm = a.landmarks ? null : null; void lm; void id; }

// --- ④ 担架那条路：院门 → 出村小路 → 北岸土路 → 土坡 → 桥北头 → 枕木桥面 → 南头 → 下路基 → 南岸路 ---
Walkable(L1218_STRETCHER_ROUTE, "救护所院门 → 出村小路 → 北岸土路 → 上路基的土坡 → 桥北头", 0.3);
Walkable([PL.aidGateOut, PL.aidGateIn, { x: 104, z: 812.5 }, { x: A.xiang.box.maxX + 1.3, z: A.xiang.door.z }], "院门 → 院里 → 厢房门口");
Walkable([{ x: 170, z: 770 }, { x: 146, z: 777 }, { x: 121, z: 783 }, { x: 121, z: 812.5 }, PL.aidGateOut], "南街口 → 南街 → 出村小路 → 院门", 0.3);
for (const p of L1218_ROADS.northBank.line.slice(1, -1)) assert.ok(-RiverFrame(p.x, p.z).d - RV.halfTop >= 5, `北岸土路 (${p.x},${p.z}) 离北坎顶 ≥ 5 m`);
Near(sample(RL.x, 700), RL.topY, 0.02, "北段路基顶");
assert.ok(sample(RL.x, 700) - sample(RL.x + 9, 700) >= 2.0, "路基比人高（≥ 2 m）");
Near(sample(RL.x, 500), RL.topY, 0.02, "路基从场地北边起就有");
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
assert.ok(all.filter((x) => /^RailBed_/.test(x.id)).every((x) => x.z > RB.southZ) && rails.some((x) => x.z > RB.southZ + 20) && rails.some((x) => x.z > 1060), "桥南有轨有枕木，一直到场地南边");
assert.equal(a.blocks.filter((x) => /^RailPier_/.test(x.id)).length, RB.spans - 1, "三座石墩");
assert.ok(all.filter((x) => /^RailGirder_/.test(x.id)).length === RB.spans * 2 && !all.some((x) => /^Rail/.test(x.id) && x.semantic === "foliage"), "四孔钢梁，每孔两根");
assert.ok(!all.some((x) => /Railing|Handrail/.test(x.id)), "铁路桥无栏杆");
assert.ok((RB.southZ - RB.northZ) / RB.spans >= 10 && (RB.southZ - RB.northZ) / RB.spans <= 12, `每孔约 11 m（${((RB.southZ - RB.northZ) / RB.spans).toFixed(1)}）`);
const walks = a.blocks.filter((x) => x.walkway);
assert.ok(walks.length === RB.spans && walks.every((x) => x.standOn === true && x.visual === false && Math.abs(x.y + x.h / 2 - H.sleeperTopY) < 0.01), "每孔一条看不见的 standOn 走道，顶在枕木顶");
for (let z = RB.northZ + 0.7; z < RB.southZ - 0.7; z += 0.25) for (const dx of [-1.0, 0, 1.0]) Near(stand(RL.x + dx, z), H.sleeperTopY, 0.01, `铁路桥面 (${(RL.x + dx).toFixed(1)},${z.toFixed(2)}) 站上去的高度`);
for (let z = RB.northZ - 1.5; z < RB.southZ + 1.5; z += 0.5) assert.ok(Math.abs(stand(RL.x, z + 0.5) - stand(RL.x, z)) <= 0.15, `北桥头 → 枕木桥面 → 南桥头 z${z} 一步高差`);
Walkable([{ x: RL.x, z: RB.southZ + 1.5 }, { x: RL.x, z: L1218_RAIL_RAMPS[1].to.z }, L1218_RAIL_RAMPS[1].to, L1218_RAIL_RAMPS[1].from, ...L1218_ROADS.southRoad.line.slice(1), { x: -45, z: 1079 }], "桥南头 → 路基顶 → 下路基的土坡 → 南岸路 → 场地南边（县城的灯）", 0.3);

// --- ⑤ 沙河：陡坎、沙床、一股水；滑坡道下去再上来 ---
for (const x of [290, 230, 150, 60, -20, -90, -140]) {
  const r = RiverAtX(x), f = RiverFrame(r.center.x, r.center.z);
  const bedN = RiverPoint(r.s, -(RV.halfTop - RV.cliffM) + 2.5), bedS = RiverPoint(r.s, RV.halfTop - RV.cliffM - 2.5);
  Near(sample(bedN.x, bedN.z), H.riverBedY, 0.08, `河床（沙，北半） x${x}`);
  Near(sample(bedS.x, bedS.z), H.riverBedY, 0.08, `河床（沙，南半） x${x}`);
  const nTop = RiverPoint(r.s, -RV.halfTop - 0.3), nToe = RiverPoint(r.s, -(RV.halfTop - RV.cliffM) + 0.3), sTop = RiverPoint(r.s, RV.halfTop + 0.3), sToe = RiverPoint(r.s, RV.halfTop - RV.cliffM - 0.3);
  const northDrop = sample(nTop.x, nTop.z) - sample(nToe.x, nToe.z), southDrop = sample(sTop.x, sTop.z) - sample(sToe.x, sToe.z);
  if (!RV.slides.some((sl) => Math.abs(x - sl.x) < 4) && Math.abs(x - RL.x) > 4 && Math.abs(x - 257) > 8) assert.ok(northDrop >= 2.6 && southDrop >= 2.6, `沙河 x${x} 两岸要陡（2.6 m 落差在 ${(RV.cliffM + 0.6).toFixed(1)} m 内）：北 ${northDrop.toFixed(2)} / 南 ${southDrop.toFixed(2)}`);
  Near(sample(r.stream.x, r.stream.z), H.streamFloorY, 0.06, `沙河 x${x} 中间那一股水的底`);
  assert.ok(Math.abs(f.d) < 0.01, `河道坐标回到中线 x${x}`);
}
const water = a.blocks.filter((x) => /^SandRiverWater_/.test(x.id));
assert.ok(water.length >= 50 && water.every((x) => x.semantic === "water" && x.solid === false && Math.abs(x.y + x.h / 2 - H.streamTopY) < 0.01 && x.d >= 6 && x.d <= 8), "那一股水：宽 6–8、齐小腿（水块），顺着弯转");
assert.ok(H.streamTopY - H.streamFloorY >= 0.3 && H.streamTopY - H.streamFloorY <= 0.5, "水深约 0.4");
const sand = a.paint.find((p) => p.id === "SandBed");
assert.ok(sand && sand.poly.length >= 40, "河床涂成沙（顺着河道）");
const slideN = RV.slides.find((x) => x.bank === "north"), slideS = RV.slides.find((x) => x.bank === "south");
const sN = RiverArcAtX(slideN.x), sS = RiverArcAtX(slideS.x);
const wade = [RiverPoint(sN, -RV.halfTop - 6), RiverPoint(sN, -(RV.halfTop - RV.cliffM) + 5), RiverPoint(sS, RV.halfTop - RV.cliffM - 5), RiverPoint(sS, RV.halfTop + 2)];
Walkable(wade, "北岸 → 滑坡道 → 河床 → 蹚水 → 滑坡道 → 南岸", 0.35);
assert.ok(slideN.x > RL.x + 10 && slideN.x < RL.x + 20 && slideS.x > RL.x + 10 && slideS.x < RL.x + 20, "两处滑坡道在铁路桥东边 10–20 m");

// --- ⑥ 18：土坎后蹲着的人机枪看不见、离开就看得见；河堤上看得见机枪 ---
Blocked(s.mgToCover, "田里那挺机枪要看不见桥北土坎后头蹲着的人");
Clear(s.mgToExposed, "离开土坎往桥头跑的人机枪要看得见");
Clear(s.leveeToMg, "南头河堤上趴着的人要看得见机枪位");
Near(sample(-55, BK.z), BK.topY, 0.05, "土坎顶（高 1 m）");
Near(sample(PL.lastGroupCover.x, PL.lastGroupCover.z), BK.hollow.y, 0.08, "坎背后挖低的那一溜");
assert.ok(BK.z < RB.northZ - 15 && BK.fromX > RL.x + 6, "土坎在桥北、路基东侧");
assert.ok(Math.abs(sample(PL.ijaMg18.x, PL.ijaMg18.z) - H.plain) < 0.25 && PL.ijaMg18.x > RL.x + 5 && PL.ijaMg18.x < RL.x + 9, "机枪位在路基东脚的平地上");
Near(sample(PL.leveePlayer.x, PL.leveePlayer.z), LV.crestY, 0.05, "南头河堤顶（1.5 m）");
{ const fx = -66, fz = RiverPoint(RiverArcAtX(fx), RV.halfTop + LV.foxhole.offD).z, dep = sample(fx, fz + 2.2) - sample(fx, fz); assert.ok(dep >= 0.45 && dep <= 0.8, `堤后的散兵坑（浅）深 ${dep.toFixed(2)}`); }
for (const x of [-150, -120, -40]) { const p = RiverPoint(RiverArcAtX(x), RV.halfTop + LV.offD); Near(sample(p.x, p.z), LV.crestY, 0.1, `河堤顺着河道 x${x}`); }
Clear(s.leveeToNorthBank, "南头河堤上看得见北岸桥头路基上的人");
assert.ok(a.blocks.filter((x) => /^CityLight_/.test(x.id)).length >= 3 && a.blocks.filter((x) => /^CityLight_/.test(x.id)).every((x) => x.z >= 1065), "南岸路尽头几盏县城的灯");

// --- ⑦ 南街口望得见官道桥；官道桥本身 ---
Clear(s.cornerToBridge, "南街口顺官道往东南要望得见官道桥上的人");
const decks = all.filter((x) => /^GuandaoDeck_/.test(x.id));
assert.ok(decks.length === GB.spans && decks.every((x) => x.standOn && x.deck && Math.abs(x.y + x.h / 2 - GB.deckY) < 0.01 && x.d >= 3.9), "官道桥六跨桥面、宽 4、与路面齐平、能站人");
Near(sample(GB.north.x, GB.north.z - 1.5), GB.deckY, 0.1, "官道桥北头与路面齐平");
Near(sample(GB.south.x, GB.south.z + 1.5), GB.deckY, 0.1, "官道桥南头与路面齐平");
assert.ok(GB.deckY - H.riverBedY >= 2.7 && GB.deckY - H.riverBedY <= 3.2, "桥面比沙床高约 3 m");
assert.ok(a.blocks.filter((x) => /^GuandaoPile_/.test(x.id)).length >= 8, "木桩每 8 m 一排");
assert.ok(decks.filter((x) => x.signal === SIG.guandaoBridgeBlown).length === GB.blownSpans.length && decks.filter((x) => !x.signal).length === GB.spans - GB.blownSpans.length, "中间三跨随 GuandaoBridgeBlown 没了，两头剩半截");
assert.ok(a.gates.filter((g) => /^GuandaoFallen/.test(g.id) && g.appearSignal === SIG.guandaoBridgeBlown).every((g) => g.y - g.h / 2 < H.riverBedY + 1.2), "断木砸在沙床和水里");
assert.ok(Math.hypot(PL.southStreetCorner.x - PL.guandaoBridgeMid.x, PL.southStreetCorner.z - PL.guandaoBridgeMid.z) >= 120 && Math.hypot(PL.southStreetCorner.x - PL.guandaoBridgeMid.x, PL.southStreetCorner.z - PL.guandaoBridgeMid.z) <= 150, "南街口到官道桥约 140 m");

// --- ⑧ 救护所、女娃家、挨炸的洞 ---
const east = a.blocks.filter((x) => x.id.startsWith("AidWallE")).sort((p, q) => p.z - q.z);
const gateW = east[1].z - east[1].d / 2 - (east[0].z + east[0].d / 2);
assert.ok(gateW >= 1.8 && Math.abs(east[0].x - A.box.maxX) < 0.01 && Math.abs(A.gate.z - 812.5) < 0.01, `救护所院门 ${gateW.toFixed(2)} m、开在东墙 z 812.5`);
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
for (const hole of L1218_HOLES) {
  const mid = HoleWorld(hole, hole.rampM + hole.chamber.d / 2, 0), roof = all.filter((x) => x.holeRoof === hole.id);
  Near(sample(mid.x, mid.z), H.holeFloorY, 0.05, `${hole.id} 洞底`);
  assert.ok(roof.length >= 1 && roof.every((r) => r.y - r.h / 2 - H.holeFloorY >= 1.5), `${hole.id} 有洞顶、洞里净高 ≥ 1.5（人能钻进去）`);
  let step = 0;
  for (let u = -0.5; u < hole.rampM + 1; u += 0.25) { const p = HoleWorld(hole, u, 0), q = HoleWorld(hole, u + 0.25, 0); step = Math.max(step, Math.abs(sample(q.x, q.z) - sample(p.x, p.z))); }
  assert.ok(step <= 0.25, `${hole.id} 坡道每 0.25 m 落差 ${step.toFixed(2)}（拖得下去）`);
}
assert.equal(L1218_HOLES.length, 4, "四个洞：救护所两处、女娃家、挨炸的那家");
assert.ok(all.filter((x) => x.holeRoof === "AidHoleA").length === 2, "东边那处洞顶留一条缝（两半）");
{ const d = Math.hypot(A.holes[0].mouth.x - A.wallRootDonggua.x, A.holes[0].mouth.z - A.wallRootDonggua.z); assert.ok(d >= 7 && d <= 14, `墙根到洞口十几步（${d.toFixed(1)} m）`); }
assert.deepEqual(s.dragLine, [], `墙根到洞口中间有挡的块：${s.dragLine.join(",")}`);
assert.ok(A.wallRootDonggua.x > A.box.maxX - 4 && A.wallRootDonggua.z > A.gate.z, "冬瓜搁的墙根在东墙里、院门南边");
assert.ok(byId.get("AidWallS_Collapsed").h <= 0.8 && !a.blocks.some((x) => /^AidWallS(_\d)?$/.test(x.id) && x.x > GY.collapsed.fromX && x.x < GY.collapsed.toX), "救护所南墙（女娃家北墙）东半截塌了");
Clear(s.wallToGirlHole, "救护所墙根越过塌了的墙看得见女娃家的洞口");
assert.equal(byId.get("GirlHoleMat").appearSignal, SIG.girlHoleCovered, "女娃家洞口的席子随 GirlHoleCovered 出现");
assert.ok(a.blocks.filter((x) => x.id.startsWith("GirlWallE")).length === 2, "女娃家院门开在东墙");
assert.ok(Math.abs(PL.cartPark.x - 121) <= 5 && PL.cartPark.z >= 798 && PL.cartPark.z <= 822, "驴车停在门前空地");
Near(sample(121, 810), H.plain - 0.08, 0.1, "门前空地压低成路面");
Clear(s.streetToCrater, "14-2 顺子跑过南街看得见挨炸那家院里的弹坑");

// --- 村子：院子、教堂、井、水塘、枕木垛、标语、灯；李子行 ---
const yards = AllYards(), villageYards = yards.filter((y) => y.strip !== "Lz");
assert.ok(villageYards.length >= 35 && villageYards.length <= 45, `北沙河村 ${villageYards.length} 个院子（契约 35–45）`);
assert.deepEqual(YardConflicts(yards), [], "院子不压路、互相不挤");
assert.ok(villageYards.some((y) => Math.abs(y.frame.ry % (Math.PI / 2)) > 0.05) && villageYards.some((y) => Math.abs(y.frame.ry % (Math.PI / 2)) < 0.05), "院子随最近的街转：有斜的也有正的");
for (const y of yards) {
  const w = y.s1 - y.s0, d = y.d1 - y.d0;
  assert.ok(w >= 11 && w <= 20 && d >= 12 && d <= 19, `${y.id} 尺寸 ${w}×${d}（真实尺寸：宽 11–20、深 12–19）`);
  assert.ok(a.blocks.some((x) => x.id === `${y.id}_House1`) && a.blocks.some((x) => x.id === `${y.id}_House1_Roof`), `${y.id} 有房子和草顶`);
  const front = a.blocks.filter((x) => x.id.startsWith(`${y.id}_WallF`));
  assert.ok(front.length === 2, `${y.id} 院门开在朝街的前墙上`);
  for (const c of YardCorners(y)) assert.ok(c.x >= VL.box.minX - 1 && c.x <= VL.box.maxX + 1 || y.strip === "Lz", `${y.id} 在村子里`);
}
const hall = byId.get("Church_Hall"), tower = byId.get("Church_Tower");
assert.ok(hall.h >= 5.5 && tower.h >= 9 && hall.h > VL.houseH + 2, "教堂正房比民房高、有钟楼");
assert.ok(a.blocks.filter((x) => /^Church_WallFront/.test(x.id)).length === 2, "教堂院门朝官道开（前墙留门洞）");
assert.ok(Math.abs(hall.ry) > 0.3, "教堂顺着官道斜摆");
Clear(s.streetToChurch, "主街上看得见教堂院门");
Clear(s.villageSouthToDitch, "村南口往南看得见村口一带");
assert.equal(L1218_WELLS.filter((w) => byId.has(`${w.id}_Curb`)).length, 3, "三口井");
assert.equal(L1218_PONDS.filter((p) => byId.get(`${p.id}_Water`)?.semantic === "water").length, 2, "两处水塘");
for (const p of L1218_PONDS) assert.ok(sample(p.x, p.z) <= H.pondFloorY + 0.1, `${p.id} 挖低了`);
assert.equal(a.blocks.filter((x) => /^SleeperPile_/.test(x.id)).length, 3, "三垛枕木（门口）");
const slogans = a.blocks.filter((x) => x.slogan);
assert.ok(slogans.length === 4 && L1218_SLOGAN_TEXTS.every((t) => slogans.some((x) => x.slogan === t)), "四条大字标语");
assert.ok(a.blocks.filter((x) => /^VillageLight_/.test(x.id)).length >= 5, "夜里亮灯的院子 ≥ 5");
assert.ok(a.paint.filter((p) => /^Garden_/.test(p.id)).length >= 3, "菜园 ≥ 3");
assert.equal(LZ.yards.filter((y) => byId.has(`${y.id}_House1`)).length, 5, "李子行五个院子");
assert.ok(LZ.box.minX >= -45 && LZ.box.maxX <= 25 && LZ.box.minZ >= 848 && LZ.box.maxZ <= 888, "李子行在北岸土路北边 x −40…20、z 850…885");
assert.ok(a.paint.some((p) => p.id === "Lizihang"), "李子行涂成村子");

// --- ⑨ 没有第三版的残留 ---
const OLD = /^(OldManStool|FamilyHole|NgCityWall|NgGateTop|NgHouse_|NgTorch_|NgWaterVat|Torch_|HandCart_|S\d+_|N\d+b?_|VillageLightPost_\d+$|VillageLight_\d+$)/;
assert.deepEqual(south.filter((x) => OLD.test(x.id)).map((x) => x.id), [], "第三版的块（老汉凳、钻洞一家的席子、北门、旧院子）不该还在");
assert.ok(!("villageWest" in PL) && !("northGate" in PL) && !("tankette1" in PL) && !("westTurn" in PL), "地名表里没有村西口 / 北门 / 九四式 / 西头的街");
for (const [x, z, what] of [[-104, 700, "x −104 的旧路基"], [-10, 975, "旧北门内外压平的那一片（现在是麦地）"], [100, 785, "旧沙河（东西向 z 763–807）"], [-120, 785, "旧沙河"], [-12, 731, "旧田间小路一带"], [97, 633, "旧反坦克沟 (97,633)"], [34.5, 600, "河汊子往南"], [34.5, 640, "河汊子往南"]]) {
  assert.ok(Math.abs(sample(x, z) - H.plain) < 0.45, `${what} (${x},${z}) 不该还在：${sample(x, z).toFixed(2)}`);
}
Near(sample(34.5, 560), HECHA_FLOOR_Y, 0.05, "河汊子直段接着 0610");
assert.ok(sample(34.5, HECHA_END.endZ + 1) > H.plain - 0.3, "河汊子在沟尾收住");
assert.ok(!a.paint.some((p) => /^Road_(FieldPath|GateStreet|WestExit|NorthLane|GateSquare|MidLane|WestStreet)$/.test(p.id) || p.id === "NorthGateYard"), "第三版的路与北门的涂色不该还在");
for (const x of south) assert.ok(x.x >= B.minX && x.x <= B.maxX && x.z <= B.maxZ, `${x.id} 在场地外 (${x.x},${x.z})`);

// --- ⑩ 七个剧情事件 ---
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
for (const sg of Object.values(SIG)) assert.ok(signals.has(sg), `随信号体块缺信号 ${sg}`);
assert.equal(Object.values(SIG).length, 7, "七个剧情事件");
for (const sg of signals) assert.ok(SCENE_EVENTS[sg], `剧情事件 ${sg} 要有中文名（Data_SceneEvents）`);
assert.ok(!signals.has("FamilyHidden") && !SCENE_EVENTS.FamilyHidden, "FamilyHidden 删了");
assert.equal(byId.get("OverturnedCart").appearSignal, SIG.cartOverturned, "救护所门前翻倒的车随 CartOverturned 出现");
assert.ok(Math.abs(byId.get("OverturnedCart").x - PL.cartPark.x) < 2 && Math.abs(byId.get("OverturnedCart").z - PL.cartPark.z) < 2, "翻倒的车在驴车停处");
const spanLen = (RB.southZ - RB.northZ) / RB.spans;
const blownZ = RB.northZ + spanLen * RB.blownSpans.length;
assert.ok(all.filter((x) => /^Rail(Girder|Sleeper|Track)_/.test(x.id)).every((x) => (x.z < blownZ) === (x.signal === SIG.bridgeBlown)), "北头两孔的钢梁、枕木、轨随 BridgeBlown 消失，其余不动");
assert.ok(a.gates.filter((g) => /^FallenGirder_/.test(g.id) && g.appearSignal === SIG.bridgeBlown).every((g) => g.y - g.h / 2 <= H.riverBedY + 0.6 && g.z > RB.northZ && g.z < blownZ + 1) && a.gates.some((g) => /^FallenGirder_/.test(g.id)), "断梁砸进河床");
assert.ok(a.gates.filter((g) => /^RailCharge_/.test(g.id)).length === RB.charges.length && byId.get("RailFuse_Bridge").appearSignal === SIG.chargesSet && byId.get("RailFuse_Bank").appearSignal === SIG.chargesSet, "桥墩上的炸药 + 引线（拉到河堤后）");
assert.ok(SolidBlocks(a, [SIG.bridgeBlown]).filter((x) => x.sleeper).length < SolidBlocks(a, []).filter((x) => x.sleeper).length, "炸了以后桥面少了一截");
assert.ok(a.gates.filter((g) => /^BombedCrater_/.test(g.id) && g.appearSignal === SIG.dugoutBombed).length >= 4 && byId.get("BombedHole_Roof").signal === SIG.dugoutBombed && a.gates.some((g) => /^BombedHole_RoofFallen/.test(g.id)), "挨炸的洞：弹坑 + 一圈土 + 塌了的洞顶随 DugoutBombed");
assert.ok(a.gates.filter((g) => /^RaidMat_/.test(g.id) && g.appearSignal === SIG.raidAftermath).length >= 12 && a.gates.filter((g) => /^RaidRubble_/.test(g.id)).length >= 3, "空袭过后：一排排盖着席子的人 + 碎砖堆随 RaidAftermath");
assert.ok(a.gates.some((g) => /_WallL_Intact$/.test(g.id) && g.signal === SIG.raidAftermath) && a.gates.some((g) => /_WallL_Stub$/.test(g.id) && g.appearSignal === SIG.raidAftermath), "出村小路边那家墙塌了半截（RaidAftermath）");

// --- ⑫ 18 引导：路边三处小场景、电线杆、夕阳方向 ---
const spots = L1218RoadsideSpots(yards);
assert.deepEqual(spots.map((sp) => sp.id), [RS.lonelyYard.id, RS.wallMats.id, RS.liziGate.id], "北岸土路边三处小场景按走路顺序：孤院、土墙席子、李子行院门");
for (const sp of spots) assert.ok(sp.roadDist <= 10 && sp.roadDist >= 1.5, `${sp.id} 离土路中线 ${sp.roadDist} m（要 1.5–10 m）`);
for (let i = 1; i < spots.length; i++) { const gap = spots[i].roadS - spots[i - 1].roadS; assert.ok(gap >= 40 && gap <= 80, `${spots[i - 1].id} → ${spots[i].id} 顺路相隔 ${gap.toFixed(1)} m（要 40–80）`); }
assert.ok(spots[0].roadS >= 20 && spots[0].roadS <= 60, `第一处离村南头 ${spots[0].roadS} m（一出村就看得见）`);
for (const r of s.roadside) Clear(r, `北岸土路上要看得见 ${r.id}`);
const LY = RS.lonelyYard;
assert.ok(a.blocks.some((x) => x.id === `${LY.id}_WallN`) && a.blocks.some((x) => x.id === `${LY.id}_HouseW`) && a.blocks.filter((x) => x.id.startsWith(`${LY.id}_WallF`) && !x.signal && !x.appearSignal).length >= 1, "孤院有墙、有正房西半间、前墙西段");
assert.ok(byId.get(`${LY.id}_WallF_Intact`)?.signal === SIG.raidAftermath && byId.get(`${LY.id}_WallF_Stub`)?.appearSignal === SIG.raidAftermath && byId.get(`${LY.id}_WallF_Stub`).h <= 0.8, "孤院前墙东半截随 RaidAftermath 塌成墙根");
assert.ok(byId.get(`${LY.id}_WallE_Intact`)?.signal === SIG.raidAftermath && byId.get(`${LY.id}_WallE_Stub`)?.appearSignal === SIG.raidAftermath && byId.get(`${LY.id}_WallE_Stub`).h <= 0.8 && byId.get(`${LY.id}_CornerRubble`)?.appearSignal === SIG.raidAftermath, "孤院东墙南半截也塌了（东南角整个塌、角外一堆碎砖）：从村南头走过来先看见");
{ const eye = { x: 104.1, z: 865.7, eye: stand(104.1, 865.7) - sample(104.1, 865.7) + 1.62 }, afterRaid = SolidBlocks(a, [SIG.raidAftermath]);
  const r = BlockSight(afterRaid, sample, eye, { x: LY.beam.x, z: LY.beam.z, eye: LY.house.heapH + 0.3 });
  assert.ok(r === null, `从村南头刚拐上北岸土路 (104.1,865.7) 隔着塌了的东南角看得见孤院里的房梁（被 ${r?.id} 挡）`); }
assert.ok(byId.get(`${LY.id}_HouseE`)?.signal === SIG.raidAftermath && byId.get(`${LY.id}_HouseE_Heap`)?.appearSignal === SIG.raidAftermath && byId.get(`${LY.id}_Beam`)?.appearSignal === SIG.raidAftermath && byId.get(`${LY.id}_Beam`).beam, "孤院正房东半间随 RaidAftermath 塌成一堆、房梁斜搭在堆上");
assert.ok(LY.box.minX >= 78 && LY.box.maxX <= 97 && LY.box.minZ >= 848 && LY.box.maxZ <= 868 && LY.box.maxZ < PL.northBankRoadA.z, "孤院在 x 80–95、z 850–866 一带、路北侧");
const roadWall = byId.get(RS.wallMats.id);
assert.ok(roadWall && roadWall.h >= 1.5 && roadWall.w >= 12 && Math.abs(roadWall.ry) > 0.1, "路北边一道顺着路的土墙");
const wallMats = a.gates.filter((g) => g.id.startsWith(`RaidMat_${RS.wallMats.id}_`));
assert.ok(wallMats.length >= 5 && wallMats.every((g) => g.appearSignal === SIG.raidAftermath && g.prop === "Mat" && Math.hypot(g.x - roadWall.x, g.z - roadWall.z) < 10), "土墙根一排 ≥ 5 张席子随 RaidAftermath 出现");
assert.ok(wallMats.every((g) => Math.hypot(g.x - spots[1].road.x, g.z - spots[1].road.z) < Math.hypot(roadWall.x - spots[1].road.x, roadWall.z - spots[1].road.z) + 1), "席子在墙朝路的那一面");
assert.ok(a.blocks.filter((x) => x.id.startsWith(`${RS.liziGate.yard}_WallB`)).length === 2, "李子行 LzS2 朝路的南墙开了院门（墙分两段）");
assert.ok(byId.get(`${RS.liziGate.id}_DoorBoard`)?.prop === "DoorBoard" && Math.hypot(byId.get(`${RS.liziGate.id}_DoorBoard`).x - PL.liziSouthGate.x, byId.get(`${RS.liziGate.id}_DoorBoard`).z - PL.liziSouthGate.z) < 1.2, "门板歪着靠在门框上");
assert.ok(byId.get(`${RS.liziGate.id}_Shoe`)?.prop === "Shoe" && byId.get(`${RS.liziGate.id}_Shoe`).h < 0.15 && byId.get(`${RS.liziGate.id}_Shoe`).z > LZ.box.maxZ, "门外地上掉着一只鞋（小体块）");
for (const [i, p] of [PL.roadsideYard, PL.roadsideMats, PL.liziSouthGate].entries()) assert.ok(Math.hypot(p.x - spots[i].x, p.z - spots[i].z) < 12, `地名表 ${["roadsideYard", "roadsideMats", "liziSouthGate"][i]} 对得上第 ${i + 1} 处`);
const poles = a.blocks.filter((x) => x.pole && x.telegraph);
assert.ok(poles.length >= 12 && poles.length === TelegraphPoleZs().length, `铁路沿线电线杆 ${poles.length} 根`);
assert.ok(poles.every((p) => Math.abs(p.h - 7) <= 0.5 && Math.abs(p.x - TG.x) < 0.01 && Math.abs(p.x - RL.x) >= 6 && Math.abs(p.x - RL.x) <= 9), "电线杆 7 m 高、在路基坡脚外一排");
{ const zs = poles.map((p) => p.z).sort((p, q) => p - q); for (let i = 1; i < zs.length; i++) assert.ok(Math.abs(zs[i] - zs[i - 1] - TG.everyM) < 0.01 || (zs[i - 1] < RB.northZ && zs[i] > RB.southZ), `电线杆间距 ${(zs[i] - zs[i - 1]).toFixed(1)}（要 ${TG.everyM}，只在沙河那一截断开）`);
  assert.ok(zs.some((z) => z < RB.northZ - 20) && zs.some((z) => z > RB.southZ + 20) && !zs.some((z) => z > RB.northZ - 4 && z < RB.southZ + 10), "两岸都有电线杆，坎沿与河堤那一截不放"); }
assert.ok(a.blocks.filter((x) => x.telegraph && /^TeleWire_/.test(x.id)).length >= poles.length - 2 && a.blocks.filter((x) => x.telegraph && /^TeleArm_/.test(x.id)).length === poles.length, "杆顶横担、杆间一根线");
Clear(s.roadToBridge, "北岸土路 (60,880) 看得见铁路桥北头");
Clear(s.roadToPole, "北岸土路 (60,880) 看得见桥边那根电线杆的顶");
{ const sun = PL.sunWest, a0 = PL.northBankRoadA, bn = PL.bridgeNorth;
  const Deg = (p, q) => Math.atan2(q.x - p.x, q.z - p.z) * 180 / Math.PI;
  const diff = Math.abs(((Deg(a0, bn) - Deg(a0, sun) + 540) % 360) - 180);
  assert.ok(diff <= 5, `夕阳 sunWest (${sun.x},${sun.z}) 要在土路长直段 (${a0.x},${a0.z}) → 桥北头 (${bn.x},${bn.z}) 的延长线 ±5° 内（差 ${diff.toFixed(1)}°）`);
  assert.ok(sun.x >= B.minX && sun.x <= B.maxX && sun.z >= B.minZ && sun.z <= B.maxZ && Math.hypot(sun.x - bn.x, sun.z - bn.z) > 60, "夕阳锚点在场地里、在桥那头更远处"); }

// --- 地标与涂色 ---
assert.ok(Array.isArray(a.landmarks) && a.landmarks.filter((l) => l.z >= L1218_GROUND.seamZ).length >= 45, "地标齐");
const lms = NormalizeLandmarks(a.landmarks);
assert.equal(lms.length, a.landmarks.length, "地标都过归一化");
for (const lm of lms) assert.ok(lm.x >= B.minX && lm.x <= B.maxX && lm.z >= B.minZ && lm.z <= B.maxZ, `地标 ${lm.id} 在场地外`);
const LM = new Map(lms.map((x) => [x.id, x]));
for (const id of ["LmDirtRoad", "LmJunction", "LmPostRoad_1218", "LmAtDitch", "LmPlank", "LmTrenchSquad", "LmMg727", "LmMainStreet_1218", "LmNorthStreet", "LmMidStreet", "LmSouthStreet", "LmSouthStreetCorner", "LmChurch", "LmBombedYard", "LmGateYard", "LmAid", "LmAidGate", "LmXiangDoor", "LmGirlYard", "LmGuandaoBridge", "LmNorthBankRoad", "LmLizihang", "LmRailNorth", "LmRailBridge", "LmRiver_1218", "LmBank", "LmMg18", "LmLevee", "LmSouthRoad", "LmCityLights", "LmLoneYard", "LmRoadWall", "LmLiziGate", "LmTelegraph"]) assert.ok(LM.has(id), `缺地标 ${id}`);
for (const id of ["LmNorthGate", "LmOldMan", "LmVillageWest", "LmFieldPath", "LmTankettes", "LmWestTurn"]) assert.ok(!LM.has(id), `第三版的地标 ${id} 不该还在`);
assert.ok(Math.abs(LM.get("LmPlank").x - PK.x) < 0.05 && Math.abs(LM.get("LmPlank").z - PK.z) < 0.05, "板桥的地标框对得上");
assert.ok(LM.get("LmAidHoleA").y < H.plain && LM.get("LmAidHoleA").y - LM.get("LmAidHoleA").h / 2 <= H.holeFloorY + 0.05, "洞的地标框从洞底立到地面");
for (const id of ["Fields", "Village", "Lizihang", "SandBed", "Stream", "Levee", "Road_DirtRoad", "Road_PostRoadNorth", "Road_MainStreet", "Road_PostRoadSouth", "Road_NorthStreet", "Road_MidStreet", "Road_SouthStreet", "Road_ExitPath", "Road_NorthBankRoad", "Road_SouthRoad", "GateYard", "AtDitch", "RailNorth", "RailSouth"]) assert.ok(a.paint.some((p) => p.id === id), `缺涂色 ${id}`);
assert.ok(a.paint.filter((p) => /^Wheat_/.test(p.id)).length >= 10, "四周的麦地拼块");

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格；接缝最大差 ${cmp.worst} m；`
  + `驴车路最陡 ${route.maxStep}、横向 ${route.maxLat}；沟深 ${(H.plain - AT.floorY).toFixed(1)}；战壕→坟 ${s.trenchToGraves[0].distM} m；机枪→坎后被挡 ${s.mgToCover.ground}；河堤→机枪 ${s.leveeToMg.distM} m；南街口→官道桥 ${s.cornerToBridge.distM} m；`
  + `院门 ${gateW.toFixed(2)}、厢房门 ${doorW.toFixed(2)}；枕木 ${sleepers.length} 根；村里 ${villageYards.length} 个院子；`
  + `18 引导：路边三处 s ${spots.map((sp) => sp.roadS).join(" / ")} m、离中线 ${spots.map((sp) => sp.roadDist).join(" / ")} m，电线杆 ${poles.length} 根，夕阳偏差 ≤ 5°`);
