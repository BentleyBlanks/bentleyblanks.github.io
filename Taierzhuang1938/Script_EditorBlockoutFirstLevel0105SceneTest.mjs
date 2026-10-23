// Script_EditorBlockoutFirstLevel0105SceneTest.mjs —— 01–05 白盒场景生成器的 node 回归（只给场景包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105SceneTest.mjs
// 查：生成两次逐字相同（generatedAt 固定）、过 ValidateBlockoutScene、锚点处高度、沟底宽、塌洞净空；
// 10-18 返工：干沟尺寸与两条视线（集结处看不见前沿、南边平地看不进沟底）、支沟南沿土垄挡住北沿机枪、
// 板桥（宽、与地面齐平、桥下净空、TankDisabled 压断两块、门板之间 6–10 cm 缝、旧门板厚薄高低不一）、日常摆件（高度、通道 ≥ 2.2 m、≥15 m 直沟至少一件）。
// 10-18 第二轮：南岸坎顶一道 0.6–0.8 m 的连续矮土埂（烘进高度场），南边平地看沟底的余量 ≥ 0.6 m。
// 10-20 干沟改弯沟：沟底宽窄不一（坑窝 ≥ 9 m、最窄 ≥ 3.5 m、不能处处一样宽）、中心线连续沟底 ≥ 50 m、北岸坑窝陡坎、
// 沟底离大路 ≥ 20 m（原来方坑西北角 8 m）、人待的地方离路口（板桥）≥ 28 m、支沟（伤员）在沟底高度、凹路口接上沟底。
// 10-20 坑北前景：坟高、田埂高、干水沟深与断面、地坎落差与豁口、坑里看不见坎下的掷弹筒组（看得见烟）、沟里弯腰的人从坑里看不见头、
// 跃进的人每一格都在掩体后、树桩 / 柏树 / 麦秸垛的尺寸、扫清带基本平、坑北的改动不碰 z ≥ −8。
// 10-20 坑北第二轮（田、路、村子看得见）：涂色只在坑北（z < −8）、田块够多三种颜色都有、相邻两块不同色；大路 L0105_ROAD 一个点不动，
// 大路北段接在它北头穿村、田间小路单独一条；路穿地坎 / 干水沟处是坡道 / 填平；（10-21 起树不沿路种：田里零星十几棵，彼此隔 25 m 以上，见下）；
// 村子在坑北 285–365 m、20–30 户、院墙 2–2.6 m、房墙 ≥ 3 m、屋顶比墙宽且 1–1.5 m 压在墙顶；色带钉在南面。
// 10-20 第三版（照史料压平、窄条田、四个村子、东边低山）：坑北只剩 ±1 m 大起伏 + 2 m 地坎；场地里的田是南北向 5–20 m 的窄条、几十条一组、组间小路，
// 翻地 + 撂荒过半；田里散 10–20 座单个的坟（0.8–1.2 m，不挡跃进站位、不压路）；场地里没有村子；远景层 backdrop 过校验、
// 四个村子 / 山包的方位与距离、大路从场地北边界接进远景层穿过村 A 通到村 D、远景地面在接缝上与场地一样高、北边界两边的田块颜色接得上。
// 10-20 第四轮（短跃进、来路、沟里一个班）：跃进一跃 9.5–18 m（翻坎那一跃 ≤ 26 m）；麦地里趴的站位平；坎下的站位蹲着从坑里看不见；
// 沟里那个班开场都在干水沟里、弯着腰坑里看不见；出沟后扑到 N2 / N1 后的每一格都被田埂挡住。

import assert from "node:assert/strict";
import { ValidateBlockoutScene, LandmarkIssues, BLOCKOUT_LANDMARK_KINDS } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler, IsSceneTreeBlock, BuildGroundPaint, LayoutFromSceneDoc, RasterizeBackdropPaint } from "./Script_EditorBlockoutLevels.mjs";
import {
  BuildFirstLevel0105Scene, FloorWidthAt, NaturalHeight, L0105SightChecks, GullyFloorExtent, GullyBankHeights, PropPassage, PropsPerStraight,
  GullySouthBerm, GullySouthBermTop, L0105_GULLY_SOUTH_BERM_LENGTH,
  PitNorthChecks, PitNorthHeight, PitNorthRoll, DitchStation, BundHeight, GraveHeight, SightBlockFromY, PitNorthObservers, PIT_NORTH_DITCH_HEAD_M,
  FarmLayout, L0105_NICHE_SHAPES, OLD_LINES,
} from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import {
  L0105_PLACES as P, L0105_HEIGHTS as H, L0105_TRENCH_SECTION as S, L0105_GULLY as G, L0105_BRIDGE as BR,
  L0105_PROPS, L0105_PROP_KINDS, L0105_SUNKEN_LANE, L0105_GULLY_SOUTH_BERM as SB, PointBeside, PointAlong, GullyU, InGullyFloor,
  L0105_ROAD, L0105_GULLY_POCKETS, L0105_GULLY_TREES, L0105_TRENCHES, L0105_FRONT_PARTS, FrontStationAtX,
  L0105_PIT_NORTH as PN, L0105_BOUNDS, L0105_RUSH_STATIONS, L0105_RUSH_FALLEN, L0105_DITCH_SQUAD, DitchSquadStart, RushStation, ScarpZ, LineLength,
  L0105_NORTH_ROAD, L0105_FIELD_PATH, L0105_FIELD_TREES, L0105_BACKDROP_LONE_TREES, L0105_BACKDROP_PATHS, L0105_FIELD_PAINT, L0105_FIELD_GRAVES, L0105_FARM,
  L0105_BACKDROP_ROAD, L0105_BACKDROP_VILLAGES, L0105_BACKDROP_HILLS, L0105_HEIGHTS,
  L0105_OLD_POSITION, L0105_WOODS, L0105_SOUTH_TREES, L0105_POST_ROAD_SOUTH, L0105_FIELD_LANES, L0105_BACKDROP_POST_ROAD,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-18T00:00:00.000Z" };
const a = await BuildFirstLevel0105Scene({ ...opts, notes: [] });
const b = await BuildFirstLevel0105Scene({ ...opts, notes: [] });
assert.equal(JSON.stringify(a), JSON.stringify(b), "生成两次要逐字相同");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));

const sample = HeightGridSampler(a.terrain);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);
const Cut = (p) => NaturalHeight(p.x, p.z) - sample(p.x, p.z);
Near(Cut(P.pit), P.pit.floorDepth, 0.05, "坑深");
Near(Cut(P.dugout), P.dugout.floorDepth, 0.05, "洞深");
Near(Cut(P.fireC), P.fireC.depth, 0.08, "散兵坑深");
Near(Cut({ x: 12.5, z: 32 }), S.traffic.depth, 0.15, "交通沟深");
Near(Cut({ x: 42, z: BranchZ(42) }), S.branch.depth, 0.15, "支沟深");
Near(Cut(P.crest), S.trafficAtCrest.depth, 0.15, "坡顶沟深");
Near(Cut({ x: 35, z: 116.5 }), S.trafficAtCrossing.depth, 0.15, "板桥下沟深");

// --- 干沟 ---
const floorY = sample(P.assembly.x, P.assembly.z);
Near(floorY, H.assemblyFloor, 0.05, "干沟沟底");
Near(sample(P.crest.x + 12, P.crest.z) - floorY, H.crest - H.assemblyFloor, 0.3, "坡顶−干沟沟底");
// 坎高与陡：北岸三处（坑窝 A / 中弯 / 坑窝 B）、南岸两处，坎顶 − 沟底 ≈ 2.5 m（扣掉土埂），坎顶往沟里 3 m 内落差 ≥ 2 m
for (const bank of GullyBankHeights(sample)) {
  Near(bank.h, H.gullyRim - H.assemblyFloor, 0.35, `${bank.name}坎高`);
  assert.ok(bank.steep >= 2, `${bank.name}不够陡：3 m 内只落 ${bank.steep} m`);
}
const ext = GullyFloorExtent(sample);
assert.ok(ext.pocketA >= 9 && ext.mid >= 9 && ext.pocketB >= 9, `坑窝要宽（≥ 9 m）：A ${ext.pocketA} / 中弯 ${ext.mid} / B ${ext.pocketB}`);
assert.ok(ext.min >= 3.5, `沟底最窄 ${ext.min} m（要 ≥ 3.5，人和担架过得去）`);
assert.ok(ext.max - ext.min >= 5, `沟底宽窄要不一（最宽 ${ext.max}、最窄 ${ext.min}）`);
assert.ok(ext.floorLen >= 50, `中心线连续沟底 ${ext.floorLen} m（要 ≥ 50）`);
// 不能处处一样宽：相邻每米的宽，变化的地方要多
const changes = ext.widths.slice(1).filter((w, i) => w > 0 && ext.widths[i] > 0 && Math.abs(w - ext.widths[i]) >= 0.2).length;
assert.ok(changes >= 15, `沟底宽度变化太少（${changes} 处），像一条直渠`);
// 离路远：沟底（含坎）离大路 ≥ 22 m；人待的三处离路口板桥 ≥ 28 m
{
  const DistRoad = (x, z) => { let best = Infinity; for (let i = 1; i < L0105_ROAD.length; i++) { const p0 = L0105_ROAD[i - 1], p1 = L0105_ROAD[i]; const dx = p1.x - p0.x, dz = p1.z - p0.z, l2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - p0.x) * dx + (z - p0.z) * dz) / l2)); best = Math.min(best, Math.hypot(x - p0.x - dx * t, z - p0.z - dz * t)); } return best; };
  let nearRoad = Infinity;
  for (let x = 10; x <= 90; x += 0.5) for (let z = 136; z <= 166; z += 0.5) if (GullyU(x, z) <= 0) nearRoad = Math.min(nearRoad, DistRoad(x, z));
  assert.ok(nearRoad >= 20, `干沟沟底离大路只有 ${nearRoad.toFixed(1)} m（要 ≥ 20）`);
  for (const [name, p] of [["坑窝 A", L0105_GULLY_POCKETS.a], ["中弯", L0105_GULLY_POCKETS.mid], ["坑窝 B", L0105_GULLY_POCKETS.b], ["支沟", P.woundedBay]]) {
    const d = Math.hypot(p.x - P.crossing.x, p.z - P.crossing.z);
    assert.ok(d >= 28, `${name}离路口板桥只有 ${d.toFixed(1)} m（要 ≥ 28）`);
  }
}
// 支沟（伤员）、冬瓜躺的地方都在沟底
for (const p of [P.woundedBay, P.donguaRest, L0105_GULLY_POCKETS.a, L0105_GULLY_POCKETS.b]) {
  assert.ok(InGullyFloor(p), `(${p.x},${p.z}) 不在沟底`);
  Near(sample(p.x, p.z), H.assemblyFloor, 0.1, `沟底高度 (${p.x},${p.z})`);
}
assert.ok(Math.abs(sample(P.assemblyEntry.x, P.assemblyEntry.z) - H.assemblyFloor) < 0.2, "交通沟坡道下到干沟沟底");
// 凹路：东南头接上沟底，往南一路比两边低 ≥ 1 m
Near(sample(P.laneHead.x, P.laneHead.z), H.assemblyFloor, 0.15, "凹路口接干沟沟底");
for (const [x, z, sideX] of [[83, 168, 91], [82.5, 185, 90], [72, 158.6, 72]]) {
  const side = sideX === x ? sample(x, z - 6) : sample(sideX, z);
  assert.ok(side - sample(x, z) >= 1.0, `凹路 (${x},${z}) 不够凹：${(side - sample(x, z)).toFixed(2)}`);
}
void L0105_SUNKEN_LANE;

