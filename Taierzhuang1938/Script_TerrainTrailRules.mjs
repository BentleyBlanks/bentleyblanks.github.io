// 《台儿庄：血战滕县》地面脚印与痕迹的规则层。纯 Node 可跑、零 three（项目契约 2）。
//
// 口径：docs/Data_TerrainTrails.md。数值：Data_Tuning_TerrainTrails.mjs。
// GPU 那一侧（痕迹靶、印章绘制、地形着色）在 Script_TerrainTrails.mjs，只调这里的函数：
//   · BuildStampAtlas         程序生成鞋底 / 膝盖 / 拖痕印章图集（RGBA8：R 坑深 G 泥边 B 踩乱）
//   · MakeStamp               一次落脚 → 一个印章（世界位置、朝向、四边形尺寸、强度）
//   · WindowIndex / ExposedRanges / TexelRects
//                             环形（toroidal）窗口：窗口按整纹素滑动，只清新露出来的条带
//   · StampCopies             印章跨过靶边时要在对边再画一份（取模寻址）
//   · TrailHistory            CPU 印章历史（环形），窗口滑回来时按当下强度回填
//   · DecayClock              整张靶按通道线性减淡：攒够 1/255 才减一次
//   · FootContact             动画脚骨 → 落脚事件（离地高度 + 水平速度的迟滞判定）
//   · StrideEmitter           第一人称按步距交替左右脚
//
// 坐标：世界 X 向东、Z 向南。纹素下标 i 覆盖世界 [i·texel, (i+1)·texel)；靶上的像素 = i mod size。
// 印章图集画的是**右脚**：u 从内侧（−x，大脚趾那边）到外侧（+x），v 从脚跟（0）到脚尖（1）。

import {
  TERRAIN_TRAIL_STAMPS, TERRAIN_TRAIL_ATLAS, TERRAIN_TRAIL_CONTACT,
} from "./Data_Tuning_TerrainTrails.mjs";

// ===========================================================================
// 一、印章图集
// ===========================================================================

// 确定性值噪声（不许 Math.random：图集每次开机都要逐字节相同，测试才比得了）。
function Hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ValueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = Hash2(ix, iy, seed), b = Hash2(ix + 1, iy, seed);
  const c = Hash2(ix, iy + 1, seed), d = Hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (a, b, v) => { const t = Clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const Gauss = (v, c, s) => Math.exp(-(((v - c) / s) ** 2));

// 分段线性 + smoothstep 的轮廓插值：pts = [[t, value], ...]，t 升序。
function Profile(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      const k = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k * k * (3 - 2 * k);
    }
  }
  return pts[pts.length - 1][1];
}

// 鞋底轮廓（右脚，半宽占整宽一半的比例）。外侧（+x）直一些，内侧（−x）在足弓处收进去。
// rigid = 硬底鞋：足弓不收（印子是鞋底的形状，不是脚的形状）。
const SOLE_LATERAL = [[0, 0.5], [0.1, 0.8], [0.25, 0.82], [0.45, 0.84], [0.65, 0.97], [0.76, 0.93], [0.9, 0.72], [1, 0.3]];
const SOLE_MEDIAL = [[0, 0.5], [0.1, 0.8], [0.25, 0.76], [0.45, 0.58], [0.62, 0.95], [0.72, 1], [0.86, 0.94], [0.96, 0.62], [1, 0.25]];
const SOLE_MEDIAL_RIGID = [[0, 0.5], [0.1, 0.82], [0.25, 0.8], [0.45, 0.74], [0.62, 0.95], [0.72, 1], [0.86, 0.94], [0.96, 0.62], [1, 0.25]];
const SANDAL = [[0, 0.55], [0.1, 0.84], [0.3, 0.86], [0.5, 0.84], [0.7, 0.92], [0.85, 0.9], [0.96, 0.68], [1, 0.35]];

