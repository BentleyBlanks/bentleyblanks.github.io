// 样条道路生成器：铁路、大车路、大街共用的**唯一**一份铺路代码。
//
// 此前全项目的「路」是六份互抄的一次性实现、七种数据形态（城内 MakeBox 薄板、
// 城外折线逐段 TerrainSlab、两份手拼 Quad 的 RoadRibbon、三份铁路）。这里收拢成：
//   中心线（Script_RoadPath 的向心 Catmull-Rom）
//     → 等弧长采样（步长 = 碰撞盒长，北关大街 0.79 m 直坎的账）
//     → 逐顶点贴地的**连续条带**（相邻截面共享顶点：拐角天然斜接，无 V 缝）
//     → 分块合批（chunkLen 一块 + 可选 sector 桶，视锥剔除不失效）
//     → 缺口（道口/桥）先挖后分段（Station 的账：段心判法会留半段长的豁口）
//
// 三个公开构件：
//   BuildRoadRibbon  路面条带（顶面 + 两侧裙边 + 可选路基碰撞）——街、土路
//   BuildRailBed     道砟路基（梯形断面扫掠 + 台阶/低隆两种碰撞）
//   BuildRailTrack   枕木 + 双轨（沿样条摆，钢轨按弦分节）
//   BuildRailwayFromSpec  纯数据 spec 一次铺完上面两件（第一关白盒 / 编辑器预览）
// 以及 MakeCrownProfile：轨面高程剖面（平滑 + 夹持，车站那条 0.46 m 低路基用）。
//
// ## 约定
//   · 法向 n = (tz, -tx)：路径朝 +z 走时 n 指向 +x。MakeCrownProfile 的
//     probeOffset 按这个符号算（车站采样点在轨西 62 m ⇒ probeOffset = -62）。
//   · 所有条带的绕向不靠背（背错一次整条路隐形，Division122 的账）：
//     每块条带按「第一格叉积 vs 期望朝向」自动定向，写死不猜。
//   · 贴地：顶面每 step 采样一次 groundAt；裙边往下 skirtDrop 盖住采样点之间
//     地形高出来的部分（TerrainSlab 的埋边思路，换成竖裙）。
//   · sinkFor(x,z)：多桶路由（近/远表 + 分区）。构件在拿到 sink 后立即 Add，
//     分区脏状态由调用方在整段构建结束后复位。

