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
// 大路北段接在它北头穿村、田间小路单独一条；路边杨树两侧成排、离路 3.5–5.5 m、能种成树；路穿地坎 / 干水沟处是坡道 / 填平；
// 村子在坑北 285–365 m、20–30 户、院墙 2–2.6 m、房墙 ≥ 3 m、屋顶比墙宽且 1–1.5 m 压在墙顶；色带钉在南面。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler, IsSceneTreeBlock, BuildGroundPaint } from "./Script_EditorBlockoutLevels.mjs";
import {
  BuildFirstLevel0105Scene, FloorWidthAt, NaturalHeight, L0105SightChecks, GullyFloorExtent, GullyBankHeights, PropPassage, PropsPerStraight,
  GullySouthBerm, GullySouthBermTop, L0105_GULLY_SOUTH_BERM_LENGTH,
  PitNorthChecks, PitNorthHeight, PitNorthTilt, DitchStation, BundHeight, GraveHeight, SightBlockFromY, PitNorthObservers, PIT_NORTH_DITCH_HEAD_M,
} from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import {
  L0105_PLACES as P, L0105_HEIGHTS as H, L0105_TRENCH_SECTION as S, L0105_GULLY as G, L0105_BRIDGE as BR,
  L0105_PROPS, L0105_PROP_KINDS, L0105_SUNKEN_LANE, L0105_GULLY_SOUTH_BERM as SB, PointBeside, GullyU, InGullyFloor,
  L0105_ROAD, L0105_GULLY_POCKETS, L0105_GULLY_TREES,
  L0105_PIT_NORTH as PN, L0105_BOUNDS, L0105_RUSH_STATIONS, L0105_RUSH_REPLACEMENT, L0105_DITCH_FLANK, RushStation, ScarpZ, LineLength,
  L0105_NORTH_ROAD, L0105_FIELD_PATH, L0105_VILLAGE, L0105_VILLAGE_HOMES, L0105_ROAD_TREES, L0105_FIELD_PAINT,
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

// --- 沟底宽 ---
for (const [x, z, nx, nz, min] of [[-30.5, 0, 0, 1, 3.4], [56, 0, 0.5, 1, 3.4], [-62, -12, 1, 0, 3.4], [12.5, 32, 23, 1, 3.4],
  [26, 76.6, 42, -18, 3.4], [35, 128, 1, 0, 3.4], [35, 116.5, 1, 0, 3.4], [42, 65.8, 2.6, 41.1, 3.4]]) {
  const r = FloorWidthAt(sample, x, z, nx, nz);
  assert.ok(r.width >= min, `沟底宽 (${x},${z}) ${r.width} < ${min}`);
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
assert.ok(pn.ditchDepthMin >= 1.15 && pn.ditchDepthMax <= 1.6, `干水沟深 ${pn.ditchDepthMin}…${pn.ditchDepthMax}（自然地面往下 1.2 + 沟沿翻土）`);
{
  // 断面：沟底宽约 1.5（离最深处 10 cm 内）；沟沿（翻土顶）到沟底 ≥ 1.2
  for (const d of [20, 60, 120, 170, 200]) {
    const c = PointBeside(PN.ditch.line, d, 0), l = PointBeside(PN.ditch.line, d, 1);
    const nx = l.x - c.x, nz = l.z - c.z;
    const prof = []; for (let u = -3; u <= 3.001; u += 0.05) prof.push([u, sample(c.x + nx * u, c.z + nz * u)]);
    const floor = Math.min(...prof.map((p) => p[1]));
    const flat = prof.filter((p) => p[1] <= floor + 0.1).map((p) => p[0]);
    const floorW = Math.max(...flat) - Math.min(...flat);
    assert.ok(floorW >= 0.9 && floorW <= 2.2, `干水沟 d${d} 沟底宽 ${floorW.toFixed(2)}（要约 1.5）`);
    const rimY = (sample(c.x + nx * 2.2, c.z + nz * 2.2) + sample(c.x - nx * 2.2, c.z - nz * 2.2)) / 2;
    assert.ok(rimY - floor >= 1.2, `干水沟 d${d} 沟沿到沟底 ${(rimY - floor).toFixed(2)}（蹲着头不露要 ≥ 1.2）`);
  }
  assert.ok(LineLength(PN.ditch.line) > 290, "干水沟全长");
  // 尽头在坑西北约 100 m、渐浅到地面；不和坑、前沿沟、交通沟相交
  const end = PN.ditch.line[PN.ditch.line.length - 1];
  const dEnd = Math.hypot(end.x - P.pit.x, end.z - P.pit.z);
  assert.ok(dEnd >= 85 && dEnd <= 110, `干水沟尽头离坑心 ${dEnd.toFixed(0)} m（要约 100）`);
  assert.ok(Math.abs(Cut(end)) < 0.2, `干水沟尽头要渐浅到地面：${Cut(end).toFixed(2)}`);
  for (const p of [P.pit, { x: -62, z: -22 }, { x: 0, z: 0 }, { x: 0.5, z: 11 }]) assert.ok(DitchStation(p.x, p.z).d > 40, "干水沟离坑 / 前沿沟 / 交通沟太近");
}
assert.ok(pn.scarpMin >= 1.7 && pn.scarpMax <= 2.3, `地坎落差 ${pn.scarpMin}…${pn.scarpMax}（北低南高约 2 m）`);
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
  Check("IjaRushR1", L0105_RUSH_REPLACEMENT.from); Check("IjaRushR1", L0105_RUSH_REPLACEMENT.to);
  L0105_DITCH_FLANK.proneAt.forEach((x, i) => Check(L0105_DITCH_FLANK.ids[i], { bund: "N1", x }));
  assert.ok(n >= 35, "跃进站位太少");
}
{
  // 扫清带基本平：z −8…−80 内坑北前景只加了田埂、孤坟（和干水沟尽头），没有起伏、没有地坎（原来坑北略低的那 0.8 m 缓坡照旧）
  for (let z = -8.5; z >= -80; z -= 1.5) for (let x = -100; x <= 185; x += 1.5) {
    if (DitchStation(x, z).d < 6) continue;
    const add = PitNorthHeight(x, z, 0);
    assert.ok(Math.abs(add - Math.max(BundHeight(x, z), GraveHeight(x, z))) < 1e-9, "扫清带里除了田埂 / 孤坟还加了别的起伏：(" + x + "," + z + ") " + add);
  }
  // 坑北的函数只碰 z < −8：z ≥ −8 的点原样返回（南面、前沿一带一点不动）
  for (const [x, z] of [[0, -7.9], [50, 0], [35, 120], [-100, 150]]) assert.equal(PitNorthHeight(x, z, 0.37), 0.37, `坑北的改动碰到了 (${x},${z})`);
  // 大起伏：地坎以北那一大片（扣掉地坎落差）起伏 1–3 m（几百米一个波）
  let rlo = Infinity, rhi = -Infinity;
  for (let z = -230; z >= -470; z -= 10) for (let x = -100; x <= 180; x += 10) {
    if (DitchStation(x, z).d < 4) continue;
    const y = sample(x, z) + PN.scarp.drop - PitNorthTilt(z); rlo = Math.min(rlo, y); rhi = Math.max(rhi, y);
  }
  assert.ok(rhi - rlo >= 1.0 && rhi - rlo <= 3.0, `远处大起伏 ${(rhi - rlo).toFixed(2)} m（要 1–2 m 上下）`);
}
{
  // 体块：树桩矮、柏树细高、麦秸垛 4×3×2.5、杨树 12–15 m、土坯房墙 3 m；边界放得下村子
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
// --- 坑北第二轮（2026-10-20）：田、路、村子 ---
{
  const paint = a.paint;
  assert.ok(Array.isArray(paint) && paint.length >= 60, "坑北要有涂色");
  for (const item of paint) for (const p of item.poly || item.line) assert.ok(p.z + (item.halfW || 0) + (item.feather || 1) / 2 < -8, `涂色 ${item.id} 伸到了 z ≥ −8：(${p.x},${p.z})`);
  // 栅格烘出来南面一点没涂（z ≥ −8 处覆盖度 0）
  const gp = BuildGroundPaint(paint, a.bounds), rgb = [0.5, 0.5, 0.5];
  for (let x = -110; x <= 190; x += 2) assert.equal(gp.Blend(x, -7.9, rgb), 0, `z −7.9 x ${x} 被涂了色`);
  assert.ok(gp.Blend(30, -50, [0, 0, 0]) > 0.99 && gp.Blend(30, -260, [0, 0, 0]) > 0.99 && gp.Blend(30, -330, [0, 0, 0]) > 0.99, "扫清带、坎下、村子都要涂满");
  const fields = paint.filter((p) => /^Field_/.test(p.id));
  const C = L0105_FIELD_PAINT;
  assert.ok(fields.length >= 50, `田块 ${fields.length}`);
  for (const c of [C.plowed, C.fallow]) assert.ok(fields.some((f) => f.color === c), `田块缺颜色 ${c}`);
  assert.ok(fields.some((f) => C.wheat.includes(f.color)), "田块缺麦地");
  const kind = (c) => (C.wheat.includes(c) ? "wheat" : c);
  for (let i = 1; i < fields.length; i++) {
    const b0 = fields[i - 1].id.split("_")[1], b1 = fields[i].id.split("_")[1];
    if (b0 === b1) assert.notEqual(kind(fields[i - 1].color), kind(fields[i].color), `相邻两块田一个颜色：${fields[i - 1].id} / ${fields[i].id}`);
  }
  for (const f of fields) {
    const xs = f.poly.map((p) => p.x), w = Math.max(...xs) - Math.min(...xs);
    if (Math.min(...xs) > L0105_BOUNDS.minX && Math.max(...xs) < L0105_BOUNDS.maxX) assert.ok(w >= 19.9 && w <= 61, `田块 ${f.id} 宽 ${w.toFixed(1)}（要 20–60）`);
  }
  // 路：大路一个点不动；北段接在大路北头，末端在村里；小路单独一条，不接进大路
  assert.deepEqual(L0105_ROAD.map((p) => [p.x, p.z]), [[175, -40], [105, 50], [35, 116], [-20, 152], [-100, 185]], "大路 L0105_ROAD 不许动（战车路线）");
  assert.deepEqual([L0105_NORTH_ROAD[0].x, L0105_NORTH_ROAD[0].z], [175, -40], "大路北段从大路北头接出去");
  const roads = a.ways.roads.map((l) => JSON.stringify(l.map((p) => [p.x, p.z])));
  assert.ok(roads.includes(JSON.stringify(L0105_ROAD.map((p) => [p.x, p.z]))), "ways.roads 里大路原样");
  assert.equal(roads.length, 4, "ways.roads：大路、凹路、大路北段、田间小路");
  const V = L0105_VILLAGE;
  const end = L0105_NORTH_ROAD[L0105_NORTH_ROAD.length - 1];
  assert.ok(end.z <= V.rows[0].zS && end.z >= V.rows[V.rows.length - 1].zN && end.x <= V.minX, "大路北段穿村到西头");
  const pathEnd = L0105_FIELD_PATH[L0105_FIELD_PATH.length - 1];
  assert.ok(Math.hypot(pathEnd.x + 31, pathEnd.z + 122) < 15, "田间小路通到坟地一带");
  // 路穿地坎是坡道、大路过干水沟填平：顺路 1 m 内高差 ≤ 0.35
  for (const line of [L0105_NORTH_ROAD, L0105_FIELD_PATH]) {
    let worst = 0;
    for (let d = 0; d < LineLength(line) - 1; d += 0.5) {
      const p = PointBeside(line, d, 0), q = PointBeside(line, d + 1, 0);
      if (q.z > -150 || q.z < -260) continue;
      worst = Math.max(worst, Math.abs(sample(p.x, p.z) - sample(q.x, q.z)));
    }
    assert.ok(worst <= 0.35, `路穿过地坎 / 干水沟处 1 m 内高差 ${worst.toFixed(2)}`);
  }
  // 路边杨树：两侧成排、离路 3.5–5.5 m、能种成树
  const rt = all.filter((x) => /^RoadPoplar_/.test(x.id));
  assert.ok(rt.length >= 36 && rt.every((t) => IsSceneTreeBlock(t) && t.h >= L0105_ROAD_TREES.hMin && t.h <= L0105_ROAD_TREES.hMax), `路边杨树 ${rt.length}，要能种成树`);
  const sides = { 1: 0, "-1": 0 };
  for (const t of rt) {
    let best = Infinity, sgn = 0;
    for (let i = 1; i < L0105_NORTH_ROAD.length; i++) {
      const p0 = L0105_NORTH_ROAD[i - 1], p1 = L0105_NORTH_ROAD[i], dx = p1.x - p0.x, dz = p1.z - p0.z, l2 = dx * dx + dz * dz;
      const k = Math.max(0, Math.min(1, ((t.x - p0.x) * dx + (t.z - p0.z) * dz) / l2)), ex = t.x - p0.x - dx * k, ez = t.z - p0.z - dz * k, dd = Math.hypot(ex, ez);
      if (dd < best) { best = dd; sgn = Math.sign(dx * ez - dz * ex); }
    }
    assert.ok(best >= 3.5 && best <= 5.5, `杨树 ${t.id} 离路 ${best.toFixed(1)} m`);
    sides[sgn] += 1;
  }
  assert.ok(sides[1] >= 18 && sides[-1] >= 18, `路两侧的杨树 ${sides[1]} / ${sides[-1]}`);
  // 村子
  const homes = L0105_VILLAGE_HOMES;
  assert.ok(homes.length >= 20 && homes.length <= 30, `村子 ${homes.length} 户`);
  const HouseRe = /^Home\d\d_House\d$/;
  for (const h of homes) {
    const dz = -(h.zS + h.zN) / 2 - 7;
    assert.ok(dz >= 285 && dz <= 365, `${h.id} 离坑 ${dz.toFixed(0)} m`);
    const walls = all.filter((x) => x.id.startsWith(h.id + "_Wall"));
    assert.ok(walls.length >= 6 && walls.every((w) => w.h >= 2 && w.h <= 2.6 && w.semantic === "plaster"), `${h.id} 院墙`);
    const hs = all.filter((x) => x.id.startsWith(h.id + "_House") && HouseRe.test(x.id));
    assert.ok(hs.length >= 2 && hs.length <= 3, `${h.id} 两三间房`);
    for (const house of hs) {
      assert.ok(house.h >= 3 && house.semantic === "plaster", `${house.id} 墙高 ${house.h}`);
      const roof = byId.get(house.id.replace("_House", "_Roof"));
      assert.ok(roof && roof.semantic === "roof" && roof.w > house.w && roof.d > house.d && roof.h >= 1 && roof.h <= 1.5, `${house.id} 屋顶`);
      Near(roof.y - roof.h / 2, house.y + house.h / 2, 0.02, `${house.id} 屋顶压在墙顶上`);
    }
  }
  assert.ok(a.colorSemantics?.includes("roof") && /^#[0-9a-f]{6}$/i.test(a.semanticColors?.roof || ""), "屋顶在白盒画质里保留深色");
  // 树、房都不在扫清带里
  for (const x of all) if (/^(RoadPoplar|FieldTree|PathTree|VillageTree|Home)/.test(x.id) && x.z > -80) assert.fail(`${x.id} 种进了扫清带 (${x.x},${x.z})`);
  // 色带钉在南面（z ≥ −8）的最高点：坑北抬高了也不改南面的颜色
  assert.ok(a.heightTint && a.heightTint.hi < 4 && a.heightTint.lo < -2, `heightTint ${JSON.stringify(a.heightTint)}`);
}

console.log(`坑北前景：坟 ${pn.graves.map((g) => g.h).join("/")} m；田埂 ${pn.bundMin}…${pn.bundMax}；干水沟深 ${pn.ditchDepthMin}…${pn.ditchDepthMax}；地坎 ${pn.scarpMin}…${pn.scarpMax}；`
  + `掷弹筒组最少挡 ${pn.mortar.worst} m、烟露 ${-pn.smoke.worst} m；沟里弯腰的人最少挡 ${pn.ditch.worst} m`);

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格；干沟沟底宽 ${ext.min}…${ext.max} m、连续 ${ext.floorLen} m；`
  + `视线 ① 最少挡 ${sights.assembly.worst} m、② 最少挡 ${sights.south.worst} m；桥下净空 ${clear.toFixed(2)} m；门板缝 ${(gapMin * 100).toFixed(0)}–${(gapMax * 100).toFixed(0)} cm；摆件 ${L0105_PROPS.length}`);

function BranchZ(x) { return 67.1 + (64.5 - 67.1) * (x - 21.9) / (63 - 21.9); }