/**
 * 鞋底的近似有符号距离（米，里面为负）。t = 沿长 0..1（脚跟 → 脚尖），x = 横向米。
 * 两端各有一段椭圆收口（脚跟、脚尖是圆的，不许出平头）：收口段里半宽按椭圆缩到 0。
 */
const HEEL_CAP = 0.16, TOE_CAP = 0.2;
function SoleDistance(x, t, L, W, lateral, medial) {
  const pts = x >= 0 ? lateral : medial;
  let hw;
  if (t <= HEEL_CAP) {
    const k = Math.max(0, 1 - ((HEEL_CAP - t) / HEEL_CAP) ** 2);
    hw = 0.5 * W * Profile(pts, HEEL_CAP) * Math.sqrt(k);
  } else if (t >= 1 - TOE_CAP) {
    const k = Math.max(0, 1 - ((t - (1 - TOE_CAP)) / TOE_CAP) ** 2);
    hw = 0.5 * W * Profile(pts, 1 - TOE_CAP) * Math.sqrt(k);
  } else {
    hw = 0.5 * W * Profile(pts, t);
  }
  const dx = Math.abs(x) - hw;
  // 收口段的横向距离在端点附近会低估（椭圆两头陡），纵向再给一个保底
  const dEnds = Math.max(-t * L, (t - 1) * L);
  if (dx <= 0 && dEnds <= 0) return Math.max(dx, dEnds);
  return Math.hypot(Math.max(dx, 0), Math.max(dEnds, 0));
}

// 露趾草鞋前沿的五个趾头：[沿长 t, 横向 x/W, 半径 m]，大脚趾在内侧（−x），趾头压在草鞋前沿上、略探出去。
const TOES = [[0.985, -0.2, 0.0135], [1.0, 0.02, 0.009], [0.99, 0.18, 0.0082], [0.965, 0.32, 0.0076], [0.93, 0.43, 0.007]];

/**
 * 一格印章。返回 [坑深, 泥边, 踩乱]（0..1）。
 * (xn, tn)：格子里的归一化坐标（x 以鞋宽为 1、t 以鞋长为 1，脚跟 0 脚尖 1，含四周留白）。
 */
const CELL_SHAPES = {
  // 草鞋 / 布鞋 / 皮靴共用鞋底骨架，鞋纹与压力分布各不相同。
  straw: (x, t, L, W, seed) => Sole("straw", x, t, L, W, seed),
  cloth: (x, t, L, W, seed) => Sole("cloth", x, t, L, W, seed),
  boot: (x, t, L, W, seed) => Sole("boot", x, t, L, W, seed),
  knee: (x, t, L, W, seed) => Oval(x, t, L, W, seed, 0.7, 0.9),
  hand: (x, t, L, W, seed) => Hand(x, t, L, W, seed),
  drag: (x, t, L, W, seed) => Drag(x, t, L, W, seed),
  scuff: (x, t, L, W, seed) => Scuff(x, t, L, W, seed),
  tread: (x, t, L, W, seed) => Tread(x, t, L, W, seed),
};

