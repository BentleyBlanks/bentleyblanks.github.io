// 道路中心线：向心 Catmull-Rom 样条 + 等弧长采样。**纯数学，不 import three** ——
// 这样纯 Node 的回归（Script_RoadPathTest）不用起浏览器就能逐数验它。
//
// ## 为什么是样条而不是折线
// 旧的六份道路代码全是「轴对齐线段 / 折线逐段矩形」：拐角处两段独立矩形靠
// 1.06 的长度富余互相叠住，实拍就是一个 V 形缝或一块双层重影（L1 大车路的
// 每个拐点都有）。样条把整条路变成一条连续曲线，按弧长采样后相邻截面共享
// 顶点，拐角自然斜接，一条路就是一张连续的网格。
//
// ## 口径
//   · 控制点 [[x,z],...] 与旧数据完全同形 —— OUTFIELD_SCENES.roads 的 points
//     不用改一个字，直街（两点）退化为直线，逐位与旧走向一致。
//   · 向心参数化（alpha=0.5）：均匀 CR 在控制点距离悬殊时会打圈、过冲，
//     向心版没有这毛病（这是选它当默认的唯一原因，不是玄学）。
//   · 曲线内部用「每段 subdivisions 份的密集折线」近似：建路是 4 m 一个截面，
//     每段 16 份的弦差远小于路宽的百分之一，够用；换积分求精确弧长纯属浪费。
//
// ## 缺口（道口/桥）→ 连续段
// 沿用 Script_Landmark_Station 用血换来的写法：**先把缺口从整条线上挖掉再
// 细分**。「段心落在缺口里就跳过」会在缺口两侧留下半段长的豁口（豁口宽度
// 取决于段长而不是缺口宽度）。缺口一律用弧长 s 表示；世界坐标的缺口
// （道口在 z=c）由调用方用 ClosestS 换算。

const EPS = 1e-9;

/** 向心 Catmull-Rom（Barry-Goldman 金字塔），u∈[0,1] 落在 p1→p2 上。 */
function CatmullRomPoint(p0, p1, p2, p3, u, alpha) {
  const Knot = (a, b, prev) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return prev + Math.max(Math.pow(d, alpha), 1e-4);
  };
  const t0 = 0;
  const t1 = Knot(p0, p1, t0);
  const t2 = Knot(p1, p2, t1);
  const t3 = Knot(p2, p3, t2);
  const t = t1 + (t2 - t1) * u;
  const Lerp = (a, b, ta, tb) => {
    const w = tb - ta < EPS ? 0 : (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = Lerp(p0, p1, t0, t1);
  const a2 = Lerp(p1, p2, t1, t2);
  const a3 = Lerp(p2, p3, t2, t3);
  const b1 = Lerp(a1, a2, t0, t2);
  const b2 = Lerp(a2, a3, t1, t3);
  return Lerp(b1, b2, t1, t2);
}

/**
 * 建一条中心线。
 * @param {Array<[number,number]>} points 控制点（世界 xz），≥2；相邻重复点自动剔除
 * @returns {{ length, points, At(s), Dense(step), ClosestS(x,z) }}
 *   At(s) → { x, z, tx, tz }（tx/tz 是单位切向）
 */
export function MakeRoadPath(points, { alpha = 0.5, subdivisions = 16 } = {}) {
  const src = [];
  for (const p of points || []) {
    const last = src[src.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPS) src.push([p[0], p[1]]);
  }
  if (src.length < 2) throw new Error("RoadPath 至少要两个不重合的控制点");

  // 端点外插一个镜像控制点（线性外推）：端段的切向就是端段自己的走向，
  // 直街（两点）因此逐位退化为直线。
  const first = [2 * src[0][0] - src[1][0], 2 * src[0][1] - src[1][1]];
  const lastIdx = src.length - 1;
  const last = [2 * src[lastIdx][0] - src[lastIdx - 1][0], 2 * src[lastIdx][1] - src[lastIdx - 1][1]];
  const ctrl = [first, ...src, last];

  // 密集折线 + 弧长表
  const xs = [src[0][0]];
  const zs = [src[0][1]];
  const ss = [0];
  for (let i = 0; i < src.length - 1; i += 1) {
    const p0 = ctrl[i], p1 = ctrl[i + 1], p2 = ctrl[i + 2], p3 = ctrl[i + 3];
    for (let k = 1; k <= subdivisions; k += 1) {
      const [x, z] = CatmullRomPoint(p0, p1, p2, p3, k / subdivisions, alpha);
      const px = xs[xs.length - 1], pz = zs[zs.length - 1];
      const d = Math.hypot(x - px, z - pz);
      if (d < EPS) continue;
      xs.push(x); zs.push(z);
      ss.push(ss[ss.length - 1] + d);
    }
  }
  const length = ss[ss.length - 1];

  const IndexOf = (s) => {
    // 二分找 s 落在哪一小段（ss[i] <= s <= ss[i+1]）
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ss[mid] <= s) lo = mid; else hi = mid;
    }
    return lo;
  };

  const At = (s) => {
    const c = Math.min(Math.max(s, 0), length);
    const i = Math.min(IndexOf(c), ss.length - 2);
    const seg = ss[i + 1] - ss[i] || 1;
    const w = (c - ss[i]) / seg;
    const dx = xs[i + 1] - xs[i], dz = zs[i + 1] - zs[i];
    const dl = Math.hypot(dx, dz) || 1;
    return {
      x: xs[i] + dx * w, z: zs[i] + dz * w,
      tx: dx / dl, tz: dz / dl,
    };
  };

  /** 给 Blocked()/编辑器用的近似折线（[[x,z],...]），step 米一个点。 */
  const Dense = (step = 8) => {
    const n = Math.max(1, Math.round(length / step));
    const out = [];
    for (let i = 0; i <= n; i += 1) {
      const p = At((length * i) / n);
      out.push([p.x, p.z]);
    }
    return out;
  };

  /** 最近点的弧长（粗筛密集表，再在邻段上投影细化）。 */
  const ClosestS = (x, z) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < xs.length; i += 1) {
      const d = (x - xs[i]) * (x - xs[i]) + (z - zs[i]) * (z - zs[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    let best = ss[bi], bestD = Math.sqrt(bd);
    for (const i of [bi - 1, bi]) {
      if (i < 0 || i >= xs.length - 1) continue;
      const dx = xs[i + 1] - xs[i], dz = zs[i + 1] - zs[i];
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - xs[i]) * dx + (z - zs[i]) * dz) / len2));
      const px = xs[i] + dx * t, pz = zs[i] + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestD) { bestD = d; best = ss[i] + Math.sqrt(len2) * t; }
    }
    return best;
  };

  return { points: src, length, At, Dense, ClosestS };
}