// --- 南岸土埂：连续、顶高 0.6–0.8 m、底宽约 2 m、烘进了网格 ---
for (const [k, line] of SB.lines.entries()) for (let d = SB.taperM, len = line.reduce((n, q, i) => (i ? n + Math.hypot(q.x - line[i - 1].x, q.z - line[i - 1].z) : 0), 0); d <= len - SB.taperM; d += 0.5) {
  void k;
  const c = PointBeside(line, d, 0);
  const top = GullySouthBerm(c.x, c.z);
  assert.ok(top >= 0.6 && top <= 0.8, `南岸土埂在弧长 ${d} m (${c.x.toFixed(1)},${c.z.toFixed(1)}) 顶高 ${top.toFixed(2)}（要 0.6–0.8）`);
  assert.ok(Math.abs(sample(c.x, c.z) - NaturalHeight(c.x, c.z)) < 0.15, `南岸土埂 (${c.x.toFixed(1)},${c.z.toFixed(1)}) 没烘进网格`);
}
assert.ok(SB.w >= 1.8 && SB.w <= 2.4 && SB.h >= 0.6 && SB.h <= 0.8, "土埂底宽约 2 m、高 0.6–0.8 m");
assert.ok(GullySouthBermTop(0) !== GullySouthBermTop(7), "土埂顶高要有起伏（形状自然）");
// 凹路照旧是开口：凹路底不被土埂垫高
Near(sample(83, 159), sample(83, 162), 0.25, "凹路拐弯处不被土埂堵上");

// --- 视线 ---
const sights = L0105SightChecks(sample);
assert.ok(sights.assembly.worst > 0.5, `集结处看得见前沿：${JSON.stringify(sights.assembly.worstRow)}`);
assert.ok(sights.south.worst >= 0.6, `南边平地看沟底的余量不到 0.6 m：${JSON.stringify(sights.south.worstRow)}`);
assert.ok(sights.southObservers >= 25, "南边平地的观察点太少（凹路排除得太宽？）");
assert.ok(sights.mgToCrawl.worst > 0.1, `北沿机枪看得见南沿土垄外爬的人：${JSON.stringify(sights.mgToCrawl.worstRow)}`);
assert.ok(sights.pinnedToSteps.worst <= 0, "洞口趴着要能顺着支沟看见台阶那头的人");

// --- 沟底宽（2026-10-24：前沿三段各量一处、西折、第二条交通沟；浅连沟窄但 ≥ 2.2）---
const FrontAt = (x) => PointAlong(L0105_TRENCHES.front, FrontStationAtX(x));
for (const [name, x, z, nx, nz, min] of [["前沿西段", FrontAt(-50).x, FrontAt(-50).z, 0, 1, 3.4], ["前沿中段", FrontAt(-9).x, FrontAt(-9).z, 0, 1, 3.4],
  ["前沿中段", FrontAt(16).x, FrontAt(16).z, 0, 1, 3.4], ["前沿东段", FrontAt(62).x, FrontAt(62).z, 0, 1, 3.4], ["前沿西折", -70, 0, 1, 0, 3.4],
  ["浅连沟（东）", FrontAt(37).x, FrontAt(37).z, 0.6, 1, 2.2], ["第二条交通沟", -47, 30, 5, 1, 3.4],
  ["交通沟南直段", 12.5, 32, 23, 1, 3.4], ["交通沟斜段", 26, 76.6, 42, -18, 3.4], ["交通沟坡顶", 35, 128, 1, 0, 3.4], ["交通沟板桥下", 35, 116.5, 1, 0, 3.4], ["支沟中段", 42, 65.8, 2.6, 41.1, 3.4]]) {
  const r = FloorWidthAt(sample, x, z, nx, nz);
  assert.ok(r.width >= min, `${name}沟底宽 (${x.toFixed(1)},${z.toFixed(1)}) ${r.width} < ${min}`);
}

