// 壕沟规划层（Script_TrenchPlan）的纯 Node 回归。
//
// 这层被高度场烘焙（渲染 + Rapier + 贴地共用一张场）、顶点色和全部布设共用：
// 它错一个符号，症状是「沟底有台阶 / 抛土堆进邻沟 / 护壁挡死三岔口 / 爆炸帧
// 掉到个位数帧率」这种要实拍才抓得到的东西。所以契约逐条钉死：
//   1. legacy 逐点等价 —— 旧公式原样抄成 oracle，覆盖 7 条沟的 5000 个点
//   2. 热路径 —— 10 万次 Apply < 200 ms（分桶网格，不许遍历全部站点）
//   3. junction 自动识别 —— 三岔口 3 个成员、回环各 2 个 T、Sap 一个 T 一个尽端
//   4. 并集与抛土 —— 取更深、不堆进开挖坡、只堆指定侧
//   5. 随机有界 —— 宽/深在带内，沟底沿弧长不许出台阶
//   6. 布设 —— 确定性、让开三岔口/路线/手摆件、id 规则、统计对得上
//   7. 圆角 —— 半径夹持与偏离公式
//
// 用法：node Taierzhuang1938/Script_TrenchPlanTest.mjs

import assert from "node:assert/strict";
import {
  CompileTrenchNetwork, PlanTrenchDressing, TRENCH_PRESETS, TrenchPreset,
  TrenchRevision, SetTrenchPresetOverride, ClearTrenchPresetOverrides,
  SetTrenchSegmentOverride, ClearTrenchSegmentOverrides,
} from "./Script_TrenchPlan.mjs";
import { MISSION_TRENCH_NETWORK } from "./Data_FirstLevelMissionTrenches.mjs";
import { MISSION_TERRAIN, TrenchPlanFor, SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";

// Sections 1-8 test the PLANNER (legacy equivalence, junction detection, berm sides, jitter bands,
// dressing, corners, overrides) on a frozen fixture: the seven-segment network the contract was written
// against (Data_FirstLevelMissionTrenches at ea89f101d, 2026-09-19). The level data keeps changing
// (2026-09-22 front rebuild, 2026-09-23 01-06 space rebuild); the planner contract does not. The live
// network is checked in sections 9-10.
const PLANNER_FIXTURE = Object.freeze({
  version: MISSION_TRENCH_NETWORK.version, seed: MISSION_TRENCH_NETWORK.seed,
  segments: Object.freeze([
  { id: "FrontCommunication", preset: "communication", role: null, routeBound: true, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: -62, z: 64 }, { x: -45, z: 41 }, { x: -45, z: 24 }, { x: -37, z: 24 }, { x: -37, z: 6 }, { x: -45, z: 6 }, { x: -45, z: -20 }, { x: -32, z: -20 }, { x: -32, z: -23 }, { x: -24, z: -23 }, { x: -24, z: -60 }, { x: -8, z: -78 }, { x: -8, z: -112 }, { x: 6, z: -124 }] },
  { id: "FrontTraverse", preset: "fire", role: null, bermSide: "minus", routeBound: false, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: -32, z: -124 }, { x: 0, z: -124 }, { x: 24, z: -124 }] },
  { id: "BundleApproach", preset: "communication", role: null, routeBound: true, depth: 2, floorW: 3.6, bankW: 1.3, bermH: 0.2, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: 6, z: -124 }, { x: 15, z: -111 }, { x: 25, z: -110 }, { x: 30, z: -117 }, { x: 49, z: -117 }, { x: 49, z: -135 }, { x: 55, z: -135 }, { x: 55, z: -152 }, { x: 49, z: -152 }, { x: 49, z: -170 }, { x: 55, z: -170 }, { x: 55, z: -184 }, { x: 45, z: -184 }, { x: 45, z: -203 }, { x: 40, z: -203 }, { x: 40, z: -213 }] },
  { id: "WestEvacuation", preset: "evacuation", role: null, routeBound: true, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: 54, z: 114 }, { x: 39, z: 116 }, { x: 32, z: 134 }, { x: 50, z: 150 }, { x: 56, z: 165 }, { x: 56, z: 184 }, { x: 56, z: 207 }] },
  { id: "EntryCoverLoop", preset: "loop", role: "localLoop", routeBound: false, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: -45, z: 41 }, { x: -52, z: 35 }, { x: -52, z: 27 }, { x: -45, z: 24 }] },
  { id: "NorthCoverLoop", preset: "loop", role: "localLoop", routeBound: false, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: -24, z: -44 }, { x: -31, z: -48 }, { x: -31, z: -56 }, { x: -24, z: -60 }] },
  { id: "FlankBreachSap", preset: "sap", role: "enemyEntry", routeBound: false, source: "planner fixture (Data_FirstLevelMissionTrenches @ ea89f101d)",
    points: [{ x: -22, z: 8 }, { x: -28, z: 8 }, { x: -37, z: 8 }] },
  ]),
});

// --- 旧公式 oracle（Data_FirstLevelMissionTerrain 原样抄，不许"整理"）-------
const Smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
function MissionPathDistance(point, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t));
  }
  return best;
}
// 旧 MISSION_TERRAIN.trenches 的宽度（契约 §3.1），深度全部 2。
const LEGACY_WIDTHS = {
  FrontCommunication: [4.2, 1.5], FrontTraverse: [4.2, 1.5], BundleApproach: [3.6, 1.3],
  WestEvacuation: [5.2, 2.2], EntryCoverLoop: [3.6, 1.5], NorthCoverLoop: [3.6, 1.5],
  FlankBreachSap: [3.2, 1.5],
};
const NaturalAt = (x, z) => 0.12 * Math.sin(x / 22) * Math.cos(z / 28)
  + 0.07 * Math.sin((x + z) / 12);
const LEGACY_TRENCHES = PLANNER_FIXTURE.segments.map((seg) => ({
  id: seg.id, points: seg.points, depth: 2,
  bottom: LEGACY_WIDTHS[seg.id][0], bank: LEGACY_WIDTHS[seg.id][1],
}));
function OldSampleTrenches(x, z) {
  const natural = NaturalAt(x, z);
  let height = natural;
  for (const trench of LEGACY_TRENCHES) {
    const d = MissionPathDistance({ x, z }, trench.points);
    height = Math.min(height,
      natural - trench.depth * (1 - Smooth((d - trench.bottom / 2) / trench.bank)));
  }
  return height;
}