/**
 * 把弧长缺口从整条线上挖掉，返回连续段 [[s0,s1],...]。
 * 缺口越界自动截到 [0,length]，互相重叠自动合并；空段（<0.5 m）丢弃。
 */
export function GapsToRuns(length, gaps = []) {
  const clipped = [];
  for (const [a, b] of gaps) {
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(length, Math.max(a, b));
    if (hi > lo) clipped.push([lo, hi]);
  }
  clipped.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const g of clipped) {
    const last = merged[merged.length - 1];
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
    else merged.push([g[0], g[1]]);
  }
  const runs = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a - cursor > 0.5) runs.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (length - cursor > 0.5) runs.push([cursor, length]);
  return runs;
}

/**
 * 一段连续段的等弧长采样。段数按总长整除，**不许留下除不尽的尾巴**
 * （AddBank 的老账：尾巴留 3 m 就是每 52 m 一个洞）。
 * @returns [{ x, z, tx, tz, s }]，首尾都含
 */
export function SampleRun(path, s0, s1, step) {
  const span = s1 - s0;
  const n = Math.max(1, Math.round(span / step));
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const s = s0 + (span * i) / n;
    out.push({ ...path.At(s), s });
  }
  return out;
}

/**
 * 按谓词沿线扫出缺口：where 为真的连续段（各向外扩 margin）变成 [[s0,s1],...]。
 * 道路的**自动断水**用它 —— 路面碰到护城河/河槽就断开，而不是把裙边垂进水里。
 * where(x, z, tx, tz) 拿得到切向，调用方可以据此把「路肩两侧的点」也一并判掉
 * （濠岸是斜线时，中心还在岸上、路肩已经悬在水上）。
 */
export function PredicateGaps(path, where, { step = 4, margin = step } = {}) {
  const n = Math.max(1, Math.round(path.length / step));
  const gaps = [];
  let open = null;
  let last = 0;
  for (let i = 0; i <= n; i += 1) {
    const s = (path.length * i) / n;
    const p = path.At(s);
    if (where(p.x, p.z, p.tx, p.tz)) {
      if (open == null) open = s;
      last = s;
    } else if (open != null) {
      gaps.push([open - margin, last + margin]);
      open = null;
    }
  }
  if (open != null) gaps.push([open - margin, path.length]);
  return gaps;
}

