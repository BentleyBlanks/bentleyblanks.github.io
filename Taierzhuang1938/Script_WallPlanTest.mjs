// 样条围墙规划（Script_WallPlan）的纯 Node 回归。
//
// 这层被寨墙、坝墙、石墙村、村院墙四路共用 —— 它错一个符号，症状是
// 「墙飘在坡上 / 圩门被封死 / 院墙角上漏一道缝」这种要实拍才能抓到的东西。
// 契约逐条钉死：覆盖无洞、缺口真空、破口留残根、贴地不悬空、闭环角互搭、
// 塌段压高、掩体抽稀、同种子逐位确定。
//
// 第二轮（覆盖面扩张）又加了三条：拼接重叠、残破咬口、碰撞并段 —— 它们是
// 城内几百圈院墙搬进本管线时新开的旋钮，错了的症状同样只有实拍才抓得到
// （墙上一道道竖缝 / 残墙齐得像新砌 / 碰撞表翻十倍）。
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
  const covered = plan.modules.reduce((sum, m) => sum + (m.sx / 1.02) * 3.0, 0);
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

// --- 拼接重叠：画出来的长度必须比弦长多出 moduleOverlap，且盖满整条 ---
{
  for (const overlap of [0, 0.02, 0.12]) {
    const plan = PlanWallRoute({
      points: [[0, 0], [60, 0]], height: 2.0, topWidth: 0.4, baseWidth: 0.4,
      moduleLen: 3.0, moduleOverlap: overlap, seed: "t:lap", groundAt: FLAT,
      heightJitter: 0, thickJitter: 0, sideJitter: 0,
    });
    assert.equal(plan.modules.length, 20, "重叠不许改变模块个数（那是间隔的事）");
    for (const m of plan.modules) {
      const drawn = (m.sx / 1) * 3.0;             // sx 已含 lenS×(1+overlap)
      assert.ok(Math.abs(drawn - 3.0 * (1 + overlap)) < 1e-6,
        `重叠 ${overlap}：每块画出来要比弦长多 ${(overlap * 100).toFixed(0)}%（实际 ${drawn.toFixed(4)}）`);
    }
    // 相邻两块的画出范围必须搭上（缝 ≤ 0）
    const sorted = [...plan.modules].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const prevEnd = sorted[i - 1].x + (sorted[i - 1].sx * 3.0) / 2;
      const nextStart = sorted[i].x - (sorted[i].sx * 3.0) / 2;
      assert.ok(nextStart - prevEnd <= 1e-6,
        `重叠 ${overlap}：第 ${i} 块与前一块之间不许露缝（露了 ${(nextStart - prevEnd).toFixed(4)} m）`);
    }
    assert.ok(Math.abs(plan.nominal.moduleOverlap - overlap) < 1e-9, "nominal 要把重叠交出去");
  }
}

// --- 残破 ruin：从墙头咬口、两端收力、不改平面位置 ---
{
  const base = {
    points: [[0, 0], [66, 0]], height: 2.2, topWidth: 0.35, baseWidth: 0.35,
    moduleLen: 2.2, seed: "t:ruin", groundAt: FLAT, heightJitter: 0,
  };
  const clean = PlanWallRoute({ ...base, ruin: 0 });
  const worn = PlanWallRoute({ ...base, ruin: 0.8 });
  assert.equal(clean.modules.length, worn.modules.length, "残破不许改变模块个数");
  const cleanH = clean.modules.map((m) => m.visH);
  const wornH = worn.modules.map((m) => m.visH);
  for (let i = 0; i < wornH.length; i += 1) {
    assert.ok(wornH[i] <= cleanH[i] + 1e-9, "残破只许把墙头咬低，不许长高");
  }
  const spread = Math.max(...wornH) - Math.min(...wornH);
  assert.ok(spread > 0.3, `ruin=0.8 的墙头要参差（实际只差 ${spread.toFixed(2)} m）`);
  assert.ok(Math.max(...clean.modules.map((m) => m.visH))
    - Math.min(...clean.modules.map((m) => m.visH)) < 1e-9, "ruin=0 的墙头要齐");
  // 咬口的走势：**两端最狠、中段最高**（旧 AddWall 逐切片 bite 的原样搬运；
  // 逐块比是掷硬币，所以按两端各 25% 与中段 25% 的均值比）。
  // 这一条锁的是"残墙什么形状"，反过来就成了另一种破法。
  const Mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const q = Math.max(2, Math.round(wornH.length * 0.25));
  const ends = Mean([...wornH.slice(0, q), ...wornH.slice(-q)]);
  const middle = Mean(wornH.slice(Math.round(wornH.length * 0.375),
    Math.round(wornH.length * 0.625)));
  assert.ok(middle > ends,
    `残破要两端咬得最狠、中段留最高（两端均高 ${ends.toFixed(2)} vs 中段 ${middle.toFixed(2)}）`);
}

// --- 碰撞并段：等高的相邻模块并成一只长盒，破口处必须断开 ---
{
  const opts = {
    points: [[0, 0], [40, 0], [40, 30], [0, 30]], closed: true,
    height: 2.15, topWidth: 0.35, baseWidth: 0.35,
    moduleLen: 2.2, seed: "t:merge", groundAt: FLAT, heightJitter: 0.035,
    gaps: [{ at: [12, 30], width: 1.5 }],
  };
  const loose = PlanWallRoute({ ...opts, colliderMerge: 0 });
  const merged = PlanWallRoute({ ...opts, colliderMerge: 0.5 });
  assert.equal(loose.modules.length, merged.modules.length, "并段不许动模块");
  assert.ok(merged.colliders.length * 4 < loose.colliders.length,
    `并段要把碰撞盒数压下来（${loose.colliders.length} -> ${merged.colliders.length}）`);
  // 并出来的盒子仍要盖住整条边，且门洞里一只都没有
  const total = (list) => list.reduce((sum, c) => sum + c.hx * 2, 0);
  assert.ok(Math.abs(total(merged.colliders) - total(loose.colliders)) < 1.0,
    "并段前后碰撞覆盖的总长要一致（并的是盒子不是墙）");
  for (const c of merged.colliders) {
    const inGate = Math.abs(c.z - 30) < 1 && Math.abs(c.x - 12) < c.hx;
    assert.ok(!inGate, `门洞里不许有并出来的碰撞盒（x=${c.x.toFixed(1)}）`);
  }
  // 并段取矮的：不许凭空长出挡墙
  for (const c of merged.colliders) {
    assert.ok(c.hy * 2 <= 2.15 * 1.05, "并段高度不许超过设计墙高");
  }
}

console.log("WallPlanTest: 全部通过");