const LEGACY_SPEC = {
  ...PLANNER_FIXTURE,
  segments: PLANNER_FIXTURE.segments.map((seg) => ({
    ...seg, depth: 2,
    floorW: LEGACY_WIDTHS[seg.id][0], bankW: LEGACY_WIDTHS[seg.id][1],
  })),
};

// 确定性伪随机（测试自用；实现里也不许 Math.random）
function Rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plan = CompileTrenchNetwork(PLANNER_FIXTURE, { natural: NaturalAt });

// --- 1. legacy 逐点等价 -----------------------------------------------------
{
  const legacy = CompileTrenchNetwork(LEGACY_SPEC, { natural: NaturalAt, legacy: true });
  const alt = CompileTrenchNetwork({
    ...LEGACY_SPEC,
    segments: LEGACY_SPEC.segments.map((s) => ({ ...s, jitterScale: 0, cornerRadiusM: 0, bermH: 0 })),
  }, { natural: NaturalAt, jitterScale: 0 });
  const rnd = Rng(0x7E11C4);
  let worst = 0, worstAt = null;
  // 覆盖全部 7 条沟的包围盒：一半点撒在走廊上（沟底/坡/沟沿），一半撒在段的
  // 包围盒里（沟外与两段之间的空地也得对得上 —— 并集的 min 写反了就在这里红）
  const boxes = LEGACY_TRENCHES.map((t) => {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of t.points) {
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    }
    const pad = t.bottom / 2 + t.bank + 4;
    return { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad };
  });
  for (let i = 0; i < 5000; i += 1) {
    const t = LEGACY_TRENCHES[i % LEGACY_TRENCHES.length];
    let x, z;
    if (i % 2 === 0) {
      const k = 1 + Math.floor(rnd() * (t.points.length - 1));
      const a = t.points[k - 1], b = t.points[k], u = rnd();
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const off = (rnd() * 2 - 1) * (t.bottom / 2 + t.bank + 3);
      x = a.x + dx * u + (dz / len) * off;
      z = a.z + dz * u - (dx / len) * off;
    } else {
      const box = boxes[i % boxes.length];
      x = box.minX + rnd() * (box.maxX - box.minX);
      z = box.minZ + rnd() * (box.maxZ - box.minZ);
    }
    const natural = NaturalAt(x, z);
    const expected = OldSampleTrenches(x, z);
    for (const compiled of [legacy, alt]) {
      const got = compiled.Apply(x, z, natural, natural);
      const delta = Math.abs(got - expected);
      if (delta > worst) { worst = delta; worstAt = [x, z]; }
    }
  }
  assert.ok(worst <= 1e-6,
    `legacy 必须与旧公式逐点相等（最差 ${worst.toExponential(2)} @ ${worstAt}）`);
  // 兼容视图：旧测试还按 id/role/points/depth/bottom/bank 读
  for (const t of legacy.trenches) {
    const src = LEGACY_TRENCHES.find((o) => o.id === t.id);
    assert.equal(t.bottom, src.bottom, `${t.id} 兼容视图的 bottom 是标称沟底宽`);
    assert.equal(t.bank, src.bank);
    assert.equal(t.depth, 2);
    assert.equal(t.points.length, src.points.length, `${t.id} 兼容视图保留原控制点`);
  }
  assert.deepEqual(legacy.trenches.filter((t) => t.role).map((t) => t.role),
    ["localLoop", "localLoop", "enemyEntry"], "role 只留在旧数据有的那三条上");
  console.log(`ok legacy 逐点等价（5000 点 ×2 编译，最差 ${worst.toExponential(2)} m）`);
}

// --- 2. 热路径计时：10 万次 Apply < 200 ms ----------------------------------
{
  const rnd = Rng(0xA17C0D);
  const N = 100000;
  const xs = new Float64Array(N), zs = new Float64Array(N);
  // 取样点撒在沟的走廊上 —— 全撒在空地上等于测「空格子有多快」，不算数
  const all = plan.segments;
  for (let i = 0; i < N; i += 1) {
    const seg = all[i % all.length];
    const st = seg.stations[Math.floor(rnd() * seg.stations.length)];
    xs[i] = st.x + (rnd() * 2 - 1) * 9;
    zs[i] = st.z + (rnd() * 2 - 1) * 9;
  }
  let sink = 0;
  for (let i = 0; i < 20000; i += 1) sink += plan.Apply(xs[i], zs[i], 0, 0);   // 预热
  // 本机常年十几个会话在跑，单次计时能被邻居抢到 5 倍开外（同一份代码实测
  // 29 / 46 / 156 ms）。取三轮里最快的一轮 —— 被抢走的时间不是这段代码的成本。
  const Fastest = (call) => {
    let best = Infinity;
    for (let round = 0; round < 3; round += 1) {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i += 1) sink += call(xs[i], zs[i]);
      best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return best;
  };
  const ms = Fastest((x, z) => plan.Apply(x, z, 0, 0));
  const depthMs = Fastest((x, z) => plan.Depth(x, z));
  assert.ok(Number.isFinite(sink));
  assert.ok(ms < 200, `10 万次 Apply 要在 200 ms 内（实测 ${ms.toFixed(1)} ms）`);
  assert.ok(depthMs < 200, `10 万次 Depth 同样是爆炸帧成本（实测 ${depthMs.toFixed(1)} ms）`);
  console.log(`ok 热路径（Apply 10 万次 ${ms.toFixed(1)} ms，Depth ${depthMs.toFixed(1)} ms）`);
}

