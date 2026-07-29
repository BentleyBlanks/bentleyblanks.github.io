// 《燎原 · 敌后1937》 —— 六边形网格数学与确定性随机基础库。
// 本模块是全项目的坐标契约：轴向坐标 (q, r)、平顶（flat-top）六边形、y 轴向上。
// 纯函数模块：不引用 window / document / three，可直接在 node 中导入用于冒烟测试。

export const hexSize = 1;

/** 邻居方向，索引 0..5 固定顺序，全项目共用（右、右上、左上、左、左下、右下）。 */
export const hexDirections = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

const sqrt3 = Math.sqrt(3);

export function HexKey(q, r) {
  return `${q},${r}`;
}

export function ParseHexKey(key) {
  const comma = key.indexOf(",");
  return { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };
}

/** 轴向坐标 → 世界坐标（XZ 平面）。 */
export function HexToWorld(q, r, size = hexSize) {
  return { x: size * 1.5 * q, z: size * sqrt3 * (r + q / 2) };
}

/** 世界坐标 → 最近的轴向坐标。 */
export function WorldToHex(x, z, size = hexSize) {
  const q = (2 / 3) * (x / size);
  const r = z / (size * sqrt3) - q / 2;
  return HexRound(q, r);
}

export function HexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

export function HexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export function HexDistanceKeys(keyA, keyB) {
  return HexDistance(ParseHexKey(keyA), ParseHexKey(keyB));
}

export function HexNeighbors(q, r) {
  return hexDirections.map((direction) => ({ q: q + direction.q, r: r + direction.r }));
}

export function HexNeighborKeys(key) {
  const { q, r } = ParseHexKey(key);
  return hexDirections.map((direction) => HexKey(q + direction.q, r + direction.r));
}

export function HexAdd(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function HexScale(a, factor) {
  return { q: a.q * factor, r: a.r * factor };
}

/** 半径 radius 的环（radius = 0 时返回中心本身）。 */
export function HexRing(center, radius) {
  if (radius <= 0) return [{ q: center.q, r: center.r }];
  const results = [];
  let cursor = HexAdd(center, HexScale(hexDirections[4], radius));
  for (let side = 0; side < 6; side += 1) {
    for (let step = 0; step < radius; step += 1) {
      results.push({ q: cursor.q, r: cursor.r });
      cursor = HexAdd(cursor, hexDirections[side]);
    }
  }
  return results;
}

/** 半径内全部格（含中心），按距离由近到远。 */
export function HexesInRange(center, radius) {
  const results = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    const lower = Math.max(-radius, -dq - radius);
    const upper = Math.min(radius, -dq + radius);
    for (let dr = lower; dr <= upper; dr += 1) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  results.sort((a, b) => HexDistance(center, a) - HexDistance(center, b));
  return results;
}

export function HexLine(a, b) {
  const steps = HexDistance(a, b);
  if (steps === 0) return [{ q: a.q, r: a.r }];
  const results = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    results.push(HexRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6));
  }
  return results;
}

/** 平顶六边形的 6 个角点（XZ 偏移），用于建几何体。 */
export function HexCornerOffsets(size = hexSize) {
  const corners = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index);
    corners.push({ x: size * Math.cos(angle), z: size * Math.sin(angle) });
  }
  return corners;
}

/** 该格朝向 direction 索引方向的边中点（用于画道路/铁路/边界线）。 */
export function HexEdgeMidpoint(q, r, directionIndex, size = hexSize) {
  const here = HexToWorld(q, r, size);
  const direction = hexDirections[directionIndex % 6];
  const there = HexToWorld(q + direction.q, r + direction.r, size);
  return { x: (here.x + there.x) / 2, z: (here.z + there.z) / 2 };
}

// ---------------------------------------------------------------------------
// 确定性随机：全项目禁止 Math.random()，一律用这里的可复现随机源。
// ---------------------------------------------------------------------------

/** mulberry32：32 位种子 → 0..1 的确定性序列。 */
export function CreateRng(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return function NextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从状态整数推进一步，返回 { value, state }，便于把随机状态存进存档。 */
export function StepRng(rngState) {
  let state = (Number(rngState) >>> 0) || 0x9e3779b9;
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state };
}

export function HashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// 数学工具
// ---------------------------------------------------------------------------

export function Clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function Clamp01(value) {
  return Clamp(value, 0, 1);
}

export function Lerp(a, b, t) {
  return a + (b - a) * t;
}

export function InverseLerp(a, b, value) {
  if (a === b) return 0;
  return Clamp01((value - a) / (b - a));
}

export function SmoothStep(edge0, edge1, value) {
  const t = Clamp01((value - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function Hash2D(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 平滑的二维值噪声，返回 0..1。 */
export function ValueNoise2D(x, y, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = Hash2D(xi, yi, seed);
  const b = Hash2D(xi + 1, yi, seed);
  const c = Hash2D(xi, yi + 1, seed);
  const d = Hash2D(xi + 1, yi + 1, seed);
  return Lerp(Lerp(a, b, u), Lerp(c, d, u), v);
}

/** 分形叠加噪声，返回 0..1。 */
export function FractalNoise2D(x, y, options = {}) {
  const octaves = options.octaves ?? 4;
  const persistence = options.persistence ?? 0.5;
  const lacunarity = options.lacunarity ?? 2;
  const seed = options.seed ?? 1;
  let amplitude = 1;
  let frequency = options.frequency ?? 1;
  let total = 0;
  let maximum = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += ValueNoise2D(x * frequency, y * frequency, seed + octave * 7919) * amplitude;
    maximum += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return maximum === 0 ? 0 : total / maximum;
}

/** 山脊噪声：把噪声折叠出锐利山脊线，用于太行山脉主脊。 */
export function RidgeNoise2D(x, y, options = {}) {
  const value = FractalNoise2D(x, y, options);
  return 1 - Math.abs(value * 2 - 1);
}

/** 在权重表上做确定性加权抽样。weights 形如 { key: weight }。 */
export function WeightedPick(weights, roll) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return entries.length ? entries[0][0] : null;
  let cursor = Clamp01(roll) * total;
  for (const [key, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Fisher-Yates 洗牌（确定性，需传入 rng）。 */
export function ShuffleInPlace(items, rng) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const temp = items[index];
    items[index] = items[swap];
    items[swap] = temp;
  }
  return items;
}