/**
 * 1938 津浦铁路 41 kg/m 扁底钢轨（Vignoles）标准断面（纯数学，单位米）：
 * 坐标为 [横向偏移 lat, 轨底起高度 y]，顺时针/闭合用于沿样条扫掠。
 * 轨底宽 126 mm、轨腰厚 20 mm、轨头宽 66 mm、全高 140 mm；
 * 标准轨距内缘 1.435 m ⇒ 两轨中心距 = 1.435 + 0.065 = 1.500 m（中心偏移 ±0.750 m）。
 */
export const VIGNOLES_RAIL_PROFILE = Object.freeze([
  Object.freeze([-0.063, 0.000]),
  Object.freeze([+0.063, 0.000]),
  Object.freeze([+0.063, 0.014]),
  Object.freeze([+0.011, 0.032]),
  Object.freeze([+0.011, 0.098]),
  Object.freeze([+0.033, 0.112]),
  Object.freeze([+0.033, 0.134]),
  Object.freeze([+0.025, 0.140]),
  Object.freeze([-0.025, 0.140]),
  Object.freeze([-0.033, 0.134]),
  Object.freeze([-0.033, 0.112]),
  Object.freeze([-0.011, 0.098]),
  Object.freeze([-0.011, 0.032]),
  Object.freeze([-0.063, 0.014]),
]);

/**
 * 折线高程锚点 + 竖曲线圆角（真实铁路坡度平顺过渡，无过冲、无锯齿）。
 * @param {Array<[number,number]>} anchors 已按弧长 s 递增的 [[s, y], ...]
 * @param {number} s 弧长（米）
 * @param {number} filletM 变坡点两侧各半圆角长度（米）
 */