function Sole(kind, xn, t, L, W, seed) {
  const x = xn * W, y = t * L;
  const rigid = kind !== "straw";
  let d = SoleDistance(x, t, L, W, kind === "straw" ? SANDAL : SOLE_LATERAL,
    kind === "straw" ? SANDAL : rigid ? SOLE_MEDIAL_RIGID : SOLE_MEDIAL);
  // 压力：脚跟与前掌深，足弓浅；硬底鞋把重量摊得更匀。
  const base = kind === "boot" ? 0.8 : kind === "cloth" ? 0.72 : 0.6;
  let press = Math.max(base, Gauss(t, 0.15, 0.13), 0.95 * Gauss(t, 0.7, 0.15), 0.8 * Gauss(t, 0.93, 0.07));
  const wall = kind === "cloth" ? 0.011 : 0.008;
  let dep = press * Smooth(0, wall, -d);
  // 鞋纹
  if (kind === "straw") {
    // 编绳：沿长每 1.1 cm 一道横纹（绳子处更浅），中间两道纵绳
    const weave = 0.5 + 0.5 * Math.cos((2 * Math.PI * y) / 0.011 + 1.3 * ValueNoise(x * 90, y * 20, seed));
    const cords = Gauss(Math.abs(x), 0.017, 0.0045);
    dep *= (0.8 + 0.2 * weave) * (1 - 0.2 * cords);
    // 趾头：并进轮廓（泥边要绕过它们）
    for (const [tt, xx, r] of TOES) {
      const dt = Math.hypot(x - xx * W, y - tt * L) - r;
      if (dt < d) d = dt;
      dep = Math.max(dep, 0.72 * Smooth(0, 0.005, -dt) * (1 - 0.35 * Clamp01((tt - 1) / 0.06)));
    }
  } else if (kind === "cloth") {
    // 纳底针脚：0.9 cm 的点阵，一粒粒更深
    const gx = (x / 0.009) - Math.round(x / 0.009), gy = (y / 0.009) - Math.round(y / 0.009);
    const stitch = Gauss(Math.hypot(gx, gy), 0, 0.22);
    dep *= 0.94 + 0.07 * stitch * Smooth(0.004, 0.012, -d);
  } else {
    // 皮靴：前掌鞋钉点阵，后跟马蹄铁
    const gx = (x / 0.017) - Math.round(x / 0.017), gy = ((y + 0.004) / 0.017) - Math.round((y + 0.004) / 0.017);
    const nail = Gauss(Math.hypot(gx, gy), 0, 0.2) * Smooth(0.45, 0.52, t) * Smooth(0.006, 0.012, -d);
    const heelIron = Smooth(0.3, 0.26, t) * Gauss(-d, 0.006, 0.0028);
    // 鞋跟与前掌之间的腰窝（皮靴后跟是一块单独的跟）：那一段悬空，只有很浅一层
    const waist = Smooth(0.3, 0.34, t) * Smooth(0.5, 0.45, t);
    // 整体先压到 0.78：鞋钉与马蹄铁是往下多顶出来的那一点，顶到 1 就被钳掉、读不出来了
    dep *= 0.74 * (1 - 0.55 * waist) * (1 + 0.36 * nail + 0.22 * heelIron);
  }
  // 泥边：鞋底外沿被挤起的一圈，脚尖那头（蹬地）更高；噪声打散
  const breakup = 0.7 + 0.3 * ValueNoise(x * 140, y * 140, seed + 7);
  const rimScale = (kind === "boot" ? 1.1 : 1) * (0.65 + 0.5 * Clamp01(t));
  const rim = Gauss(d, 0.0065, 0.0065) * Smooth(-0.003, 0.002, d) * rimScale * breakup;
  // 踩乱：鞋底整片 + 外面一圈土被带乱
  const halo = Math.exp(-((Math.max(d, 0) / 0.02) ** 2)) * (0.55 + 0.45 * ValueNoise(x * 60, y * 60, seed + 13));
  const dist = Math.max(Smooth(0.002, -0.004, d), halo * 0.85);
  return [Clamp01(dep), Clamp01(rim), Clamp01(dist)];
}

function Oval(xn, t, L, W, seed, depth, rimAmp) {
  const x = xn * W, y = (t - 0.5) * L;
  const r = Math.hypot(x / (0.5 * W), y / (0.5 * L));
  const d = (r - 1) * 0.5 * Math.min(W, L);
  const dep = depth * Math.pow(Clamp01(1 - r * r), 0.6) * (0.9 + 0.1 * ValueNoise(x * 120, y * 120, seed));
  const rim = rimAmp * Gauss(d, 0.006, 0.006) * Smooth(-0.003, 0.002, d) * (0.7 + 0.3 * ValueNoise(x * 150, y * 150, seed + 3));
  const dist = Math.max(Smooth(0.004, -0.006, d), 0.8 * Math.exp(-((Math.max(d, 0) / 0.018) ** 2)));
  return [Clamp01(dep), Clamp01(rim), Clamp01(dist)];
}

