// 《血战台儿庄》程序化噪声库 —— 纯 JS，**不许 import three**（Node 里要能直接跑，
// 贴图烘焙与关卡布局共用同一份，冒烟测试靠这一点）。
//
// 全部确定性：不调 Math.random。同一个 seed 永远出同一张图 —— 视觉审查靠逐轮
// 截图比对，画面每帧都在变的话根本没法判断「这一版比上一版好」。

// --- 确定性 PRNG（mulberry32）------------------------------------------------
export function Mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位整数种子（FNV-1a）。给「按名字取稳定随机」用。 */
export function HashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// --- 整数哈希 ---------------------------------------------------------------
function Hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function Hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const Fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const Lerp = (a, b, t) => a + (b - a) * t;

// --- Value noise ------------------------------------------------------------
export function ValueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = Fade(xf), v = Fade(yf);
  const a = Hash2(xi, yi, seed), b = Hash2(xi + 1, yi, seed);
  const c = Hash2(xi, yi + 1, seed), d = Hash2(xi + 1, yi + 1, seed);
  return Lerp(Lerp(a, b, u), Lerp(c, d, u), v);
}

export function ValueNoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = Fade(xf), v = Fade(yf), w = Fade(zf);
  const n = (dx, dy, dz) => Hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = Lerp(n(0, 0, 0), n(1, 0, 0), u);
  const x10 = Lerp(n(0, 1, 0), n(1, 1, 0), u);
  const x01 = Lerp(n(0, 0, 1), n(1, 0, 1), u);
  const x11 = Lerp(n(0, 1, 1), n(1, 1, 1), u);
  return Lerp(Lerp(x00, x10, v), Lerp(x01, x11, v), w);
}

// --- 可平铺的 value noise（贴图必须无缝，不然墙上一眼看见接缝）--------------
export function TileableValue2(x, y, period, seed = 0, periodY = period) {
  const p = Math.max(1, Math.round(period));
  // 两轴分开的周期：条状噪声（布的织向、枪管的拉丝）要把一轴拉长四五倍，
  // 两轴共用一个周期的话被拉长的那一轴根本走不满一圈 —— 图不平铺，接缝就回来了。
  const q = Math.max(1, Math.round(periodY));
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = Fade(xf), v = Fade(yf);
  const wrapX = (n) => ((n % p) + p) % p;
  const wrapY = (n) => ((n % q) + q) % q;
  const a = Hash2(wrapX(xi), wrapY(yi), seed), b = Hash2(wrapX(xi + 1), wrapY(yi), seed);
  const c = Hash2(wrapX(xi), wrapY(yi + 1), seed), d = Hash2(wrapX(xi + 1), wrapY(yi + 1), seed);
  return Lerp(Lerp(a, b, u), Lerp(c, d, u), v);
}

// --- 分形叠加 ---------------------------------------------------------------
export function Fbm2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 0 } = {}) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * ValueNoise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function TileableFbm2(x, y, period, {
  octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 0, periodY = null,
} = {}) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  const py = periodY == null ? period : periodY;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * TileableValue2(x * freq, y * freq, period * freq, seed + i * 131, py * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function Fbm3(x, y, z, { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0 } = {}) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * ValueNoise3(x * freq, y * freq, z * freq, seed + i * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** 脊状噪声：给砖缝、裂纹、烟的丝缕用。 */
export function Ridged2(x, y, opts = {}) {
  const v = Fbm2(x, y, opts);
  return 1 - Math.abs(v * 2 - 1);
}

/** 域扭曲：直接叠 fbm 出来的东西太「电脑」，扭一下才像风化痕迹。 */
export function Warp2(x, y, amount = 1, opts = {}) {
  const seed = opts.seed ?? 0;
  const qx = Fbm2(x, y, { ...opts, seed: seed + 977 });
  const qy = Fbm2(x + 5.2, y + 1.3, { ...opts, seed: seed + 1231 });
  return Fbm2(x + amount * qx, y + amount * qy, opts);
}

// --- Worley / 细胞噪声（碎石、弹坑、剥落的抹面）-----------------------------
export function Worley2(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 1e9, second = 1e9;
  const wrap = period > 0 ? (n) => ((n % period) + period) % period : (n) => n;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = xi + dx, cy = yi + dy;
      const px = cx + Hash2(wrap(cx), wrap(cy), seed);
      const py = cy + Hash2(wrap(cx), wrap(cy), seed + 7919);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) { second = best; best = d; } else if (d < second) { second = d; }
    }
  }
  return { f1: Math.sqrt(best), f2: Math.sqrt(second) };
}

// --- 小工具 -----------------------------------------------------------------
export const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const Clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const Mix = Lerp;
export function SmoothStep(edge0, edge1, x) {
  const t = Clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}
