// 样条围墙规划（Script_WallPlan）的纯 Node 回归。
//
// 这层被寨墙、坝墙、石墙村、村院墙四路共用 —— 它错一个符号，症状是
// 「墙飘在坡上 / 圩门被封死 / 院墙角上漏一道缝」这种要实拍才能抓到的东西。
// 契约逐条钉死：覆盖无洞、缺口真空、破口留残根、贴地不悬空、闭环角互搭、
// 塌段压高、掩体抽稀、同种子逐位确定。
//
// 用法：node Taierzhuang1938/Script_WallPlanTest.mjs

import assert from "node:assert/strict";
import { PlanWallRoute } from "./Script_WallPlan.mjs";

const FLAT = () => 0;

// --- 直墙：覆盖无洞、模块等分、碰撞随行 ---
{
  const plan = PlanWallRoute({
    points: [[0, 0], [90, 0]], height: 2.0, topWidth: 0.4, baseWidth: 0.9,
    moduleLen: 3.0, seed: "t:straight", groundAt: FLAT,
  });
  assert.equal(plan.modules.length, 30, "90 m / 3 m = 30 个模块，不许留尾巴");
  const covered = plan.modules.reduce((sum, m) => sum + m.sx / 1.02 * 3.0, 0);
  assert.ok(Math.abs(covered - 90) < 0.5, `模块总长要盖满整条墙（盖了 ${covered.toFixed(1)}）`);
  assert.ok(plan.colliders.length >= 28, "完好直墙几乎每模块一只碰撞盒");
  assert.ok(plan.covers.length <= Math.ceil(plan.colliders.length / 3) + 1,
    "掩体点必须抽稀（坝墙的账：一道墙不许灌满掩体表）");
  for (const m of plan.modules) {
    assert.ok(m.sy > 0.5 && m.sy < 1.6, `模块高度缩放要在正常带内（sy=${m.sy}）`);
    assert.ok(Math.abs(m.z) < 0.2, "直墙模块不许飘离中心线（侧错位 ≤ sideJitter）");
  }
}

// --- 缺口（圩门）：门洞里一个模块、一只碰撞盒都不许有 ---
{
  const plan = PlanWallRoute({
    points: [[0, 0], [200, 0]], height: 2.2, topWidth: 0.5, baseWidth: 1.1,
    moduleLen: 3.0, seed: "t:gate", groundAt: FLAT,
    gaps: [{ at: [100, 0], width: 8 }],
  });
  for (const m of plan.modules) {
    assert.ok(Math.abs(m.x - 100) > 3.9, `门洞净空里不许有模块（x=${m.x.toFixed(1)}）`);
  }
  for (const c of plan.colliders) {
    assert.ok(Math.abs(c.x - 100) > 3.9, `门洞净空里不许有碰撞（x=${c.x.toFixed(1)}）`);
  }
}

// --- 破口：高度按剖面塌下去、残根不给碰撞 ---
{
  const plan = PlanWallRoute({
    points: [[0, 0], [200, 0]], height: 2.0, topWidth: 0.4, baseWidth: 0.9,
    moduleLen: 2.0, seed: "t:breach", groundAt: FLAT,
    breaches: [{ at: [100, 0], width: 16 }],
    heightJitter: 0,
  });
  const atCenter = plan.modules.filter((m) => Math.abs(m.x - 100) < 1.5);
  assert.ok(atCenter.length > 0, "破口中心也要有残根模块（矮，但在）");
  for (const m of atCenter) {
    assert.ok(m.visH < 2.0 * 0.25, `破口中心要塌到两成半以下（visH=${m.visH.toFixed(2)}）`);
  }
  for (const c of plan.colliders) {
    assert.ok(Math.abs(c.x - 100) > 4,
      `破口中心的残根不许登记碰撞 —— 那是给人走的（x=${c.x.toFixed(1)}）`);
  }
  const far = plan.modules.find((m) => Math.abs(m.x - 30) < 1.5);
  assert.ok(far && far.visH > 1.8, "破口影响不许波及远处");
}

// --- 贴地：斜坡上模块底要埋进地、顶要跟着地走 ---
{
  const slope = (x, z) => x * 0.05;                 // 5% 坡
  const plan = PlanWallRoute({
    points: [[0, 0], [100, 0]], height: 2.0, topWidth: 0.4, baseWidth: 0.9,
    moduleLen: 3.0, seed: "t:slope", groundAt: slope, embed: 0.5, heightJitter: 0,
  });
  for (const m of plan.modules) {
    const ground = slope(m.x, m.z);
    const bottom = m.y - (m.sy * (2.0 + 0.5)) / 2;
    assert.ok(bottom < ground - 0.2, `模块底要埋进地（x=${m.x.toFixed(1)}，底 ${bottom.toFixed(2)} vs 地 ${ground.toFixed(2)}）`);
    assert.ok(Math.abs(m.topY - (ground + m.visH)) < 0.35,
      `模块顶要贴着本地地高走（x=${m.x.toFixed(1)}）`);
  }
  // 顶的整体走势必须跟坡（首尾差 ≈ 5 m 坡差）
  const first = plan.modules[0], last = plan.modules[plan.modules.length - 1];
  assert.ok(last.topY - first.topY > 3.5, "墙顶要顺着坡爬升，不许一条水平线");
}