function Hand(xn, t, L, W, seed) {
  // 掌根（后）更深，前面四个指头的浅凹
  const [dep0, rim0, dist0] = Oval(xn, t * 1.25 - 0.12, L * 0.8, W, seed, 0.75, 0.6);
  let dep = dep0, dist = dist0;
  const x = xn * W, y = t * L;
  for (let i = 0; i < 4; i++) {
    const fx = (-0.3 + i * 0.2) * W, fy = (0.86 + (i === 1 || i === 2 ? 0.06 : 0)) * L;
    const df = Math.hypot((x - fx) / 0.4, y - fy) - 0.012;
    dep = Math.max(dep, 0.45 * Smooth(0, 0.006, -df));
    dist = Math.max(dist, 0.7 * Smooth(0.01, -0.004, df));
  }
  return [Clamp01(dep), rim0, Clamp01(dist)];
}

function Drag(xn, t, L, W, seed) {
  // 匍匐拖痕：两端淡出的一长条；布料与装具压出的纵向条纹；两侧被推开的泥
  const x = xn * W, y = t * L;
  const ends = Smooth(-0.02, 0.2, t) * Smooth(1.02, 0.8, t);
  const edge = Math.abs(x) - 0.5 * W * (0.9 + 0.1 * ValueNoise(0, y * 12, seed));
  const inside = Smooth(0, 0.03, -edge);
  const stripes = 0.65 + 0.35 * ValueNoise(x * 70, y * 4, seed + 5);
  const dep = 0.55 * inside * stripes * ends;
  const rim = 0.7 * Gauss(edge, 0.012, 0.012) * ends * (0.6 + 0.4 * ValueNoise(x * 90, y * 40, seed + 9));
  const dist = Math.max(inside, 0.8 * Math.exp(-((Math.max(edge, 0) / 0.03) ** 2))) * Smooth(-0.1, 0.12, t) * Smooth(1.1, 0.88, t);
  return [Clamp01(dep), Clamp01(rim), Clamp01(dist)];
}

function Scuff(xn, t, L, W, seed) {
  const x = xn * W, y = (t - 0.5) * L;
  const r = Math.hypot(x / (0.5 * W), y / (0.5 * L));
  const n = ValueNoise(x * 45, y * 45, seed);
  const blob = Smooth(1.05, 0.45, r + 0.35 * (n - 0.5));
  return [0.35 * blob * Smooth(1, 0.2, r), 0.25 * Gauss(r, 0.95, 0.12), Clamp01(blob)];
}

// 履带一段：横向履齿按节距排（以印章中心为相位原点 —— 每走一个 lengthM 盖一段时履齿落在同一套世界格子上），
// 中间导齿那一道浅一些，两侧被挤出的泥。两端各留 6% 的淡出（相邻两段重叠在那里）。
function Tread(xn, t, L, W, seed) {
  const pitch = TERRAIN_TRAIL_STAMPS.tread.pitchM;
  const x = xn * W, y = (t - 0.5) * L;
  const ends = Smooth(-0.06, 0.02, t) * Smooth(1.06, 0.98, t);
  const edge = Math.abs(x) - 0.5 * W;
  const band = Smooth(0.004, -0.01, edge);
  const phase = y / pitch - Math.round(y / pitch);
  const grouser = Gauss(phase, 0, 0.13);
  const guide = Gauss(x, 0, 0.022);
  const dep = band * (0.62 + 0.33 * grouser) * (1 - 0.35 * guide) * (0.94 + 0.06 * ValueNoise(x * 80, y * 30, seed)) * ends;
  const rim = Gauss(edge, 0.016, 0.014) * ends * (0.65 + 0.35 * ValueNoise(x * 60, y * 25, seed + 3));
  const dist = Math.max(band, 0.8 * Math.exp(-((Math.max(edge, 0) / 0.05) ** 2))) * ends;
  return [Clamp01(dep), Clamp01(rim), Clamp01(dist)];
}