// --- 2026-10-24 第六版空间 ---
{
  const all = [...a.blocks, ...a.gates], C = L0105_FIELD_PAINT;
  const FP = L0105_FRONT_PARTS, front = L0105_TRENCHES.front;
  const Part = ([i0, i1]) => front.slice(i0, i1 + 1);
  // 前沿三段：每段 30–60 m 长、至少 4 个折点、相邻折距不全相等；段与段之间有浅连沟（深 0.9–1.1）；西段往南错、东段往北错
  for (const [name, range] of [["西段", FP.west], ["中段", FP.mid], ["东段", FP.east]]) {
    const pts = Part(range), len = pts[pts.length - 1].x - pts[0].x;
    assert.ok(len >= 30 && len <= 60, `前沿${name}长 ${len} m（要 30–60）`);
    assert.ok(pts.length >= 4, `前沿${name}折点 ${pts.length} 个（要 ≥ 4）`);
    const steps = pts.slice(1).map((p, i) => Math.round((p.x - pts[i].x) * 10) / 10);
    assert.ok(new Set(steps).size >= 2, `前沿${name}折距全一样（${steps.join("/")}），像机器画的锯齿`);
    for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i].z - pts[i - 1].z) >= 1.0 || name === "中段", `前沿${name}第 ${i} 折前后没错开`);
  }
  assert.ok(Part(FP.west).every((p) => p.z >= 5) && Part(FP.east).every((p) => p.z <= -6), "西段整体往南错、东段整体往北错");
  for (const [name, range] of [["西", FP.linkW], ["东", FP.linkE]]) {
    const pts = Part(range), mid = PointAlong(pts, LineLength(pts) / 2);
    const cut = Cut({ x: mid.x, z: mid.z });
    assert.ok(cut >= 0.85 && cut <= 1.15, `${name}边浅连沟深 ${cut.toFixed(2)}（要 0.9–1.1）`);
  }
  // 沟口那 10 m 平的、机枪坑 / 三个射位 / 散兵坑 / 爬沟一点没动
  assert.deepEqual(Part(FP.mid).filter((p) => Math.abs(p.x) <= 5).map((p) => [p.x, p.z]), [[-5, 0], [5, 0]], "沟口那 10 m 照旧");
  assert.deepEqual([P.pit.x, P.pit.z, P.fireA.x, P.fireB.x, P.fireC.x, P.fireC.z], [0, -7, 0.8, 4.5, -9, -15], "机枪坑、三个射位、散兵坑不动");
  assert.deepEqual(L0105_TRENCHES.crawlSap.map((p) => [p.x, p.z]), [[-3.5, -9], [-8, -14]], "爬沟不动");
  assert.deepEqual(L0105_TRENCHES.traffic.map((p) => [p.x, p.z]), [[0, 0], [0.5, 11], [13, 21], [12, 44], [30, 86], [35, 116], [35, 131], [35, 144]], "主交通沟一个点不改（0610 import 它）");
  // 第二条交通沟：从西段往后通坡后，不跟主交通沟相交（两条线最近也隔 20 m 以上）
  const T2 = L0105_TRENCHES.traffic2;
  const DistLine = (x, z, line) => { let best = Infinity; for (let i = 1; i < line.length; i++) { const a0 = line[i - 1], a1 = line[i], dx = a1.x - a0.x, dz = a1.z - a0.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((x - a0.x) * dx + (z - a0.z) * dz) / l2)); best = Math.min(best, Math.hypot(x - a0.x - dx * k, z - a0.z - dz * k)); } return best; };
  assert.ok(T2.length >= 5 && T2[0].z < 12 && T2[T2.length - 1].z >= 140, "第二条交通沟从前沿西段通到坡后");
  for (let d = 0; d <= LineLength(T2); d += 2) { const q = PointBeside(T2, d, 0); assert.ok(DistLine(q.x, q.z, L0105_TRENCHES.traffic) >= 20, `第二条交通沟离主交通沟太近 (${q.x.toFixed(1)},${q.z.toFixed(1)})`); }
  Near(Cut({ x: -47, z: 30 }), S.traffic2.depth, 0.15, "第二条交通沟深");
  assert.ok(DistLine(T2[0].x, T2[0].z, Part(FP.west)) <= 3, "第二条交通沟接在前沿西段上");
  // 主交通沟：让担架的龛 ≥ 8 个、板桥以北、沟壁凹进去 0.6–0.8 m
  const litter = L0105_NICHE_SHAPES.filter((n) => n.kind === "litter");
  assert.ok(litter.length >= 8 && litter.every((n) => n.on === "traffic" && n.z < 108), "主交通沟板桥以北每隔约 10 m 一个让担架的龛");
  for (const n of litter) {
    const depth = NaturalHeight(n.x, n.z) - sample(n.x, n.z);
    assert.ok(depth >= 1.6, `让担架的龛 ${n.id} 没挖进沟壁（深 ${depth.toFixed(2)}）`);
    assert.ok(n.hv - 0.2 >= 0.3 && n.hv - 0.2 <= 0.4, `让担架的龛 ${n.id} 凹进去 ${((n.hv - 0.2) * 2).toFixed(2)} m（要 0.6–0.8）`);
  }
  // 弹药龛 ≥ 6、手榴弹龛 ≥ 3，每个手榴弹龛离最近的弹药龛 ≥ 3 m；龛里有箱子；机枪坑边有弹药箱
  const ammo = L0105_NICHE_SHAPES.filter((n) => n.kind === "ammo"), gren = L0105_NICHE_SHAPES.filter((n) => n.kind === "grenade");
  assert.ok(ammo.length >= 6 && gren.length >= 3, `弹药龛 ${ammo.length}、手榴弹龛 ${gren.length}`);
  for (const g of gren) assert.ok(Math.min(...ammo.map((q) => Math.hypot(q.x - g.x, q.z - g.z))) >= 3, `手榴弹龛 ${g.id} 离弹药龛不到 3 m`);
  for (const n of [...ammo, ...gren]) assert.ok(all.filter((b) => b.id.startsWith(n.id + "_")).length >= 2, `龛 ${n.id} 里没箱子`);
  assert.ok(all.filter((b) => /^PitAmmoCrate/.test(b.id)).length >= 2, "机枪坑边要有弹药箱");
  for (const seg of ["W", "M", "E"]) assert.ok(ammo.filter((n) => n.id.includes(`_${seg}`)).length >= 2 && gren.some((n) => n.id.endsWith(`_${seg}`)), `前沿${seg}段要有弹药龛和手榴弹龛`);
  // 排长掩蔽部兼通信所、坡后预备队、连弹药所、连指挥所（地标）
  Near(Cut(P.platoonShelter), P.platoonShelter.floorDepth, 0.1, "排长掩蔽部深");
  assert.ok(all.some((b) => b.id === "PlatoonShelterRoofTimber") && all.some((b) => b.id === "PlatoonFieldPhone"), "排长掩蔽部要有顶和野战电话");
  assert.ok(P.reserve.z > P.crest.z && P.companyAmmo.z > P.crest.z, "预备队、连弹药所在坡顶以南");
  for (const q of P.reserve.pits) Near(Cut(q), P.reserve.pitDepth, 0.1, `预备队浅坑 (${q.x},${q.z})`);
  assert.ok(all.filter((b) => /^CompanyAmmoCrate/.test(b.id)).length >= 5 && all.some((b) => b.id === "CompanyAmmoTarp"), "连弹药所要有一堆箱子和苫布");
  assert.ok(a.landmarks.some((lm) => lm.name === P.companyPost.name && InGullyFloor(lm, 0.5)), "连指挥所 / 绷带所的地标在干沟里");
  assert.ok(!a.blocks.some((b) => Math.hypot(b.x - P.companyPost.x, b.z - P.companyPost.z) < 3 && !/^KeepIn_/.test(b.id)), "连指挥所不加体块（干沟里人多）");
  // 北边放弃的旧阵地：≥ 3 段射击沟、都在地坎南边高的一侧、每段不规则；空机枪掩体 ≥ 3、掩蔽部顶塌了半边；尸体 / 弹药箱 / 破枪；旧交通沟往南、往北（掷弹筒蹲在里面）；警戒沟 ≥ 2 段 + 散兵坑
  const OLD = L0105_OLD_POSITION;
  assert.ok(OLD.fire.length >= 3, "旧阵地射击沟 ≥ 3 段");
  for (const f of OLD.fire) {
    assert.ok(f.line.every((p) => p.z > ScarpZ(p.x) + 1.5 && p.z < ScarpZ(p.x) + 10), `${f.id} 要在地坎南边高的一侧、离坎沿不远`);
    const steps = f.line.slice(1).map((p, i) => Math.round((p.x - f.line[i].x) * 10) / 10);
    assert.ok(f.line.length >= 4 && new Set(steps).size >= 2, `${f.id} 折点太少或折距全一样`);
    const mid = PointAlong(f.line, LineLength(f.line) / 2);
    Near(Cut(mid), S.oldFire.depth, 0.25, `${f.id} 深`);
    assert.ok(sample(mid.x, mid.z) > sample(mid.x, ScarpZ(mid.x) - 6) + 0.3, `${f.id} 沟底要比坎下的地还高`);
  }
  for (let i = 1; i < OLD.fire.length; i++) assert.ok(OLD.fire[i].line[0].x - OLD.fire[i - 1].line[OLD.fire[i - 1].line.length - 1].x >= 12, "旧阵地的段与段之间要断开");
  assert.ok(OLD.mgNests.length >= 3 && OLD.mgNests.every((n) => Math.abs(Cut(n) - OLD.mgNest.depth) < 0.25 && all.some((b) => b.id === `${n.id}_Sandbags`)), `三个空机枪掩体（沟上掏的方坑 + 北沿土袋）：深 ${OLD.mgNests.map((n) => Cut(n).toFixed(2)).join("/")}`);
  assert.ok(all.some((b) => b.id === "OldShelterRoofTimber") && all.some((b) => b.id === "OldShelterFallenSlab"), "掩蔽部顶塌了半边");
  assert.ok(all.filter((b) => /^OldCrate_/.test(b.id)).length >= 4 && all.filter((b) => /^OldRifle_/.test(b.id)).length >= 3 && all.filter((b) => /^OldCollapse_/.test(b.id)).length >= 3, "丢下的弹药箱、破枪、塌方土堆");
  assert.ok(OLD.comm[0].z < -195 && OLD.comm[OLD.comm.length - 1].z >= -145 && OLD.comm[OLD.comm.length - 1].z <= -80, "旧交通沟从旧阵地往南（到干沙沟北岸外十来米）");
  Near(Cut(PointAlong(OLD.comm, 15)), S.oldComm.depth, 0.2, "旧交通沟深（浅）");
  assert.ok(DistLine(P.mortar.x, P.mortar.z, OLD.sap) <= 1 && P.mortar.z < ScarpZ(P.mortar.x) - 3, "掷弹筒组蹲在通警戒阵地的旧交通沟里、坎下那一截");
  assert.ok(OLD.outposts.length >= 2 && OLD.outposts.every((f) => f.line.every((p) => p.z <= -435 && p.z >= -465)) && OLD.foxholes.length >= 3, "警戒阵地：两段短沟 + 散兵坑");
  for (const f of OLD.foxholes) Near(Cut(f), OLD.foxholeDepth, 0.15, `散兵坑 (${f.x},${f.z})`);
  assert.ok(a.paint.filter((p) => /^OldTrench_/.test(p.id)).length >= OLD.fire.length + 2 && a.paint.some((p) => p.id === "OldTrench_Comm" && p.color === OLD.paint), "旧沟有自己的涂色（跟现在的沟分得开）");
  assert.ok(!a.paint.some((p) => p.id.startsWith("OldTrench_") && p.color === C.ditchSoil), "旧沟的颜色别跟干水沟翻土一样");
  // 干沙沟：顶宽 8–10、沟底 5–6（沙色）、深 1.3–1.5、两岸不齐
  assert.ok(PN.ditch.topW >= 8 && PN.ditch.topW <= 10 && PN.ditch.floorW >= 5 && PN.ditch.floorW <= 6 && PN.ditch.depth >= 1.3 && PN.ditch.depth <= 1.5, "干沙沟断面");
  assert.ok(a.paint.some((p) => p.id === "DitchSand" && p.color === C.ditchSand), "沟底涂沙色");
  {
    let uneven = 0;
    for (const d of [60, 110, 160, 210, 260]) {
      const c = PointBeside(PN.ditch.line, d, 0), l = PointBeside(PN.ditch.line, d, 1), nx = l.x - c.x, nz = l.z - c.z;
      const Edge = (dir) => { let s = 0; const floor = sample(c.x, c.z); for (let u = 0.5; u <= 8; u += 0.1) { if (sample(c.x + nx * u * dir, c.z + nz * u * dir) >= floor + PN.ditch.depth * 0.9) { s = u; break; } } return s; };
      if (Math.abs(Edge(1) - Edge(-1)) >= 0.4) uneven += 1;
    }
    assert.ok(uneven >= 2, `干沙沟两岸要不齐（${uneven} 处不齐）`);
  }
  // 田是拼块：场地里的片朝向至少 4 种、没有一整片同宽的竖条、约五分之一整块
  const farm = FarmLayout();
  const siteGroups = farm.groups.filter((g) => g.row <= 4 && g.x1 > L0105_BOUNDS.minX && g.x0 < L0105_BOUNDS.maxX && g.poly);
  const dirs = new Set(siteGroups.filter((g) => !g.whole).map((g) => g.shearDeg));
  assert.ok(dirs.size >= 4 && [...dirs].every((d) => Math.abs(d) <= L0105_FARM.shearDeg && Math.abs(d) >= 3), `片的朝向 ${dirs.size} 种（要 ≥ 4，每片 ±3…14°）`);
  for (const g of siteGroups.filter((q) => !q.whole)) {
    const ws = farm.parcels.filter((p) => p.row === g.row && p.group === g.index).map((p) => Math.round(p.w * 2) / 2);
    if (ws.length >= 3) assert.ok(new Set(ws).size >= 2, `row ${g.row} group ${g.index} 一整排同宽的竖条`);
    for (const w of ws) assert.ok(w >= 9.9 && w <= 32.1, `row ${g.row} group ${g.index} 条宽 ${w}（要 10–32）`);
    assert.ok(g.x1 - g.x0 >= 50 && g.x1 - g.x0 <= 110, `片宽 ${g.x1 - g.x0}（要 50–110）`);
  }
  const wholeFrac = siteGroups.filter((g) => g.whole).length / siteGroups.length;
  assert.ok(wholeFrac >= 0.08 && wholeFrac <= 0.35, `整块不分条的片占 ${(wholeFrac * 100).toFixed(0)}%（要约五分之一）`);
  // 林 ≥ 3 片（坟 5–7、柏树 3–5）；南半场零星的树离路 ≥ 10 m、彼此 ≥ 25 m
  assert.ok(L0105_WOODS.length >= 3 && L0105_WOODS.every((w) => w.graves.length >= 5 && w.graves.length <= 7 && w.cypresses.length >= 3 && w.cypresses.length <= 5), "家族坟地（林）≥ 3 片，坟 5–7、柏树 3–5");
  for (const w of L0105_WOODS) assert.equal(all.filter((b) => b.id.startsWith(`${w.id}_Cypress`)).length, w.cypresses.length, `${w.name} 的柏树`);
  for (const w of L0105_WOODS) for (const g of w.graves) { let ring = 0; for (let i = 0; i < 12; i++) { const ang = i * Math.PI / 6; ring += sample(g.x + Math.cos(ang) * (PN.graveBaseR + 1), g.z + Math.sin(ang) * (PN.graveBaseR + 1)); } assert.ok(Math.abs(sample(g.x, g.z) - ring / 12 - g.h) < 0.15, `${w.name} 的坟 (${g.x},${g.z}) 没烘进高度场`); }
  const st = all.filter((b) => /^SouthTree_/.test(b.id));
  assert.equal(st.length, L0105_SOUTH_TREES.length, "南半场零星的树照锚点表");
  for (const t of st) {
    for (const line of [L0105_ROAD, L0105_POST_ROAD_SOUTH, ...L0105_FIELD_LANES, L0105_TRENCHES.traffic, L0105_TRENCHES.traffic2, L0105_TRENCHES.front]) assert.ok(DistLine(t.x, t.z, line) >= 10, `${t.id} (${t.x},${t.z}) 挨着路 / 沟`);
    for (const u of st) if (u !== t) assert.ok(Math.hypot(u.x - t.x, u.z - t.z) >= 25, `${t.id} 和 ${u.id} 挨得太近`);
  }
  // 老驿道：有头有尾——从北边界下来，过岔口 (175,−40) 往东南一直到 z ≥ 40（场地里到南边界，远景里接着往东南）
  assert.deepEqual([L0105_POST_ROAD_SOUTH[0].x, L0105_POST_ROAD_SOUTH[0].z], [L0105_ROAD[0].x, L0105_ROAD[0].z], "驿道南段从车道岔口接出去");
  assert.ok(L0105_POST_ROAD_SOUTH[L0105_POST_ROAD_SOUTH.length - 1].z >= 40, "驿道往南到 z ≥ 40");
  assert.ok(Math.hypot(L0105_BACKDROP_POST_ROAD[0].x - L0105_POST_ROAD_SOUTH[L0105_POST_ROAD_SOUTH.length - 1].x, L0105_BACKDROP_POST_ROAD[0].z - L0105_POST_ROAD_SOUTH[L0105_POST_ROAD_SOUTH.length - 1].z) < 0.01, "远景里的驿道接在场地里那段的头上");
  assert.ok(!all.some((b) => /Poplar|RoadTree/.test(b.id)), "驿道没有行道树");
  assert.ok(sample(185, 2) < NaturalHeight(185, 2) - 0.05, "驿道南段在坑南靠路面压低认路");
  // 三辆轻装甲车露头的地方在东边麦田里（场地东扩到 320）
  assert.ok(L0105_BOUNDS.maxX >= 310 && P.tankFirstSeen.x >= 250 && P.tankFirstSeen.z <= -100, "轻装甲车从东边麦田 x 260–300 冒出来");
}