function EvalAnchoredElevation(anchors, s, filletM = 20) {
  if (!anchors || !anchors.length) return 0;
  if (anchors.length === 1 || s <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (s >= last[0]) return last[1];
  // 先求所在折线段
  let idx = 0;
  while (idx < anchors.length - 2 && anchors[idx + 1][0] < s) idx += 1;
  const Linear = (pos) => {
    if (pos <= anchors[0][0]) return anchors[0][1];
    if (pos >= last[0]) return last[1];
    let k = 0;
    while (k < anchors.length - 2 && anchors[k + 1][0] < pos) k += 1;
    const [s0, y0] = anchors[k], [s1, y1] = anchors[k + 1];
    const span = Math.max(1e-6, s1 - s0);
    return y0 + ((y1 - y0) * (pos - s0)) / span;
  };
  if (!(filletM > 0)) return Linear(s);
  // 用 ±filletM 五点对称平滑核消除变坡折角，单调保形且不过冲
  const r = filletM;
  return (
    Linear(s - r) * 0.12
    + Linear(s - r * 0.5) * 0.22
    + Linear(s) * 0.32
    + Linear(s + r * 0.5) * 0.22
    + Linear(s + r) * 0.12
  );
}

/**
 * 轨面高程：支持两条模式——
 *   1) 贴地平滑模式（默认，兼容历史调用）：地面（可另取旁侧采样点避开垫地）→ 箱式平滑 → 抬 lift → 对本地地面夹持；
 *   2) 工程锚点纵断面模式（anchors）：给定 [[s, y], ...]（或 { z, y } 按样条换算弧长），按铁路竖曲线平滑放坡，
 *      再施加可选 clampLo / clampHi 保证道砟始终高出地面。
 * 站间采用线性插值，消除 4 m 采样步进造成的枕木/钢轨微台阶；任意 s 仍严格满足 [clampLo, clampHi] 凸性夹持。
 */
export function MakeCrownProfile(path, {
  groundAt, step = 4, smooth = 0, lift = 0, clampLo = null, clampHi = null, probeOffset = 0,
  anchors = null, filletM = 20,
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
  let resolvedAnchors = null;
  if (Array.isArray(anchors) && anchors.length) {
    resolvedAnchors = anchors.map((entry) => {
      if (Array.isArray(entry)) return [entry[0], entry[1]];
      if (Number.isFinite(entry.s)) return [entry.s, entry.y];
      if (Number.isFinite(entry.z)) {
        const sVal = Number.isFinite(entry.x) ? path.ClosestS(entry.x, entry.z) : SAtZ(path, entry.z);
        return [sVal, entry.y];
      }
      return [0, entry.y ?? 0];
    }).sort((a, b) => a[0] - b[0]);
  }
  const crown = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let crownY;
    if (resolvedAnchors) {
      crownY = EvalAnchoredElevation(resolvedAnchors, i * stride, filletM) + lift;
    } else if (!smooth) {
      crownY = base[i] + lift;
    } else {
      let sum = 0, cnt = 0;
      for (let k = -smooth; k <= smooth; k += 1) {
        sum += base[Math.min(n - 1, Math.max(0, i + k))];
        cnt += 1;
      }
      crownY = sum / cnt + lift;
    }
    if (clampLo != null) crownY = Math.max(crownY, local[i] + clampLo);
    if (clampHi != null) crownY = Math.min(crownY, local[i] + clampHi);
    crown[i] = crownY;
  }
  const SampleArray = (arr, s) => {
    const clamped = Math.min(Math.max(s, 0), path.length);
    const f = clamped / stride;
    const i0 = Math.min(n - 1, Math.max(0, Math.floor(f)));
    const i1 = Math.min(n - 1, i0 + 1);
    const t = f - i0;
    return arr[i0] * (1 - t) + arr[i1] * t;
  };
  return {
    At: (s) => SampleArray(crown, s),
    LocalAt: (s) => SampleArray(local, s),
    SlopeAt: (s) => {
      const ds = Math.min(2, path.length * 0.1) || 1;
      const s0 = Math.max(0, s - ds), s1 = Math.min(path.length, s + ds);
      return s1 > s0 ? (SampleArray(crown, s1) - SampleArray(crown, s0)) / (s1 - s0) : 0;
    },
  };
}

/** 在弯曲样条上精确反查世界坐标 z 对应的弧长 s（线性插值过零，无穿越时取最近点）。 */
export function SAtZ(path, targetZ) {
  const n = Math.max(64, Math.ceil(path.length / 4));
  let prevS = 0;
  let prevZ = path.At(0).z;
  let bestS = 0;
  let bestErr = Math.abs(prevZ - targetZ);
  for (let i = 1; i <= n; i += 1) {
    const s = (path.length * i) / n;
    const z = path.At(s).z;
    const err = Math.abs(z - targetZ);
    if (err < bestErr) { bestErr = err; bestS = s; }
    if ((prevZ <= targetZ && z >= targetZ) || (prevZ >= targetZ && z <= targetZ)) {
      const dz = z - prevZ;
      return Math.abs(dz) > 1e-9 ? prevS + ((targetZ - prevZ) / dz) * (s - prevS) : prevS;
    }
    prevS = s;
    prevZ = z;
  }
  return bestS;
}

/** 将世界 z 区间 [[z0,z1],...] 或弧长区间 [[s0,s1],...] 统一折算为弧长缺口。 */
export function ResolveRailwayGaps(path, gaps = [], zGaps = []) {
  const out = [];
  for (const g of gaps || []) if (Array.isArray(g) && g.length >= 2) out.push([g[0], g[1]]);
  for (const g of zGaps || []) {
    if (!Array.isArray(g) || g.length < 2) continue;
    const s0 = SAtZ(path, g[0]);
    const s1 = SAtZ(path, g[1]);
    out.push([Math.min(s0, s1), Math.max(s0, s1)]);
  }
  return out;
}

/**
 * 数据驱动铁路的纵断面：中心线 + 道砟顶（上面那份 MakeCrownProfile）+ 轨顶。
 * spec 是 Data_* 或场景 ways.railways 里的纯数据（形状见 Data_FirstLevelMissionLayout.MISSION_RAILWAY）。
 * 建几何的 Script_RoadSpline.BuildRailwayFromSpec、Encounter 编辑器 2D/3D 渲染与布局查询共用同一份剖面。
 */
export function MakeRailwayProfile(spec, groundAt) {
  const path = MakeRoadPath(spec.points);
  const crown = MakeCrownProfile(path, { groundAt, ...(spec.crown || {}) });
  const rail = spec.rail || { lift: 0.16, h: 0.14 };
  const railTopLift = (rail.footLift != null ? rail.footLift + (rail.h ?? 0.14) : rail.lift + (rail.h ?? 0.14) / 2);
  return {
    path,
    CrownAt: crown.At,
    LocalAt: crown.LocalAt,
    SlopeAt: crown.SlopeAt,
    RailTopAt: (s) => crown.At(s) + railTopLift,
    RailTopNear: (x, z) => crown.At(path.ClosestS(x, z)) + railTopLift,
    bedGaps: ResolveRailwayGaps(path, spec.bed?.gaps, spec.bed?.zGaps ?? spec.zGaps),
    sleeperGaps: ResolveRailwayGaps(path, spec.sleeperGaps, spec.sleeperZGaps ?? spec.zGaps),
    railGaps: ResolveRailwayGaps(path, spec.railGaps, spec.railZGaps ?? spec.zGaps),
  };
}

/** 点到折线（[[x,z],...]）的最近距离。原散落四份的实现收拢到这里。 */
export function DistanceToPolyline(x, z, points) {
  let best = 1e9;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / len2));
    const d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
    if (d < best) best = d;
  }
  return best;
}