/** 每种印章在格子里的留白：印章四边形 = 鞋底尺寸 × pad（泥边、踩乱、趾头都在四边形里）。 */
export const STAMP_PADS = Object.freeze({
  straw: Object.freeze([1.8, 1.36]), cloth: Object.freeze([1.8, 1.3]), boot: Object.freeze([1.8, 1.3]),
  knee: Object.freeze([1.7, 1.7]), hand: Object.freeze([1.7, 1.5]), drag: Object.freeze([1.3, 1.12]),
  scuff: Object.freeze([1.35, 1.35]),
  tread: Object.freeze([1.6, 1.12]),
});

/**
 * 生成印章图集。RGBA8，一行 cells 格，每格 cellW × cellH；R 坑深 G 泥边 B 踩乱 A 0。
 * 每格外圈留 2 px 空白（mip 往下几级时不串格）。数据行 0 = 纹理 v = 0 = 脚跟。
 */
export function BuildStampAtlas({ cellW = TERRAIN_TRAIL_ATLAS.cellW, cellH = TERRAIN_TRAIL_ATLAS.cellH,
  cells = TERRAIN_TRAIL_ATLAS.cells } = {}) {
  const width = cellW * cells, height = cellH;
  const data = new Uint8Array(width * height * 4);
  const border = 2;
  for (const [kind, spec] of Object.entries(TERRAIN_TRAIL_STAMPS)) {
    const shape = CELL_SHAPES[kind];
    const [padW, padL] = STAMP_PADS[kind];
    const L = spec.lengthM, W = spec.widthM;
    for (let py = border; py < cellH - border; py++) {
      const v = (py + 0.5) / cellH;
      const t = (v - 0.5) * padL + 0.5;
      for (let px = border; px < cellW - border; px++) {
        const u = (px + 0.5) / cellW;
        const xn = (u - 0.5) * padW;
        const [r, g, b] = shape(xn, t, L, W, spec.cell * 101 + 17);
        // 格子边上再淡一下：任何形状都不许顶到留白（顶到了就是四边形裁出来的直线）
        const fade = Smooth(border, border + 3, Math.min(px, cellW - 1 - px, py, cellH - 1 - py));
        const i = (py * width + spec.cell * cellW + px) * 4;
        data[i] = Math.round(255 * r * fade);
        data[i + 1] = Math.round(255 * g * fade);
        data[i + 2] = Math.round(255 * b * fade);
      }
    }
  }
  return { width, height, cellW, cellH, cells, data };
}

// ===========================================================================
// 二、印章
// ===========================================================================

/** 鞋按人：日军皮靴、百姓布鞋、川军七成草鞋三成布鞋（按 seed 固定，同一个人一直穿同一双）。 */
export function SoleForKind(kind, seed = "") {
  const k = String(kind || "");
  if (k.startsWith("ija")) return "boot";
  if (k.startsWith("nra")) {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return ((h >>> 0) % 10) < 7 ? "straw" : "cloth";
  }
  return "cloth";
}

/**
 * 一个印章。
 * @param {{x:number,z:number,dirX:number,dirZ:number,kind:string,side?:number,strength:number[],
 *          lengthScale?:number,widthScale?:number}} p
 *   dir = 脚跟 → 脚尖的水平方向（单位向量）；side = +1 右脚 / −1 左脚（左脚镜像）。
 * @returns 印章记录：位置、方向、四边形尺寸（带留白，宽带符号表示镜像）、格号、三通道强度
 */
