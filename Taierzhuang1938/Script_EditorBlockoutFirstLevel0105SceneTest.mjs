// Script_EditorBlockoutFirstLevel0105SceneTest.mjs —— 01–05 白盒场景生成器的 node 回归（只给场景包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105SceneTest.mjs
// 查：生成两次逐字相同（generatedAt 固定）、过 ValidateBlockoutScene、锚点处高度、沟底宽、塌洞净空；
// 10-18 返工：干沟尺寸与两条视线（集结处看不见前沿、南边平地看不进沟底）、支沟南沿土垄挡住北沿机枪、
// 板桥（宽、与地面齐平、桥下净空、TankDisabled 压断两块、门板之间 6–10 cm 缝、旧门板厚薄高低不一）、日常摆件（高度、通道 ≥ 2.2 m、≥15 m 直沟至少一件）。
// 10-18 第二轮：南岸坎顶一道 0.6–0.8 m 的连续矮土埂（烘进高度场），南边平地看沟底的余量 ≥ 0.6 m。
// 10-20 干沟改弯沟：沟底宽窄不一（坑窝 ≥ 9 m、最窄 ≥ 3.5 m、不能处处一样宽）、中心线连续沟底 ≥ 50 m、北岸坑窝陡坎、
// 沟底离大路 ≥ 20 m（原来方坑西北角 8 m）、人待的地方离路口（板桥）≥ 28 m、支沟（伤员）在沟底高度、凹路口接上沟底。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import {
  BuildFirstLevel0105Scene, FloorWidthAt, NaturalHeight, L0105SightChecks, GullyFloorExtent, GullyBankHeights, PropPassage, PropsPerStraight,
  GullySouthBerm, GullySouthBermTop, L0105_GULLY_SOUTH_BERM_LENGTH,
} from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import {
  L0105_PLACES as P, L0105_HEIGHTS as H, L0105_TRENCH_SECTION as S, L0105_GULLY as G, L0105_BRIDGE as BR,
  L0105_PROPS, L0105_PROP_KINDS, L0105_SUNKEN_LANE, L0105_GULLY_SOUTH_BERM as SB, PointBeside, GullyU, InGullyFloor,
  L0105_ROAD, L0105_GULLY_POCKETS, L0105_GULLY_TREES,
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

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格；干沟沟底宽 ${ext.min}…${ext.max} m、连续 ${ext.floorLen} m；`
  + `视线 ① 最少挡 ${sights.assembly.worst} m、② 最少挡 ${sights.south.worst} m；桥下净空 ${clear.toFixed(2)} m；门板缝 ${(gapMin * 100).toFixed(0)}–${(gapMax * 100).toFixed(0)} cm；摆件 ${L0105_PROPS.length}`);

function BranchZ(x) { return 67.1 + (64.5 - 67.1) * (x - 21.9) / (63 - 21.9); }