const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");

// --- 洞 ---
const dugFloor = sample(P.dugout.x, P.dugout.z);
const roof = byId.get("DugoutRoofTimber");
assert.ok(roof.y - roof.h / 2 - dugFloor >= 2.1, "洞里净高 ≥ 2.1");
const beam = byId.get("DugoutCollapseBeam");
const gap = beam.y - beam.h / 2 - dugFloor;
assert.ok(gap >= 0.3 && gap <= 0.5, `塌洞横木离地 ${gap}`);
assert.equal(byId.get("DugoutLintel").signal, "DugoutCollapsed");
assert.equal(byId.get("ParapetMiddle").signal, "PitShelled");
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));

// --- 板桥 ---
const boards = all.filter((x) => /^BridgeDoorBoard_/.test(x.id));
const stringers = all.filter((x) => /^BridgeStringer_/.test(x.id));
assert.ok(boards.length >= 9 && stringers.length >= 3, "板桥：门板 ≥ 9 块、横木 ≥ 3 根");
assert.ok(boards.every((x) => x.w >= 3.5 && x.w <= 4.0), "桥面宽 3.5–4 m（驴车、担架过得去）");
const r = BR.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
const deckTop = Math.max(...boards.map((x) => x.y + x.h / 2));
for (const s of [-1, 1]) {
  const end = sample(BR.x + fx * s * (BR.spanM / 2 + 0.5), BR.z + fz * s * (BR.spanM / 2 + 0.5));
  assert.ok(Math.abs(deckTop - end) <= 0.2, `桥面与桥头地面不齐：桥面 ${deckTop.toFixed(2)} vs ${end.toFixed(2)}`);
}
const under = sample(BR.x, BR.z);
const clear = Math.min(...stringers.map((x) => x.y - x.h / 2)) - under;
assert.ok(clear >= 1.6, `桥下横木底离沟底 ${clear.toFixed(2)} m（人要能在桥下沟底趴着、弯腰过）`);
assert.ok(deckTop - under >= 2.0, "桥下照常是沟");
// 门板之间 6–10 cm 的缝（每块门板单独一个块），桥下仰看透得出天光（10-18 第三轮：5 cm 在白盒灰里看不出一块块板）
let gapMin = Infinity, gapMax = 0;
{
  const sorted = boards.map((x) => ({ x, s: (x.x - BR.x) * fx + (x.z - BR.z) * fz })).sort((p, q) => p.s - q.s);
  for (let i = 1; i < sorted.length; i++) {
    const gapM = (sorted[i].s - sorted[i - 1].s) - (sorted[i].x.d + sorted[i - 1].x.d) / 2;
    gapMin = Math.min(gapMin, gapM); gapMax = Math.max(gapMax, gapM);
    assert.ok(gapM >= 0.055 && gapM <= 0.105, `门板 ${sorted[i - 1].x.id}–${sorted[i].x.id} 缝 ${(gapM * 100).toFixed(1)} cm（要 6–10 cm）`);
  }
}
// 旧门板：厚薄、高低各家不一（至少两种厚度、顶面高低差 ≥ 2 cm），但顶面高低差 ≤ 4 cm、底面不压到横木上（净空不变）
{
  const tops = boards.map((x) => x.y + x.h / 2), bottoms = boards.map((x) => x.y - x.h / 2);
  const stringerTop = Math.max(...stringers.map((x) => x.y + x.h / 2));
  assert.ok(new Set(boards.map((x) => x.h)).size >= 2, "门板厚度要有差别");
  assert.ok(Math.max(...tops) - Math.min(...tops) >= 0.02, "门板顶面高低要略有差别");
  assert.ok(Math.max(...tops) - Math.min(...tops) <= 0.04 + 1e-9, "门板顶面高低差 ≤ 4 cm（桥面照样平；块中心高只到厘米）");
  assert.ok(Math.min(...bottoms) >= stringerTop - 0.011, `门板底面压进横木：${Math.min(...bottoms).toFixed(3)} < 横木顶 ${stringerTop.toFixed(3)}`);
}
const brokenOff = boards.filter((x) => x.signal === "TankDisabled");
const brokenOn = all.filter((x) => x.appearSignal === "TankDisabled");
assert.ok(brokenOff.length >= 1 && brokenOff.length <= 2 && brokenOn.length >= 1, "TankDisabled：一两块门板压断下沉");
assert.ok(brokenOn.every((x) => x.y < deckTop - 0.2), "断板要往下塌");

// --- 日常摆件 ---
const COVER_KINDS = new Set(Object.entries(L0105_PROP_KINDS).filter(([, k]) => k.cover).map(([n]) => n));
for (const p of L0105_PROPS) {
  const blk = byId.get(p.id);
  assert.ok(blk, `摆件 ${p.id} 没出块`);
  const k = L0105_PROP_KINDS[p.kind];
  assert.ok(k, `摆件 ${p.id} 的种类 ${p.kind} 没定义`);
  if (k.cover) {
    assert.ok(blk.h >= 0.8 && blk.h <= 1.1, `能挡子弹的摆件要齐腰高 0.8–1.1 m：${p.id} ${blk.h}`);
    assert.ok(blk.cover && Number.isFinite(blk.cover.faceX), `${p.id} 要写 cover 朝向`);
  }
  const w = PropPassage(sample, p);
  assert.ok(w >= 2.2, `${p.id} 旁边只剩 ${w} m 通道（要 ≥ 2.2）`);
}
assert.ok(L0105_PROPS.filter((p) => COVER_KINDS.has(p.kind)).length >= 20, "能挡子弹的摆件太少");
for (const row of PropsPerStraight(15)) assert.ok(row.count >= 1, `${row.on} (${row.from.x},${row.from.z})→(${row.to.x},${row.to.z}) ${row.len} m 的直沟没有摆件`);
for (const id of ["CrateStack_B1", "SandbagStack_J1", "SandbagStack_C2"]) assert.ok(COVER_KINDS.has(byId.get(id)?.prop), `02 拖单被要用的掩体 ${id} 不在`);
assert.ok(!all.some((x) => /foxhole|FoxHole|猫耳/i.test(x.id)), "不要猫耳洞");
{
  const trees = all.filter((x) => /^DeadTree_/.test(x.id));
  assert.equal(trees.length, L0105_GULLY_TREES.length, "干沟两岸的枯树照锚点表");
  assert.ok(trees.every((t) => GullyU(t.x, t.z) >= 1), "枯树都长在坎顶上，不在沟底 / 坎上");
  assert.ok(trees.filter((t) => t.z > 150).length >= 8 && trees.filter((t) => t.z < 141).length >= 3, "南岸疏疏落落一排、北岸坑窝顶上几棵");
}