export function MakeStamp(p) {
  const spec = TERRAIN_TRAIL_STAMPS[p.kind] || TERRAIN_TRAIL_STAMPS.scuff;
  const [padW, padL] = STAMP_PADS[p.kind] || STAMP_PADS.scuff;
  let dx = p.dirX, dz = p.dirZ;
  const n = Math.hypot(dx, dz);
  if (n > 1e-6) { dx /= n; dz /= n; } else { dx = 0; dz = -1; }
  const s = p.strength || [1, 1, 1];
  return {
    x: p.x, z: p.z, dirX: dx, dirZ: dz,
    quadW: spec.widthM * padW * (p.widthScale || 1) * (p.side === -1 ? -1 : 1),
    quadL: spec.lengthM * padL * (p.lengthScale || 1),
    cell: spec.cell,
    r: Clamp01(s[0]), g: Clamp01(s[1]), b: Clamp01(s[2]),
  };
}

/** 印章四边形的外接圆半径（米）。 */
export function StampRadius(stamp) { return 0.5 * Math.hypot(stamp.quadW, stamp.quadL); }

// ===========================================================================
// 三、环形窗口
// ===========================================================================

const Mod = (a, n) => ((a % n) + n) % n;

/**
 * 窗口中心的纹素下标。离当前中心不到 recenterM 就不挪（整纹素对齐，避免每帧都清一两列）。
 * @param {{ix:number,iz:number}|null} current
 * @returns {{ix:number,iz:number}}
 */
export function WindowIndex(current, x, z, texelM, recenterM) {
  if (current) {
    const cx = (current.ix + 0.5) * texelM, cz = (current.iz + 0.5) * texelM;
    if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) < recenterM) return current;
  }
  return { ix: Math.floor(x / texelM), iz: Math.floor(z / texelM) };
}

/** 窗口覆盖的纹素下标范围 [x0, x1) × [z0, z1)。 */
export function WindowRange(index, size) {
  const h = size >> 1;
  return { x0: index.ix - h, x1: index.ix - h + size, z0: index.iz - h, z1: index.iz - h + size };
}

/**
 * 窗口从 prev 挪到 next 之后新露出来的区域（纹素下标矩形，互不重叠）。
 * prev 为空、或挪得比整个窗口还远：整张窗口都是新的。
 */
export function ExposedRanges(prev, next, size) {
  const b = WindowRange(next, size);
  if (!prev) return [b];
  const a = WindowRange(prev, size);
  if (Math.abs(next.ix - prev.ix) >= size || Math.abs(next.iz - prev.iz) >= size) return [b];
  const out = [];
  // x 方向新进来的列 × 新窗口的整段 z
  if (b.x0 < a.x0) out.push({ x0: b.x0, x1: a.x0, z0: b.z0, z1: b.z1 });
  if (b.x1 > a.x1) out.push({ x0: a.x1, x1: b.x1, z0: b.z0, z1: b.z1 });
  // z 方向新进来的行 × 新旧重叠的那段 x（不和上面重复）
  const ox0 = Math.max(a.x0, b.x0), ox1 = Math.min(a.x1, b.x1);
  if (ox1 > ox0) {
    if (b.z0 < a.z0) out.push({ x0: ox0, x1: ox1, z0: b.z0, z1: a.z0 });
    if (b.z1 > a.z1) out.push({ x0: ox0, x1: ox1, z0: a.z1, z1: b.z1 });
  }
  return out;
}

/** 纹素下标矩形 → 靶上的像素矩形（取模后可能拆成 1–4 块）。 */
export function TexelRects(range, size) {
  const Split = (a0, a1) => {
    const len = a1 - a0;
    if (len >= size) return [[0, size]];
    const s = Mod(a0, size);
    return s + len <= size ? [[s, len]] : [[s, size - s], [0, s + len - size]];
  };
  const out = [];
  for (const [x, w] of Split(range.x0, range.x1)) {
    for (const [y, h] of Split(range.z0, range.z1)) out.push({ x, y, w, h });
  }
  return out;
}

