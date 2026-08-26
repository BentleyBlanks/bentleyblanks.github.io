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
import { MakeRoadPath, GapsToRuns, SampleRun, PredicateGaps } from "./Script_RoadPath.mjs";

export { MakeRoadPath, GapsToRuns, SampleRun, PredicateGaps };

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
// 轨面高程剖面
// ---------------------------------------------------------------------------

/**
 * 轨面高程：地面（可另取旁侧采样点避开垫地）→ 箱式平滑 → 抬 lift → 对本地
 * 地面夹持。铁路的顶面必须比地面平顺（坡度 ≲2%），直接逐点贴地会得到
 * 过山车 —— 这正是车站那条 0.46 m 低路基的做法，收拢成可复用的剖面。
 */
export function MakeCrownProfile(path, {
  groundAt, step = 4, smooth = 0, lift = 0, clampLo = null, clampHi = null, probeOffset = 0,
}) {
  const n = Math.max(2, Math.round(path.length / step) + 1);
  const stride = path.length / (n - 1);
  const local = new Float64Array(n);
  const base = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = path.At(i * stride);
    local[i] = groundAt(p.x, p.z);
    base[i] = probeOffset
      ? Math.max(local[i], groundAt(p.x + p.tz * probeOffset, p.z - p.tx * probeOffset))
      : local[i];
  }
  const Idx = (s) => Math.min(n - 1, Math.max(0, Math.round(s / stride)));
  const SmoothAt = (i) => {
    if (!smooth) return base[i];
    let sum = 0, cnt = 0;
    for (let k = -smooth; k <= smooth; k += 1) {
      sum += base[Math.min(n - 1, Math.max(0, i + k))];
      cnt += 1;
    }
    return sum / cnt;
  };
  return {
    At: (s) => {
      const i = Idx(s);
      let crownY = SmoothAt(i) + lift;
      if (clampLo != null) crownY = Math.max(crownY, local[i] + clampLo);
      if (clampHi != null) crownY = Math.min(crownY, local[i] + clampHi);
      return crownY;
    },
    LocalAt: (s) => local[Idx(s)],
  };
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
 *     人沿可见的坡一级级走上去，不是坡脚一堵隐形墙）—— 高堤（1.35 m）用
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
      return {
        s: sm.s, x: sm.x, z: sm.z, nx, nz,
        TL: [sm.x + nx * topHalf, crownY, sm.z + nz * topHalf],
        TR: [sm.x - nx * topHalf, crownY, sm.z - nz * topHalf],
        BL: [lbx, groundAt(lbx, lbz) - embed, lbz],
        BR: [rbx, groundAt(rbx, rbz) - embed, rbz],
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
      acc.AddBand(slice.map((r) => r.TL), slice.map((r) => r.TR), sArr, tile, [0, 1, 0]);
      acc.AddBand(slice.map((r) => r.BL), slice.map((r) => r.TL), sArr, tile,
        [mid.nx, 0.4, mid.nz]);
      acc.AddBand(slice.map((r) => r.TR), slice.map((r) => r.BR), sArr, tile,
        [-mid.nx, 0.4, -mid.nz]);
      const target = sinkFor ? sinkFor(mid.x, mid.z) : sink;
      if (sectorKey) target.SetSector(sectorKey(mid.x, mid.z));
      target.Add(material, acc.Build());
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
// 轨道
// ---------------------------------------------------------------------------

/**
 * 枕木 + 双轨。枕木在道口断开（sleeperGaps），钢轨默认**连续**（真实道口
 * 钢轨照旧连着，轨顶高出土面那 0.14 m 正是乡道道口的样子）；要在桥上断开
 * 就把桥段传进 railGaps。钢轨按弦分节（segLen），弯道上节间以 1% 富余互搭。
 *
 * @param sinkFor (x,z)=>sink：近/远表与分区路由。构件拿到就 Add，脏分区由调用方复位。
 */
export function BuildRailTrack({
  path, crownAt, gauge = 1.435, sleeperGaps = [], railGaps = [],
  sinkFor, inRegion = null, seed = "track",
  sleeper = {}, rail = {}, spacingAt = null,
}) {
  const rnd = Mulberry32(HashString(String(seed)));
  const tie = {
    along: 0.24, h: 0.16, length: 2.5, lift: 0.08, material: "SleeperWood",
    jitter: 0.06, ryJitter: 0, spacing: 0.9, tile: TILE_METERS.wood, ...sleeper,
  };
  const railSpec = {
    w: 0.12, h: 0.15, lift: 0.23, segLen: 12, material: "RailSteel",
    tile: TILE_METERS.steel, ...rail,
  };
  const InGap = (gaps, s) => gaps.some(([g0, g1]) => s > g0 && s < g1);
  const stats = { ties: 0, railSegs: 0 };

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
        sinkFor(p.x, p.z).Add(tie.material, PlaceGeometry(
          MakeBox(tie.along, tie.h, tie.length, tie.tile, `${seed}:tie${i}`),
          { x: p.x + nx * wob, y: crownAt(s) + tie.lift, z: p.z + nz * wob, ry }));
        stats.ties += 1;
      }
    }
    s += spacing;
    i += 1;
  }

  for (const side of [-1, 1]) {
    for (const [a, b] of GapsToRuns(path.length, railGaps)) {
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
        const len = Math.hypot(bx - ax, bz - az);
        const ry = Math.atan2(-(bz - az), bx - ax);
        sinkFor(pm.x, pm.z).Add(railSpec.material, PlaceGeometry(
          MakeBox(len * 1.01, railSpec.h, railSpec.w, railSpec.tile,
            `${seed}:r${side}:${Math.round(s0)}`),
          { x: (ax + bx) / 2, y: crownAt((s0 + s1) / 2) + railSpec.lift,
            z: (az + bz) / 2, ry }));
        stats.railSegs += 1;
      }
    }
  }
  return stats;
}