import * as THREE from "three";
import { MakeBox, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import {
  MakeRoadPath, GapsToRuns, SampleRun, PredicateGaps, MakeCrownProfile, MakeRailwayProfile,
  VIGNOLES_RAIL_PROFILE, ResolveRailwayGaps,
} from "./Script_RoadPath.mjs";

export {
  MakeRoadPath, GapsToRuns, SampleRun, PredicateGaps, MakeCrownProfile, MakeRailwayProfile,
  VIGNOLES_RAIL_PROFILE, ResolveRailwayGaps,
};

// ---------------------------------------------------------------------------
// 条带累加器
// ---------------------------------------------------------------------------

/** 攒几条「沿路条带」再一次性出 BufferGeometry。 */
class StripAccum {
  constructor() {
    this.positions = [];
    this.uvs = [];
    this.indices = [];
  }

  /**
   * 一条带：rowsA / rowsB 是两条平行边的世界坐标（[x,y,z][]，等长 ≥2），
   * sArr 是每行的弧长（U 向按世界米数走，全场贴图密度一致），
   * expected 是这条带面该朝的方向 —— 用第一格的叉积对一次符号，反了就翻绕向。
   */
  AddBand(rowsA, rowsB, sArr, tile, expected) {
    const n = rowsA.length;
    if (n < 2) return;
    const base = this.positions.length / 3;
    for (let i = 0; i < n; i += 1) {
      const a = rowsA[i];
      this.positions.push(a[0], a[1], a[2]);
      this.uvs.push(sArr[i] / tile, 0);
    }
    for (let i = 0; i < n; i += 1) {
      const a = rowsA[i], b = rowsB[i];
      this.positions.push(b[0], b[1], b[2]);
      const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      this.uvs.push(sArr[i] / tile, w / tile);
    }
    // 第一格定向：n = (A1-A0) × (B0-A0)
    const A0 = rowsA[0], A1 = rowsA[1], B0 = rowsB[0];
    const ux = A1[0] - A0[0], uy = A1[1] - A0[1], uz = A1[2] - A0[2];
    const vx = B0[0] - A0[0], vy = B0[1] - A0[1], vz = B0[2] - A0[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const flip = cx * expected[0] + cy * expected[1] + cz * expected[2] < 0;
    for (let i = 0; i < n - 1; i += 1) {
      const a = base + i, a2 = a + 1, b = base + n + i, b2 = b + 1;
      if (!flip) this.indices.push(a, a2, b, b, a2, b2);
      else this.indices.push(a, b, a2, a2, b, b2);
    }
  }

  Build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",
      new THREE.BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    const IndexArray = this.positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
    geometry.setIndex(new THREE.BufferAttribute(new IndexArray(this.indices), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// ---------------------------------------------------------------------------
// 路面条带
// ---------------------------------------------------------------------------

/**
 * 一条路面：顶面沿地形起伏，两侧竖裙边盖住过渡带，可选每格一个路基碰撞盒。
 *
 * @param sink BuildSink（或编辑器的替身：{ Add, Solid, SetSector }）
 * @param {object} opts
 *   points|path   控制点（[[x,z],...]）或现成的 RoadPath
 *   width         路面宽（米）
 *   material      桶名（默认 DirtRoad）
 *   groundAt      (x,z) => 地面标高。**必须传宿主那一份**
 *   crown         路面高出地面多少（默认 0.045，垫起来的街传 0.22 那一档）
 *   skirtDrop     裙边往下多少（默认 0.65）
 *   step          采样步长 = 碰撞盒长（默认 4 m）
 *   gaps          [[s0,s1],...] 弧长缺口（桥头等）
 *   widthJitter   低频宽度抖动比例（土路传 ~0.09，街传 0）
 *   colliders     null 或 { tag, thickness }：路面垫高超过 ~0.15 才需要
 *                 （不登记的话人踩在路面以下走，车辙比脚面还高）
 *   inRegion      (x,z)=>bool，块级取舍（切片外不生成）
 *   sectorKey     (x,z)=>string，分区合批
 *   cutWhere      (x,z)=>bool，**自动断开**（护城河/河槽等）。按中心 + 两路肩
 *                 三点判 —— 濠岸是斜线时中心还在岸上、路肩已经悬在水面上；
 *                 判中的连续段各向外扩 cutMargin 挖成缺口。
 */
export function BuildRoadRibbon(sink, {
  points = null, path = null, width, material = "DirtRoad", groundAt,
  crown = 0.045, skirtDrop = 0.65, step = 4, gaps = [],
  widthJitter = 0, seed = "road", tile = TILE_METERS.ground,
  colliders = null, inRegion = null, sectorKey = null, chunkLen = 60,
  cutWhere = null, cutMargin = 2,
}) {
  const p = path || MakeRoadPath(points);
  let allGaps = gaps;
  if (cutWhere) {
    const half = width / 2;
    const wet = (x, z, tx, tz) => {
      if (cutWhere(x, z)) return true;
      const nx = tz, nz = -tx;
      return cutWhere(x + nx * half, z + nz * half) || cutWhere(x - nx * half, z - nz * half);
    };
    allGaps = gaps.concat(PredicateGaps(p, wet, { step, margin: cutMargin }));
  }
  const runs = GapsToRuns(p.length, allGaps);
  const rnd = Mulberry32(HashString(String(seed)));
  const stats = { length: 0, chunks: 0, colliders: 0 };
  // 低频宽度抖动：24 m 一档线性混合（逐样本独立抖会变成锯齿边）
  const jitterCell = 24;
  const jitters = [];
  const HalfAt = (s) => {
    if (!widthJitter) return width / 2;
    const cell = Math.floor(s / jitterCell);
    while (jitters.length <= cell + 1) jitters.push((rnd() - 0.5) * 2);
    const w = s / jitterCell - cell;
    const j = jitters[cell] * (1 - w) + jitters[cell + 1] * w;
    return (width / 2) * (1 + j * widthJitter);
  };
  for (const [a, b] of runs) {
    const samples = SampleRun(p, a, b, step);
    const rows = samples.map((sm) => {
      const half = HalfAt(sm.s);
      const nx = sm.tz, nz = -sm.tx;
      const lx = sm.x + nx * half, lz = sm.z + nz * half;
      const rx = sm.x - nx * half, rz = sm.z - nz * half;
      return {
        s: sm.s, x: sm.x, z: sm.z, nx, nz,
        L: [lx, groundAt(lx, lz) + crown, lz],
        R: [rx, groundAt(rx, rz) + crown, rz],
      };
    });
    const per = Math.max(1, Math.round(chunkLen / step));
    for (let i0 = 0; i0 < rows.length - 1; i0 += per) {
      const i1 = Math.min(i0 + per, rows.length - 1);
      const slice = rows.slice(i0, i1 + 1);
      const mid = slice[Math.floor(slice.length / 2)];
      if (inRegion && !inRegion(mid.x, mid.z)) continue;
      const acc = new StripAccum();
      const sArr = slice.map((r) => r.s);
      acc.AddBand(slice.map((r) => r.L), slice.map((r) => r.R), sArr, tile, [0, 1, 0]);
      if (skirtDrop > 0.01) {
        acc.AddBand(slice.map((r) => r.L), slice.map((r) => [r.L[0], r.L[1] - skirtDrop, r.L[2]]),
          sArr, tile, [mid.nx, 0, mid.nz]);
        acc.AddBand(slice.map((r) => r.R), slice.map((r) => [r.R[0], r.R[1] - skirtDrop, r.R[2]]),
          sArr, tile, [-mid.nx, 0, -mid.nz]);
      }
      if (sectorKey) sink.SetSector(sectorKey(mid.x, mid.z));
      sink.Add(material, acc.Build());
      if (sectorKey) sink.SetSector("");
      stats.chunks += 1;
    }
    stats.length += b - a;
    if (colliders) {
      // 一格一盒，盒长 = 采样步长（北关大街的账：盒长跟着采样走，
      // 拉长到 10 m 就会在垫地过渡带留下 >autostep 的直坎）
      const t = colliders.thickness ?? 0.24;
      for (let i = 0; i < rows.length - 1; i += 1) {
        const r0 = rows[i], r1 = rows[i + 1];
        const cx = (r0.x + r1.x) / 2, cz = (r0.z + r1.z) / 2;
        if (inRegion && !inRegion(cx, cz)) continue;
        const surf = groundAt(cx, cz) + crown;
        const len = Math.hypot(r1.x - r0.x, r1.z - r0.z);
        const ry = Math.atan2(-(r1.z - r0.z), r1.x - r0.x);
        sink.Solid(cx, surf - t, cz, len / 2 + 0.12, t, width / 2,
          colliders.tag || "embankment", ry);
        stats.colliders += 1;
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// 道砟路基
// ---------------------------------------------------------------------------

/**
 * 道砟堤：梯形断面沿样条扫掠（顶面平 crown，两坡脚逐点贴地埋进土里）。
 *
 * 碰撞两档（colliders）：
 *   { mode:"steps", steps:4, every:15, tag }
 *     四级台阶贴着可见斜面（AddBank 的账：每级 ≤0.56 m 落在 autostep 档内，
 *     人沿可见的坡一级级走上去，不是坡脚一堵空气墙）—— 高堤（1.35 m）用
 *   { mode:"lowRise", rise:0.34, every:12, tag }
 *     只压到地面 +rise（Station 的账：NavGrid 判「挡路」按格子各自的地面
 *     +0.56，盒顶贴太高会把导航切出随机断点）—— 城关低路基（0.46 m）用
 * 碰撞盒一律走 colliderSink（默认 sink）：远景表的盒子也得进物理。
 */
export function BuildRailBed(sink, {
  path, groundAt, crownAt, topHalf = 3.4, baseHalf = null, slope = 1.75, embed = 0.3,
  material = "RailBallast", gaps = [], step = 4, chunkLen = 40,
  tile = TILE_METERS.ground, colliders = null, inRegion = null,
  sectorKey = null, sinkFor = null, colliderSink = null,
  subBallast = null,
}) {
  const runs = GapsToRuns(path.length, gaps);
  const stats = { chunks: 0, colliders: 0 };
  const HalfAt = (crownY, ground) => {
    const drop = Math.max(0.25, crownY - ground);
    return baseHalf != null ? baseHalf : topHalf + drop * slope;
  };
  for (const [a, b] of runs) {
    const samples = SampleRun(path, a, b, step);
    const rows = samples.map((sm) => {
      const nx = sm.tz, nz = -sm.tx;
      const crownY = crownAt(sm.s);
      const ground = groundAt(sm.x, sm.z);
      const half = HalfAt(crownY, ground);
      const lbx = sm.x + nx * half, lbz = sm.z + nz * half;
      const rbx = sm.x - nx * half, rbz = sm.z - nz * half;
      const row = {
        s: sm.s, x: sm.x, z: sm.z, nx, nz, crownY, ground,
        TL: [sm.x + nx * topHalf, crownY, sm.z + nz * topHalf],
        TR: [sm.x - nx * topHalf, crownY, sm.z - nz * topHalf],
        BL: [lbx, groundAt(lbx, lbz) - embed, lbz],
        BR: [rbx, groundAt(rbx, rbz) - embed, rbz],
      };
      if (subBallast) {
        // 两层路基断面：上层碎石道砟棱体（厚 ballastThick），下层超过阈值时顺坡扫掠土质路堤
        const thick = subBallast.ballastThick ?? 0.30;
        const bSlope = subBallast.ballastSlope ?? slope;
        const eSlope = subBallast.slope ?? 1.55;
        const toeY = crownY - thick;
        const shHalf = topHalf + thick * bSlope;
        const lsx = sm.x + nx * shHalf, lsz = sm.z + nz * shHalf;
        const rsx = sm.x - nx * shHalf, rsz = sm.z - nz * shHalf;
        const lGnd = groundAt(lsx, lsz), rGnd = groundAt(rsx, rsz);
        const lDrop = Math.max(0.08, crownY - lGnd + 0.06);
        const rDrop = Math.max(0.08, crownY - rGnd + 0.06);
        const lBallastDrop = Math.min(thick, lDrop);
        const rBallastDrop = Math.min(thick, rDrop);
        const lMidHalf = topHalf + lBallastDrop * bSlope;
        const rMidHalf = topHalf + rBallastDrop * bSlope;
        const lmx = sm.x + nx * lMidHalf, lmz = sm.z + nz * lMidHalf;
        const rmx = sm.x - nx * rMidHalf, rmz = sm.z - nz * rMidHalf;
        row.BTL = [lmx, Math.max(groundAt(lmx, lmz) - 0.08, crownY - lBallastDrop), lmz];
        row.BTR = [rmx, Math.max(groundAt(rmx, rmz) - 0.08, crownY - rBallastDrop), rmz];
        const lRem = Math.max(0, toeY - lGnd + embed);
        const rRem = Math.max(0, toeY - rGnd + embed);
        const lFullHalf = shHalf + lRem * eSlope;
        const rFullHalf = shHalf + rRem * eSlope;
        const lfx = sm.x + nx * lFullHalf, lfz = sm.z + nz * lFullHalf;
        const rfx = sm.x - nx * rFullHalf, rfz = sm.z - nz * rFullHalf;
        row.ETL = [lmx, row.BTL[1] + 0.03, lmz];
        row.ETR = [rmx, row.BTR[1] + 0.03, rmz];
        row.EBL = [lfx, groundAt(lfx, lfz) - embed, lfz];
        row.EBR = [rfx, groundAt(rfx, rfz) - embed, rfz];
        row.needEarth = Math.max(toeY - lGnd, toeY - rGnd) > -0.05;
      }
      return row;
    });
    const per = Math.max(1, Math.round(chunkLen / step));
    for (let i0 = 0; i0 < rows.length - 1; i0 += per) {
      const i1 = Math.min(i0 + per, rows.length - 1);
      const slice = rows.slice(i0, i1 + 1);
      const mid = slice[Math.floor(slice.length / 2)];
      if (inRegion && !inRegion(mid.x, mid.z)) continue;
      const target = sinkFor ? sinkFor(mid.x, mid.z) : sink;
      if (sectorKey) target.SetSector(sectorKey(mid.x, mid.z));
      const sArr = slice.map((r) => r.s);
      if (subBallast) {
        const bAcc = new StripAccum();
        bAcc.AddBand(slice.map((r) => r.TL), slice.map((r) => r.TR), sArr, tile, [0, 1, 0]);
        bAcc.AddBand(slice.map((r) => r.BTL), slice.map((r) => r.TL), sArr, tile, [mid.nx, 0.45, mid.nz]);
        bAcc.AddBand(slice.map((r) => r.TR), slice.map((r) => r.BTR), sArr, tile, [-mid.nx, 0.45, -mid.nz]);
        target.Add(material, bAcc.Build());
        if (slice.some((r) => r.needEarth)) {
          const eAcc = new StripAccum();
          const eTile = subBallast.tile ?? tile;
          eAcc.AddBand(slice.map((r) => r.EBL), slice.map((r) => r.ETL), sArr, eTile, [mid.nx, 0.4, mid.nz]);
          eAcc.AddBand(slice.map((r) => r.ETR), slice.map((r) => r.EBR), sArr, eTile, [-mid.nx, 0.4, -mid.nz]);
          target.Add(subBallast.material || "earthDark", eAcc.Build());
        }
      } else {
        const acc = new StripAccum();
        acc.AddBand(slice.map((r) => r.TL), slice.map((r) => r.TR), sArr, tile, [0, 1, 0]);
        acc.AddBand(slice.map((r) => r.BL), slice.map((r) => r.TL), sArr, tile,
          [mid.nx, 0.4, mid.nz]);
        acc.AddBand(slice.map((r) => r.TR), slice.map((r) => r.BR), sArr, tile,
          [-mid.nx, 0.4, -mid.nz]);
        target.Add(material, acc.Build());
      }
      if (sectorKey) target.SetSector("");
      stats.chunks += 1;
    }
    if (colliders) {
      const csink = colliderSink || sink;
      const every = colliders.every ?? 13;
      const nCol = Math.max(1, Math.round((b - a) / every));
      const colL = (b - a) / nCol;
      for (let i = 0; i < nCol; i += 1) {
        const sMid = a + colL * (i + 0.5);
        const pm = path.At(sMid);
        if (inRegion && !inRegion(pm.x, pm.z)) continue;
        const ground = groundAt(pm.x, pm.z);
        const crownY = crownAt(sMid);
        const half = HalfAt(crownY, ground);
        const ry = Math.atan2(-pm.tz, pm.tx);
        if (colliders.mode === "steps") {
          const steps = colliders.steps ?? 4;
          const h = Math.max(0.2, crownY - ground);
          for (let k = 0; k < steps; k += 1) {
            const top = (h * (k + 1)) / steps;
            const w = half + (topHalf - half) * ((k + 1) / steps);
            csink.Solid(pm.x, ground + top / 2, pm.z, colL / 2, top / 2, w,
              colliders.tag || "embankment", ry);
          }
        } else {
          const rise = colliders.rise ?? 0.34;
          csink.Solid(pm.x, ground + rise / 2, pm.z, colL / 2, rise / 2, half,
            colliders.tag || "embankment", ry);
        }
        stats.colliders += 1;
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// 钢轨扫掠截面 & 倒角枕木
// ---------------------------------------------------------------------------

/** 倒角枕木几何（本地 X=沿轨宽, Y=上 [-h/2..+h/2], Z=跨轨长），8 棱截面代替尖锐方块。 */
function MakeBeveledSleeperGeometry(along, h, length, tile) {
  const hx = along * 0.5, hy = h * 0.5, hz = length * 0.5;
  const bx = Math.min(0.018, hx * 0.25), by = Math.min(0.015, hy * 0.25);
  const prof = [
    [-hx + bx, hy], [hx - bx, hy], [hx, hy - by], [hx, -hy + by * 0.5],
    [hx - bx * 0.5, -hy], [-hx + bx * 0.5, -hy], [-hx, -hy + by * 0.5], [-hx, hy - by],
  ];
  const pos = [], norm = [], uv = [], idx = [];
  const n = prof.length;
  const perim = [0];
  for (let i = 0; i < n; i += 1) {
    const a = prof[i], b = prof[(i + 1) % n];
    perim.push(perim[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  // 侧面：每条棱独立法线（硬边木料质感）
  for (let i = 0; i < n; i += 1) {
    const a = prof[i], b = prof[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const el = Math.hypot(ex, ey) || 1;
    // 外法线 (顺时针轮廓 → (-ey, ex))
    const nx = -ey / el, ny = ex / el;
    const base = pos.length / 3;
    pos.push(a[0], a[1], -hz, b[0], b[1], -hz, b[0], b[1], hz, a[0], a[1], hz);
    for (let k = 0; k < 4; k += 1) norm.push(nx, ny, 0);
    uv.push(0, perim[i] / tile, 0, perim[i + 1] / tile, length / tile, perim[i + 1] / tile, length / tile, perim[i] / tile);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // 两端端面（±Z）
  for (const sign of [-1, 1]) {
    const z = sign * hz;
    const center = pos.length / 3;
    pos.push(0, 0, z); norm.push(0, 0, sign); uv.push(0.5, 0.5);
    for (let i = 0; i < n; i += 1) {
      pos.push(prof[i][0], prof[i][1], z);
      norm.push(0, 0, sign);
      uv.push((prof[i][0] + hx) / along, (prof[i][1] + hy) / h);
    }
    for (let i = 0; i < n; i += 1) {
      const a = center + 1 + i, b = center + 1 + ((i + 1) % n);
      if (sign > 0) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** 沿样条扫掠一段闭合钢轨截面（14 点 Vignoles 工字轨），每条截面棱独立硬法线、严格跟坡跟弯。 */
function BuildVignolesRailChunk(stations, footLift, railH, sideOff, tile, profile) {
  const scaleY = railH / 0.14;
  const nProf = profile.length;
  const pos = [], norm = [], uv = [], idx = [];
  const perim = [0];
  for (let p = 0; p < nProf; p += 1) {
    const a = profile[p], b = profile[(p + 1) % nProf];
    perim.push(perim[p] + Math.hypot(b[0] - a[0], (b[1] - a[1]) * scaleY));
  }
  for (let p = 0; p < nProf; p += 1) {
    const a = profile[p], b = profile[(p + 1) % nProf];
    const ay = a[1] * scaleY, by = b[1] * scaleY;
    const dl = b[0] - a[0], dy = by - ay;
    const len = Math.hypot(dl, dy) || 1;
    // 截面在 (lat, y) 逆时针排布，外法线为 (+dy, -dl)
    const nl = dy / len, ny = -dl / len;
    const base = pos.length / 3;
    for (let i = 0; i < stations.length; i += 1) {
      const st = stations[i];
      const latA = sideOff + a[0], latB = sideOff + b[0];
      const ax = st.x + st.nx * latA, az = st.z + st.nz * latA, pyA = st.y + footLift + ay;
      const bx = st.x + st.nx * latB, bz = st.z + st.nz * latB, pyB = st.y + footLift + by;
      const wx = st.nx * nl, wz = st.nz * nl;
      pos.push(ax, pyA, az, bx, pyB, bz);
      norm.push(wx, ny, wz, wx, ny, wz);
      uv.push(st.s / tile, perim[p] / tile, st.s / tile, perim[p + 1] / tile);
    }
    for (let i = 0; i < stations.length - 1; i += 1) {
      const i0 = base + i * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
      idx.push(i0, i1, i3, i0, i3, i2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const IndexArray = pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
  g.setIndex(new THREE.BufferAttribute(new IndexArray(idx), 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// 数据驱动的整条铁路
// ---------------------------------------------------------------------------

/**
 * 纯数据 spec → 纵断面 → 道砟堤 → 枕木双轨，一次调用。第一关白盒、场景（ways.railways）与
 * 「场景样条PCG」编辑器预览共用这一条，断面与间距只写在 spec 里。
 *
 * spec: { id, points, gauge, crown:{MakeCrownProfile 参数},
 *         bed:{BuildRailBed 参数（material/topHalf/slope/embed/step/chunkLen/colliders/subBallast）},
 *         sleeper:{BuildRailTrack.sleeper，含 spacing}, rail:{BuildRailTrack.rail} }
 * groundAt 必须是宿主那一份（与玩家、AI 踩的是同一个地面）。
 */
export function BuildRailwayFromSpec(sink, spec, {
  groundAt, sinkFor = null, colliderSink = null, profile = null,
  sleeperSpotsOut = null, fishplateSpotsOut = null, clipBounds = null,
}) {
  const railway = profile || MakeRailwayProfile(spec, groundAt);
  let extraGaps = [];
  if (clipBounds) {
    const { minX, maxX, minZ, maxZ } = clipBounds;
    extraGaps = PredicateGaps(
      railway.path,
      (x, z) => x < minX || x > maxX || z < minZ || z > maxZ,
      { step: 1, margin: 0 },
    );
  }
  const bedGaps = extraGaps.length ? [...railway.bedGaps, ...extraGaps] : railway.bedGaps;
  const sleeperGaps = extraGaps.length ? [...railway.sleeperGaps, ...extraGaps] : railway.sleeperGaps;
  const railGaps = extraGaps.length ? [...railway.railGaps, ...extraGaps] : railway.railGaps;
  const bed = spec.bed === false ? { chunks: 0, colliders: 0 } : BuildRailBed(sink, {
    path: railway.path, groundAt, crownAt: railway.CrownAt,
    ...(spec.bed || {}), gaps: bedGaps, sinkFor, colliderSink,
  });
  const track = BuildRailTrack({
    path: railway.path, crownAt: railway.CrownAt, slopeAt: railway.SlopeAt,
    gauge: spec.gauge ?? 1.50,
    sinkFor: sinkFor || (() => sink), seed: spec.id || "railway",
    sleeper: spec.sleeper || {}, rail: spec.rail || {},
    sleeperGaps, railGaps,
    sleeperSpotsOut, fishplateSpotsOut,
  });
  return { profile: railway, bed, track };
}

// ---------------------------------------------------------------------------
// 轨道
// ---------------------------------------------------------------------------

/**
 * 枕木 + 双轨。枕木在道口断开（sleeperGaps），钢轨默认**连续**（真实道口
 * 钢轨照旧连着，轨顶高出土面那 0.14 m 正是乡道道口的样子）；要在桥上断开
 * 就把桥段传进 railGaps。
 *
 * 2026-11 升级：
 *   · 钢轨默认按 1938 津浦 41 kg/m Vignoles 扁底工字断面沿 3D 坡度/曲率连续扫掠，
 *     顶面另铺一条亮钢轮轨磨耗带（rail.wearMaterial），兼顾老 caller 传 `profile: "box"` 兼容。
 *   · 枕木支持两条路径：调用方给 `sleeperSpotsOut` 时输出每根枕木与鱼尾板的世界位姿（交 Three.js
 *     用 BlenderMCP 精修的 Model_RailSleeperKit.glb 做 InstancedMesh）；否则退回倒角木枕 + 垫板进 BuildSink。
 *
 * @param sinkFor (x,z)=>sink：近/远表与分区路由。构件拿到就 Add，脏分区由调用方复位。
 */
export function BuildRailTrack({
  path, crownAt, slopeAt = null, gauge = 1.435, sleeperGaps = [], railGaps = [],
  sinkFor, inRegion = null, seed = "track",
  sleeper = {}, rail = {}, spacingAt = null,
  sleeperSpotsOut = null, fishplateSpotsOut = null,
}) {
  const rnd = Mulberry32(HashString(String(seed)));
  const tie = {
    along: 0.23, h: 0.16, length: 2.54, lift: 0.08, material: "SleeperWood",
    fastenerMaterial: "RailSteel",
    jitter: 0.04, ryJitter: 0.015, spacing: 0.9, tile: TILE_METERS.wood,
    beveled: true, fasteners: false, ...sleeper,
  };
  const railSpec = {
    w: 0.12, h: 0.14, lift: 0.23, footLift: null, segLen: 12, chunkLen: 60, step: 4,
    material: "RailSteel", wearMaterial: null, profile: "vignoles",
    jointSpacing: 10, tile: TILE_METERS.steel, ...rail,
  };
  const railFootLift = railSpec.footLift != null ? railSpec.footLift : (railSpec.lift - railSpec.h * 0.5);
  const InGap = (gaps, s) => gaps.some(([g0, g1]) => s > g0 && s < g1);
  const PitchAt = (s) => {
    if (slopeAt) return Math.atan(slopeAt(s));
    const s0 = Math.max(0, s - 1), s1 = Math.min(path.length, s + 1);
    return s1 > s0 ? Math.atan((crownAt(s1) - crownAt(s0)) / (s1 - s0)) : 0;
  };
  const stats = { ties: 0, railSegs: 0, joints: 0 };

  let s = 0, i = 0;
  while (s < path.length) {
    const spacing = spacingAt ? spacingAt(s) : tie.spacing;
    if (!InGap(sleeperGaps, s)) {
      const p = path.At(s);
      if (!inRegion || inRegion(p.x, p.z)) {
        const nx = p.tz, nz = -p.tx;
        const wob = (rnd() - 0.5) * tie.jitter * 2;
        const ry = Math.atan2(-p.tz, p.tx)
          + (tie.ryJitter ? (rnd() - 0.5) * tie.ryJitter * 2 : 0);
        const pitch = PitchAt(s);
        const cx = p.x + nx * wob, cz = p.z + nz * wob;
        const cy = crownAt(s) + tie.lift;
        if (sleeperSpotsOut) {
          // Model_RailSleeperKit.glb 约定 Y=0 为枕木顶面（实体 -0.16..0，垫板 0..+0.014）
          sleeperSpotsOut.push({
            x: cx, y: cy + tie.h * 0.5, z: cz, ry, pitch, variant: i % 3,
          });
        } else {
          const geo = tie.beveled
            ? MakeBeveledSleeperGeometry(tie.along, tie.h, tie.length, tie.tile)
            : MakeBox(tie.along, tie.h, tie.length, tie.tile, `${seed}:tie${i}`);
          sinkFor(p.x, p.z).Add(tie.material, PlaceGeometry(geo, { x: cx, y: cy, z: cz, ry, rz: pitch }));
          if (tie.fasteners) {
            const plateY = cy + tie.h * 0.5 + 0.007;
            for (const side of [-1, 1]) {
              const off = (side * gauge) * 0.5;
              sinkFor(p.x, p.z).Add(tie.fastenerMaterial, PlaceGeometry(
                MakeBox(0.21, 0.014, 0.24, railSpec.tile, `${seed}:tp${i}:${side}`),
                { x: p.x + nx * off, y: plateY, z: p.z + nz * off, ry, rz: pitch }));
            }
          }
        }
        stats.ties += 1;
      }
    }
    s += spacing;
    i += 1;
  }

  const useVignoles = railSpec.profile === "vignoles";
  const railRuns = GapsToRuns(path.length, railGaps);
  if (useVignoles) {
    const step = railSpec.step || 4;
    const chunkLen = railSpec.chunkLen || 60;
    for (const [a, b] of railRuns) {
      const samples = SampleRun(path, a, b, step);
      const stations = samples.map((sm) => ({
        s: sm.s, x: sm.x, z: sm.z, nx: sm.tz, nz: -sm.tx, y: crownAt(sm.s),
      }));
      const per = Math.max(1, Math.round(chunkLen / step));
      for (const side of [-1, 1]) {
        const off = (side * gauge) * 0.5;
        for (let i0 = 0; i0 < stations.length - 1; i0 += per) {
          const i1 = Math.min(i0 + per, stations.length - 1);
          const slice = stations.slice(i0, i1 + 1);
          const mid = slice[Math.floor(slice.length / 2)];
          if (inRegion && !inRegion(mid.x, mid.z)) continue;
          const target = sinkFor(mid.x, mid.z);
          target.Add(railSpec.material, BuildVignolesRailChunk(
            slice, railFootLift, railSpec.h, off, railSpec.tile, VIGNOLES_RAIL_PROFILE));
          if (railSpec.wearMaterial) {
            // 轨顶磨耗亮钢带（宽 48 mm，微高出 2 mm，阳光下形成清晰双轨反光线条）
            const wAcc = new StripAccum();
            const topY = railFootLift + railSpec.h + 0.002;
            const sArr = slice.map((st) => st.s);
            wAcc.AddBand(
              slice.map((st) => [st.x + st.nx * (off - 0.024), st.y + topY, st.z + st.nz * (off - 0.024)]),
              slice.map((st) => [st.x + st.nx * (off + 0.024), st.y + topY, st.z + st.nz * (off + 0.024)]),
              sArr, railSpec.tile, [0, 1, 0]);
            target.Add(railSpec.wearMaterial, wAcc.Build());
          }
          stats.railSegs += 1;
        }
        // 每 10 m 轨节鱼尾板接头（Fishplate_Joint）
        if (fishplateSpotsOut && railSpec.jointSpacing > 0) {
          for (let sj = a + railSpec.jointSpacing * 0.5; sj < b - 1.5; sj += railSpec.jointSpacing) {
            const pj = path.At(sj);
            if (inRegion && !inRegion(pj.x, pj.z)) continue;
            const nx = pj.tz, nz = -pj.tx;
            fishplateSpotsOut.push({
              x: pj.x + nx * off, y: crownAt(sj) + railFootLift, z: pj.z + nz * off,
              ry: Math.atan2(-pj.tz, pj.tx), pitch: PitchAt(sj),
            });
            stats.joints += 1;
          }
        }
      }
    }
  } else {
    for (const side of [-1, 1]) {
      for (const [a, b] of railRuns) {
        const nSeg = Math.max(1, Math.round((b - a) / railSpec.segLen));
        const segL = (b - a) / nSeg;
        for (let k = 0; k < nSeg; k += 1) {
          const s0 = a + segL * k, s1 = s0 + segL;
          const pm = path.At((s0 + s1) / 2);
          if (inRegion && !inRegion(pm.x, pm.z)) continue;
          const off = (side * gauge) / 2;
          const p0 = path.At(s0), p1 = path.At(s1);
          const ax = p0.x + p0.tz * off, az = p0.z - p0.tx * off;
          const bx = p1.x + p1.tz * off, bz = p1.z - p1.tx * off;
          const y0 = crownAt(s0), y1 = crownAt(s1);
          const len = Math.hypot(bx - ax, y1 - y0, bz - az);
          const ry = Math.atan2(-(bz - az), bx - ax);
          const pitch = Math.atan2(y1 - y0, Math.hypot(bx - ax, bz - az) || 1);
          sinkFor(pm.x, pm.z).Add(railSpec.material, PlaceGeometry(
            MakeBox(len * 1.01, railSpec.h, railSpec.w, railSpec.tile,
              `${seed}:r${side}:${Math.round(s0)}`),
            { x: (ax + bx) / 2, y: (y0 + y1) * 0.5 + railSpec.lift,
              z: (az + bz) / 2, ry, rz: pitch }));
          stats.railSegs += 1;
        }
      }
    }
  }
  return stats;
}