/** 纹素下标矩形 → 世界矩形（米）。 */
export function WorldRectOf(range, texelM) {
  return { minX: range.x0 * texelM, maxX: range.x1 * texelM, minZ: range.z0 * texelM, maxZ: range.z1 * texelM };
}

/**
 * 一个印章在靶上要画在哪几处（靶像素坐标的中心）。跨过靶的边就在对边再画一份。
 * @returns {Array<[number, number]>} 像素坐标（浮点）
 */
export function StampCopies(stamp, texelM, size) {
  const px = Mod(stamp.x / texelM, size), pz = Mod(stamp.z / texelM, size);
  const r = StampRadius(stamp) / texelM + 1;
  const xs = [px], zs = [pz];
  if (px - r < 0) xs.push(px + size);
  if (px + r > size) xs.push(px - size);
  if (pz - r < 0) zs.push(pz + size);
  if (pz + r > size) zs.push(pz - size);
  const out = [];
  for (const x of xs) for (const z of zs) out.push([x, z]);
  return out;
}

// ===========================================================================
// 四、历史与衰减
// ===========================================================================

/**
 * CPU 印章历史（结构数组 + 环形，满了挤掉最老的）。窗口滑回清过的地方时，
 * 按「落下至今过了多久」重新盖回去。靶上的减淡是**逐纹素减同样多的色阶**（不是按比例），
 * 所以回填给的是原强度 + 已退掉的量（fr/fg/fb = 年龄 / 寿命），印章着色器算 max(图集 × 强度 − 已退, 0)，
 * 与靶上逐帧减出来的值逐色阶一致。
 */