// --- 坑北前景（2026-10-20）---
const pn = PitNorthChecks(sample);
for (const g of pn.graves) assert.ok(g.h >= 0.95 && g.h <= 1.35 && Math.abs(g.h - g.want) <= 0.1, `坟 ${g.id} 高 ${g.h}（要 ${g.want}，1.0–1.3）`);
assert.equal(pn.graves.length, 7, "两座孤坟 + 坟地五座");
assert.ok(pn.bunds.length >= 60 && pn.bundMin >= 0.25 && pn.bundMax <= 0.36, `田埂高 ${pn.bundMin}…${pn.bundMax}（要约 0.3）`);
assert.ok(pn.ditchDepthMin >= 1.2 && pn.ditchDepthMax <= 1.75, `干沙沟深 ${pn.ditchDepthMin}…${pn.ditchDepthMax}（自然地面往下 1.4 + 沟沿翻土）`);
{
  // 断面（2026-10-24 北沙河小支沟的样子）：沟底宽 5–6（离最深处 10 cm 内）；沟沿（翻土顶）到沟底 ≥ 1.2
  const rimU = PN.ditch.topW / 2 * (1 + PN.ditch.bankWobble) + PN.ditch.lipW + 0.4;
  for (const d of [70, 180, 230, 260, 300]) {   // 避开驿道从沟上过的那一截（约 d 100，路面下填平）和穿地坎的豁口（约 d 120）
    const c = PointBeside(PN.ditch.line, d, 0), l = PointBeside(PN.ditch.line, d, 1);
    const nx = l.x - c.x, nz = l.z - c.z;
    const prof = []; for (let u = -6; u <= 6.001; u += 0.05) prof.push([u, sample(c.x + nx * u, c.z + nz * u)]);
    const floor = Math.min(...prof.map((p) => p[1]));
    const flat = prof.filter((p) => p[1] <= floor + 0.1).map((p) => p[0]);
    const floorW = Math.max(...flat) - Math.min(...flat);
    assert.ok(floorW >= 4.5 && floorW <= 6.8, `干沙沟 d${d} 沟底宽 ${floorW.toFixed(2)}（要 5–6）`);
    const rimY = (sample(c.x + nx * rimU, c.z + nz * rimU) + sample(c.x - nx * rimU, c.z - nz * rimU)) / 2;
    assert.ok(rimY - floor >= 1.2, `干沙沟 d${d} 沟沿到沟底 ${(rimY - floor).toFixed(2)}（蹲着头不露要 ≥ 1.2）`);
  }
  assert.ok(LineLength(PN.ditch.line) > 290, "干水沟全长");
  // 尽头在坑西北约 100 m、渐浅到地面；不和坑、前沿沟、交通沟相交
  const end = PN.ditch.line[PN.ditch.line.length - 1];
  const dEnd = Math.hypot(end.x - P.pit.x, end.z - P.pit.z);
  assert.ok(dEnd >= 85 && dEnd <= 110, `干水沟尽头离坑心 ${dEnd.toFixed(0)} m（要约 100）`);
  assert.ok(Math.abs(Cut(end)) < 0.2, `干水沟尽头要渐浅到地面：${Cut(end).toFixed(2)}`);
  for (const p of [P.pit, { x: -62, z: -22 }, { x: 0, z: 0 }, { x: 0.5, z: 11 }]) assert.ok(DitchStation(p.x, p.z).d > 40, "干水沟离坑 / 前沿沟 / 交通沟太近");
}
assert.ok(pn.scarpMin >= 1.7 && pn.scarpMax <= 2.5, `地坎落差 ${pn.scarpMin}…${pn.scarpMax}（北低南高约 2 m；2026-10-24 起量坎线南 9.5 m，旧阵地的沟在 4–8 m）`);
{
  // 坎面陡：坎线两侧各 1 m 落差 ≥ 1.2 m；豁口处顺沟走 1 m 内高差 ≤ 0.6 m
  for (const x of [-80, -20, 28, 80, 170]) {
    const z = ScarpZ(x);
    assert.ok(sample(x, z + 1) - sample(x, z - 1) >= 1.2, `地坎 x${x} 坎面不够陡：${(sample(x, z + 1) - sample(x, z - 1)).toFixed(2)}`);
  }
  assert.ok(pn.notchStep <= 0.6, `豁口处顺沟 1 m 内高差 ${pn.notchStep}`);
  // 掷弹筒组在坎下（北边低的那层）
  assert.ok(P.mortar.z < ScarpZ(P.mortar.x) - 3, "掷弹筒组要在地坎北边（坎下）");
  assert.ok(sample(P.mortar.x, P.mortar.z) < sample(P.mortar.x, ScarpZ(P.mortar.x) + 4) - 1.6, "掷弹筒组脚下比坎上低 ≥ 1.6 m");
}
assert.ok(pn.mortar.worst >= 0.3, `坑里看得见坎下的掷弹筒组：最少只挡 ${pn.mortar.worst} m（${JSON.stringify(pn.mortar.worstRow?.b)}）`);
assert.ok(pn.smoke.worst <= -0.3, `坑里看不见掷弹筒的发射烟（离地 3 m）：${pn.smoke.worst}`);
assert.ok(pn.ditch.worst >= 0.1, `干水沟里弯腰的人（沟底 + ${PIT_NORTH_DITCH_HEAD_M}）从坑里看得见头：最少只挡 ${pn.ditch.worst} m（${JSON.stringify(pn.ditch.worstRow?.b)}）`);
assert.ok(pn.lmgW.block <= 0 && pn.lmgE.block <= 0, `坑里要看得见两挺轻机枪（压坑沿的人露着头）：${pn.lmgW.block} / ${pn.lmgE.block}`);
{
  // 跃进的人：有掩体的每一格，掩体在他和坑之间 —— 坑沿射击台上的眼睛看他趴着的身子（骨盆处离地 0.2；田埂只有 0.3 m，头顶齐埂），被田埂 / 坟 / 沟沿挡住
  const obs = PitNorthObservers(sample);
  const pitTop = { x: 0, z: -9.4, eyeY: obs.pitEyeY };
  let n = 0;
  const Check = (id, desc) => {
    const st = RushStation(desc);
    if (!st.cover) return;
    const r = SightBlockFromY(sample, pitTop, { x: st.x, z: st.z, eye: 0.2 }, 0.1);
    n += 1;
    assert.ok(r.block >= 0.02, `${id} ${JSON.stringify(desc)} → (${st.x},${st.z}) 从坑里看过去没被 ${st.cover} 挡住（${r.block}）`);
    assert.ok(Math.abs(sample(st.x, st.z + 0.35) - sample(st.x, st.z - 0.35)) < 0.3, `${id} 趴在斜坡上 (${st.x},${st.z})`);
  };
  for (const [id, list] of Object.entries(L0105_RUSH_STATIONS)) list.forEach((d) => Check(id, d));
  const SQ = L0105_DITCH_SQUAD;
  for (const [id, x] of Object.entries(SQ.n2X)) if (!SQ.fallen.includes(id)) Check(id, { bund: "N2", x });
  for (const [id, n1] of Object.entries(SQ.toN1)) Check(id, { bund: "N1", x: n1.x });
  assert.ok(n >= 20, `有掩体的站位太少（${n}）`);
  // 10-20 第四轮：短跃进 —— 相邻两格 9.5–18 m（从坎下翻上来那一跃算上翻坎 ≤ 26 m）；麦地里趴的地方平；坎下的蹲着（眼高 1.0）坑里看不见
  for (const [id, list] of Object.entries(L0105_RUSH_STATIONS)) {
    const st = list.map(RushStation);
    for (let i = 1; i < st.length; i++) {
      const hop = Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z);
      assert.ok(hop >= 9.5 && hop <= (st[i - 1].hidden ? 26 : 18), `${id} 第 ${i} 跃 ${hop.toFixed(1)} m`);
    }
    for (const q of st) {
      if (q.prone) assert.ok(Math.abs(sample(q.x, q.z + 0.35) - sample(q.x, q.z - 0.35)) < 0.3, `${id} 趴在斜坡上 (${q.x},${q.z})`);
      if (q.hidden) {
        assert.ok(q.z < ScarpZ(q.x) - 3, `${id} (${q.x},${q.z}) 要在地坎北边的低地里`);
        const r = SightBlockFromY(sample, pitTop, { x: q.x, z: q.z, eye: 1.0 }, 0.1);
        assert.ok(r.block >= 0.05, `${id} 蹲在坎下 (${q.x},${q.z}) 从坑里看得见（${r.block}）`);
      }
    }
  }
  for (const [id, f] of Object.entries(L0105_RUSH_FALLEN)) assert.ok(f.bound < 5 && Math.abs(f.at.z) > 150, `${id} 倒在正面开阔地里`);
  // 沟里那个班开场在干水沟里（离沟中心线 ≤ 0.8 m，弯着腰从坑里看不见：断面另见 pn.ditch）
  SQ.ids.forEach((id, i) => { const q = DitchSquadStart(i); assert.ok(DitchStation(q.x, q.z).d <= 0.8, `${id} 开场不在沟里 (${q.x},${q.z})`); });
}
{
  // 扫清带基本平：z −8…−80 内坑北前景只加了田埂、孤坟（和干水沟尽头），没有起伏、没有地坎（原来坑北略低的那 0.8 m 缓坡照旧）
  for (let z = -8.5; z >= -80; z -= 1.5) for (let x = -100; x <= 315; x += 1.5) {
    if (DitchStation(x, z).d < 8) continue;   // 2026-10-24 沙沟宽了（顶宽 8.6 + 两岸不齐 + 翻土）
    const add = PitNorthHeight(x, z, 0);
    assert.ok(Math.abs(add - Math.max(BundHeight(x, z), GraveHeight(x, z))) < 1e-9, "扫清带里除了田埂 / 孤坟还加了别的起伏：(" + x + "," + z + ") " + add);
  }
  // 坑北的函数只碰 z < −8：z ≥ −8 的点原样返回（南面、前沿一带一点不动）
  for (const [x, z] of [[0, -7.9], [50, 0], [35, 120], [-100, 150]]) assert.equal(PitNorthHeight(x, z, 0.37), 0.37, `坑北的改动碰到了 (${x},${z})`);
  // 第三版压平：地坎以北那一大片 = 前沿一带 + 坑北略低 0.8 m − 地坎 2 m + ±1 m 的大起伏（+ 原来那层 ±0.33 m 的小起伏；田埂 / 坟 / 干水沟 / 路以外逐点对得上，没有往北抬的坡）
  let rlo = Infinity, rhi = -Infinity, worst = 0, n = 0;
  const OLDP = L0105_OLD_POSITION;
  for (let z = -230; z >= -478; z -= 6) for (let x = -106; x <= 316; x += 6) {
    if (DitchStation(x, z).d < 8 || GraveHeight(x, z) > 0 || BundHeight(x, z) > 0) continue;
    const want = L0105_HEIGHTS.front + L0105_HEIGHTS.fieldNorthDip - PN.scarp.drop + PitNorthRoll(x, z);
    const near = [L0105_NORTH_ROAD, L0105_FIELD_PATH, ...OLD_LINES].some((line) => { for (let i = 1; i < line.length; i++) { const p0 = line[i - 1], p1 = line[i]; const dx = p1.x - p0.x, dz = p1.z - p0.z; const t = Math.max(0, Math.min(1, ((x - p0.x) * dx + (z - p0.z) * dz) / (dx * dx + dz * dz))); if (Math.hypot(x - p0.x - dx * t, z - p0.z - dz * t) < 9) return true; } return false; });
    if (near) continue;
    // 2026-10-24：旧阵地的坑（警戒散兵坑、掷弹筒的圆坑）也是 Ground 里挖的，不算
    if (OLDP.foxholes.some((f) => Math.hypot(f.x - x, f.z - z) < 4) || Math.hypot(P.mortar.x - x, P.mortar.z - z) < 5) continue;
    worst = Math.max(worst, Math.abs(sample(x, z) - want)); n += 1;
    rlo = Math.min(rlo, sample(x, z)); rhi = Math.max(rhi, sample(x, z));
  }
  assert.ok(n > 1000 && worst < 0.36, `坑北压平：坎下的地面跟「−2.8 + 大起伏」差 ${worst.toFixed(2)} m（${n} 点；前沿一带那层 ±0.33 m 的小起伏照旧）`);
  assert.ok(rhi - rlo >= 0.8 && rhi - rlo <= 2.7, `坎下的地面起伏 ${(rhi - rlo).toFixed(2)} m（只留 ±1 m 的低频起伏 + 前沿一带那层 ±0.33 m 的小起伏；2026-10-24 东扩到 x 320 后两头都量到了）`);
  for (let x = -100; x <= 180; x += 20) { const r = PitNorthRoll(x, -400); assert.ok(Math.abs(r) <= 1.0001, `大起伏超过 ±1 m：${r}`); }
}
{
  // 体块：树桩矮、柏树细高、麦秸垛 4×3×2.5；边界放得下村子
  const stumps = all.filter((x) => /^FieldStump_/.test(x.id));
  assert.ok(stumps.length >= 10 && stumps.every((x) => x.h >= 0.3 && x.h <= 0.5 && x.z <= -8 && x.z >= -80), "扫清带树桩十几个、0.3–0.5 m");
  const cyp = all.filter((x) => /^GraveCypress_/.test(x.id));
  assert.ok(cyp.length >= 2 && cyp.length <= 3 && cyp.every((x) => x.h >= 6 && x.h <= 8 && x.w <= 1.5), "坟地 2–3 棵柏树，6–8 m");
  const hs = byId.get("Haystack"), hsTop = byId.get("HaystackTop");
  assert.ok(hs && hsTop && hs.w === 4 && hs.d === 3, "麦秸垛 4×3 m");
  Near(hsTop.y + hsTop.h / 2 - (hs.y - hs.h / 2), 2.5, 0.02, "麦秸垛高");
  assert.ok(!all.some((x) => /^Village(Poplar|House|Roof)_/.test(x.id)), "原来 400 多米外那排杨树和 10 间房去掉了（第二轮重排）");
  assert.ok(!all.some((x) => /^EnemyLmg(WestMound|EastLip)$/.test(x.id)), "原来轻机枪的小土包 / 弹坑沿去掉了");
  // 轻机枪不站进麦秸垛，也不趴在坟顶上
  for (const p of [P.enemyLmgEast, { x: 36.0, z: -139.4 }]) assert.ok(Math.abs(p.x - PN.haystack.x) > PN.haystack.w / 2 + 0.5 || Math.abs(p.z - PN.haystack.z) > PN.haystack.d / 2 + 0.5, "轻机枪 2 站进了麦秸垛");
  assert.ok(GraveHeight(P.enemyLmgWest.x, P.enemyLmgWest.z) < 0.2, "轻机枪 1 趴在坟顶上了（要在坟后）");
}
// --- 坑北第二轮 / 第三版（2026-10-20）：田、路、坟、远景层 ---
{
  const paint = a.paint;
  assert.ok(Array.isArray(paint) && paint.length >= 60, "坑北要有涂色");
  for (const item of paint) for (const p of item.poly || item.line) assert.ok(p.z + (item.halfW || 0) + (item.feather || 1) / 2 < -8, `涂色 ${item.id} 伸到了 z ≥ −8：(${p.x},${p.z})`);
  // 栅格烘出来南面一点没涂（z ≥ −8 处覆盖度 0）
  const gp = BuildGroundPaint(paint, a.bounds), rgb = [0.5, 0.5, 0.5];
  for (let x = -110; x <= 320; x += 2) assert.equal(gp.Blend(x, -7.9, rgb), 0, `z −7.9 x ${x} 被涂了色`);
  assert.ok(gp.Blend(30, -50, [0, 0, 0]) > 0.99 && gp.Blend(30, -260, [0, 0, 0]) > 0.99 && gp.Blend(30, -470, [0, 0, 0]) > 0.99, "扫清带、坎下、北边界都要涂满");
  // 拼块田（2026-10-24）：条地 10–32 m 宽（按 FarmLayout 的名义宽，多边形因为斜了外包框更宽）、宽窄不一；翻地 + 撂荒过半
  const C = L0105_FIELD_PAINT;
  const strips = paint.filter((p) => /^Field_/.test(p.id));
  assert.ok(strips.length >= 60, `场地里的田块 ${strips.length}`);
  const kind = (c) => (C.wheat.includes(c) ? "wheat" : C.plowed.includes(c) ? "plowed" : C.fallow.includes(c) ? "fallow" : "?");
  const counts = { wheat: 0, plowed: 0, fallow: 0 };
  for (const f of strips) {
    const k = kind(f.color); assert.notEqual(k, "?", `田块 ${f.id} 颜色 ${f.color} 不是麦地 / 翻地 / 撂荒`); counts[k] += 1;
    assert.ok(f.poly.length >= 3 && f.poly.every((p) => p.z < -8), `田块 ${f.id} 的多边形不对`);
  }
  assert.ok(counts.plowed + counts.fallow >= strips.length * 0.55, `翻地 + 撂荒要多一些：${JSON.stringify(counts)}`);
  // 一片里相邻两条不种同一样；片与片之间留小路（2·pathHalfW）
  const farm = FarmLayout();
  for (let i = 1; i < farm.parcels.length; i++) {
    const p0 = farm.parcels[i - 1], p1 = farm.parcels[i];
    if (p0.row === p1.row && p0.group === p1.group) assert.notEqual(p0.crop.kind, p1.crop.kind, `片里相邻两条一样：row ${p0.row} group ${p0.group}`);
  }
  const fieldGroups = farm.groups.filter((g) => g.row <= 4 && g.x1 > L0105_BOUNDS.minX && g.x0 < L0105_BOUNDS.maxX);
  const perGroup = fieldGroups.map((g) => farm.parcels.filter((p) => p.row === g.row && p.group === g.index).length);
  const widths = farm.parcels.filter((p) => !p.whole && fieldGroups.some((g) => g.row === p.row && g.index === p.group)).map((p) => p.w);
  assert.ok(fieldGroups.length >= 10 && perGroup.filter((n) => n >= 3).length >= 6, `场地里的片 ${fieldGroups.length}，每片条数 ${perGroup.join("/")}`);
  assert.ok(Math.max(...widths) - Math.min(...widths) >= 10, `条地宽窄要不一：${Math.min(...widths).toFixed(1)}…${Math.max(...widths).toFixed(1)}`);
  assert.ok(paint.some((p) => p.id === "FarmPaths" && p.color === C.fieldPath), "片间田间小路（底色）");
  // 路：车道一个点不动；老驿道北段接在车道北头一直通到北边界，远景层的大路从那里接着往北
  assert.deepEqual(L0105_ROAD.map((p) => [p.x, p.z]), [[175, -40], [105, 50], [35, 116], [-20, 152], [-100, 185]], "车道 L0105_ROAD 不许动（05 A 车的路线）");
  assert.deepEqual([L0105_NORTH_ROAD[0].x, L0105_NORTH_ROAD[0].z], [175, -40], "驿道北段从车道北头接出去");
  const roadEnd = L0105_NORTH_ROAD[L0105_NORTH_ROAD.length - 1];
  assert.equal(roadEnd.z, L0105_BOUNDS.minZ, "驿道北段通到北边界");
  assert.deepEqual([L0105_BACKDROP_ROAD[0].x, L0105_BACKDROP_ROAD[0].z], [roadEnd.x, roadEnd.z], "远景层的大路接在场地里那段的头上");
  const roads = a.ways.roads.map((l) => JSON.stringify(l.map((p) => [p.x, p.z])));
  assert.ok(roads.includes(JSON.stringify(L0105_ROAD.map((p) => [p.x, p.z]))), "ways.roads 里车道原样");
  assert.equal(roads.length, 5 + L0105_FIELD_LANES.length, "ways.roads：车道、凹路、驿道北段、田间小路、驿道南段、几条田间小路");
  const pathEnd = L0105_FIELD_PATH[L0105_FIELD_PATH.length - 1];
  assert.ok(Math.hypot(pathEnd.x + 31, pathEnd.z + 122) < 15, "田间小路通到坟地一带");
  assert.equal(L0105_FIELD_PATH[0].z, L0105_BOUNDS.minZ, "田间小路往北出场地");
  // 路穿地坎是坡道、大路过干水沟填平：顺路 1 m 内高差 ≤ 0.35
  for (const line of [L0105_NORTH_ROAD, L0105_FIELD_PATH]) {
    let worstStep = 0;
    for (let d = 0; d < LineLength(line) - 1; d += 0.5) {
      const p = PointBeside(line, d, 0), q = PointBeside(line, d + 1, 0);
      if (q.z > -150 || q.z < -260) continue;
      worstStep = Math.max(worstStep, Math.abs(sample(p.x, p.z) - sample(q.x, q.z)));
    }
    assert.ok(worstStep <= 0.35, `路穿过地坎 / 干水沟处 1 m 内高差 ${worstStep.toFixed(2)}`);
  }
  // 树（2026-10-21 用户：整个场景稀疏地有几棵，不沿路种）：没有路边 / 小路边成排的树；田里零星的树彼此隔 25 m 以上、离路远、不在沟上坎上坟上
  assert.ok(!all.some((x) => /^(RoadPoplar|PathTree)_/.test(x.id)), "沿大路、沿小路成排的树去掉了");
  const ft = all.filter((x) => /^FieldTree_/.test(x.id));
  assert.equal(ft.length, L0105_FIELD_TREES.length, "田里零星的树照锚点表");
  const DistLine = (x, z, line) => { let best = Infinity; for (let i = 1; i < line.length; i++) { const a0 = line[i - 1], a1 = line[i], dx = a1.x - a0.x, dz = a1.z - a0.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((x - a0.x) * dx + (z - a0.z) * dz) / l2)); best = Math.min(best, Math.hypot(x - a0.x - dx * k, z - a0.z - dz * k)); } return best; };
  const graveSpots = [...L0105_FIELD_GRAVES, ...PN.loneGraves, ...PN.graveyard];
  for (const t of ft) {
    assert.ok(IsSceneTreeBlock(t) && t.h >= 10 && t.h <= 14, `${t.id} 要能种成树（${t.h} m）`);
    for (const line of [L0105_NORTH_ROAD, L0105_FIELD_PATH, L0105_ROAD, L0105_POST_ROAD_SOUTH, ...L0105_FIELD_LANES]) assert.ok(DistLine(t.x, t.z, line) >= 10, `${t.id} (${t.x},${t.z}) 挨着路`);
    assert.ok(DitchStation(t.x, t.z).d >= 3 && Math.abs(ScarpZ(t.x) - t.z) >= 6, `${t.id} (${t.x},${t.z}) 在沟里 / 坎上`);
    assert.ok(graveSpots.every((g) => Math.hypot(g.x - t.x, g.z - t.z) >= 3), `${t.id} (${t.x},${t.z}) 长在坟包上`);
    assert.ok(!(t.x > -75 && t.x < 75 && t.z > -215) && t.z < -90, `${t.id} (${t.x},${t.z}) 在扫清带或 03 跃进的那一片里`);
    for (const u of ft) if (u !== t) assert.ok(Math.hypot(u.x - t.x, u.z - t.z) >= 25, `${t.id} 和 ${u.id} 挨得太近（要稀疏）`);
  }
  for (const line of [L0105_NORTH_ROAD, L0105_FIELD_PATH]) assert.ok(ft.filter((t) => DistLine(t.x, t.z, line) < 15).length <= 1, "路边 15 m 内最多一棵（不成排）");
  // 远景田野上零星的树：照锚点表，不在村子树圈里，离远景的路和小路 ≥ 20 m；没有沿大路的成排树
  {
    const bdt = a.backdrop.shapes.filter((x) => /^BdLoneTree/.test(x.id));
    assert.equal(bdt.length, L0105_BACKDROP_LONE_TREES.length, "远景零星的树照锚点表");
    assert.ok(!a.backdrop.shapes.some((x) => /^BdRoadPoplar/.test(x.id)), "远景里沿大路的树去掉了");
    const DL = (x, z, line) => { let best = Infinity; for (let i = 1; i < line.length; i++) { const a0 = line[i - 1], a1 = line[i], dx = a1.x - a0.x, dz = a1.z - a0.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((x - a0.x) * dx + (z - a0.z) * dz) / l2)); best = Math.min(best, Math.hypot(x - a0.x - dx * k, z - a0.z - dz * k)); } return best; };
    for (const t of bdt) {
      assert.equal(t.kind, "tree");
      for (const line of [L0105_BACKDROP_ROAD, ...L0105_BACKDROP_PATHS]) assert.ok(DL(t.x, t.z, line) >= 20, `${t.id} (${t.x},${t.z}) 挨着远景的路`);
      for (const v of L0105_BACKDROP_VILLAGES) assert.ok(Math.abs(t.x - v.x) > v.rx + v.ringM + 20 || Math.abs(t.z - v.z) > v.rz + v.ringM + 20, `${t.id} 在村 ${v.id} 边上`);
      assert.ok(t.z < L0105_BOUNDS.minZ || t.x > L0105_BOUNDS.maxX || t.x < L0105_BOUNDS.minX, `${t.id} 应在场地外`);
    }
  }
  // 场地里没有村子（第三版挪进远景层）、没有炮楼
  assert.ok(!all.some((x) => /^(Home\d|Village)/.test(x.id)), "场地里不该再有村子的块");
  // 散坟：10–20 座，0.8–1.2 m 高（烘进高度场、涂新土色），不挨着跃进站位 / 路 / 干水沟 / 掷弹筒组
  assert.ok(L0105_FIELD_GRAVES.length >= 10 && L0105_FIELD_GRAVES.length <= 20, `散坟 ${L0105_FIELD_GRAVES.length}`);
  const stations = [];
  for (const list of Object.values(L0105_RUSH_STATIONS)) for (const d of list) stations.push(RushStation(d));
  for (const g of L0105_FIELD_GRAVES) {
    let ring = 0; for (let i = 0; i < 12; i++) { const ang = i * Math.PI / 6; ring += sample(g.x + Math.cos(ang) * (PN.graveBaseR + 1), g.z + Math.sin(ang) * (PN.graveBaseR + 1)); }
    const h = sample(g.x, g.z) - ring / 12;
    assert.ok(h >= 0.75 && h <= 1.3 && Math.abs(h - g.h) <= 0.12, `散坟 (${g.x},${g.z}) 高 ${h.toFixed(2)}（要 ${g.h}）`);
    for (const st of stations) assert.ok(Math.hypot(st.x - g.x, st.z - g.z) > 8, `散坟 (${g.x},${g.z}) 挨着跃进站位 (${st.x},${st.z})`);
    assert.ok(DitchStation(g.x, g.z).d > 8, `散坟 (${g.x},${g.z}) 挨着干水沟`);
    assert.ok(Math.hypot(g.x - P.mortar.x, g.z - P.mortar.z) > 20, `散坟 (${g.x},${g.z}) 挨着掷弹筒组`);
    for (const line of [L0105_NORTH_ROAD, L0105_FIELD_PATH, ...L0105_FIELD_LANES]) for (let d = 0; d <= LineLength(line); d += 2) { const q = PointBeside(line, d, 0); assert.ok(Math.hypot(q.x - g.x, q.z - g.z) > 6, `散坟 (${g.x},${g.z}) 压着路`); }
    assert.ok(paint.some((p) => /^FieldGrave_/.test(p.id) && p.color === C.newSoil && Math.abs(p.poly[0].x - g.x - 1.9) < 0.11 && Math.abs(p.poly[0].z - g.z) < 0.11), `散坟 (${g.x},${g.z}) 没涂新土色`);
  }
  // 色带钉在南面（z ≥ −8）的最低 / 最高点：坑北压平变低了也不改南面的颜色
  assert.ok(a.heightTint.lo === -2.68 && a.heightTint.hi >= 3.7 && a.heightTint.hi <= 3.9, `heightTint ${JSON.stringify(a.heightTint)}（钉在南面：最低还是干沟一带 −2.68，最高 3.7–3.9；2026-10-24 东扩后南面最高点在东边的坡顶台地上）`);

  // --- 远景层 ---
  const bd = a.backdrop;
  assert.ok(bd && bd.far >= 5000 && bd.ground.radiusM >= 5000, "要有远景层，远平面 / 远景地面够远");
  const layout = LayoutFromSceneDoc(a);
  assert.ok(layout.cameraFar >= 5000 && layout.backdrop && layout.backdropGroundAt, "LayoutFromSceneDoc 交出远景层与远平面");
  assert.equal(layout.blocks.length, a.blocks.length, "远景层不进 blocks（不碰撞、不进寻路）");
  assert.deepEqual(layout.bounds, a.bounds, "远景层不改玩家能走的范围");
  // 远景的东西都在场地外面
  const B = L0105_BOUNDS;
  const inside = (x, z) => x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ;
  for (const sh of bd.shapes) assert.ok(!inside(sh.x, sh.z), `远景体块 ${sh.id} 在场地里 (${sh.x},${sh.z})`);
  // 接缝：远景地面在场地边上跟场地一样高，往外 blendM 内落到 ground.y
  for (let x = B.minX; x <= B.maxX; x += 5) {
    assert.ok(Math.abs(layout.backdropGroundAt(x, B.minZ - 0.01) - sample(x, B.minZ)) < 0.01, `北边界 x ${x} 远景地面跟场地对不上`);
  }
  for (let z = B.minZ; z <= B.maxZ; z += 5) assert.ok(Math.abs(layout.backdropGroundAt(B.maxX + 0.01, z) - sample(B.maxX, z)) < 0.01, `东边界 z ${z} 远景地面跟场地对不上`);
  assert.ok(Math.abs(layout.backdropGroundAt(30, -480 - bd.ground.blendM - 1) - bd.ground.y) < 1e-6, "离场地 blendM 以外就是 ground.y");
  // 北边界两边的田块颜色接得上：场地涂色在 z −479 与远景图在 z −483 同一个 x 处的颜色
  const ras = RasterizeBackdropPaint(layout.backdrop);
  assert.ok(ras && ras.texelM <= 2.5, `远景地面图太糙：${ras?.texelM} m/像素`);
  const TexAt = (x, z) => { const i = Math.round((x - ras.minX) / ras.texelM - 0.5), j = Math.round((z - ras.minZ) / ras.texelM - 0.5); const at = (j * ras.width + i) * 4; return [ras.data[at] / 255, ras.data[at + 1] / 255, ras.data[at + 2] / 255, ras.data[at + 3] / 255]; };
  let same = 0, tried = 0;
  for (let x = B.minX + 3; x <= B.maxX - 3; x += 3.7) {
    const f = [0.5, 0.5, 0.5]; gp.Blend(x, -479, f);
    const t = TexAt(x, -483);
    tried += 1;
    if (t[3] > 0.99 && Math.abs(f[0] - t[0]) + Math.abs(f[1] - t[1]) + Math.abs(f[2] - t[2]) < 0.06) same += 1;
  }
  assert.ok(same >= tried * 0.8, `北边界两边的田块颜色接不上：${same}/${tried}`);
  // 四个村子：A 约 600 m 北偏东（x 60–200、z −560…−680）、大路穿村；B 西北约 1.2 km；C 正北约 2 km；D 东北约 2.5 km、在大路上
  const pit = { x: P.pit.x, z: P.pit.z };
  const Bearing = (v) => Math.atan2(v.x - pit.x, -(v.z - pit.z)) * 180 / Math.PI, Dist = (v) => Math.hypot(v.x - pit.x, v.z - pit.z);
  const VA = L0105_BACKDROP_VILLAGES.find((v) => v.id === "A"), VB = L0105_BACKDROP_VILLAGES.find((v) => v.id === "B");
  const VC = L0105_BACKDROP_VILLAGES.find((v) => v.id === "C"), VD = L0105_BACKDROP_VILLAGES.find((v) => v.id === "D");
  assert.ok(VA.x >= 60 && VA.x <= 200 && VA.z <= -560 && VA.z >= -680 && Dist(VA) >= 550 && Dist(VA) <= 700 && Bearing(VA) > 0 && Bearing(VA) < 30, `村 A (${VA.x},${VA.z})`);
  assert.ok(Dist(VB) >= 1050 && Dist(VB) <= 1350 && Bearing(VB) < -25 && Bearing(VB) > -65, `村 B 方位 ${Bearing(VB).toFixed(0)}° 距离 ${Dist(VB).toFixed(0)}`);
  assert.ok(Dist(VC) >= 1800 && Dist(VC) <= 2200 && Math.abs(Bearing(VC)) < 12, `村 C 方位 ${Bearing(VC).toFixed(0)}° 距离 ${Dist(VC).toFixed(0)}`);
  assert.ok(Dist(VD) >= 2300 && Dist(VD) <= 2700 && Bearing(VD) > 25 && Bearing(VD) < 65, `村 D 方位 ${Bearing(VD).toFixed(0)}° 距离 ${Dist(VD).toFixed(0)}`);
  const OnRoad = (v, tol) => { for (let d = 0; d <= LineLength(L0105_BACKDROP_ROAD); d += 2) { const q = PointBeside(L0105_BACKDROP_ROAD, d, 0); if (Math.hypot(q.x - v.x, q.z - v.z) < tol) return true; } return false; };
  assert.ok(OnRoad(VA, 4) && OnRoad(VD, 4), "大路穿过村 A、通到村 D");
  for (const v of L0105_BACKDROP_VILLAGES) {
    const mine = bd.shapes.filter((sh) => sh.id.startsWith(`Village${v.id}_`));
    const roofs = mine.filter((sh) => sh.kind === "box" && /Roof$/.test(sh.id)), trees = mine.filter((sh) => sh.kind === (v.id === "A" ? "tree" : "blob"));
    assert.ok(roofs.length >= 15 && trees.length >= 40, `村 ${v.id}：房顶 ${roofs.length}、树 ${trees.length}`);
    assert.ok(roofs.every((r) => r.color.toLowerCase() === "#3e3a35"), `村 ${v.id} 屋顶要深色`);
    // 树围成一圈：树的平均离村心距离比房子远
    const rTree = trees.reduce((acc, t) => acc + Math.hypot((t.x - v.x) / v.rx, (t.z - v.z) / v.rz), 0) / trees.length;
    const rRoof = roofs.reduce((acc, t) => acc + Math.hypot((t.x - v.x) / v.rx, (t.z - v.z) / v.rz), 0) / roofs.length;
    assert.ok(rTree > rRoof + 0.3, `村 ${v.id} 的树没围在外面（${rTree.toFixed(2)} vs 房 ${rRoof.toFixed(2)}）`);
  }
  // 东边一串低山包：20–60 m 高、离坑 2.8–3.4 km、在东北到东（方位 30°–100°）
  const hills = bd.shapes.filter((sh) => sh.kind === "hill");
  assert.ok(hills.length >= 4 && hills.length === L0105_BACKDROP_HILLS.length, `山包 ${hills.length}`);
  for (const h of hills) assert.ok(h.h >= 20 && h.h <= 60 && Dist(h) >= 2800 && Dist(h) <= 3400 && Bearing(h) >= 30 && Bearing(h) <= 100, `山包 ${h.id} 高 ${h.h} 距离 ${Dist(h).toFixed(0)} 方位 ${Bearing(h).toFixed(0)}°`);
  // 远景地面的田块：同一套分组网格（场地外也是窄条，远处拼块）；扫清带往东西延伸
  const rects = bd.paint.find((p) => p.rects);
  assert.ok(rects.rects.length >= 1000 && rects.palette.length >= 6, `远景田块 ${rects.rects.length}`);
  assert.ok(L0105_FARM.region.minX <= -3000 && L0105_FARM.region.maxX >= 3500, "远景田块铺得够宽（村子、山包那一带都在里面）");
}