// --- 闭环：四角互搭、角上不留豁口、外向法向 ---
{
  const plan = PlanWallRoute({
    points: [[0, 0], [40, 0], [40, 30], [0, 30]], closed: true,
    height: 1.5, topWidth: 0.3, baseWidth: 0.3,
    moduleLen: 2.8, seed: "t:ring", groundAt: FLAT, sideJitter: 0,
  });
  assert.ok(Math.abs(plan.stats.length - 140) < 1e-6, "闭环周长 = 矩形周长");
  // 每个角：两条邻边的端模块都要**伸过角点**（不加长的话端面正好停在角上，
  // 两面墙的外角就漏一道墙厚的豁口）
  for (const corner of [[0, 0], [40, 0], [40, 30], [0, 30]]) {
    const near = plan.modules.filter((m) => Math.hypot(m.x - corner[0], m.z - corner[1]) < 3.5);
    assert.ok(near.length >= 2, `角 (${corner}) 两侧都要有端模块`);
    for (const m of near) {
      const dist = Math.hypot(m.x - corner[0], m.z - corner[1]);
      const halfDraw = (m.sx * 2.8 / 1.02) / 2;
      assert.ok(halfDraw - dist > 0.04,
        `角上的端模块要伸过角点互搭（盖过角 ${(halfDraw - dist).toFixed(3)} m）`);
    }
  }
  // 模块不许跨角（角在模块中段 = 弦切角，墙拐角处飘出去）
  for (const m of plan.modules) {
    const onEdge = Math.abs(m.z) < 1 || Math.abs(m.z - 30) < 1
      || Math.abs(m.x) < 1 || Math.abs(m.x - 40) < 1;
    assert.ok(onEdge, `闭环模块必须贴边不跨角（(${m.x.toFixed(1)}, ${m.z.toFixed(1)})）`);
  }
}

// --- 塌段：压扁摊宽、不给掩体、碰撞跟着矮 ---
{
  const plan = PlanWallRoute({
    points: [[0, 0], [300, 0]], height: 1.45, topWidth: 0.55, baseWidth: 0.55,
    moduleLen: 4.5, seed: "t:collapse", groundAt: FLAT,
    collapseChance: 0.3, heightJitter: 0,
  });
  const collapsed = plan.modules.filter((m) => m.collapsed);
  assert.ok(collapsed.length >= 10 && collapsed.length <= 32,
    `30% 塌段概率下 67 模块塌 10—32 段（实际 ${collapsed.length}）`);
  for (const m of collapsed) {
    assert.ok(m.visH < 1.45 * 0.56, "塌段要压到六成以下");
    assert.ok(m.sz > 1.2, "塌段要摊宽（石头堆开了）");
  }
  for (const c of plan.covers) {
    const m = plan.modules.find((mm) => Math.abs(mm.x - c.x) < 0.1);
    assert.ok(!m || !m.collapsed, "塌段不许当掩体");
  }
}

// --- 整边塌成瓦砾线（村院墙）：fallenRuns 交还调用方 ---
{
  const plan = PlanWallRoute({
    points: [[0, 0], [20, 0], [20, 16], [0, 16]], closed: true,
    height: 1.55, topWidth: 0.28, baseWidth: 0.28,
    moduleLen: 2.8, seed: "t:fallen7", groundAt: FLAT,
    edgeCollapseChance: 0.99,
  });
  assert.ok(plan.fallenRuns.length === 4, "全塌概率下四条边都要进 fallenRuns");
  assert.equal(plan.modules.length, 0, "塌掉的边不许再出模块");
  for (const run of plan.fallenRuns) {
    assert.ok(run.len > 10, "整边瓦砾线长度 = 边长");
  }
}

// --- 确定性：同参数逐位一致；随机破口避开圩门 ---
{
  const opts = {
    points: [[-420, -560], [240, -560]], height: 2.2, topWidth: 0.5, baseWidth: 1.1,
    moduleLen: 3.0, seed: "north:zhai", groundAt: (x) => Math.sin(x * 0.013) * 0.55,
    gaps: [{ at: [-145, -560], width: 8.9 }, { at: [40, -560], width: 8.1 }],
    randomBreaches: { count: 3, widthMin: 9, widthMax: 16, margin: 24, avoidGapMargin: 14 },
    damage: 0.3,
  };
  const a = PlanWallRoute(opts);
  const b = PlanWallRoute(opts);
  assert.equal(JSON.stringify(a.modules), JSON.stringify(b.modules), "同种子必须逐位一致");
  assert.equal(a.stats.breaches, 3, "随机破口要撒满三处");
  // 破口塌出的通道不许贴着圩门（诚实读数：模块高剖面在门旁 14 m 内不许 < 六成）
  for (const m of a.modules) {
    for (const gx of [-145, 40]) {
      if (Math.abs(m.x - gx) < 14 && m.visH < 2.2 * 0.5) {
        assert.fail(`随机破口贴到圩门边上了（x=${m.x.toFixed(1)}）`);
      }
    }
  }
  // 变体分布：四种变体都要被用到（实例化的意义就在混着摆）
  const used = new Set(a.modules.map((m) => m.variant));
  assert.equal(used.size, 4, "四种几何变体都要用上");
}

console.log("WallPlanTest: 全部通过");