export class TrailHistory {
  constructor(capacity = 8192) {
    this.capacity = capacity;
    this.f = new Float32Array(capacity * 10);   // x z dirX dirZ quadW quadL cell r g b
    this.t = new Float64Array(capacity);
    this.head = 0;
    this.count = 0;
  }
  Clear() { this.head = 0; this.count = 0; }
  Add(stamp, time) {
    const i = this.head, o = i * 10, f = this.f;
    f[o] = stamp.x; f[o + 1] = stamp.z; f[o + 2] = stamp.dirX; f[o + 3] = stamp.dirZ;
    f[o + 4] = stamp.quadW; f[o + 5] = stamp.quadL; f[o + 6] = stamp.cell;
    f[o + 7] = stamp.r; f[o + 8] = stamp.g; f[o + 9] = stamp.b;
    this.t[i] = time;
    this.head = (i + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  /**
   * 与世界矩形相交、且还没退干净的印章，按落下的先后顺序回调。
   * stamp.r/g/b 是原强度，stamp.fr/fg/fb 是到现在已经退掉的量（0..1，按 lifeS 线性）。
   * @param {{minX,maxX,minZ,maxZ}|null} rect null = 全部
   * @param {(stamp:object) => void} visit
   * @returns {number} 回调次数
   */
  Query(rect, now, lifeS, visit) {
    let n = 0;
    const f = this.f, cap = this.capacity;
    const first = (this.head - this.count + cap) % cap;
    const stamp = { x: 0, z: 0, dirX: 0, dirZ: 0, quadW: 0, quadL: 0, cell: 0, r: 0, g: 0, b: 0, fr: 0, fg: 0, fb: 0 };
    for (let k = 0; k < this.count; k++) {
      const i = (first + k) % cap, o = i * 10;
      const age = Math.max(0, now - this.t[i]);
      const fr = age / lifeS[0], fg = age / lifeS[1], fb = age / lifeS[2];
      if (f[o + 7] - fr <= 0.002 && f[o + 8] - fg <= 0.002 && f[o + 9] - fb <= 0.002) continue;
      const x = f[o], z = f[o + 1];
      const rad = 0.5 * Math.hypot(f[o + 4], f[o + 5]);
      if (rect && (x + rad < rect.minX || x - rad > rect.maxX || z + rad < rect.minZ || z - rad > rect.maxZ)) continue;
      stamp.x = x; stamp.z = z; stamp.dirX = f[o + 2]; stamp.dirZ = f[o + 3];
      stamp.quadW = f[o + 4]; stamp.quadL = f[o + 5]; stamp.cell = f[o + 6];
      stamp.r = f[o + 7]; stamp.g = f[o + 8]; stamp.b = f[o + 9];
      stamp.fr = fr; stamp.fg = fg; stamp.fb = fb;
      visit(stamp);
      n++;
    }
    return n;
  }
}

/**
 * 整张靶的线性减淡。每个通道每秒退 255/lifeS 个色阶，攒够整数个色阶才出一次减法。
 * （8 位靶上做乘法衰减会卡死在小数舍入上：0.99 × 50 仍然舍入回 50。）
 */
export class DecayClock {
  constructor() { this.acc = [0, 0, 0]; }
  Reset() { this.acc[0] = this.acc[1] = this.acc[2] = 0; }
  /** @returns {number[]|null} 这一步要减掉的色阶数 [r, g, b]，没有攒够返回 null */
  Advance(dt, lifeS) {
    let any = false;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      this.acc[c] += Math.max(0, dt) * 255 / lifeS[c];
      const steps = Math.min(255, Math.floor(this.acc[c]));
      if (steps > 0) { out[c] = steps; this.acc[c] -= steps; any = true; }
    }
    return any ? out : null;
  }
}

// ===========================================================================
// 五、落脚判定
// ===========================================================================

/**
 * 一个关节（踝 / 膝）的着地判定。每帧喂：关节离地形的高度 h（米）、水平速度（m/s）。
 * 状态：参考高 ref（跟着真实的最低踝高走）、armed（抬起来过没有）。
 *   · h < ref + enter 且速度 < plantMps 且 armed → 落脚一次，armed = false
 *   · h > ref + exit → armed = true（抬脚了）
 * absolute：膝盖不学参考高，直接和 enter/exit 比（站着的时候膝盖离地 40 cm，学了会乱）。
 */
export class FootContact {
  constructor({ absolute = false } = {}) {
    this.absolute = absolute;
    this.ref = absolute ? 0 : TERRAIN_TRAIL_CONTACT.refInitM;
    this.armed = true;
    this.lastX = NaN; this.lastZ = NaN;
  }
  /**
   * @returns {boolean} 这一帧落脚了
   */
  Step(h, speed, dt, x, z, C = TERRAIN_TRAIL_CONTACT, enterM = C.enterM, exitM = C.exitM) {
    if (!Number.isFinite(h)) return false;
    if (!this.absolute) {
      const [lo, hi] = C.refRangeM;
      this.ref = Math.min(hi, Math.max(lo, Math.min(this.ref + C.refRelaxMps * Math.max(0, dt), h)));
    }
    if (h > this.ref + exitM) { this.armed = true; return false; }
    if (!this.armed || h > this.ref + enterM || !(speed < C.plantMps)) return false;
    this.armed = false;
    if (Number.isFinite(this.lastX) && Math.hypot(x - this.lastX, z - this.lastZ) < C.minSpacingM) return false;
    this.lastX = x; this.lastZ = z;
    return true;
  }
}

/** 第一人称：步距到了就落一只脚，左右交替。 */
export class StrideEmitter {
  constructor() { this.last = null; this.side = 1; }
  Reset() { this.last = null; }
  /** @returns {number} 0 = 这一帧不落脚；+1 右脚 / −1 左脚 */
  Step(stepDistance, strideM) {
    if (this.last === null || stepDistance < this.last) { this.last = stepDistance; return 0; }
    if (stepDistance - this.last < strideM) return 0;
    this.last = stepDistance;
    this.side = -this.side;
    return this.side;
  }
}