// --- 3. junction 自动识别 ---------------------------------------------------
{
  const three = plan.junctions.find((j) => Math.hypot(j.x - 6, j.z + 124) < 1.5);
  assert.ok(three, "三岔口 (6,-124) 必须被认出来");
  assert.equal(three.members.length, 3, `三岔口要有 3 个成员（得到 ${JSON.stringify(three.members.map((m) => m.id))}）`);
  assert.deepEqual(three.members.map((m) => m.id).sort(),
    ["BundleApproach", "FrontCommunication", "FrontTraverse"]);
  for (const id of ["EntryCoverLoop", "NorthCoverLoop"]) {
    const seg = plan.segments.find((s) => s.id === id);
    assert.equal(seg.junctions.length, 2, `${id} 两端都接主沟`);
    assert.ok(seg.junctions.every((j) => j.kind === "T" && j.otherId === "FrontCommunication"),
      `${id} 的两端都是落在 FrontCommunication 中段的 T 口`);
  }
  const sap = plan.segments.find((s) => s.id === "FlankBreachSap");
  assert.equal(sap.junctions.length, 1, "Sap 只有一头接主沟，另一头是尽端");
  assert.equal(sap.junctions[0].kind, "T");
  assert.ok(Math.hypot(sap.junctions[0].x + 37, sap.junctions[0].z - 8) < 0.01,
    "Sap 的 T 口在 (-37,8)");
  const freeEnd = sap.junctions.some((j) => Math.hypot(j.x + 22, j.z - 8) < 1.5);
  assert.ok(!freeEnd, "(-22,8) 是缺口尽端，不许被认成接口");
  // junctionClear 与旧规则 other.bottom/2+2 语义等价：三岔口 3 m 内一律让开
  let checked = 0;
  for (const seg of plan.segments) {
    for (const st of seg.stations) {
      if (Math.hypot(st.x - 6, st.z + 124) > 3) continue;
      checked += 1;
      assert.ok(st.junctionClear,
        `${seg.id} 在三岔口 3 m 内的站点必须 junctionClear（s=${st.s.toFixed(1)}）`);
    }
  }
  assert.ok(checked >= 12, `三岔口附近要有足够的站点被查到（只查到 ${checked}）`);
  // 远离任何接口的站点不许被误判
  const far = plan.segments.find((s) => s.id === "WestEvacuation");
  assert.ok(far.stations.every((st) => !st.junctionClear),
    "WestEvacuation 不接任何别的沟，全程不许 junctionClear");
  console.log(`ok junction（三岔口 3 成员、回环各 2 个 T、Sap 1 T + 1 尽端；三岔口 3 m 内 ${checked} 站全让开）`);
}

// --- 4. 并集 / 抛土规则 -----------------------------------------------------
{
  // (a) 抛土堆从不出现在任何段的开挖坡内
  const rnd = Rng(0xBE12);
  let inCutSamples = 0, bermSamples = 0;
  for (let i = 0; i < 20000; i += 1) {
    const seg = plan.segments[i % plan.segments.length];
    const st = seg.stations[Math.floor(rnd() * seg.stations.length)];
    const off = (rnd() * 2 - 1) * 8;
    const x = st.x + st.nx * off, z = st.z + st.nz * off;
    const natural = NaturalAt(x, z);
    const got = plan.Apply(x, z, natural, natural);
    const corridor = plan.Corridor(x, z);
    if (corridor && corridor.inCut) {
      inCutSamples += 1;
      assert.ok(got <= natural + 1e-9,
        `开挖坡内不许抬高（${seg.id} d=${corridor.d.toFixed(2)} got=${got.toFixed(3)} natural=${natural.toFixed(3)}）`);
    }
    if (got > natural + 1e-9) {
      bermSamples += 1;
      assert.ok(!corridor || !corridor.inCut, "抬高的点必须在所有段的开挖坡之外");
    }
  }
  assert.ok(inCutSamples > 2000 && bermSamples > 200,
    `取样要同时覆盖坡内与抛土带（inCut ${inCutSamples} / berm ${bermSamples}）`);

  // (b) 同一点被两段覆盖时取更深的
  const cross = CompileTrenchNetwork({
    version: 1, seed: "t:cross",
    segments: [
      { id: "Shallow", preset: "communication", points: [{ x: -30, z: 0 }, { x: 30, z: 0 }], depth: 1.4, bermH: 0 },
      { id: "Deep", preset: "communication", points: [{ x: 0, z: -30 }, { x: 0, z: 30 }], depth: 2.6, bermH: 0 },
    ],
  }, { jitterScale: 0 });
  assert.equal(cross.junctions.length, 1, "两段中段真交叉认成一个接口");
  assert.equal(cross.junctions[0].members.length, 2);
  assert.equal(cross.segments[0].junctions[0].kind, "cross", "中段相交是 cross 不是 T");
  assert.ok(Math.abs(cross.Apply(0, 0, 0, 0) - (-2.6)) < 1e-9,
    `交点取更深的那一段（得到 ${cross.Apply(0, 0, 0, 0)}）`);
  assert.ok(Math.abs(cross.Apply(20, 0, 0, 0) - (-1.4)) < 1e-9, "只被浅段覆盖处仍是浅的");
  assert.ok(Math.abs(cross.Depth(0, 0) - 2.6) < 1e-9, "Depth 也是并集里最深的那个");
  assert.equal(cross.Depth(25, 25), 0, "沟外 Depth 为 0");

  // (c) berm 只在指定侧：FrontTraverse bermSide "minus" → 北侧（z<-124）有堆
  let northMax = 0, southMax = 0;
  for (let x = -28; x <= -12; x += 0.5) {
    for (let off = 2; off <= 7; off += 0.1) {
      const northZ = -124 - off, southZ = -124 + off;
      northMax = Math.max(northMax, plan.Apply(x, northZ, NaturalAt(x, northZ), NaturalAt(x, northZ)) - NaturalAt(x, northZ));
      southMax = Math.max(southMax, plan.Apply(x, southZ, NaturalAt(x, southZ), NaturalAt(x, southZ)) - NaturalAt(x, southZ));
    }
  }
  assert.ok(northMax > 0.15, `射击壕的抛土要堆在北侧＝敌方（northMax ${northMax.toFixed(3)}）`);
  assert.ok(southMax <= 1e-9, `自己这侧一粒土都不许有（southMax ${southMax.toFixed(3)}）`);
  console.log(`ok 并集与抛土（坡内 ${inCutSamples} 点不抬高、抛土 ${bermSamples} 点全在坡外、单侧堆 ${northMax.toFixed(2)} m vs ${southMax.toFixed(3)} m）`);
}