console.log(`坑北前景：坟 ${pn.graves.map((g) => g.h).join("/")} m；田埂 ${pn.bundMin}…${pn.bundMax}；干水沟深 ${pn.ditchDepthMin}…${pn.ditchDepthMax}；地坎 ${pn.scarpMin}…${pn.scarpMax}；`
  + `掷弹筒组最少挡 ${pn.mortar.worst} m、烟露 ${-pn.smoke.worst} m；沟里弯腰的人最少挡 ${pn.ditch.worst} m`);

// --- 地标（§2.2 landmarks，2026-10-20）：齐、都在场地里、过校验；坑 / 洞 / 板桥 / 麦秸垛的框对得上实物；三处回身打的掩体框就是那三个摆件 ---
{
  const lms = a.landmarks;
  assert.ok(Array.isArray(lms) && lms.length >= 35, `地标要有 35 个以上，现在 ${lms?.length}`);
  const errors = [];
  LandmarkIssues(lms, errors);
  assert.deepEqual(errors, [], "地标过校验");
  const byName = new Map(lms.map((lm) => [lm.name, lm]));
  const NEED = [P.dugout.name, P.dugoutMouth.name, "支沟", P.enemyBranchGun.name, P.interrogation.name, P.branchMouth.name, P.outflankExit.name,
    "弹药箱垛", "土袋垛（台阶拐角）", "土袋垛（拐角 2）", BR.name, P.crest.name, "干沟（集结处）", "凹路口", P.pit.name, P.fireA.name, P.fireB.name, P.fireC.name,
    P.parapet.name, P.corner1.name, "坟地", "麦秸垛", "干水沟尽头", "地坎（北低 2 m）", P.mortar.name, P.tankFirstSeen.name];
  for (const name of NEED) assert.ok(byName.has(name), `缺地标「${name}」`);
  assert.equal(lms.filter((lm) => /^田埂 /.test(lm.name)).length, PN.bunds.length, "每道田埂一个地标");
  const B = a.bounds;
  for (const lm of lms) {
    assert.ok(lm.x >= B.minX && lm.x <= B.maxX && lm.z >= B.minZ && lm.z <= B.maxZ, `地标「${lm.name}」出了场地 (${lm.x},${lm.z})`);
    assert.ok(BLOCKOUT_LANDMARK_KINDS.includes(lm.kind), `地标「${lm.name}」kind ${lm.kind}`);
  }
  // 坑 / 洞：框从坑底立到地面（y − h/2 ≈ 坑底，y + h/2 ≈ 坑边自然地面上下 0.25 m）
  for (const [name, c, depth] of [[P.pit.name, P.pit, P.pit.floorDepth], [P.dugout.name, P.dugout, P.dugout.floorDepth]]) {
    const lm = byName.get(name);
    assert.ok(Math.abs(lm.y - lm.h / 2 - sample(c.x, c.z)) < 0.05, `${name} 地标的底 = 坑底`);
    assert.ok(Math.abs(lm.w - c.w) < 0.01 && Math.abs(lm.d - c.d) < 0.01 && Math.abs(lm.h - depth) < 0.01, `${name} 地标的尺寸 = 坑的尺寸`);
  }
  // 三处回身打的掩体：框就是那三个摆件（位置、尺寸、朝向）
  for (const [name, id] of [["弹药箱垛", "CrateStack_B1"], ["土袋垛（台阶拐角）", "SandbagStack_J1"], ["土袋垛（拐角 2）", "SandbagStack_C2"]]) {
    const lm = byName.get(name), b = a.blocks.find((q) => q.id === id);
    assert.ok(b && Math.hypot(lm.x - b.x, lm.z - b.z) < 0.02 && Math.abs(lm.w - b.w) < 0.02 && Math.abs((lm.ry || 0) - (b.ry || 0)) < 0.01, `${name} 地标对不上摆件 ${id}`);
  }
  // 板桥：框的朝向 = 门板的朝向（本地 Z 顺路），顶在桥面附近
  {
    const lm = byName.get(BR.name), board = [...a.blocks, ...a.gates].find((q) => q.id === "BridgeDoorBoard_01");
    assert.ok(Math.abs(lm.ry - Math.atan2(fx, fz)) < 0.01, `板桥地标朝向 ${lm.ry}`);
    assert.ok(Math.abs(lm.y + lm.h / 2 - (board.y + board.h / 2)) < 0.15, "板桥地标顶在桥面上");
  }
  const hsLm = byName.get("麦秸垛");
  assert.ok(Math.hypot(hsLm.x - PN.haystack.x, hsLm.z - PN.haystack.z) < 0.01 && Math.abs(hsLm.h - PN.haystack.h) < 0.01, "麦秸垛地标对上麦秸垛");
  for (const kind of ["pit", "area", "prop", "place"]) assert.ok(lms.some((lm) => lm.kind === kind), `缺 ${kind} 类地标`);
}

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块 + ${a.landmarks.length} 地标，${a.terrain.cols}×${a.terrain.rows} 网格；干沟沟底宽 ${ext.min}…${ext.max} m、连续 ${ext.floorLen} m；`
  + `视线 ① 最少挡 ${sights.assembly.worst} m、② 最少挡 ${sights.south.worst} m；桥下净空 ${clear.toFixed(2)} m；门板缝 ${(gapMin * 100).toFixed(0)}–${(gapMax * 100).toFixed(0)} cm；摆件 ${L0105_PROPS.length}`);

function BranchZ(x) { return 67.1 + (64.5 - 67.1) * (x - 21.9) / (63 - 21.9); }
