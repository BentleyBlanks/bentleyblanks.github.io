// 样条中心线（Script_RoadPath）的纯 Node 回归。
//
// 这层数学被铁路、大车路、大街、道路编辑器四路共用 —— 它错一个符号，
// 症状是「城外某条路歪了半米」这种要实拍才能抓到的东西。所以这里把
// 契约逐条钉死：过控制点、弧长单调、切向单位、直线逐位退化、缺口先挖后分、
// 采样不留尾巴、最近点换算（铁路道口按世界 z 给缺口，全靠它换弧长）。
//
// 用法：node Taierzhuang1938/Script_RoadPathTest.mjs

import assert from "node:assert/strict";
import {
  MakeRoadPath, GapsToRuns, SampleRun, DistanceToPolyline,
} from "./Script_RoadPath.mjs";

// --- 直线（两点）：逐位退化 ---
{
  const path = MakeRoadPath([[10, -50], [10, 250]]);
  assert.ok(Math.abs(path.length - 300) < 1e-6, "直线弧长 = 欧氏距离");
  const mid = path.At(150);
  assert.ok(Math.abs(mid.x - 10) < 1e-9 && Math.abs(mid.z - 100) < 1e-9, "直线中点在线上");
  assert.ok(Math.abs(mid.tx) < 1e-9 && Math.abs(mid.tz - 1) < 1e-9, "直线切向 = 走向");
  // 铁路道口的换算：直线上 ClosestS(x, z) 就是 z - fromZ
  assert.ok(Math.abs(path.ClosestS(10, 0) - 50) < 1e-6, "ClosestS 直线换算");
  assert.ok(Math.abs(path.ClosestS(400, 0) - 50) < 1e-6, "ClosestS 只看投影不看横距");
}

// --- 过控制点 + 弧长单调 + 切向单位 ---
{
  const pts = [[-1500, -168], [-1444, -120], [-1440, 40], [-1330, 44], [-1080, 36]];
  const path = MakeRoadPath(pts);
  for (const p of pts) {
    const s = path.ClosestS(p[0], p[1]);
    const q = path.At(s);
    assert.ok(Math.hypot(q.x - p[0], q.z - p[1]) < 0.05,
      `样条必须过控制点 (${p[0]}, ${p[1]})，实际差 ${Math.hypot(q.x - p[0], q.z - p[1]).toFixed(3)}`);
  }
  let prev = path.At(0);
  for (let s = 2; s <= path.length; s += 2) {
    const cur = path.At(s);
    const unit = Math.hypot(cur.tx, cur.tz);
    assert.ok(Math.abs(unit - 1) < 1e-6, "切向必须是单位向量");
    // 相邻采样的转角必须温和（样条的意义所在：折线拐点是硬折，样条摊开）
    const dot = prev.tx * cur.tx + prev.tz * cur.tz;
    assert.ok(dot > 0.5, `2 m 内转角不许超过 60°（s=${s}，dot=${dot.toFixed(3)}）`);
    prev = cur;
  }
  // 弧长不短于折线长（曲线只会更长）
  let poly = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    poly += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  assert.ok(path.length >= poly - 1e-6, "样条弧长 ≥ 折线长");
  assert.ok(path.length < poly * 1.25, "向心 CR 不许离谱地绕远（过冲/打圈的守门）");
}

// --- 相邻重复控制点剔除 ---
{
  const path = MakeRoadPath([[0, 0], [0, 0], [100, 0]]);
  assert.equal(path.points.length, 2, "重复点要剔");
  assert.ok(Math.abs(path.length - 100) < 1e-6);
  assert.throws(() => MakeRoadPath([[5, 5]]), /两个/, "单点必须报错");
}

// --- 缺口 → 连续段：越界截断、重叠合并、余段补齐 ---
{
  assert.deepEqual(GapsToRuns(100, []), [[0, 100]]);
  assert.deepEqual(GapsToRuns(100, [[20, 30], [25, 40], [95, 130]]), [[0, 20], [40, 95]]);
  assert.deepEqual(GapsToRuns(100, [[-10, 5]]), [[5, 100]]);
  assert.deepEqual(GapsToRuns(100, [[0, 100]]), [], "整条都被挖掉就没有段");
  // 道口两侧的段边必须**贴着缺口边**（Station 的账：段心判法会留半段豁口）
  const runs = GapsToRuns(660, [[325.5, 334.5]]);
  assert.deepEqual(runs, [[0, 325.5], [334.5, 660]]);
}

// --- 等弧长采样：首尾都在、不留尾巴、步距均匀 ---
{
  const path = MakeRoadPath([[0, 0], [100, 0]]);
  const samples = SampleRun(path, 10, 90, 4);
  assert.equal(samples.length, 21, "80 m / 4 m = 20 段 21 点");
  assert.ok(Math.abs(samples[0].s - 10) < 1e-9 && Math.abs(samples[20].s - 90) < 1e-9);
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(Math.abs(samples[i].s - samples[i - 1].s - 4) < 1e-9, "步距均匀，无尾巴");
  }
  // 步长除不尽时向最近段数取整，段长微调而不是甩尾
  const odd = SampleRun(path, 0, 10, 4);
  assert.equal(odd.length, 4, "10/4 → round(2.5)=2… 实为 3 段 4 点");
}

// --- 点到折线距离（Blocked 的路走廊判据用） ---
{
  const path = MakeRoadPath([[0, 0], [100, 0], [100, 100]]);
  const dense = path.Dense(8);
  // 样条自己走过的点到密集线距离 ≈ 0（这正是 Blocked 换用 Dense 的原因）
  for (const s of [0.2, 0.5, 0.8]) {
    const p = path.At(path.length * s);
    assert.ok(DistanceToPolyline(p.x, p.z, dense) < 0.6, "样条实走点必须在走廊里");
  }
  // 90° 拐角、百米边长：弦中点离样条 ~5 m（样条向拐角内侧收）——
  // 这就是「按控制点折线判走廊会误伤」的量级，钉住它防实现漂移
  const sag = DistanceToPolyline(50, 0, dense);
  assert.ok(sag > 1 && sag < 12, `弦中点偏差应在 1—12 m（实测 ${sag.toFixed(2)}）`);
  assert.ok(DistanceToPolyline(100, 0, dense) < 0.6, "拐角控制点在走廊里");
  assert.ok(Math.abs(DistanceToPolyline(-40, 0, dense) - 40) < 2, "线外远点距离正确");
}

// --- 真实数据冒烟：L0/L1 的大车路点列都能建路 ---
{
  for (const pts of [
    [[-150, -1690], [-142, -1552], [-158, -1300], [-150, -640]],
    [[-1500, -168], [-1444, -120], [-1440, 40], [-1330, 44], [-1080, 36], [-700, 26], [-560, 16]],
  ]) {
    const path = MakeRoadPath(pts);
    const samples = SampleRun(path, 0, path.length, 4);
    for (const s of samples) {
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z)
        && Number.isFinite(s.tx) && Number.isFinite(s.tz), "采样不许出 NaN");
    }
  }
}

console.log("ok  RoadPathTest — 样条中心线契约全部通过");