// --- 5. 宽度 / 深度随机有界，沟底不许出台阶 ---------------------------------
{
  const flat = CompileTrenchNetwork(PLANNER_FIXTURE, { natural: () => 0 });
  for (const seg of flat.segments) {
    const p = seg.params;
    // 宽度 = 9 m 一档的比例噪声 ± 3 m 一档的毛边（米）
    const loHalf = (seg.nominal.floorW / 2) * (1 - p.floorJitter) - (p.edgeJitterM ?? 0);
    const hiHalf = (seg.nominal.floorW / 2) * (1 + p.floorJitter) + (p.edgeJitterM ?? 0);
    const loBank = seg.nominal.bankW * (1 - p.bankJitter);
    const hiBank = seg.nominal.bankW * (1 + p.bankJitter);
    let prev = null, worstStep = 0;
    for (let s = 0; s <= seg.path.length; s += 0.5) {
      const at = seg.path.At(Math.min(s, seg.path.length));
      const half = seg.HalfFloorAt(at.x, at.z);
      const bank = seg.BankAt(at.x, at.z);
      const depth = seg.DepthAt(at.x, at.z);
      assert.ok(half >= loHalf - 1e-9 && half <= hiHalf + 1e-9,
        `${seg.id} 半沟底宽越界 ${half.toFixed(3)} ∉ [${loHalf.toFixed(3)},${hiHalf.toFixed(3)}]`);
      assert.ok(bank >= loBank - 1e-9 && bank <= hiBank + 1e-9,
        `${seg.id} 坡宽越界 ${bank.toFixed(3)}`);
      assert.ok(depth >= 1.83 && depth <= 2.2,
        `${seg.id} 深度越界 ${depth.toFixed(3)}（全身掩蔽下限 1.83）`);
      const floorY = flat.Apply(at.x, at.z, 0, 0);
      if (prev !== null) worstStep = Math.max(worstStep, Math.abs(floorY - prev));
      prev = floorY;
    }
    assert.ok(worstStep <= 0.08,
      `${seg.id} 沟底沿弧长不许出台阶（每 0.5 m 最大高差 ${worstStep.toFixed(3)} m）`);
  }
  // jitterScale=0 时退化为常量
  const flatNoJitter = CompileTrenchNetwork(PLANNER_FIXTURE, { jitterScale: 0 });
  const seg0 = flatNoJitter.segments[0];
  assert.equal(seg0.HalfFloorAt(10, 10), seg0.nominal.floorW / 2, "jitterScale=0 宽度是常量");
  assert.equal(seg0.DepthAt(10, 10), seg0.nominal.depth, "jitterScale=0 深度是常量");
  console.log("ok 宽/深随机有界，沟底沿弧长无台阶（每 0.5 m ≤ 0.08 m）");
}

// --- 6. 布设 ---------------------------------------------------------------
const GroundAt = (x, z) => NaturalAt(x, z) - plan.Depth(x, z);
{
  // Keep the explicit timber option covered; reference 07's default is bare earth.
  const dressing = PlanTrenchDressing(plan, { groundAt: GroundAt, timber: true });
  const again = PlanTrenchDressing(plan, { groundAt: GroundAt, timber: true });
  assert.deepEqual(again, dressing, "同种子两次布设必须逐位相同");
  const earth = PlanTrenchDressing(plan, { groundAt: GroundAt });
  assert.equal(earth.stats.revetments, 0, "reference 07 has no repeating wooden revetments");
  assert.equal(earth.stats.duckboards, 0, "reference 07 has a bare compacted-earth floor");
  assert.deepEqual(earth.blocks, dressing.blocks.filter(b => !/Revetment|Duckboard/.test(b.id)),
    "changing the finish preserves every firing bay");
  assert.deepEqual(earth.placements, dressing.placements, "changing the finish preserves supplies");

  // id 规则与统计
  const posts = dressing.blocks.filter((b) => /Revetment-?\d+_-?1Post$/.test(b.id));
  const slats = dressing.blocks.filter((b) => /Revetment-?\d+_-?1Slat\d+$/.test(b.id));
  const boards = dressing.blocks.filter((b) => /Duckboard\d+$/.test(b.id));
  const bays = dressing.blocks.filter((b) => /TrenchBay\d+$/.test(b.id));
  assert.equal(posts.length, dressing.stats.revetments, "stats.revetments 要对上实际护壁组数");
  assert.equal(boards.length, dressing.stats.duckboards, "stats.duckboards 要对上");
  assert.equal(bays.length, dressing.stats.bays, "stats.bays 要对上");
  assert.equal(dressing.placements.length, dressing.stats.props, "stats.props 要对上");
  assert.ok(slats.length >= posts.length * 2, "每根桩至少两条横板");
  assert.equal(new Set(dressing.blocks.map((b) => b.id)).size, dressing.blocks.length, "体块 id 不许重复");
  assert.equal(new Set(dressing.placements.map((p) => p.id)).size, dressing.placements.length);
  for (const b of [...posts, ...slats]) {
    assert.ok(b.id.includes("Revetment"), "护壁 id 必须含 Revetment（Layout 的老清理网还认它）");
    assert.equal(b.solid, false, "护壁没有独立碰撞");
    assert.equal(b.semantic, "timber");
  }
  for (const b of bays) {
    assert.equal(b.solid, true);
    assert.equal(b.semantic, "cover");
    assert.equal(b.h, 0.55);
    assert.equal(b.d, 0.9);
    assert.ok(b.w >= 3.5 - 1e-9 && b.w <= 5 + 1e-9, `射击位长 3.5–5 m（得到 ${b.w}）`);
    assert.ok(b.cover && Math.abs(Math.hypot(b.cover.faceX, b.cover.faceZ) - 1) < 1e-6,
      "射击位朝向要是单位向量（面朝沟外）");
  }
  const ALLOWED = new Set(["battlefieldSupplyBox", "battlefieldCanvasCover01", "battlefieldCompartmentCrate"]);
  for (const p of dressing.placements) {
    assert.ok(ALLOWED.has(p.asset), `只许发已登记的资产名（得到 ${p.asset}）`);
    assert.equal(p.scale, 1);
    assert.equal(p.solid, false);
  }

  // y 由 groundAt 得来
  for (const b of posts) {
    const expected = GroundAt(b.x, b.z) - 0.05 + b.h / 2;
    assert.ok(Math.abs(b.y - expected) < 1e-9, `护壁桩的 y 必须由 groundAt 算（${b.id}）`);
  }
  for (const b of boards) {
    assert.ok(Math.abs(b.y - (GroundAt(b.x, b.z) + b.h / 2)) < 1e-9, `踏板的 y 必须由 groundAt 算（${b.id}）`);
  }

  // 护壁不落在 junctionClear 站、不落在离段端 3 m 内（k 就是站点序号）
  for (const b of posts) {
    const segId = b.id.slice(0, b.id.indexOf("Revetment"));
    const seg = plan.segments.find((s) => s.id === segId);
    assert.ok(seg, `护壁 id 要能反查到段（${b.id}）`);
    const k = Number(b.id.match(/Revetment(\d+)_/)[1]);
    const st = seg.stations[k];
    assert.ok(st, `${b.id} 的站点序号越界`);
    assert.equal(st.junctionClear, false, `${b.id} 不许落在三岔口让位区`);
    assert.ok(st.s >= 3 - 1e-9 && st.s <= seg.path.length - 3 + 1e-9,
      `${b.id} 离段端要有 3 m（s=${st.s.toFixed(2)} / ${seg.path.length.toFixed(2)}）`);
    // 桩位横向 = halfFloor + insetM，桩顶不高于沟沿
    const lateral = Math.hypot(b.x - st.x, b.z - st.z);
    assert.ok(Math.abs(lateral - (st.halfFloor + seg.params.revetment.insetM)) < 1e-6,
      `${b.id} 桩位横向要贴在沟壁上（${lateral.toFixed(3)}）`);
    assert.ok(b.h <= st.depth + 1e-9, `${b.id} 桩顶不许高过沟沿`);
  }

  // 射击位：数量上限、离三岔口 ≥ 6 m
  for (const seg of plan.segments) {
    const mine = bays.filter((b) => b.id.startsWith(`${seg.id}TrenchBay`));
    assert.ok(mine.length <= seg.params.bays.maxCount,
      `${seg.id} 射击位不许超过 maxCount（${mine.length} > ${seg.params.bays.maxCount}）`);
  }
  for (const b of bays) {
    for (const j of plan.junctions) {
      assert.ok(Math.hypot(b.x - j.x, b.z - j.z) >= 6,
        `射击位要离三岔口 6 m 以上（${b.id} 离 (${j.x.toFixed(1)},${j.z.toFixed(1)}) 只有 ${Math.hypot(b.x - j.x, b.z - j.z).toFixed(2)}）`);
    }
  }
  assert.ok(bays.length <= 16, `全网射击位总数要压在 16 以内（Fortifications 的 meshCount<70 上限；得到 ${bays.length}）`);

  // 被 avoidRoutes 穿过的件跳过：造一条横穿 FrontTraverse 的假路线
  const fake = [[{ x: -20, z: -140 }, { x: -20, z: -108 }]];
  const cut = PlanTrenchDressing(plan, { groundAt: GroundAt, avoidRoutes: fake, timber: true });
  assert.ok(cut.stats.skipped.route > 0, "横穿的路线必须让布设让开");
  const ids = new Set(cut.blocks.map((b) => b.id));
  assert.ok([...ids].every((id) => dressing.blocks.some((b) => b.id === id)),
    "加路线只许减件，不许换一套随机");
  for (const b of cut.blocks.filter((x) => x.id.startsWith("FrontTraverseRevetment"))) {
    assert.ok(Math.abs(b.x + 20) > 2,
      `路线净空里不许留护壁（${b.id} x=${b.x.toFixed(2)}）`);
  }
  assert.ok(dressing.blocks.some((b) => b.id.startsWith("FrontTraverseRevetment") && Math.abs(b.x + 20) <= 2),
    "对照组在同一位置本来是有件的（否则上一条断言是空转）");

  // keepOut：手摆体块占地外扩 0.5 m
  const box = { x: -20, z: -124, w: 10, d: 10, ry: 0 };
  const kept = PlanTrenchDressing(plan, { groundAt: GroundAt, keepOut: [box], timber: true });
  assert.ok(kept.stats.skipped.keepOut > 0, "手摆体块占地必须让布设让开");
  for (const b of kept.blocks.filter((x) => x.id.startsWith("FrontTraverse"))) {
    assert.ok(Math.abs(b.x - box.x) > box.w / 2 || Math.abs(b.z - box.z) > box.d / 2,
      `手摆件占地里不许留布设（${b.id}）`);
  }

  // laneCuts 只对 BundleApproach
  const lane = PlanTrenchDressing(plan, {
    groundAt: GroundAt,
    timber: true,
    laneCuts: (x, z) => z < -150 && z > -190,
  });
  assert.ok(lane.stats.skipped.lane > 0, "laneCuts 要真的删掉件");
  for (const b of lane.blocks.filter((x) => x.id.startsWith("BundleApproach"))) {
    assert.ok(!(b.z < -150 && b.z > -190), `攻击通道里不许留 BundleApproach 的件（${b.id}）`);
  }
  const otherUntouched = lane.blocks.filter((b) => !b.id.startsWith("BundleApproach")).length;
  const otherBefore = dressing.blocks.filter((b) => !b.id.startsWith("BundleApproach")).length;
  assert.equal(otherUntouched, otherBefore, "laneCuts 不许波及别的段");

  console.log(`ok 布设（护壁 ${dressing.stats.revetments} 组 / 踏板 ${dressing.stats.duckboards} / 射击位 ${dressing.stats.bays} / 杂物 ${dressing.stats.props}，`
    + `跳过 route ${dressing.stats.skipped.route} keepOut ${dressing.stats.skipped.keepOut} junction ${dressing.stats.skipped.junction} lane ${dressing.stats.skipped.lane}）`);
}

// --- 7. 圆角 ---------------------------------------------------------------
{
  const sharp = CompileTrenchNetwork({
    ...PLANNER_FIXTURE,
    segments: PLANNER_FIXTURE.segments.map((s) => ({ ...s, cornerRadiusM: 0 })),
  }, { jitterScale: 0 });
  for (let i = 0; i < sharp.segments.length; i += 1) {
    const seg = sharp.segments[i];
    assert.equal(seg.corners.length, 0, `${seg.id} cornerRadiusM=0 不许有圆角`);
    assert.equal(seg.path.points.length, seg.control.length,
      `${seg.id} cornerRadiusM=0 时 path.points 与控制点一致`);
    for (let k = 0; k < seg.control.length; k += 1) {
      assert.ok(Math.abs(seg.path.points[k][0] - seg.control[k].x) < 1e-12
        && Math.abs(seg.path.points[k][1] - seg.control[k].z) < 1e-12,
        `${seg.id} 第 ${k} 个控制点不许被动`);
    }
  }
  let rounded = 0;
  for (const seg of plan.segments) {
    for (const corner of seg.corners) {
      rounded += 1;
      const k = seg.control.findIndex((p) => Math.abs(p.x - corner.x) < 1e-9 && Math.abs(p.z - corner.z) < 1e-9);
      assert.ok(k > 0 && k < seg.control.length - 1, "圆角只出现在内角上");
      const a = seg.control[k - 1], b = seg.control[k], c = seg.control[k + 1];
      const minLen = Math.min(Math.hypot(b.x - a.x, b.z - a.z), Math.hypot(c.x - b.x, c.z - b.z));
      assert.ok(corner.r <= 0.5 * minLen + 1e-9,
        `${seg.id} 圆角半径要 ≤ 0.5×较短邻边（r=${corner.r.toFixed(3)} minLen=${minLen.toFixed(3)}）`);
      const bound = corner.r * (1 / Math.cos(corner.theta / 2) - 1);
      let best = Infinity;
      const pts = seg.path.points;
      for (let e = 0; e < pts.length - 1; e += 1) {
        const dx = pts[e + 1][0] - pts[e][0], dz = pts[e + 1][1] - pts[e][1];
        const len2 = dx * dx + dz * dz || 1;
        let t = ((b.x - pts[e][0]) * dx + (b.z - pts[e][1]) * dz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        best = Math.min(best, Math.hypot(b.x - pts[e][0] - dx * t, b.z - pts[e][1] - dz * t));
      }
      assert.ok(best <= bound + 1e-9,
        `${seg.id} 圆角后中心线到控制点的偏离要 ≤ r·(1/cos(θ/2)−1)（${best.toFixed(4)} > ${bound.toFixed(4)}）`);
      assert.ok(Math.abs(corner.deviation - bound) < 1e-9, "corner.deviation 就是那条上界");
    }
  }
  assert.ok(rounded >= 30, `默认参数下要有足够多的角被圆掉（只有 ${rounded}）`);
  console.log(`ok 圆角（${rounded} 个内角，半径夹持 + 偏离公式）`);
}

// --- 8. 覆盖与 revision ----------------------------------------------------
{
  const base = TrenchRevision();
  assert.equal(TrenchPreset("communication").floorW, TRENCH_PRESETS.communication.floorW);
  const r1 = SetTrenchPresetOverride("communication", { floorW: 5.5, revetment: { spacingM: 9 } });
  assert.ok(r1 > base, "改预设要抬 revision");
  assert.equal(TrenchPreset("communication").floorW, 5.5);
  assert.equal(TrenchPreset("communication").revetment.spacingM, 9);
  assert.equal(TrenchPreset("communication").revetment.slatLenM, 3.5, "嵌套覆盖只改指定键");
  assert.equal(TRENCH_PRESETS.communication.floorW, 3.4, "覆盖不许写回基线（基线在源码里）");
  const wide = CompileTrenchNetwork(PLANNER_FIXTURE, { jitterScale: 0 });
  assert.equal(wide.segments.find((s) => s.id === "FrontCommunication").nominal.floorW, 5.5);
  assert.equal(wide.revision, r1, "plan 带着编译时的 revision，C 拿它做缓存键");
  const r2 = ClearTrenchPresetOverrides();
  assert.ok(r2 > r1);
  assert.equal(TrenchPreset("communication").floorW, 3.4);

  const r3 = SetTrenchSegmentOverride("FrontTraverse", {
    points: [{ x: -10, z: -124 }, { x: 10, z: -124 }], widthScale: 2,
  });
  const dragged = CompileTrenchNetwork(PLANNER_FIXTURE, { jitterScale: 0 });
  const ft = dragged.segments.find((s) => s.id === "FrontTraverse");
  assert.equal(ft.control.length, 2, "拖点要落到编译结果里");
  assert.ok(Math.abs(ft.path.length - 20) < 1e-9);
  assert.equal(ft.nominal.floorW, TRENCH_PRESETS.fire.floorW * 2, "widthScale 只放大沟底");
  assert.equal(ft.nominal.bankW, TRENCH_PRESETS.fire.bankW, "widthScale 不动坡宽");
  const r4 = ClearTrenchSegmentOverrides();
  assert.ok(r4 > r3);
  assert.equal(CompileTrenchNetwork(PLANNER_FIXTURE, { jitterScale: 0 })
    .segments.find((s) => s.id === "FrontTraverse").control.length, 3, "清掉覆盖要回到基线");
  console.log("ok 预设/段级覆盖与 revision");
}

// --- 9. 数据来源标注 -------------------------------------------------------
{
  for (const seg of MISSION_TRENCH_NETWORK.segments) {
    assert.ok(typeof seg.source === "string" && seg.source.length > 10,
      `${seg.id} 必须写清 points 的来源`);
    assert.ok(seg.points.length >= 2);
  }
  const bound = MISSION_TRENCH_NETWORK.segments.filter((s) => s.routeBound).map((s) => s.id);
  // 2026-09-23 01–06 空间重排：01 前沿交通壕、连接支沟、03 支沟与右侧低沟、左枪通道、缺口支沟、
  // 取弹沟、攻击支路的点都直接取自任务/AI 路线表（改点先改路线表）。
  assert.deepEqual(bound, ["FrontCommunication", "CollectionLink", "BunkerTrench", "BunkerFrontSap", "SupportSap", "RightApproach",
    "LeftGunAccess", "GuardWithdrawal", "BundleApproach", "RoadAttack", "WestEvacuation"],
    "routeBound 只属于点来自任务/AI 路线的那几条");
  for (const seg of MISSION_TRENCH_NETWORK.segments) {
    if (seg.routeBound) assert.ok(/Data_FirstLevel\w+\./.test(seg.source),
      `${seg.id} routeBound 的 source 要指到具体文件字段`);
  }
  console.log("ok 数据来源标注与 routeBound");
}

// --- 10. 现行网络：01–06 前沿的连接与沟宽 ---------------------------------
{
  const live = CompileTrenchNetwork(MISSION_TRENCH_NETWORK, { jitterScale: 0 });
  assert.equal(new Set(live.segments.map((s) => s.id)).size, live.segments.length, "段 id 不重复");
  // 人要走的沟（routeBound）标称沟底不窄于 3.4（SquadMarchAi.CanPause 钉的下限，见 TRENCH_PRESETS 注释）。
  for (const seg of live.segments.filter((s) => MISSION_TRENCH_NETWORK.segments.find((g) => g.id === s.id).routeBound))
    assert.ok(seg.nominal.floorW >= 3.4 - 1e-9, `${seg.id} 标称沟底 ${seg.nominal.floorW} m，窄于 3.4`);
  // 01–06 的关键接口必须被规划层认成接口（抛土、护壁、布设都让开它们）。
  const JunctionAt = (x, z, ids) => live.junctions.find((j) => Math.hypot(j.x - x, j.z - z) < 1.5
    && ids.every((id) => j.members.some((m) => m.id === id)));
  for (const [label, x, z, ids] of [
    ["支沟交汇 SJ", -29, -110, ["BunkerTrench", "SupportSap"]],
    ["缺口交汇 GJ", -8, -140.6, ["SupportSap", "RightApproach", "GuardWithdrawal"]],
    ["后墙岔口 RJ", 29.7, -141.5, ["BunkerFrontSap", "BundleApproach", "RoadAttack"]],
    ["岔口 J", 14, -124.6, ["BunkerTrench", "BunkerFrontSap", "BunkerDepthSap"]],
  ]) assert.ok(JunctionAt(x, z, ids), `${label} (${x},${z}) 要被认成 ${ids.join("/")} 的接口`);
  // 取弹沟与守军背坡浅沟互不相接（契约 §4「取弹沟不连通守军背坡」在规划层的那一半）。
  const Touches = (a, b) => live.junctions.some((j) => j.members.some((m) => m.id === a) && j.members.some((m) => m.id === b));
  assert.ok(!Touches("BundleApproach", "GuardBackslope") && !Touches("BundleApproach", "GuardWithdrawal"),
    "取弹沟不接背坡与缺口支沟");
  console.log(`ok 现行网络 ${live.segments.length} 段：人走的沟宽 ≥3.4，SJ/GJ/RJ/J 四个接口认得出，取弹沟不接背坡`);
}

// --- 11. 现行网络：宽/深/坡有界、圆角、沟底台阶只许出现在声明过的深浅相接处 --------
// 第 1–8 节在冻结夹具上验规划层；这里把同样的几何规矩跑在现行网络上（2026-09-23 评审：
// 夹具化之后现行网络的沟底台阶、宽深上下界、圆角都没人查了）。
{
  const flat = CompileTrenchNetwork(MISSION_TRENCH_NETWORK, { natural: () => 0 });
  const nominalDepth = new Map(flat.segments.map((s) => [s.id, s.nominal.depth]));
  // 深浅不同的段相接：并集取 min，浅段走进深段那一下是台阶——只在这些接口 4.5 m 内豁免，
  // 而且真实地面（MISSION_TERRAIN.steps 做了过渡）上必须爬得上去（下面 11b）。
  const depthJunctions = flat.junctions.filter((j) => {
    const ds = j.members.map((m) => nominalDepth.get(m.id));
    return Math.max(...ds) - Math.min(...ds) > 0.1;
  });
  const EXEMPT_M = 4.5, exempt = [];
  let corners = 0;
  for (const seg of flat.segments) {
    const p = seg.params;
    const loHalf = (seg.nominal.floorW / 2) * (1 - p.floorJitter) - (p.edgeJitterM ?? 0);
    const hiHalf = (seg.nominal.floorW / 2) * (1 + p.floorJitter) + (p.edgeJitterM ?? 0);
    const loBank = seg.nominal.bankW * (1 - p.bankJitter), hiBank = seg.nominal.bankW * (1 + p.bankJitter);
    const loDepth = seg.nominal.depth * (1 - p.depthJitter) - p.floorRutM - 1e-9, hiDepth = seg.nominal.depth * (1 + p.depthJitter) + p.floorRutM + 1e-9;
    let prev = null, worst = 0, worstAt = null;
    for (let s = 0; s <= seg.path.length; s += 0.5) {
      const at = seg.path.At(Math.min(s, seg.path.length));
      const half = seg.HalfFloorAt(at.x, at.z), bank = seg.BankAt(at.x, at.z), depth = seg.DepthAt(at.x, at.z);
      assert.ok(half >= loHalf - 1e-9 && half <= hiHalf + 1e-9, `${seg.id} 半沟底宽越界 ${half.toFixed(3)}`);
      assert.ok(bank >= loBank - 1e-9 && bank <= hiBank + 1e-9, `${seg.id} 坡宽越界 ${bank.toFixed(3)}`);
      assert.ok(depth >= loDepth && depth <= hiDepth, `${seg.id} 深度越界 ${depth.toFixed(3)} ∉ 标称 ${seg.nominal.depth}×(1±${p.depthJitter})±车辙 ${p.floorRutM}`);
      const y = flat.Apply(at.x, at.z, 0, 0);
      const near = depthJunctions.find((j) => Math.hypot(j.x - at.x, j.z - at.z) < EXEMPT_M);
      if (prev !== null && !near && !prev.near) { const d = Math.abs(y - prev.y); if (d > worst) { worst = d; worstAt = [at.x.toFixed(1), at.z.toFixed(1)]; } }
      if (near && !exempt.includes(near)) exempt.push(near);
      prev = { y, near };
    }
    assert.ok(worst <= 0.08, `${seg.id} 沟底沿弧长出台阶 ${worst.toFixed(3)} m @ ${worstAt}（只有声明的深浅接口可以）`);
    for (const corner of seg.corners) {
      corners += 1;
      const k = seg.control.findIndex((q) => Math.abs(q.x - corner.x) < 1e-9 && Math.abs(q.z - corner.z) < 1e-9);
      assert.ok(k > 0 && k < seg.control.length - 1, `${seg.id} 圆角只出现在内角上`);
      const a = seg.control[k - 1], b = seg.control[k], c = seg.control[k + 1];
      assert.ok(corner.r <= 0.5 * Math.min(Math.hypot(b.x - a.x, b.z - a.z), Math.hypot(c.x - b.x, c.z - b.z)) + 1e-9, `${seg.id} 圆角半径夹持`);
      assert.ok(Math.abs(corner.deviation - corner.r * (1 / Math.cos(corner.theta / 2) - 1)) < 1e-9, `${seg.id} 圆角偏离公式`);
    }
  }
  assert.ok(corners >= 30, `现行网络要有足够多的角被圆掉（${corners}）`);
  // 11b. 豁免的接口在真实地面上（含 MISSION_TERRAIN.steps 的过渡）必须爬得上去：沿每条相接段、
  // 接口 ±EXEMPT_M 内每 0.2 m 的高差 ≤ tan52°×0.2 + 0.035（Rapier 爬坡上限 + 与路线净空同一余量）。
  // 唯一例外是声明过的射台：从深沟翻上去（一次 ≤ TRAVERSAL.vaultMax 的翻越），不是走上去。
  const FIRE_STEP_SEGMENTS = { ObservationSpur: "03 observation step: vault up from the support sap floor" };
  const liveTerrain = TrenchPlanFor(MISSION_TERRAIN);
  const TAN52 = Math.tan(52 * Math.PI / 180), bad = [];
  for (const j of exempt) for (const m of j.members) {
    const seg = liveTerrain.segments.find((s) => s.id === m.id);
    const s0 = seg.path.ClosestS(j.x, j.z);
    let prev = null, run = 0;
    for (let s = Math.max(0, s0 - EXEMPT_M); s <= Math.min(seg.path.length, s0 + EXEMPT_M); s += 0.2) {
      const at = seg.path.At(s), y = SampleMissionTerrain(at.x, at.z);
      const steep = prev !== null && Math.abs(y - prev) > TAN52 * 0.2 + 0.035;
      run = steep ? run + Math.abs(y - prev) : 0;
      if (steep && (!FIRE_STEP_SEGMENTS[m.id] || run > TRAVERSAL.vaultMax))
        bad.push(`${m.id}@${at.x.toFixed(1)},${at.z.toFixed(1)} Δ${(y - prev).toFixed(2)} run ${run.toFixed(2)}`);
      prev = y;
    }
  }
  assert.deepEqual(bad, [], "深浅相接处在真实地面上可攀爬");
  console.log(`ok 现行网络 ${flat.segments.length} 段：宽/深/坡有界、${corners} 个圆角、沟底无台阶（豁免 ${exempt.length} 个深浅接口，真实地面均可攀爬）`);
}

// --- 12. frameLengthM：改尾巴不许把前面的布设重新洗牌 ---------------------------
// 2026-09-23 01–06 重排把 FrontCommunication 的北端改短了；段写 frameLengthM=原弧长后，
// 尾巴之前的每一站、每一块护壁/踏板/射击位/杂物都与原来逐位相同。
{
  const fc = PLANNER_FIXTURE.segments[0];
  const full = CompileTrenchNetwork(PLANNER_FIXTURE, { natural: NaturalAt });
  const L0 = full.segments[0].path.length;
  const trimmedSpec = { ...PLANNER_FIXTURE, segments: [{ ...fc, points: fc.points.slice(0, -2), frameLengthM: L0 }, ...PLANNER_FIXTURE.segments.slice(1)] };
  const trimmed = CompileTrenchNetwork(trimmedSpec, { natural: NaturalAt });
  const cut = trimmed.segments[0].path.length - 8;   // 离新尾巴 8 m 以外（圆角与段端净空之外）
  const a = full.segments[0].stations.filter((s) => s.s < cut), b = trimmed.segments[0].stations.filter((s) => s.s < cut);
  // 逐位 = 到 1e-6 m（尾巴不同，折线累计弧长的最后一位浮点会差 1e-15）。
  const Q = (v) => typeof v === "number" ? +v.toFixed(6) : v;
  assert.deepEqual(b.map((s) => [s.s, s.x, s.z].map(Q)), a.map((s) => [s.s, s.x, s.z].map(Q)), "尾巴之前的站点逐位相同");
  const Ground = (x, z) => NaturalAt(x, z);
  const Before = (plan) => PlanTrenchDressing(plan, { groundAt: Ground, timber: true }).blocks
    .filter((q) => q.id.startsWith("FrontCommunication") && plan.segments[0].path.ClosestS(q.x, q.z) < cut)
    .map((q) => JSON.stringify(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Q(v)]))));
  assert.deepEqual(Before(trimmed), Before(full), "尾巴之前的护壁、踏板、射击位逐位相同");
  const noFrame = CompileTrenchNetwork({ ...trimmedSpec, segments: [{ ...trimmedSpec.segments[0], frameLengthM: undefined }, ...trimmedSpec.segments.slice(1)] }, { natural: NaturalAt });
  assert.notDeepEqual(Before(noFrame), Before(full), "不写 frameLengthM 时改尾巴确实会洗牌（这条断言保证上面那条不是空转）");
  console.log(`ok frameLengthM：改尾巴后前 ${cut.toFixed(0)} m 的站点与布设逐位不变`);
}

console.log("TrenchPlanTest: 全部通过");
